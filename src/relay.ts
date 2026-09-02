/**
 * The command relay (命令引信) — v2.0. A 15s host fuse that moves sovereign
 * commands from the board's 命令区 into the 大副部 conversation: draft
 * directives get a staff session (created via the host apiProxy on first
 * need, cwd-bound to the war root, activated with `/war` so the persona and
 * war_* tools exist before the relay text reaches the model) and a relay
 * prompt, then the directive card flips to `received` — the user clicks in
 * and answers the staff's questions there.
 *
 * Structural slices keep this module free of host imports (unit-testable).
 * @module dsh-plugin-stardeck/relay
 */

import { appendDirectiveEvent, foldChains, loadDirectives, pendingDirectives, type Directive } from './directives.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'
import { boardDigest } from './wake.ts'
import { loadCampaign } from './events.ts'
import { buildChainNote, pivotChainSlice, type ChainAncestor } from './chain-note.ts'
import { chainArchiveSection, pivotPromptFor, relayPromptFor } from './prompts.ts'
import { displayTitleOf } from './client/preflight.ts'
import type { WarStore } from './state.ts'

// B1-件①：征召令/转达等模板正文已迁单一资产源 src/prompts.ts（快照门禁）——
// 此处 re-export 维持既有测试/消费面不变。
export { relayPromptFor, pivotPromptFor, chainDigest, chainOutcomeOf, type ChainStepFace } from './prompts.ts'

/** Structural slice of the harness apiProxy's sessions + workspace domains. */
export interface SessionsApiFace {
  create(request: { rpcId: string; payload: { workspaceId?: string; cwd?: string } }): Promise<{ result: { ok: true; value: { sessionId: string } } | { ok: false; error: { code: string; message: string } } }>
  rename(request: { rpcId: string; payload: { sessionId: string; title: string } }): Promise<{ result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } } }>
  prompt(request: { rpcId: string; payload: { sessionId: string; mode: 'queue'; content: Array<{ type: 'text'; text: string }> } }): Promise<{ result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } } }>
  /** V9.12：演示织换复用既有「演示·」会话用（可选——缺面时退回每次新建）。 */
  list?(request: { rpcId: string; payload: { cursor?: string } }): Promise<{ result: { ok: true; value: { items: ReadonlyArray<{ id: string; title?: string; displayTitle: string }> } } | { ok: false; error: { code: string; message: string } } }>
}

/** Structural slice of the apiProxy workspace domain (registry create is
 * idempotent over an existing directory). */
export interface WorkspaceApiFace {
  create(request: { rpcId: string; payload: { path: string } }): Promise<{ result: { ok: true; value: { workspace: { workspaceId: string } } } | { ok: false; error: { code: string; message: string } } }>
  /** V17 归档：宿主 registry 全局归档集（分组面隐藏；日志与记账保留，无恢复）。 */
  archiveSession(request: { rpcId: string; payload: { sessionId: string } }): Promise<{ result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } } }>
}

/** Wiring the command fuse needs. The sessions face arrives LATER via
 * bind() — the fuse itself must live on the plugin's main context, never on
 * the inject scope (whose disposal would kill the interval: live R8 catch). */
export interface CommandFuseDeps {
  store: WarStore
  stateDir: string
  /** War root — the staff session's cwd (sandbox-visible). */
  warRoot: string
  /** Lights the war surface (persona + war_* tools) — a queued '/war' TEXT is
   * NOT intercepted as a slash command via apiProxy.prompt (live R8 catch),
   * so activation must flip the store and sync the surface in code. */
  activate(): void
  /** V5-R2: relay text carries the triage discipline when staff-triage is on. */
  flags?: FeatureFlags
}

function rpcId(): string {
  return `warroom-${crypto.randomUUID()}`
}

/**
 * Run one fuse pass: relay every pending directive into ITS OWN staff
 * conversation (v3 每命令一会话 — one staff thread per command, topic-clean).
 * A directive without a session gets a fresh one (cwd-bound to the war root,
 * activated with `/war` in code, named `大副·<命令摘要>`); the session id is
 * recorded as `directive_session_opened` BEFORE the relay text goes out, so a
 * failed prompt retries into the same conversation instead of leaking a new
 * one. `state.hqSessionId` degrades to a legacy fallback (first session wins)
 * for tasks that predate the command flow. Idempotent per directive — a
 * relayed command is `received` and never picked up twice.
 */
export async function relayPendingCommands(deps: CommandFuseDeps, sessions: SessionsApiFace | undefined, workspaces?: WorkspaceApiFace): Promise<{ relayed: number; staffSessionId?: string }> {
  const all = loadDirectives(deps.stateDir)
  const pending = pendingDirectives(all)
  if (pending.length === 0) return { relayed: 0 }
  if (sessions === undefined) return { relayed: 0 }
  // The war surface (persona + war_* tools) must exist before any relay text
  // reaches the model — code-side activation, never a queued '/war' string.
  if (!deps.store.get().active) deps.activate()
  // V10 战线链一次折齐：pivot 目标解析 + 战线档案注入共用（命令量级=百级，
  // 任务账本按需 lazy 加载并缓存——同 parent 多次查不重读盘）。
  const byId = new Map(all.map(d => [d.id, d] as const))
  const chains = foldChains(all)
  const campaignCache = new Map<string, ReturnType<typeof loadCampaign> | undefined>()
  const campaignOf = (taskId?: string): ReturnType<typeof loadCampaign> | undefined => {
    if (taskId === undefined) return undefined
    if (campaignCache.has(taskId)) return campaignCache.get(taskId)
    let c: ReturnType<typeof loadCampaign> | undefined
    try {
      const loaded = loadCampaign(deps.stateDir, taskId)
      c = loaded.startedAt === '' ? undefined : loaded
    } catch { c = undefined }
    campaignCache.set(taskId, c)
    return c
  }
  const chainNoteFor = (directive: Directive, includePivotFallback = false): string => {
    const cont = directive.continuation
    if (cont === undefined || (cont.mode === 'pivot' && !includePivotFallback)) return ''
    const gen = chains.generationOf.get(directive.id) ?? 1
    const rootId = chains.rootByCommand.get(directive.id) ?? directive.id
    const members = chains.membersOfRoot.get(rootId) ?? []
    const ancestors: ChainAncestor[] = []
    for (let g = 1; g < gen && g <= members.length; g++) {
      const anc = byId.get(members[g - 1]!)
      if (anc === undefined) continue
      ancestors.push({ generation: g, text: anc.text, campaign: campaignOf(anc.taskId) })
    }
    // V15 知识连续性：详情代带任务回报摘要+关键产物路径（chain-note 纯模块，cap 1500）。
    // B1-件①：模板正文在 prompts.ts（chainArchiveSection）——快照门覆盖。
    return chainArchiveSection(gen, buildChainNote(ancestors, gen))
  }
  let relayed = 0
  for (const directive of pending) {
    // V10 pivot 分路：指令直插父任务的执行会话队列，一穿五态即归档
    // （received 记执行会话号 → approved 挂父任务号）；不开新大副会话。
    // 无活体 attempt（还在排队/已收官）落回常轨走大副且带战线档案兜底。
    const cont = directive.continuation
    if (cont !== undefined && cont.mode === 'pivot') {
      const parent = byId.get(cont.parentId)
      const camp = campaignOf(parent?.taskId)
      const live = camp?.attemptLog.filter(a => a.endedAt === undefined).at(-1)
      if (parent !== undefined && camp !== undefined && live !== undefined) {
        // V15：pivot 直插也带父代速览（结论+产物+任务回报，cap 400）。
        const pivotSlice = pivotChainSlice({ generation: chains.generationOf.get(parent.id) ?? 1, text: parent.text, campaign: camp })
        const pushed = await sessions.prompt({ rpcId: rpcId(), payload: { sessionId: live.sessionId, mode: 'queue', content: [{ type: 'text', text: pivotPromptFor(parent.text, directive.id, directive.text, pivotSlice) }] } })
        if (!pushed.result.ok) continue // busy/shape drift：保持 draft，下一 tick 重投同一会话
        const now = new Date().toISOString()
        appendDirectiveEvent(deps.stateDir, { type: 'directive_received', ts: now, directiveId: directive.id, staffSessionId: live.sessionId })
        appendDirectiveEvent(deps.stateDir, { type: 'directive_approved', ts: now, directiveId: directive.id, taskId: camp.campaignId })
        console.log(`[warroom] pivot 续战令 ${directive.id} 已插入执行会话 ${live.sessionId}（挂任务 ${camp.campaignId}）`)
        relayed += 1
        continue
      }
    }
    let sessionId = directive.staffSessionId
    if (sessionId === undefined) {
      // V15.1：大副会话走 workspace.create（按路径幂等）+ workspaceId 绑定——
      // 裸 cwd 建的会话没有工作区身份，进不了宿主会话目录，聚焦页跳钮 select
      // 即 unknown（舰长永远跳不进大副对话）。与外勤小队征召同构。
      let workspaceId: string | undefined
      if (workspaces !== undefined) {
        const ws = await workspaces.create({ rpcId: rpcId(), payload: { path: deps.warRoot } }).catch(err => {
          console.error(`[warroom] staff workspace create threw:`, err instanceof Error ? err.message : err)
          return undefined
        })
        if (ws !== undefined && ws.result.ok) workspaceId = ws.result.value.workspace.workspaceId
        else if (ws !== undefined) console.error(`[warroom] staff workspace create failed: ${ws.result.error.code}: ${ws.result.error.message}`)
        else console.error('[warroom] staff workspace create: no workspace face result')
      }
      const created = await sessions.create({ rpcId: rpcId(), payload: workspaceId !== undefined ? { workspaceId } : { cwd: deps.warRoot } })
      console.log(`[warroom] staff session create → ok=${created.result.ok}${created.result.ok ? ` id=${created.result.value.sessionId}` : ` err=${created.result.error.code}`}`)
      if (!created.result.ok) throw new Error(`大副会话创建失败：${created.result.error.code}: ${created.result.error.message}`)
      sessionId = created.result.value.sessionId
      appendDirectiveEvent(deps.stateDir, { type: 'directive_session_opened', ts: new Date().toISOString(), directiveId: directive.id, staffSessionId: sessionId })
      void sessions.rename({ rpcId: rpcId(), payload: { sessionId, title: `大副·${displayTitleOf(directive.text).slice(0, 12)}` } }).catch(() => undefined)
      const war = deps.store.get()
      if (war.hqSessionId === undefined) {
        war.hqSessionId = sessionId
        deps.store.save()
      }
    }
    // V5-R4（flag staff-wake）上下文注入：板摘要随令附上（防重复立案）；
    // V10 续战令附战线档案（祖先各代近况；pivot 落回常轨时也带，作兜底档案）。
    const suffixWake = deps.flags !== undefined && featureEnabled(deps.flags, 'staff-wake') ? `\n\n${boardDigest(deps.stateDir)}` : ''
    const suffixChain = chainNoteFor(directive, cont?.mode === 'pivot')
    const prompted = await sessions.prompt({ rpcId: rpcId(), payload: { sessionId, mode: 'queue', content: [{ type: 'text', text: `${relayPromptFor(directive, deps.flags)}${suffixChain}${suffixWake}` }] } })
    if (!prompted.result.ok) continue // busy/shape drift: leave it draft, the next tick retries the same session
    appendDirectiveEvent(deps.stateDir, { type: 'directive_received', ts: new Date().toISOString(), directiveId: directive.id, staffSessionId: sessionId })
    relayed += 1
  }
  return { relayed, staffSessionId: deps.store.get().hqSessionId }
}

/** The 15s command fuse handle. */
export interface CommandFuse {
  start(): void
  stop(): void
  bind(sessions: SessionsApiFace, workspace?: WorkspaceApiFace): void
  tickNow(): Promise<void>
}

/**
 * The 15s command fuse. Raw Node interval + unref (the cordis timer service
 * reflects at property-access time when uninjected — pitfall #1); it lives on
 * the PLUGIN's main context, never on an inject scope (whose immediate
 * disposal killed the interval — the live R8 catch). One concern per fuse:
 * it only relays commands, waking commanders stays the patrol's.
 */
export function createCommandFuse(deps: CommandFuseDeps): CommandFuse {
  let timer: NodeJS.Timeout | undefined
  let relay: SessionsApiFace | undefined
  let workspaces: WorkspaceApiFace | undefined
  // 在途守卫（V15.1 考题实锤）：下令回推的立即 tickNow 与 15s 周期 tick 撞车
  // 时，两个 relay 读到同一 draft 态（session_opened 尚未落账）→ 各开一个大副
  // 会话、各投一次令。撞车方直接让路，漏掉的活由下一轮周期 tick 兜底。
  let running = false
  const tick = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      await relayPendingCommands(deps, relay, workspaces)
    } catch (err) {
      console.error('[warroom] command fuse relay failed:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }
  }
  return {
    bind(sessions, workspace) {
      relay = sessions
      workspaces = workspace
    },
    start(): void {
      if (timer !== undefined) return
      timer = setInterval(() => { void tick() }, 15_000)
      timer.unref?.()
      console.log('[warroom] command fuse armed (15s)')
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      console.log('[warroom] command fuse stopped')
    },
    async tickNow(): Promise<void> {
      await tick()
    },
  }
}
