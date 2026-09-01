/**
 * The `/war` slash command (host side): the sovereign's entry into the
 * warroom. Bare `/war` activates war mode and queues the commander's
 * report-in prompt; `/war <text>` queues that text as the first strategic
 * order. Activation persists BEFORE the prompt lands, so the model the
 * kickoff meets already carries the commander persona and the war_* tools
 * (the activation-before-prompt ordering guarantee).
 * @module dsh-plugin-stardeck/commands
 */

import { warKickoffPrompt } from './persona.ts'
import type { WarStore } from './state.ts'

/** Structural `CommandInvocation` (the fields this handler consumes). */
export interface CommandInvocationFace {
  readonly agent: { followup(message: unknown): void; readonly id?: string }
  readonly rawInput: string
}

/** Structural `CommandResult`. */
export type CommandResultFace =
  | { readonly kind: 'success'; readonly text?: string }
  | { readonly kind: 'error'; readonly text: string }

/** Structural slice of the harness `commands` service. */
export interface CommandsServiceFace {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly input?: { readonly hint: string }
    readonly handler: (invocation: CommandInvocationFace) => CommandResultFace | Promise<CommandResultFace>
  }): () => void
}

/** Wiring shared with the activation surface. */
export interface WarCommandDeps {
  store: WarStore
  /** Applies an activation flip to the host surface (tool registry sync). */
  onActiveChange: (active: boolean) => void
}

/** Build one identified user message (uuid + freeze, plugin-sourced). */
function userMessage(text: string): { id: string; role: 'user'; content: Array<{ type: 'text'; text: string }>; source: { kind: 'plugin'; plugin: string } } {
  const content = Object.freeze([{ type: 'text', text }]) as Array<{ type: 'text'; text: string }>
  return Object.freeze({
    id: crypto.randomUUID(),
    role: 'user',
    content,
    source: Object.freeze({ kind: 'plugin', plugin: 'dsh-plugin-stardeck' }),
  })
}

/** `/war [<strategic intent>]` → staff report-in or first intent to process. */
export function warOrderPrompt(rawInput: string): string {
  const text = rawInput.trim()
  if (text === '') return warKickoffPrompt()
  return `【舰长意图】${text}\n\n大副：请按条令处理——听懂意图、需要澄清就问、清晰则起草任务书，经舰长过目后 war_publish 发布。`
}

/** Execute `/war` against the live store. Pure over the deps; no HTTP. */
export function executeWarCommand(deps: WarCommandDeps, invocation: CommandInvocationFace): CommandResultFace {
  const war = deps.store.get()
  if (!war.active) {
    war.active = true
    if (war.hqSessionId === undefined && invocation.agent.id !== undefined) {
      war.hqSessionId = invocation.agent.id
    }
    deps.store.save()
    // Tools + persona exist before the queued prompt reaches the model.
    deps.onActiveChange(true)
  }
  invocation.agent.followup(userMessage(warOrderPrompt(invocation.rawInput)))
  return { kind: 'success', text: '舰桥已就位 — 外勤小队正在报到；外勤组员状态用 war_status 查询 / War room active — the commander is reporting in.' }
}

/**
 * Register `/war` on the harness command runtime (global scope).
 * @returns the registration disposer.
 */
export function registerWarCommand(commands: CommandsServiceFace, deps: WarCommandDeps): () => void {
  return commands.register({
    name: 'war',
    description: 'enter the war room — activate the staff and talk strategy (tasks are authored, published, and auto-claimed)',
    input: { hint: '[<strategic intent>]' },
    handler: invocation => executeWarCommand(deps, invocation),
  })
}

/** `/peace` — stand the war room down (staff persona + tools unmounted). */
export function registerPeaceCommand(commands: CommandsServiceFace, deps: WarCommandDeps): () => void {
  return commands.register({
    name: 'peace',
    description: 'stand the war room down — deactivate the staff persona and the war_* tool surface',
    handler: () => {
      const war = deps.store.get()
      if (war.active) {
        war.active = false
        deps.store.save()
        deps.onActiveChange(false)
      }
      return { kind: 'success', text: '舰桥已休眠（在役外勤组员与会话保留，可 /war 重新启用）/ War room stood down.' }
    },
  })
}
