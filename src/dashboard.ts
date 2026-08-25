/**
 * The strategic board HTTP API (web compositions only): the war map tab's
 * data source. GET /warroom/api/board returns the cross-workspace projection
 * — every task with status/workspace/troops/reports — plus the unit roster;
 * POST /warroom/api/active toggles war mode (dashboard-side activation
 * mirrors the /war semantics: surface syncs before responding).
 * @module dsh-plugin-warroom/dashboard
 */

import { createHash } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { appendDirectiveEvent, loadDirectives, newDirectiveId } from './directives.ts'
import { listCampaignIds, loadCampaign } from './events.ts'
import { appendThreadEvent, loadAttachedThreads } from './threads.ts'
import { nextRunOf } from './schedule.ts'
import type { Roster } from './units.ts'
import type { WarStore } from './state.ts'
import type { CampaignState } from './types.ts'
import { armPlanCard, runSpikeProbe, type SpikeDeps } from './v5spike.ts'
import { planApprovedNotice, planRejectedNotice } from './persona.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'

/** Structural slice of the harness webServer route registry. */
export interface RouteRegistry {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }): () => void
}

/** Minimal structural req/res (Node-ish) — duck-typed, no host imports. */
interface ReqFace { method?: string; url?: string }
interface ResFace {
  setHeader?(k: string, v: string): void
  end(body?: string): void
  write?(chunk: string): unknown
  on?(event: string, cb: () => void): void
}

/** Read a request body as a string (the commands POST channel). */
function readBody(req: unknown): Promise<string> {
  return new Promise(resolve => {
    const r = req as { on?(event: string, cb: (chunk?: unknown) => void): void }
    const parts: string[] = []
    if (r.on === undefined) {
      resolve('')
      return
    }
    r.on('data', chunk => { parts.push(typeof chunk === 'string' ? chunk : String(chunk)) })
    r.on('end', () => resolve(parts.join('')))
  })
}

/**
 * Cheap board revision: a sha1 signature over the campaign logs' name+mtime+
 * size, the shared directive log, and the global state file. SSE frames carry
 * ONLY this — clients refetch the full projection when it moves (the
 * wire discipline: never ship task lists on the event channel).
 */
export function boardRevision(stateDir: string): string {
  let sig = ''
  try {
    const dir = join(stateDir, 'campaigns')
    for (const f of readdirSync(dir).filter(x => x.endsWith('.jsonl')).sort()) {
      const st = statSync(join(dir, f))
      sig += `${f}:${st.mtimeMs}:${st.size};`
    }
  } catch {
    // No campaigns directory yet — an empty board still has a revision.
  }
  try {
    const st = statSync(join(stateDir, 'directives.jsonl'))
    sig += `directives:${st.mtimeMs}:${st.size};`
  } catch {
    sig += 'directives:-;'
  }
  try {
    const st = statSync(join(stateDir, 'threads.jsonl'))
    sig += `threads:${st.mtimeMs}:${st.size};`
  } catch {
    sig += 'threads:-;'
  }
  try {
    const st = statSync(join(stateDir, 'state.json'))
    sig += `state:${st.mtimeMs}:${st.size}`
  } catch {
    sig += 'state:-'
  }
  return createHash('sha1').update(sig).digest('hex').slice(0, 12)
}

export interface DashboardDeps {
  store: WarStore
  stateDir: string
  roster(): Roster
  /** War root (informational — the client no longer creates sessions here). */
  warRoot: string
  /** v5 R1 机制验证探针（flag `v5-spike`）。缺省 undefined → 探针路由
   * 404，宿主面行为与改前字节等价。 */
  spike?: SpikeDeps
  /** Feature flags（V5-R2 起 dashboard 需要判档位账本路由的开关）。 */
  flags?: FeatureFlags
  /** K17 计划判定回推：把元首的批/驳结果投回参谋会话（index 经 sessions
   * 面接线；缺席/失败 best-effort，不阻塞判定入账）。 */
  pushToStaff?: (sessionId: string, text: string) => void
  /** v3: fired after a command card is created — the host ticks the command
   * fuse NOW so the staff receives in ~1s instead of waiting out the 15s
   * interval. Optional so pure-route tests can omit it. */
  onCommandCreated?: () => void
}

const STATUS_ORDER: Record<CampaignState['status'], number> = { published: 0, in_progress: 1, reported: 2, draft: 3, failed: 4, closed: 5 }

/** The board projection served to the war map (pure — reusable by tests). */
export function boardProjection(stateDir: string): Record<string, unknown>[] {
  return listCampaignIds(stateDir)
    .map(id => loadCampaign(stateDir, id))
    .filter(t => t.startedAt !== '')
    .sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      || ((b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
      || (a.startedAt < b.startedAt ? -1 : 1))
    .map(task => {
      let nextRunAt: string | null = null
      if (task.schedule !== undefined && task.schedule.enabled) {
        const anchor = task.schedule.lastTriggeredAt !== undefined ? Date.parse(task.schedule.lastTriggeredAt) : Date.parse(task.startedAt)
        if (Number.isFinite(anchor)) {
          try {
            const next = nextRunOf(task.schedule.cron, anchor)
            if (next !== undefined) nextRunAt = new Date(next).toISOString()
          } catch { /* invalid stored cron — the projection stays null */ }
        }
      }
      return {
        taskId: task.campaignId,
        title: task.title ?? task.intent,
        status: task.status,
        priority: task.priority ?? 'normal',
        quality: task.quality ?? 'common',
        rounds: task.rounds,
        attempts: task.attempts,
        deps: task.deps ?? [],
        lastError: task.lastError ?? null,
        workspacePath: task.workspacePath ?? null,
        claimedBy: task.claimedBy ?? null,
        startedAt: task.startedAt,
        brief: task.brief ?? '',
        acceptance: task.acceptance ?? '',
        schedule: task.schedule === undefined ? null : { cron: task.schedule.cron, enabled: task.schedule.enabled, nextRunAt },
        // Session cards: every commander attempt with its conversation id.
        // (Named attemptLog — `attempts` is already the numeric count.)
        attemptLog: task.attemptLog.map(a => ({ id: a.id, n: a.n, sessionId: a.sessionId, startedAt: a.startedAt, endedAt: a.endedAt ?? null, outcome: a.outcome ?? null })),
        troops: [...task.units.values()].map(u => ({
          childId: u.childId,
          label: u.label,
          unit: u.unitName,
          front: u.front,
          recalled: u.recalled !== undefined,
          settled: u.settled !== undefined,
          lastReport: u.lastReport ?? null,
        })),
        deliverables: task.deliverables.map(d => ({ kind: d.kind, summary: d.summary, detail: d.detail ?? null, ts: d.ts })),
        reports: task.reports.map(r => ({ ts: r.ts, from: r.from, text: r.text, evidence: r.evidence ?? null })),
        comments: task.comments.map(c => ({ ts: c.ts, from: c.from, text: c.text })),
        closedVerdict: task.closedVerdict ?? null,
      }
    })
}

/** A scheduled bounty the 30s tick must act on right now. Pure. */
export interface DueBounty {
  readonly taskId: string
  /** true = open the next round; false = previous round still busy, skip. */
  readonly openRound: boolean
  readonly reason: string
}

/**
 * Which cron bounties are due at `nowMs`? The anchor is the LAST trigger (or
 * task creation), so a long gap collapses into one fire — 错过即跳过, never
 * backfill (the anti-burn rule).
 */
export function dueBounties(stateDir: string, nowMs: number): DueBounty[] {
  const out: DueBounty[] = []
  for (const id of listCampaignIds(stateDir)) {
    const task = loadCampaign(stateDir, id)
    if (task.startedAt === '' || task.schedule === undefined || !task.schedule.enabled) continue
    const anchor = task.schedule.lastTriggeredAt !== undefined ? Date.parse(task.schedule.lastTriggeredAt) : Date.parse(task.startedAt)
    if (!Number.isFinite(anchor)) continue
    try {
      const next = nextRunOf(task.schedule.cron, anchor)
      if (next !== undefined && next <= nowMs) {
        const busy = task.status === 'published' || task.status === 'in_progress' || task.status === 'reported'
        out.push(busy
          ? { taskId: id, openRound: false, reason: `上一轮（${task.status}）尚未收官，本次到点跳过、不补跑` }
          : { taskId: id, openRound: true, reason: '到点重开悬赏' })
      }
    } catch {
      // Stored cron turned invalid — publish-time validation already guards new ones.
    }
  }
  return out
}

/** The 命令区 projection served to the war map (pure — reusable by tests). */
export function directiveProjection(stateDir: string): Record<string, unknown>[] {
  return loadDirectives(stateDir).map(d => ({
    commandId: d.id,
    text: d.text,
    createdAt: d.createdAt,
    status: d.status,
    staffSessionId: d.staffSessionId ?? null,
    taskId: d.taskId ?? null,
    cancelledReason: d.cancelledReason ?? null,
    // V5 档位账本：档位/理由/置信度/元首改档次数（未分诊为 null）。
    grade: d.grade ?? null,
    gradeReason: d.gradeReason ?? null,
    gradeConfidence: d.gradeConfidence ?? null,
    regrades: d.regrades ?? 0,
    // V5-R3 计划态：当前计划文本与判定状态（未呈报为 null）。
    plan: d.plan === undefined ? null : { text: d.plan.text, status: d.plan.status, decidedAt: d.plan.decidedAt ?? null },
  }))
}

/**
 * Register `/warroom` routes on the web server.
 * @returns the registration disposer.
 */
export function registerDashboard(webServer: RouteRegistry, deps: DashboardDeps): () => void {
  const handler = async (req: unknown, res: unknown): Promise<void> => {
    const r = req as ReqFace
    const w = res as ResFace
    const pathname = new URL(r.url ?? '/', 'http://local').pathname
    const send = (code: number, body: unknown): void => {
      w.setHeader?.('content-type', 'application/json; charset=utf-8')
      w.end(JSON.stringify(body))
      void code
    }
    try {
      if (r.method === 'GET' && pathname === '/warroom/api/board') {
        send(200, {
          ok: true,
          active: deps.store.get().active,
          warRoot: deps.warRoot,
          hqSessionId: deps.store.get().hqSessionId ?? null,
          revision: boardRevision(deps.stateDir),
          commands: directiveProjection(deps.stateDir),
          tasks: boardProjection(deps.stateDir),
          threads: loadAttachedThreads(deps.stateDir).map(t => ({ sessionId: t.sessionId, note: t.note, attachedAt: t.attachedAt })),
          roster: deps.roster().units.map(u => ({ name: u.name, label: u.label, description: u.description, sandboxMode: u.sandboxMode, source: u.source })),
          rosterErrors: deps.roster().errors,
        })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands') {
        // The 命令区 + button: create a draft command card; the command fuse
        // relays it into the staff conversation within 15s.
        const body = JSON.parse(await readBody(r)) as { text?: unknown }
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (text === '') {
          send(400, { ok: false, error: '命令内容为空：请用一句大白话写下元首的意图。' })
          return
        }
        if (text.length > 2000) {
          send(400, { ok: false, error: '命令太长（>2000 字）：请拆成多道命令分别下达。' })
          return
        }
        const commandId = newDirectiveId()
        appendDirectiveEvent(deps.stateDir, { type: 'directive_created', ts: new Date().toISOString(), directiveId: commandId, text })
        deps.onCommandCreated?.()
        send(200, { ok: true, commandId })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/threads') {
        // v3 挂载: pin an externally-created session onto the battlefield as
        // an「外部」card. Registry only — never writes into the session.
        const body = JSON.parse(await readBody(r)) as { sessionId?: unknown; note?: unknown }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        const note = typeof body.note === 'string' ? body.note.trim() : ''
        if (sessionId === '' || sessionId.length > 200) {
          send(400, { ok: false, error: '会话号不能为空（且不超过 200 字符）：请贴入要挂载的 thread 会话号。' })
          return
        }
        if (note.length > 500) {
          send(400, { ok: false, error: '备注太长（>500 字）：一句话说明这个 thread 在干什么即可。' })
          return
        }
        appendThreadEvent(deps.stateDir, { type: 'thread_attached', ts: new Date().toISOString(), sessionId, note })
        send(200, { ok: true, sessionId })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/threads/detach') {
        const body = JSON.parse(await readBody(r)) as { sessionId?: unknown }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        if (sessionId === '') {
          send(400, { ok: false, error: '缺少会话号。' })
          return
        }
        appendThreadEvent(deps.stateDir, { type: 'thread_detached', ts: new Date().toISOString(), sessionId })
        send(200, { ok: true, sessionId })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands/talking') {
        // Fired by the client when the user opens the staff conversation
        // from a received command card — the card flips to 对话中.
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.status === 'received') {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_talking', ts: new Date().toISOString(), directiveId: directive.id })
        }
        send(200, { ok: true, status: directive.status })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands/regrade') {
        // V5-R2 档位账本（flag staff-triage）：元首在命令卡上升降档。
        // 旗关 → 404，与改前等价。
        if (deps.flags === undefined || !featureEnabled(deps.flags, 'staff-triage')) {
          send(404, { ok: false, error: `no such route: ${r.method ?? 'GET'} ${pathname}` })
          return
        }
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown; grade?: unknown; reason?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        const grade = typeof body.grade === 'string' ? body.grade.trim() : ''
        const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : '元首命令卡升降档'
        if (commandId === '') {
          send(400, { ok: false, error: '缺少命令号。' })
          return
        }
        if (grade !== 'L0' && grade !== 'L1' && grade !== 'L2') {
          send(400, { ok: false, error: '档位必须是 L0 / L1 / L2。' })
          return
        }
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.status === 'approved' || directive.status === 'cancelled') {
          send(400, { ok: false, error: `命令 ${commandId} 已${directive.status === 'approved' ? '批准出任务' : '取消'}，档位不再变更。` })
          return
        }
        if (directive.grade === undefined) {
          send(400, { ok: false, error: `命令 ${commandId} 尚未分诊（等参谋第一轮 war_triage 入账后再升降档）。` })
          return
        }
        appendDirectiveEvent(deps.stateDir, { type: 'directive_regraded', ts: new Date().toISOString(), directiveId: commandId, grade, reason })
        send(200, { ok: true, commandId, grade })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands/plan') {
        // V5-R3 计划判定（flag staff-plan）：元首在命令卡上批准/驳回计划草案。
        if (deps.flags === undefined || !featureEnabled(deps.flags, 'staff-plan')) {
          send(404, { ok: false, error: `no such route: ${r.method ?? 'GET'} ${pathname}` })
          return
        }
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown; decision?: unknown; note?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        const decision = typeof body.decision === 'string' ? body.decision.trim() : ''
        const note = typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : undefined
        if (commandId === '') {
          send(400, { ok: false, error: '缺少命令号。' })
          return
        }
        if (decision !== 'approve' && decision !== 'reject') {
          send(400, { ok: false, error: '判定必须是 approve 或 reject。' })
          return
        }
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.plan === undefined || directive.plan.status !== 'pending') {
          send(400, { ok: false, error: `命令 ${commandId} 无待批计划（当前：${directive.plan === undefined ? '未呈报' : directive.plan.status}）。` })
          return
        }
        if (decision === 'approve') {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_plan_approved', ts: new Date().toISOString(), directiveId: commandId, ...(note !== undefined ? { note } : {}) })
        } else {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_plan_rejected', ts: new Date().toISOString(), directiveId: commandId, reason: note ?? '元首驳回，请修订重呈' })
        }
        // K17 判定回推：参谋会话在等判定结果——投递 best-effort，失败不阻塞入账
        // （下一次呈报/唤醒还会碰头）。仅在参谋会话存在时投。
        if (directive.staffSessionId !== undefined && directive.staffSessionId !== '' && deps.pushToStaff !== undefined) {
          deps.pushToStaff(directive.staffSessionId, decision === 'approve' ? planApprovedNotice(note) : planRejectedNotice(note ?? '请修订重呈'))
        }
        send(200, { ok: true, commandId, decision })
        return
      }
      if (r.method === 'GET' && pathname === '/warroom/api/events') {
        const sse = w as ResFace
        if (typeof sse.write !== 'function') {
          send(501, { ok: false, error: '此连接不支持事件流（SSE）' })
          return
        }
        sse.setHeader?.('content-type', 'text/event-stream; charset=utf-8')
        sse.setHeader?.('cache-control', 'no-cache')
        sse.setHeader?.('connection', 'keep-alive')
        sse.setHeader?.('x-accel-buffering', 'no')
        let last = boardRevision(deps.stateDir)
        sse.write('retry: 3000\n\n')
        sse.write(`data: ${JSON.stringify({ rev: last })}\n\n`)
        const watch = setInterval(() => {
          try {
            const rev = boardRevision(deps.stateDir)
            if (rev !== last) {
              last = rev
              sse.write(`data: ${JSON.stringify({ rev })}\n\n`)
            } else {
              sse.write(': ping\n\n')
            }
          } catch {
            // Never let a stat hiccup kill the stream.
          }
        }, 1000)
        sse.on?.('close', () => clearInterval(watch))
        return
      }
      if (deps.spike !== undefined && pathname === '/warroom/api/v5-spike') {
        // v5 R1 机制验证探针（flag v5-spike）：GET = 宿主面可用性快照；
        // POST {sessionId} = 全链探针；POST {action:'planCard', sessionId}
        // = 切 plan mode + 投呈报提示（评审卡截图用）。旗关则整个路由不存在。
        if (r.method === 'GET') {
          send(200, { ok: true, availability: deps.spike.availability() })
          return
        }
        if (r.method === 'POST') {
          const body = JSON.parse(await readBody(r)) as { sessionId?: unknown; action?: unknown; text?: unknown }
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
          if (sessionId === '' || sessionId.length > 200) {
            send(400, { ok: false, error: '缺少 sessionId（贴一个活体会话号，≤200 字符）。' })
            return
          }
          if (body.action === 'planCard') {
            send(200, await armPlanCard(deps.spike, sessionId, typeof body.text === 'string' && body.text.trim() !== '' ? body.text.trim() : undefined))
            return
          }
          send(200, await runSpikeProbe(deps.spike, sessionId))
          return
        }
      }
      send(404, { ok: false, error: `no such route: ${r.method ?? 'GET'} ${pathname}` })
    } catch (err) {
      send(500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return webServer.register({ kind: 'prefix', path: '/warroom', handler })
}
