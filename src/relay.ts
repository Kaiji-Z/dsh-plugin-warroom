/**
 * The command relay (命令引信) — v2.0. A 15s host fuse that moves sovereign
 * commands from the board's 命令区 into the 参谋部 conversation: draft
 * directives get a secretary session (created via the host apiProxy on first
 * need, cwd-bound to the war root, activated with `/war` so the persona and
 * war_* tools exist before the relay text reaches the model) and a relay
 * prompt, then the directive card flips to `received` — the user clicks in
 * and answers the secretary's questions there.
 *
 * Structural slices keep this module free of host imports (unit-testable).
 * @module dsh-plugin-warroom/relay
 */

import { appendDirectiveEvent, loadDirectives, pendingDirectives, type Directive } from './directives.ts'
import type { WarStore } from './state.ts'

/** Structural slice of the harness apiProxy's sessions + workspace domains. */
export interface SessionsApiFace {
  create(request: { rpcId: string; payload: { workspaceId?: string; cwd?: string } }): Promise<{ result: { ok: true; value: { sessionId: string } } | { ok: false; error: { code: string; message: string } } }>
  rename(request: { rpcId: string; payload: { sessionId: string; title: string } }): Promise<{ result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } } }>
  prompt(request: { rpcId: string; payload: { sessionId: string; mode: 'queue'; content: Array<{ type: 'text'; text: string }> } }): Promise<{ result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } } }>
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
  /** War root — the secretary session's cwd (sandbox-visible). */
  warRoot: string
  /** Lights the war surface (persona + war_* tools) — a queued '/war' TEXT is
   * NOT intercepted as a slash command via apiProxy.prompt (live R8 catch),
   * so activation must flip the store and sync the surface in code. */
  activate(): void
}

function rpcId(): string {
  return `warroom-${crypto.randomUUID()}`
}

/**
 * The relay text delivered into the secretary conversation for one command.
 * Pure — the drafting instructions ride the text because the persona layer
 * alone doesn't know the board's command flow.
 */
export function relayPromptFor(directive: Directive): string {
  return `【命令区】新命令 ${directive.id}
${directive.text}

参谋：这是元首从作战室命令区下达的命令。按 warroom-bounty-drafting（悬赏令起草法）处理：
- 听懂意图；需要澄清就用提问卡片问元首——元首看到命令卡亮起后会点进本会话来回答。
- 能定案就呈任务书，经元首批准后 war_publish 发布，务必携带参数 commandId=${directive.id}（发布后命令卡自动标记「已批准」并链接到任务）。
- 发布前按起草法定好工作区路由（元首点名 > 最近用过 > 当前打开 > 决策卡让元首选项目名）；全新无归属项目用 @new:<名字> 新开副本。
- 确实无法成案（元首放弃/无法澄清）就 war_abandon_command 说明原因。`
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
export async function relayPendingCommands(deps: CommandFuseDeps, sessions: SessionsApiFace | undefined): Promise<{ relayed: number; secretarySessionId?: string }> {
  const pending = pendingDirectives(loadDirectives(deps.stateDir))
  if (pending.length === 0) return { relayed: 0 }
  if (sessions === undefined) return { relayed: 0 }
  // The war surface (persona + war_* tools) must exist before any relay text
  // reaches the model — code-side activation, never a queued '/war' string.
  if (!deps.store.get().active) deps.activate()
  let relayed = 0
  for (const directive of pending) {
    let sessionId = directive.secretarySessionId
    if (sessionId === undefined) {
      const created = await sessions.create({ rpcId: rpcId(), payload: { cwd: deps.warRoot } })
      console.log(`[warroom] staff session create → ok=${created.result.ok}${created.result.ok ? ` id=${created.result.value.sessionId}` : ` err=${created.result.error.code}`}`)
      if (!created.result.ok) throw new Error(`参谋会话创建失败：${created.result.error.code}: ${created.result.error.message}`)
      sessionId = created.result.value.sessionId
      appendDirectiveEvent(deps.stateDir, { type: 'directive_session_opened', ts: new Date().toISOString(), directiveId: directive.id, secretarySessionId: sessionId })
      void sessions.rename({ rpcId: rpcId(), payload: { sessionId, title: `参谋·${directive.text.slice(0, 12)}` } }).catch(() => undefined)
      const war = deps.store.get()
      if (war.hqSessionId === undefined) {
        war.hqSessionId = sessionId
        deps.store.save()
      }
    }
    const prompted = await sessions.prompt({ rpcId: rpcId(), payload: { sessionId, mode: 'queue', content: [{ type: 'text', text: relayPromptFor(directive) }] } })
    if (!prompted.result.ok) continue // busy/shape drift: leave it draft, the next tick retries the same session
    appendDirectiveEvent(deps.stateDir, { type: 'directive_received', ts: new Date().toISOString(), directiveId: directive.id, secretarySessionId: sessionId })
    relayed += 1
  }
  return { relayed, secretarySessionId: deps.store.get().hqSessionId }
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
