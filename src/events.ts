/**
 * Campaign event log: append-only JSONL files under
 * `<stateDir>/campaigns/<campaignId>.jsonl`, folded into CampaignState on
 * read (append-only discipline — never overwrite, derive state).
 * @module dsh-plugin-warroom/events
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AttemptRecord, CampaignState, UnitRecord, WarEvent } from './types.ts'

/** Ensure the campaigns directory exists and return its path. */
export function ensureCampaignsDir(stateDir: string): string {
  const dir = join(stateDir, 'campaigns')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Append one event as a JSON line to the campaign's log (creates the file). */
export function appendEvent(stateDir: string, event: WarEvent): void {
  const file = join(ensureCampaignsDir(stateDir), `${event.campaignId}.jsonl`)
  appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8')
}

/** Read and parse a campaign's events; malformed lines are skipped, not fatal. */
export function readEvents(stateDir: string, campaignId: string): WarEvent[] {
  const file = join(ensureCampaignsDir(stateDir), `${campaignId}.jsonl`)
  if (!existsSync(file)) return []
  const events: WarEvent[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      events.push(JSON.parse(trimmed) as WarEvent)
    } catch {
      // Crash-torn tail line: ignore, the log stays append-only.
    }
  }
  return events
}

/** List every campaign id that has a log file. */
export function listCampaignIds(stateDir: string): string[] {
  const dir = ensureCampaignsDir(stateDir)
  return readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.slice(0, -'.jsonl'.length))
    .sort()
}

/**
 * Fold one task log's events into its current state — the task header
 * (secretary's brief) plus the folded campaign (troops) under it. Pure: no
 * filesystem, no clock — timestamps come from the events themselves.
 */
export function foldCampaign(campaignId: string, events: ReadonlyArray<WarEvent>): CampaignState {
  const state: CampaignState & { attemptLog: AttemptRecord[] } = {
    campaignId,
    intent: '',
    startedAt: '',
    status: 'draft',
    rounds: 0,
    attempts: 0,
    attemptLog: [],
    deliverables: [],
    reports: [],
    comments: [],
    messages: [],
    subtasks: new Map(),
    units: new Map(),
  }
  // The attempt record still open (no outcome) — failure/submit/close settle it.
  const settleAttempt = (to: 'failed' | 'reported' | 'succeeded', ts: string, acceptable: ReadonlyArray<'failed' | 'reported' | 'succeeded' | undefined>): void => {
    const i = state.attemptLog.length - 1
    const current = state.attemptLog[i]
    if (current === undefined) return
    if (acceptable.includes(current.outcome)) {
      state.attemptLog[i] = { ...current, outcome: to, endedAt: ts }
    }
  }
  for (const event of events) {
    switch (event.type) {
      case 'task_created':
        state.title = event.title
        state.intent = event.title
        state.brief = event.brief
        state.acceptance = event.acceptance
        state.priority = event.priority
        state.quality = event.quality
        state.deps = event.deps
        state.startedAt = state.startedAt === '' ? event.ts : state.startedAt
        if (event.publishedBy !== undefined) state.publishedBy = event.publishedBy
        break
      case 'task_published':
        state.status = 'published'
        state.workspacePath = event.workspacePath
        if (event.publishedBy !== undefined) state.publishedBy = event.publishedBy
        if (state.startedAt === '') state.startedAt = event.ts
        break
      case 'task_claimed':
        state.status = 'in_progress'
        state.claimedBy = event.claimedBy
        if (event.attemptId !== undefined && event.attempt !== undefined) {
          state.attempt = { id: event.attemptId, n: event.attempt }
          state.attempts = event.attempt
          // Session card: this attempt's conversation is the claiming commander.
          if (!state.attemptLog.some(a => a.id === event.attemptId)) {
            state.attemptLog.push({ id: event.attemptId, n: event.attempt, sessionId: event.claimedBy, startedAt: event.ts })
          }
        } else {
          // v0.2 legacy claim (no token): still a session card, keyed by number.
          state.attemptLog.push({ id: '', n: state.attemptLog.length + 1, sessionId: event.claimedBy, startedAt: event.ts })
        }
        if (state.hqSessionId === undefined) state.hqSessionId = event.claimedBy
        break
      case 'task_submitted':
        state.status = 'reported'
        state.reports.push({ ts: event.ts, from: event.from, text: event.report, ...(event.evidence !== undefined ? { evidence: event.evidence } : {}) })
        if (event.deliverables !== undefined && event.deliverables.length > 0) {
          state.deliverables = [...state.deliverables, ...event.deliverables]
        }
        settleAttempt('reported', event.ts, [undefined])
        break
      case 'task_attempt_failed':
        state.lastError = event.reason
        settleAttempt('failed', event.ts, [undefined])
        break
      case 'task_requeued':
        // Failure retry: back on the board for the next claim — the old
        // attempt token dies here (submit demands the CURRENT token), and its
        // session card settles as failed (a requeued attempt is dead even if
        // the commander never got a war_fail through — live R8 surgery case).
        settleAttempt('failed', event.ts, [undefined])
        state.status = 'published'
        state.claimedBy = undefined
        state.attempt = undefined
        state.lastError = event.reason
        break
      case 'task_failed':
        state.status = 'failed'
        state.lastError = event.reason
        break
      case 'task_scheduled':
        state.schedule = { cron: event.cron, enabled: event.enabled }
        break
      case 'task_schedule_triggered':
        if (state.schedule !== undefined) {
          state.schedule = { ...state.schedule, lastTriggeredAt: event.ts }
        }
        if (!event.skipped) {
          // A new bounty round: fresh claim, fresh token, loot history kept.
          state.rounds += 1
          state.status = 'published'
          state.claimedBy = undefined
          state.attempt = undefined
          state.lastError = undefined
        }
        break
      case 'task_commented':
        state.comments.push({ ts: event.ts, from: event.from, text: event.comment })
        break
      case 'message_logged':
        state.messages.push({ messageId: event.messageId, ts: event.ts, from: event.from, to: event.to, text: event.text })
        break
      case 'message_delivered':
        // Marks the matching logged message; unknown ids (torn logs, replays) are ignored.
        {
          const m = state.messages.find(x => x.messageId === event.messageId)
          if (m !== undefined) state.messages[state.messages.indexOf(m)] = { ...m, delivered: true }
        }
        break
      case 'subtask_created':
        if (!state.subtasks.has(event.subtaskId)) {
          state.subtasks.set(event.subtaskId, {
            subtaskId: event.subtaskId,
            title: event.title,
            ...(event.detail !== undefined ? { detail: event.detail } : {}),
            deps: event.deps,
            status: 'open',
            attempts: 0,
          })
        }
        break
      case 'subtask_claimed': {
        const s = state.subtasks.get(event.subtaskId)
        if (s !== undefined && s.status === 'open') {
          state.subtasks.set(event.subtaskId, {
            ...s,
            status: 'in_progress',
            claimedBy: event.claimedBy,
            claimedAt: event.ts,
            updatedAt: event.ts,
            attempt: { id: event.attemptId, n: event.attempt },
            attempts: event.attempt,
          })
        }
        break
      }
      case 'subtask_updated': {
        const s = state.subtasks.get(event.subtaskId)
        // The token gate rides the fold too: a stale attemptId is a replay or
        // an ownership change — the update is ignored, not applied.
        if (s === undefined || s.attempt === undefined || s.attempt.id !== event.attemptId) break
        if (event.status === 'completed') {
          state.subtasks.set(event.subtaskId, { ...s, status: 'completed', updatedAt: event.ts, parked: undefined, ...(event.note !== undefined ? { lastNote: event.note } : {}) })
        } else if (event.status === 'blocked') {
          // Blocked returns the subtask to the open pool; the note survives.
          state.subtasks.set(event.subtaskId, { ...s, status: 'open', claimedBy: undefined, claimedAt: undefined, attempt: undefined, updatedAt: event.ts, parked: undefined, ...(event.note !== undefined ? { lastNote: event.note } : {}) })
        } else {
          state.subtasks.set(event.subtaskId, { ...s, updatedAt: event.ts, parked: undefined, ...(event.note !== undefined ? { lastNote: event.note } : {}) })
        }
        break
      }
      case 'subtask_parked': {
        // Park keeps the attempt and token: the interrupted owner may resume
        // with the SAME attempt_id; rotation needs an explicit reassignment.
        const s = state.subtasks.get(event.subtaskId)
        if (s !== undefined && s.status === 'in_progress') {
          state.subtasks.set(event.subtaskId, { ...s, parked: true, updatedAt: event.ts, ...(event.reason !== undefined ? { lastNote: event.reason } : {}) })
        }
        break
      }
      // V5-R3 (staff-goal)：纯账本事件（goal 交接入账红线）——不改 fold
      // 状态，回放/审计经原始日志。
      case 'commander_goal_armed':
      case 'commander_goal_settled':
      case 'staff_woken':
        break
      // V5-R4 (quota-recovery)：原地暂停/恢复位——不动 status/attempt。
      case 'task_paused_quota':
        state.quotaPaused = true
        break
      case 'task_resumed_quota':
        state.quotaPaused = false
        break
      case 'task_closed':
        state.status = 'closed'
        state.closedVerdict = event.verdict
        // A 通过 verdict upgrades the reported attempt into the winning session.
        if (event.verdict.includes('通过')) settleAttempt('succeeded', event.ts, ['reported', undefined])
        break
      case 'campaign_started':
        // v0.1 compat: an old log's campaign header doubles as a task header.
        state.intent = event.intent
        state.startedAt = state.startedAt === '' ? event.ts : state.startedAt
        if (event.hqSessionId !== undefined) state.hqSessionId = event.hqSessionId
        if (state.status === 'draft') state.status = 'in_progress'
        break
      case 'plan_recorded':
        state.plan = state.plan === undefined ? event.plan : `${state.plan}\n${event.plan}`
        break
      case 'unit_deployed':
        state.units.set(event.childId, {
          childId: event.childId,
          unitName: event.unitName,
          label: event.label,
          mission: event.mission,
          front: event.front,
          writes: event.writes,
          deployedAt: event.ts,
          orders: [],
        })
        break
      case 'order_sent': {
        const unit = state.units.get(event.childId)
        if (unit !== undefined) {
          state.units.set(event.childId, { ...unit, orders: [...unit.orders, { ts: event.ts, order: event.order }] })
        }
        break
      }
      case 'report_received': {
        const unit = state.units.get(event.childId)
        if (unit !== undefined) state.units.set(event.childId, { ...unit, lastReport: event.summary })
        break
      }
      case 'unit_recalled': {
        const unit = state.units.get(event.childId)
        if (unit !== undefined) state.units.set(event.childId, { ...unit, recalled: { reason: event.reason, ts: event.ts } })
        break
      }
      case 'unit_settled': {
        const unit = state.units.get(event.childId)
        if (unit !== undefined) state.units.set(event.childId, { ...unit, settled: { stopReason: event.stopReason, ts: event.ts } })
        break
      }
      case 'campaign_closed':
        // v0.1 compat.
        state.status = 'closed'
        state.closedVerdict = event.outcome
        break
    }
  }
  return state
}

/** Load one campaign from disk (read + fold). */
export function loadCampaign(stateDir: string, campaignId: string): CampaignState {
  return foldCampaign(campaignId, readEvents(stateDir, campaignId))
}

/** A unit still holds its front if deployed, not recalled, and not settled. */
export function isActiveUnit(unit: UnitRecord): boolean {
  return unit.recalled === undefined && unit.settled === undefined
}
