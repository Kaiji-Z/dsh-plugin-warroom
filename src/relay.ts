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

import { appendDirectiveEvent, loadDirectives, pendingDirectives, type Directive } from './directives.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'
import { bountyDraftingSkillContent } from './skill.ts'
import { boardDigest } from './wake.ts'
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
  const pending = pendingDirectives(loadDirectives(deps.stateDir))
  if (pending.length === 0) return { relayed: 0 }
  if (sessions === undefined) return { relayed: 0 }
  // The war surface (persona + war_* tools) must exist before any relay text
  // reaches the model — code-side activation, never a queued '/war' string.
  if (!deps.store.get().active) deps.activate()
  let relayed = 0
  for (const directive of pending) {
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
    // V5-R4（flag staff-wake）上下文注入：板摘要随令附上（防重复立案）。
    const suffix = deps.flags !== undefined && featureEnabled(deps.flags, 'staff-wake') ? `\n\n${boardDigest(deps.stateDir)}` : ''
    const prompted = await sessions.prompt({ rpcId: rpcId(), payload: { sessionId, mode: 'queue', content: [{ type: 'text', text: `${relayPromptFor(directive, deps.flags)}${suffix}` }] } })
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
