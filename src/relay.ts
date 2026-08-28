/**
 * The command relay (命令引信) — v2.0. A 15s host fuse that moves sovereign
 * commands from the board's 命令区 into the 参谋部 conversation: draft
 * directives get a staff session (created via the host apiProxy on first
 * need, cwd-bound to the war root, activated with `/war` so the persona and
 * war_* tools exist before the relay text reaches the model) and a relay
 * prompt, then the directive card flips to `received` — the user clicks in
 * and answers the staff's questions there.
 *
 * Structural slices keep this module free of host imports (unit-testable).
 * @module dsh-plugin-warroom/relay
 */

import { appendDirectiveEvent, foldChains, loadDirectives, pendingDirectives, type Directive } from './directives.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'
import { bountyDraftingSkillContent } from './skill.ts'
import { boardDigest } from './wake.ts'
import { loadCampaign } from './events.ts'
import type { TaskStatus } from './types.ts'
import type { WarStore } from './state.ts'

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
 * The relay text delivered into the staff conversation for one command.
 * Pure — the drafting instructions ride the text because the persona layer
 * alone doesn't know the board's command flow. V5-R2: with the staff-triage
 * flag the triage discipline rides the text too (flag off = byte-identical).
 */
export function relayPromptFor(directive: Directive, flags?: FeatureFlags): string {
  const base = `【命令区】新命令 ${directive.id}
${directive.text}

参谋：这是元首从作战室命令区下达的命令。按 warroom-bounty-drafting（悬赏令起草法）处理：
- 听懂意图；需要澄清就用提问卡片问元首——元首看到命令卡亮起后会点进本会话来回答。
- 能定案就呈任务书，经元首批准后 war_publish 发布，务必携带参数 commandId=${directive.id}（发布后命令卡自动标记「已批准」并链接到任务）。
- 发布前按起草法定好工作区路由（元首点名 > 最近用过 > 当前打开 > 决策卡让元首选项目名）；全新无归属项目用 @new:<名字> 新开副本。
- 确实无法成案（元首放弃/无法澄清）就 war_abandon_command 说明原因。`
  if (flags === undefined || !featureEnabled(flags, 'staff-triage')) return base
  // V5-R3（staff-plan 旗）：L1/L2 走计划态——勘察后 war_plan 呈批，元首
  // 批准后 war_publish 才放行（发布硬门在工具侧拦）。旗关时维持 R2 的
  // 现行呈批（完整任务书经元首批准）。
  const planDiscipline = featureEnabled(flags, 'staff-plan')
    ? `- L1 复杂：先勘察（读相关工作区/依赖），再用 war_plan 呈一页纸计划（command_id=${directive.id}：目标、≤5 步骤、涉及工作区、风险与回退）；元首在命令卡上批准后才能 war_publish——没批前发布会被硬门拦下。驳回就按意见修订重呈。
- L2 不明确：先用提问卡片向元首澄清收敛，能定案后按复杂度走 L0 或 L1。`
    : `- L1 复杂：走现行呈批——完整任务书经元首批准后 war_publish。
- L2 不明确：先用提问卡片向元首澄清收敛，能定案后再按复杂度走 L0/L1。`
  // V5-R4（坑2 正解）：apiProxy 会话看不到编程注册技能——起草法全文内嵌
  // 提示词（单一事实源：与 skill.ts 同一函数）。板摘要注入在 relayPending
  // _Commands 侧拼（staff-wake 旗）——本函数保持纯。
  const craft = bountyDraftingSkillContent()
  // V6 命令拆解（staff-decompose 旗）：大命令拆链纪律——呈批复用计划卡，
  // 成链发布落顺序 deps + 链级同一工作区。
  const decomposeDiscipline = featureEnabled(flags, 'staff-decompose')
    ? `\n- 一步做不完的大命令：先勘察，再 war_decompose 呈拆解（command_id=${directive.id}：一页纸总计划 + ≥2 个子任务书，逐个过 lint）；元首在命令卡上批准后 war_publish_chain 成链发布（子任务同工作区顺序接力），不要再拆成多个独立命令。`
    : ''
  return `${base}

【V5 分诊】接令第一轮先用 war_triage 报档位（command_id=${directive.id}，grade=L0/L1/L2，reason 一句话，confidence 0-1），再按档位走流程：
- L0 简单【默认优先】：轻任务书直发——标题一句话、brief 两三句、验收 ≤3 条可判定项，直接 war_publish（带 commandId），无需元首批准。
${planDiscipline}${decomposeDiscipline}
- 元首文本标记优先：命令含「!!直接做」强制 L0、含「??先看方案」强制 L2（工具会强制改档，照办即可）。
- 发布前过系统 lint：标题 ≥4 字、正文 ≥10 字、验收用「；/、」列举或 ≥30 字明确完成定义——不可判定会被拦。

【起草法全文】（内嵌——本会话看不到技能库）
${craft}`
}

/** 罗马代际标签（服务端侧小实现——客户端视图层的 GEN_ROMAN 不跨端复用）。 */
function romanGen(n: number): string {
  const numerals = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']
  return numerals[n] ?? `第${n}代`
}

function brief(text: string, w: number): string {
  return text.length > w ? `${text.slice(0, w)}…` : text
}

/** V10 战线档案条目（纯）：一代旧令的一行战况，深挖兜底写「战况不详」。 */
export interface ChainStepFace {
  readonly generation: number
  readonly text: string
  readonly outcome?: string
}

export function chainDigest(steps: ReadonlyArray<ChainStepFace>): string {
  return steps
    .map(s => `- ${romanGen(s.generation)} 代「${brief(s.text, 18)}」→ ${s.outcome ?? '战况不详（任务账本缺失）'}`)
    .join('\n')
}

/** 从挂链任务折出一行战况（纯；结构性切片，deepen/retry 的征召注入用）。 */
export function chainOutcomeOf(task?: { status: TaskStatus; lastError?: string; closedVerdict?: string }): string {
  if (task === undefined) return '未成形（尚未发布成任务）'
  if (task.status === 'closed') return `已收官：${task.closedVerdict ?? '验收通过'}`
  if (task.status === 'failed') return `败退${task.lastError !== undefined && task.lastError !== '' ? `——败因：${task.lastError}` : ''}`
  switch (task.status) {
    case 'reported': return '已交稿，待元首验收'
    case 'in_progress': return '作战进行中'
    case 'published': return '已发布，待指挥官领令'
    default: return '草稿中'
  }
}

/** V10 pivot 转达文本（纯）：不进参谋对话——指令直插执行会话队列。 */
export function pivotPromptFor(parentText: string, directiveId: string, text: string): string {
  return `【续战令·转向】${directiveId}（续自「${brief(parentText, 16)}」）

指挥官：元首在作战进行中插播指令——

${text}

按队列在本回合结束后送达；与本任务既定路线冲突时，以本条为准修订方向。确实无法转向就照常收束，由参谋另案处理。`
}

/**
 * Run one fuse pass: relay every pending directive into ITS OWN staff
 * conversation (v3 每命令一会话 — one staff thread per command, topic-clean).
 * A directive without a session gets a fresh one (cwd-bound to the war root,
 * activated with `/war` in code, named `参谋·<命令摘要>`); the session id is
 * recorded as `directive_session_opened` BEFORE the relay text goes out, so a
 * failed prompt retries into the same conversation instead of leaking a new
 * one. `state.hqSessionId` degrades to a legacy fallback (first session wins)
 * for tasks that predate the command flow. Idempotent per directive — a
 * relayed command is `received` and never picked up twice.
 */
export async function relayPendingCommands(deps: CommandFuseDeps, sessions: SessionsApiFace | undefined): Promise<{ relayed: number; staffSessionId?: string }> {
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
    const steps = []
    for (let g = 1; g < gen && g <= members.length; g++) {
      const anc = byId.get(members[g - 1]!)
      if (anc === undefined) continue
      const camp = campaignOf(anc.taskId)
      steps.push({
        generation: g,
        text: anc.text,
        outcome: chainOutcomeOf(camp === undefined ? undefined : { status: camp.status, lastError: camp.lastError, closedVerdict: camp.closedVerdict }),
      })
    }
    return `\n\n【战线档案 · ${romanGen(gen)} 代续战令】此前各代战况（勿重蹈覆辙）：\n${chainDigest(steps)}\n工作区纪律：本令任务默认发布到父代任务的工作区（战线跟着战场走）；仅当命令明确要求换地点才换。`
  }
  let relayed = 0
  for (const directive of pending) {
    // V10 pivot 分路：指令直插父任务的执行会话队列，一穿五态即归档
    // （received 记执行会话号 → approved 挂父任务号）；不开新参谋会话。
    // 无活体 attempt（还在排队/已收官）落回常轨走参谋且带战线档案兜底。
    const cont = directive.continuation
    if (cont !== undefined && cont.mode === 'pivot') {
      const parent = byId.get(cont.parentId)
      const camp = campaignOf(parent?.taskId)
      const live = camp?.attemptLog.filter(a => a.endedAt === undefined).at(-1)
      if (parent !== undefined && camp !== undefined && live !== undefined) {
        const pushed = await sessions.prompt({ rpcId: rpcId(), payload: { sessionId: live.sessionId, mode: 'queue', content: [{ type: 'text', text: pivotPromptFor(parent.text, directive.id, directive.text) }] } })
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
      const created = await sessions.create({ rpcId: rpcId(), payload: { cwd: deps.warRoot } })
      console.log(`[warroom] staff session create → ok=${created.result.ok}${created.result.ok ? ` id=${created.result.value.sessionId}` : ` err=${created.result.error.code}`}`)
      if (!created.result.ok) throw new Error(`参谋会话创建失败：${created.result.error.code}: ${created.result.error.message}`)
      sessionId = created.result.value.sessionId
      appendDirectiveEvent(deps.stateDir, { type: 'directive_session_opened', ts: new Date().toISOString(), directiveId: directive.id, staffSessionId: sessionId })
      void sessions.rename({ rpcId: rpcId(), payload: { sessionId, title: `参谋·${directive.text.slice(0, 12)}` } }).catch(() => undefined)
      const war = deps.store.get()
      if (war.hqSessionId === undefined) {
        war.hqSessionId = sessionId
        deps.store.save()
      }
    }
    // V5-R4（flag staff-wake）上下文注入：板摘要随令附上（防重复立案）；
    // V10 续战令附战线档案（祖先各代战况；pivot 落回常轨时也带，作兜底档案）。
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
  bind(sessions: SessionsApiFace): void
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
  return {
    bind(sessions) {
      relay = sessions
    },
    start(): void {
      if (timer !== undefined) return
      timer = setInterval(() => {
        void relayPendingCommands(deps, relay).catch(err => {
          console.error('[warroom] command fuse relay failed:', err instanceof Error ? err.message : err)
        })
      }, 15_000)
      timer.unref?.()
      console.log('[warroom] command fuse armed (15s)')
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      console.log('[warroom] command fuse stopped')
    },
    async tickNow(): Promise<void> {
      await relayPendingCommands(deps, relay).catch(err => {
        console.error('[warroom] command fuse relay failed:', err instanceof Error ? err.message : err)
      })
    },
  }
}
