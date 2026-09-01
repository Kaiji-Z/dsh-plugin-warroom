/**
 * v3 挂载 thread (attach) — externally-created sessions pinned onto the
 * battlefield as「外部」cards. One append-only JSONL log at
 * `<stateDir>/threads.jsonl`, folded on read — the same discipline as the
 * campaign and directive logs (never overwrite, derive state). Attach/detach
 * are registry operations ONLY: no task semantics, no writes into the
 * attached session — the board stays a read projection (SPEC §6).
 * @module dsh-plugin-stardeck/threads
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonlCached } from './fold-cache.ts'

/** One externally-attached thread, folded from the log. */
export interface AttachedThread {
  readonly sessionId: string
  /** User-supplied one-line note (what this thread is about). */
  readonly note: string
  readonly attachedAt: string
}

/** The attach log's entry union (one JSON line each). */
export type ThreadEvent =
  | { type: 'thread_attached'; ts: string; sessionId: string; note: string }
  | { type: 'thread_detached'; ts: string; sessionId: string }

function threadsFile(stateDir: string): string {
  return join(stateDir, 'threads.jsonl')
}

/** Append one event as a JSON line to the attach log. */
export function appendThreadEvent(stateDir: string, event: ThreadEvent): void {
  mkdirSync(stateDir, { recursive: true })
  appendFileSync(threadsFile(stateDir), `${JSON.stringify(event)}\n`, 'utf8')
}

/** Read and parse the attach log; malformed lines are skipped, not fatal.
 * B1-件③：经 mtime+size 指纹缓存（未变更零重读；append 必失效）。 */
export function readThreadEvents(stateDir: string): ThreadEvent[] {
  return readJsonlCached(threadsFile(stateDir), line => JSON.parse(line) as ThreadEvent)
}

/**
 * Fold the attach log: attach registers (or re-attaches with a fresh note and
 * timestamp), detach removes. Events for unknown sessions are ignored. Pure.
 */
export function foldThreads(events: ReadonlyArray<ThreadEvent>): AttachedThread[] {
  const bySession = new Map<string, AttachedThread>()
  for (const event of events) {
    if (event.type === 'thread_attached') {
      bySession.set(event.sessionId, { sessionId: event.sessionId, note: event.note, attachedAt: event.ts })
    } else {
      bySession.delete(event.sessionId)
    }
  }
  return [...bySession.values()]
}

/** Load currently-attached threads from disk (read + fold). */
export function loadAttachedThreads(stateDir: string): AttachedThread[] {
  return foldThreads(readThreadEvents(stateDir))
}
