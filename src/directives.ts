/**
 * The sovereign's directive feed (命令区) — v2.0. Natural-language commands
 * created from the board UI, relayed to the secretary by the host command
 * fuse, and resolved either into a published task (approved) or dropped
 * (cancelled). One append-only JSONL log at `<stateDir>/directives.jsonl`,
 * folded on read — the same discipline as the campaign logs (never
 * overwrite, derive state).
 * @module dsh-plugin-warroom/directives
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Directive lifecycle on the 命令区 board column. */
export type DirectiveStatus = 'draft' | 'received' | 'talking' | 'approved' | 'cancelled'

/** One sovereign command, folded from the directive log. */
export interface Directive {
  readonly id: string
  /** The sovereign's natural-language text, verbatim. */
  readonly text: string
  readonly createdAt: string
  status: DirectiveStatus
  /** The 参谋部 session that took the command (set on receive). */
  secretarySessionId?: string
  /** The task this directive became (set on approval). */
  taskId?: string
  /** Cancellation reason (set on cancel). */
  cancelledReason?: string
}

/** The directive log's entry union (one JSON line each). */
export type DirectiveEvent =
  | { type: 'directive_created'; ts: string; directiveId: string; text: string }
  | { type: 'directive_session_opened'; ts: string; directiveId: string; secretarySessionId: string }
  | { type: 'directive_received'; ts: string; directiveId: string; secretarySessionId: string }
  | { type: 'directive_talking'; ts: string; directiveId: string }
  | { type: 'directive_approved'; ts: string; directiveId: string; taskId: string }
  | { type: 'directive_cancelled'; ts: string; directiveId: string; reason: string }

/** Terminal statuses — later transitions are ignored (a published command
 * cannot be re-approved, a cancelled one cannot resurrect). */
const TERMINAL: ReadonlySet<DirectiveStatus> = new Set(['approved', 'cancelled'])

function directivesFile(stateDir: string): string {
  return join(stateDir, 'directives.jsonl')
}

/** Append one event as a JSON line to the shared directive log. */
export function appendDirectiveEvent(stateDir: string, event: DirectiveEvent): void {
  mkdirSync(stateDir, { recursive: true })
  appendFileSync(directivesFile(stateDir), `${JSON.stringify(event)}\n`, 'utf8')
}

/** Read and parse the directive log; malformed lines are skipped, not fatal. */
export function readDirectiveEvents(stateDir: string): DirectiveEvent[] {
  const file = directivesFile(stateDir)
  if (!existsSync(file)) return []
  const events: DirectiveEvent[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      events.push(JSON.parse(trimmed) as DirectiveEvent)
    } catch {
      // Crash-torn tail line: ignore, the log stays append-only.
    }
  }
  return events
}

/**
 * Fold the shared log into directives. Creation order is preserved; events
 * for unknown ids are ignored; transitions after a terminal status are
 * ignored. Pure: no filesystem, no clock.
 */
export function foldDirectives(events: ReadonlyArray<DirectiveEvent>): Directive[] {
  const byId = new Map<string, Directive>()
  for (const event of events) {
    const current = byId.get(event.directiveId)
    if (current === undefined) {
      if (event.type !== 'directive_created') continue
      byId.set(event.directiveId, { id: event.directiveId, text: event.text, createdAt: event.ts, status: 'draft' })
      continue
    }
    if (TERMINAL.has(current.status)) continue
    switch (event.type) {
      // v3 每命令一会话: the per-command staff session lands BEFORE the relay
      // text goes out, so a failed prompt retries into the same conversation.
      case 'directive_session_opened':
        current.secretarySessionId = event.secretarySessionId
        break
      case 'directive_received':
        current.status = 'received'
        current.secretarySessionId = event.secretarySessionId
        break
      case 'directive_talking':
        current.status = 'talking'
        break
      case 'directive_approved':
        current.status = 'approved'
        current.taskId = event.taskId
        break
      case 'directive_cancelled':
        current.status = 'cancelled'
        current.cancelledReason = event.reason
        break
    }
  }
  return [...byId.values()]
}

/** Load all directives from disk (read + fold), oldest first. */
export function loadDirectives(stateDir: string): Directive[] {
  return foldDirectives(readDirectiveEvents(stateDir))
}

/** The command fuse's worklist: draft commands no secretary has taken yet. */
export function pendingDirectives(directives: ReadonlyArray<Directive>): Directive[] {
  return directives.filter(d => d.status === 'draft')
}

/** New directive ids: time-ordered, filesystem-safe, visually distinct from
 * task ids (`cmd-` prefix — the two must never be confusable on a card). */
export function newDirectiveId(now: Date = new Date()): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `cmd-${stamp}-${crypto.randomUUID().slice(0, 4)}`
}
