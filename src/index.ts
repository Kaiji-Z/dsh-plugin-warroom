/**
 * dsh-plugin-warroom — the strategic operating system for DeepSeek Harness.
 *
 * v0.2 shape: the sovereign talks only to the
 * secretary (贴身参谋, the user-facing conversation persona); the secretary
 * authors professional task briefs and publishes them to the strategic task
 * board (跨工作区 JSONL store + war map UI); a single durable commander
 * (司令, a continuable subagent child with FULL harness capability — the
 * "autonomous executor") auto-claims tasks, materializes per-task
 * workspaces, and deploys typed troops inside them; reports flow back to the
 * board for the sovereign's review.
 *
 * Everything is activation-gated: dormant installs expose none of it until
 * `/war` (or config) lights the war room; `/peace` stands it down.
 * @module dsh-plugin-warroom
 */

import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import { dueBounties, registerDashboard } from './dashboard.ts'
import { registerPeaceCommand, registerWarCommand, type CommandsServiceFace } from './commands.ts'
import { appendEvent, listCampaignIds, loadCampaign } from './events.ts'
import { readDossier } from './dossier.ts'
import { commanderPersonaText, conscriptBriefing, secretaryPersonaText } from './persona.ts'
import { createCommandFuse, type SessionsApiFace, type WorkspaceApiFace } from './relay.ts'
import { createWakeEngine } from './wake.ts'
import { createQuotaFuse, probeBackoffMs } from './quota.ts'
import type { PlanModeFace, SpikeDeps } from './v5spike.ts'
import type { GoalsFace } from './goals.ts'
import { createWarStore, resolveStateDir, type WarStore } from './state.ts'
import { bountyDraftingSkill, type SkillsServiceFace } from './skill.ts'
import { featureEnabled, readFeatureFlags } from './flags.ts'
import { kickIdleTroops, warTools, type CommanderOps, type SubagentsServiceFace, type WarToolsDeps } from './tools.ts'
import { conscriptPlan, workspaceConflict } from './rules.ts'
import { loadRoster, type Roster } from './units.ts'
import type { CampaignState } from './types.ts'
import { materializeInstanceWorkspace, materializeTaskWorkspace, resolveWarRoot } from './workspace.ts'

export const name = 'warroom-plugin'
export const inject = ['tools', 'systemPrompt', 'subagents']

/** Activation-gated registration of the war_* tools (surface pattern). */
function createWarSurface(
  registry: { register(definition: unknown): () => void },
  deps: WarToolsDeps,
): { sync(): void; dispose(): void } {
  let on = false
  const disposers: Array<() => void> = []
  return {
    sync(): void {
      const want = deps.store.get().active
      if (want === on) return
      on = want
      if (want) {
        for (const tool of warTools(deps)) disposers.push(registry.register(tool))
      } else {
        for (const dispose of disposers.splice(0)) dispose()
      }
    },
    dispose(): void {
      on = false
      for (const dispose of disposers.splice(0)) dispose()
    },
  }
}

/**
 * The conscriptor (v2.0 征召制): every commander is a TOP-LEVEL session
 * created via the host apiProxy and bound to the TASK WORKSPACE (registry
 * workspace.create + sessions.create({workspaceId}) — the
 * execution-session paradigm). That is what makes the sandbox honest: an
 * in-process continuable child inherits its PARENT session's write root
 * (live R8 catch: a warRoot-rooted commander could not write a bound
 * external workspace), while a session-bound commander roots exactly where
 * the task lives and sits at delegation depth 0. The 征召令 prompt carries
 * the full commander doctrine (no persona field exists on sessions.create).
 * Gates: spawn-once-per-task, workspace occupancy, global commander cap.
 * The patrol fuse is the crash-recovery net: stranded published tasks get
 * ONE relay ping into the 参谋部 conversation per plan signature.
 */
function createConscriptor(deps: {
  store: WarStore
  stateDir: string
  warRoot: string
  maxUnits: number
  maxCommanders: number
  subagents: SubagentsServiceFace
}): CommanderOps & { bindRelay(sessions: SessionsApiFace, workspace: WorkspaceApiFace): void; patrolNow(): void } {
  const spawned = new Set<string>()
  let relay: SessionsApiFace | undefined
  let workspaceApi: WorkspaceApiFace | undefined
  const board = (): CampaignState[] => listCampaignIds(deps.stateDir).map(id => loadCampaign(deps.stateDir, id)).filter(t => t.startedAt !== '')
  const rpc = (): string => `warroom-${crypto.randomUUID()}`
  const conscriptTask = async (task: CampaignState, signal: AbortSignal): Promise<{ spawned: true; childId: string } | { spawned: false; reason: string }> => {
    if (task.status !== 'published') return { spawned: false, reason: `任务状态为 ${task.status}，只有待领取任务可征召。` }
    if (relay === undefined || workspaceApi === undefined) return { spawned: false, reason: 'apiProxy 未接入（无会话创建通道）。' }
    // Lazy prune: a spawned task that left the board frees its guard slot.
    for (const id of [...spawned]) {
      if (loadCampaign(deps.stateDir, id).status !== 'published') spawned.delete(id)
    }
    if (spawned.has(task.campaignId)) return { spawned: false, reason: '该任务已有一名待命司令。' }
    const busy = workspaceConflict(task.workspacePath, board().map(t => ({ taskId: t.campaignId, status: t.status, workspacePath: t.workspacePath })))
    if (busy !== undefined) return { spawned: false, reason: `工作区正被任务 ${busy.taskId} 占用，本任务排队等待收官接力。` }
    const inflight = board().filter(t => t.status === 'in_progress').length
    if (inflight >= deps.maxCommanders) return { spawned: false, reason: `在役司令满编（${inflight}/${deps.maxCommanders}），稍后由巡检补征。` }
    // Bind the commander session to the task workspace (sandbox root).
    const wsPath = task.workspacePath ?? deps.warRoot
    const ws = await workspaceApi.create({ rpcId: rpc(), payload: { path: wsPath } })
    if (!ws.result.ok) return { spawned: false, reason: `工作区注册失败（${ws.result.error.code}）：${ws.result.error.message}` }
    const created = await relay.create({ rpcId: rpc(), payload: { workspaceId: ws.result.value.workspace.workspaceId } })
    if (!created.result.ok) return { spawned: false, reason: `司令会话创建失败（${created.result.error.code}）：${created.result.error.message}` }
    const sessionId = created.result.value.sessionId
    const title = `司令·${(task.title ?? task.intent).slice(0, 14)}`
    void relay.rename({ rpcId: rpc(), payload: { sessionId, title } }).catch(() => undefined)
    const bound = task.workspacePath !== undefined && !task.workspacePath.startsWith(deps.warRoot)
    const dossier = task.workspacePath !== undefined && bound
      ? readDossier(deps.stateDir, task.workspacePath)
      : '（新战区，尚无历史档案。）'
    const order = [
      commanderPersonaText(deps.maxUnits),
      '',
      conscriptBriefing({ taskId: task.campaignId, title: task.title ?? task.intent, workspacePath: task.workspacePath, acceptance: task.acceptance ?? '', dossier }),
      '',
      '你的写权限根就在本会话绑定的工作区——直接动手即可；确需分兵时用 war_deploy_unit（战区写工作区内相对路径）。',
    ].join('\n')
    const prompted = await relay.prompt({ rpcId: rpc(), payload: { sessionId, mode: 'queue', content: [{ type: 'text', text: order }] } })
    if (!prompted.result.ok) return { spawned: false, reason: `征召令投递失败（${prompted.result.error.code}）：${prompted.result.error.message}` }
    spawned.add(task.campaignId)
    return { spawned: true, childId: sessionId }
  }
  return {
    bindRelay(sessions, workspace) {
      relay = sessions
      workspaceApi = workspace
    },
    async conscript(task, signal) {
      return conscriptTask(task, signal)
    },
    async relayTo(sessionId, text): Promise<boolean> {
      if (relay === undefined) return false
      try {
        const sent = await relay.prompt({ rpcId: rpc(), payload: { sessionId, mode: 'queue', content: [{ type: 'text', text }] } })
        return sent.result.ok
      } catch {
        return false
      }
    },
    patrolNow(): void {
      try {
        const war = deps.store.get()
        if (!war.active) return
        if (relay === undefined || workspaceApi === undefined) return
        const tasks = board()
        const inflight = tasks.filter(t => t.status === 'in_progress').length
        if (inflight >= deps.maxCommanders) return
        const plan = conscriptPlan(tasks.map(t => ({ taskId: t.campaignId, status: t.status, workspacePath: t.workspacePath, priority: t.priority, startedAt: t.startedAt })))
        const waiting = plan.filter(t => !spawned.has(t.taskId))
        if (waiting.length === 0) return
        // v3: the patrol conscripts DIRECTLY (no staff LLM round-trip) — the
        // spawn-once guard + conscriptTask's own gates keep it idempotent.
        void (async () => {
          const signal = new AbortController().signal
          for (const t of waiting) {
            try {
              await conscriptTask(loadCampaign(deps.stateDir, t.taskId), signal)
            } catch {
              // Patrol never throws into the timer.
            }
            if (board().filter(x => x.status === 'in_progress').length >= deps.maxCommanders) return
          }
        })()
      } catch {
        // Patrol never throws into the timer.
      }
    },
  }
}

/**
 * Auto-log TROOP reports/settlements into the owning task's log. v2.0: the
 * event's session may be ANY in-progress task's commander (征召制, one
 * commander per task); we match the session against the task's claimer and
 * locate the owning task by the child id embedded in the notice. Defensive:
 * shape drift degrades to "no auto-log", never a crash.
 */
function registerReportCapture(ctx: Context, stateDir: string, store: WarStore): void {
  const onEvent = (session: unknown, ev: unknown): void => {
    try {
      const event = ev as { type?: string; source?: { kind?: string }; content?: ReadonlyArray<{ type?: string; text?: string }> }
      if (event?.type !== 'user/message') return
      const kind = event.source?.kind
      if (kind !== 'subagent-report' && kind !== 'subagent-settled') return
      const war = store.get()
      if (!war.active) return
      const sessionId = (session as { id?: string } | undefined)?.id
      if (sessionId === undefined) return
      const text = (event.content ?? []).filter(b => b?.type === 'text').map(b => b.text ?? '').join('\n')
      const childId = /Background subagent ([\w-]+)/.exec(text)?.[1]
      if (childId === undefined) return
      for (const taskId of listCampaignIds(stateDir)) {
        const task = loadCampaign(stateDir, taskId)
        if (!task.units.has(childId)) continue
        // v2.0 征召制：部队的上级是该任务当前持有者的会话；旧单司令日志经
        // commanderChildId 兜底兼容。
        if (sessionId !== task.claimedBy && sessionId !== war.commanderChildId) continue
        const ts = new Date().toISOString()
        if (kind === 'subagent-report') {
          appendEvent(stateDir, { type: 'report_received', ts, campaignId: taskId, childId, summary: text.slice(0, 2000) })
        } else {
          appendEvent(stateDir, { type: 'unit_settled', ts, campaignId: taskId, childId, stopReason: text.split('\n')[0] ?? '' })
        }
        return
      }
    } catch {
      // Additive listener: never propagate into the host event loop.
    }
  }
  ;(ctx as unknown as { on(event: 'session/event', listener: (session: unknown, ev: unknown) => void): unknown }).on('session/event', onEvent)
}

/**
 * Mount the war room: config, store, roster loader, commander lifecycle,
 * activation-gated tool surface + secretary persona, troop-report capture,
 * the patrol fuse, the `/war` + `/peace` commands, and (in web
 * compositions) the strategic board HTTP API.
 * @param ctx - plugin context (tools + systemPrompt + subagents injected).
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const stateDir = resolveStateDir(config.statePath)
  const store = createWarStore(stateDir)
  if (config.active !== 'auto') {
    store.get().active = config.active === 'on'
    store.save()
  }
  // The war root must exist before anything points a workspace at it —
  // workspace.create rejects missing paths with a raw ENOENT (live R8 catch).
  const warRoot = resolveWarRoot(config.warRoot)
  mkdirSync(warRoot, { recursive: true })
  const roster = (): Roster => loadRoster(join(stateDir, 'units'), process.cwd())
  const subagents = (ctx as unknown as { subagents: SubagentsServiceFace }).subagents
  const commander = createConscriptor({ store, stateDir, warRoot, maxUnits: config.maxUnits, maxCommanders: config.maxCommanders, subagents })
  const deps: WarToolsDeps = {
    store,
    stateDir,
    maxUnits: config.maxUnits,
    maxAttempts: config.maxAttempts,
    roster,
    subagents,
    commander,
    workspace: { materialize: materializeTaskWorkspace, materializeInstance: materializeInstanceWorkspace },
    warRoot,
    flags: readFeatureFlags(),
  }
  const surface = createWarSurface(ctx.tools, deps)
  surface.sync()
  ctx.effect(() => () => surface.dispose(), 'warroom.warSurface()')
  // V4-R2 (troop-mailbox): the live-agent registry is OPTIONAL — when present
  // it lets troops push a message to a sibling troop via the commander as parent;
  // absent, those messages stay durable-pending (honest degradation, no error).
  ctx.inject(['agents'], (agentCtx) => {
    const agents = (agentCtx as unknown as { agents?: { get(id: string): unknown } }).agents
    if (agents === undefined) return
    deps.resolveAgent = (sessionId: string): unknown => {
      try {
        return agents.get(sessionId)
      } catch {
        return undefined
      }
    }
  })
  // V5-R3 (staff-goal): the host goal service face — cordis inject capture is
  // the ONLY legal access (R1 K13: direct property reads throw). Shared ref:
  // tools' lazy getter and the v5 spike read the same capture.
  const goalsRef: { face?: GoalsFace } = {}
  ctx.inject(['goals'], (goalCtx) => {
    goalsRef.face = (goalCtx as unknown as Record<string, unknown>).goals as GoalsFace
  })
  deps.goals = () => goalsRef.face
  // V5-R4: the apiProxy sessions face binds LATE — wake/quota fuses read it
  // lazily through this ref (declared up front; bound in the apiProxy inject).
  const sessionsRef: { face?: SessionsApiFace } = {}
  // V4-R3 (troop-scheduler): the 30s fallback fuse — mutation kicks cover the
  // common path; this sweep catches troops that idled without completing.
  // (the host's idle edges are not exposed to our structural slice; the
  // warroom fuse idiom reaches the same effect, honestly bounded.)
  if (featureEnabled(deps.flags, 'troop-scheduler')) {
    const schedulerTimer = setInterval(() => {
      for (const id of listCampaignIds(stateDir)) {
        try {
          const t = loadCampaign(stateDir, id)
          if (t.status === 'in_progress') void kickIdleTroops(deps, id).catch(() => {})
        } catch {
          // One bad campaign log never kills the fuse.
        }
      }
    }, 30_000)
    ctx.effect(() => () => clearInterval(schedulerTimer), 'warroom.schedulerFuse()')
  }
  // V5-R4 (staff-wake): 参谋唤醒管线——分级推（结算点钩子）+ 去抖 + 90s
  // 巡检补推（崩溃恢复：reported/failed 未醒的任务）。sessions 面晚绑定
  // 经 sessionsRef 惰性取（与命令引信同一形态）。
  if (featureEnabled(deps.flags, 'staff-wake')) {
    const wakeEngine = createWakeEngine({ stateDir, sessions: () => sessionsRef.face, hqSessionId: () => store.get().hqSessionId, now: () => Date.now() })
    deps.wakeStaff = (taskId, kind, detail) => wakeEngine.wake(taskId, kind, detail)
    const wakeTimer = setInterval(() => wakeEngine.sweep(), 90_000)
    wakeTimer.unref?.()
    ctx.effect(() => () => clearInterval(wakeTimer), 'warroom.wakeFuse()')
  }
  // V5-R4 (quota-recovery): 配额熔断正管——被动检测（agent/error 事件，宿主
  // 面可收性 R5 实弹定案）+ 主动探测（近零 token probe，退避节奏）+ 原地
  // 暂停/恢复（不烧 maxAttempts 不换令牌）。探针会话 lazily 建一次复用。
  if (featureEnabled(deps.flags, 'quota-recovery')) {
    const probeRef: { sessionId?: string } = {}
    const quotaFuse = createQuotaFuse({
      stateDir,
      store,
      sessions: () => sessionsRef.face,
      probeSessionId: () => probeRef.sessionId,
    })
    // 被动检测：宿主 agent 总线（goal-round-driver 同款事件；R1 定案④）。
    try {
      ctx.on('agent/error', (payload: unknown) => {
        try {
          quotaFuse.onAgentError((payload as { error?: unknown }).error)
        } catch {
          // 监听器永不传播异常。
        }
      })
    } catch {
      // 事件面缺席 → 纯主动探测兜底（诚实降级，SPEC §3）。
    }
    // 主动探测节奏：熔断时退避轮询 probe；通过即恢复。
    let probeAttempt = 0
    const quotaTimer = setInterval(() => {
      void (async () => {
        try {
          if (!quotaFuse.isBlocked()) return
          const sessions = sessionsRef.face
          if (sessions !== undefined && probeRef.sessionId === undefined) {
            const made = await sessions.create({ rpcId: 'warroom-quota-probe', payload: { cwd: warRoot } })
            if (made.result.ok) probeRef.sessionId = made.result.value.sessionId
          }
          const verdict = await quotaFuse.probe()
          if (verdict === 'open') {
            probeAttempt = 0
            await quotaFuse.markResumed()
          } else if (verdict === 'blocked') {
            probeAttempt = Math.min(probeAttempt + 1, 4)
          }
        } catch {
          // 熔断探测永不抛。
        }
      })()
    }, probeBackoffMs(0))
    quotaTimer.unref?.()
    ctx.effect(() => () => clearInterval(quotaTimer), 'warroom.quotaFuse()')
  }
  ctx.systemPrompt.section({
    name: 'warroom:secretary',
    order: 120,
    text: () => (store.get().active ? secretaryPersonaText(config.maxUnits) : ''),
  })
  registerReportCapture(ctx, stateDir, store)
  // Patrol fuse (征召巡检): 90s net for stranded tasks — published with a free
  // workspace but no live commander spawn (crash/restart recovery). Raw Node
  // interval — accessing ctx.setInterval would demand the cordis timer service
  // in inject, which not every composition carries.
  const patrolFuse = setInterval(() => commander.patrolNow(), 90_000)
  patrolFuse.unref?.()
  ctx.effect(() => () => clearInterval(patrolFuse), 'warroom.patrolFuse()')
  // Bounty fuse (日常悬赏): host-side 30s tick. It only appends trigger events
  // (错过即跳过 — dueBounties anchors on the last trigger, never backfills);
  // waking the commander stays the patrol fuse's job, one concern per fuse.
  const bountyFuse = setInterval(() => {
    try {
      const due = dueBounties(stateDir, Date.now())
      for (const b of due) {
        appendEvent(stateDir, {
          type: 'task_schedule_triggered', ts: new Date().toISOString(), campaignId: b.taskId,
          skipped: !b.openRound, ...(b.openRound ? {} : { note: b.reason }),
        })
      }
    } catch {
      // A tick must never take the host down; the next tick retries nothing (错过即跳过).
    }
  }, 30_000)
  bountyFuse.unref?.()
  ctx.effect(() => () => clearInterval(bountyFuse), 'warroom.bountyFuse()')
  // `/war` lights the war room; `/peace` stands it down.
  ctx.inject(['commands'], (cmdCtx) => {
    const commands = (cmdCtx as unknown as { commands: CommandsServiceFace }).commands
    const disposeWar = registerWarCommand(commands, { store, onActiveChange: surface.sync })
    const disposePeace = registerPeaceCommand(commands, { store, onActiveChange: surface.sync })
    cmdCtx.effect(() => {
      disposeWar()
      disposePeace()
    }, 'warroom.commands()')
  })
  // Command fuse (命令引信): 15s tick relaying board commands into the
  // 参谋部 conversation. The fuse lives on the plugin's main context (an
  // inject-scope effect got disposed immediately and killed the interval —
  // live R8 catch); the apiProxy sessions face binds in late and the fuse
  // no-ops until then. Activation flips the store + syncs the surface in
  // code (a queued '/war' text is NOT intercepted as a slash command via
  // apiProxy.prompt — second live R8 catch). Compositions without apiProxy
  // keep the /war entry path.
  const commandFuse = createCommandFuse({
    store,
    stateDir,
    warRoot,
    flags: deps.flags,
    activate: () => {
      const war = store.get()
      if (!war.active) {
        war.active = true
        store.save()
      }
      surface.sync()
    },
  })
  commandFuse.start()
  // Cordis effect = setup-returns-cleanup (React shape): a single-arrow
  // disposer executes IMMEDIATELY and kills its own fuse (live R8 catch).
  ctx.effect(() => () => commandFuse.stop(), 'warroom.commandFuse()')
  // The apiProxy sessions face binds LATE (see the fuse comment above) — the
  // v5 spike probe needs it too, so capture it in a ref the probe closure reads.
  ctx.inject(['apiProxy'], (apiCtx) => {
    const api = (apiCtx as unknown as { apiProxy: { sessions: SessionsApiFace; workspace: WorkspaceApiFace } }).apiProxy
    console.log('[warroom] apiProxy bound to fuse + patrol + conscriptor')
    commander.bindRelay(api.sessions, api.workspace)
    commandFuse.bind(api.sessions)
    sessionsRef.face = api.sessions
  })
  // The secretary's drafting craft rides the runtime skill registry (no
  // filesystem writes — the runtime provider owns it, base bundles without
  // the skills service simply skip this layer).
  ctx.inject(['skills'], (skillCtx) => {
    const skills = (skillCtx as unknown as { skills?: SkillsServiceFace }).skills
    if (skills === undefined) return
    const disposeSkill = skills.register(bountyDraftingSkill())
    skillCtx.effect(() => disposeSkill(), 'warroom.draftingSkill()')
  })
  // The strategic board HTTP API mounts only in compositions carrying a webserver.
  ctx.inject(['webServer'], (webCtx) => {
    // v5 R1 spike（flag `v5-spike`）：宿主面 plan-mode/goal 可达性 + 活体
    // 往返探针。缺省（旗关）不给 spike → 探针路由 404，行为与改前等价。
    // 动态定案①：cordis 守卫「cannot get property without inject」——直接
    // 属性读会抛，必须 inject 回调捕获；isolate realm 内的服务（plan-mode
    // 疑似）在宿主面 inject 永不满足 → faces 恒空，这就是不可达的判据。
    // goals 面复用主 scope 的 goalsRef（staff-goal 同一个捕获）。
    const spikeFaces: { planMode?: PlanModeFace } = {}
    const spikeBound: { planMode?: boolean; goals?: boolean } = {}
    if (featureEnabled(deps.flags, 'v5-spike')) {
      try {
        ctx.inject(['planMode'], (pmCtx) => {
          spikeFaces.planMode = (pmCtx as unknown as Record<string, unknown>).planMode as PlanModeFace
          spikeBound.planMode = true
        })
      } catch { /* inject itself must never kill the plugin */ }
    }
    const spike: SpikeDeps | undefined = featureEnabled(deps.flags, 'v5-spike') ? {
      availability: () => {
        try {
          return {
            planMode: spikeBound.planMode === true ? 'service (inject satisfied)' : 'unavailable on host plane (inject not satisfied)',
            goals: goalsRef.face !== undefined ? 'service (inject satisfied)' : 'unavailable on host plane (inject not satisfied)',
            agents: typeof deps.resolveAgent === 'function' ? 'registry bound' : 'registry not bound',
            resolveAgent: typeof deps.resolveAgent,
            sessionsBound: sessionsRef.face !== undefined,
          }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
      resolveAgent: (sessionId) => {
        if (deps.resolveAgent === undefined) return { error: 'agents registry not bound' }
        try {
          const agent = deps.resolveAgent(sessionId)
          return agent === undefined || agent === null ? { error: 'no live agent for session' } : { agent }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
      planMode: () => spikeFaces.planMode,
      goals: () => goalsRef.face as GoalsFace | undefined,
      sessions: () => sessionsRef.face,
      warRoot: () => deps.warRoot,
    } : undefined
    const disposeDashboard = registerDashboard((webCtx as unknown as { webServer: Parameters<typeof registerDashboard>[0] }).webServer, {
      store,
      stateDir,
      roster,
      warRoot: deps.warRoot,
      flags: deps.flags,
      // v3: the + button's POST gets an instant relay — the fuse ticks NOW
      // instead of waiting out the 15s interval (receive in ~1s).
      onCommandCreated: () => { void commandFuse.tickNow() },
      ...(spike === undefined ? {} : { spike }),
    })
    webCtx.effect(() => disposeDashboard, 'warroom.dashboard()')
  })
}

export { Config }

// VERIFICATION.md §8.3 (P0-3): feature flags ship as package API — new
// features gate behind WARROOM_FEATURES with OFF == pre-change behavior.
export { readFeatureFlags, featureEnabled, FEATURE_FLAGS_ENV } from './flags.ts'
