/**
 * The war map (两区指挥中心) — the warroom's v3.0 operating surface. Two
 * regions: the HQ (指挥中心, left — 命令 + 任务 columns, EVERY user input
 * lives here) and the battlefield (战场, right — 进行中/已完成/已失败
 * attempt session cards, read-only). Battlefield cards are DETAIL-FIRST:
 * clicking opens an in-board modal whose 「进入会话复盘」 button jumps into
 * the thread (sessions.open); reported/failed cards also carry a 「去处理」
 * shortcut to the owning command's staff conversation. The v2.0 HQ-create
 * button is gone — the staff thread is created by the command fuse and
 * entered via command cards only (v3 decision table, SPEC §2).
 * @module dsh-plugin-warroom/client/views
 */

import { createElement, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { attachThread, createCommand, decidePlan, detachThread, markTalking, regradeCommand, useWar, type BoardAttempt, type BoardCommand, type BoardQuality, type BoardTask, type BoardThread } from './data.ts'
import { warCopy } from './copy.ts'
import { QUALITY_TIERS } from '../types.ts'

/** Structural slices of the framework services. */
export interface ClientServicesFace {
  sessions?: {
    scope(sessionId: string): unknown
    sessionOf(actx: unknown): { prompt(content: Array<{ type: 'text'; text: string }>, mode: 'queue'): Promise<{ ok: boolean; error?: { code: string; message: string } }> } | undefined
    open(sessionId: string): void
    /** Navigation awareness: current-session change hands the column back. */
    list?: { getSnapshot(): { current: string | undefined }; subscribe(fn: () => void): () => void }
  }
}

/** 文案一律经 warCopy（皮肤词典）取——不写内联字面量（换肤基础层）；
 *  cls/dot 是样式键不属于皮肤文案，留在视图层。 */
const STATUS_LABEL = warCopy.taskStatus

const COMMAND_STATUS: Record<BoardCommand['status'], { label: string; cls: string; dot: string; hint?: string }> = {
  draft: { ...warCopy.commandStatus.draft, cls: 'st-draft', dot: 'draft' },
  received: { ...warCopy.commandStatus.received, cls: 'st-received', dot: 'received' },
  talking: { ...warCopy.commandStatus.talking, cls: 'st-talking', dot: 'received' },
  approved: { ...warCopy.commandStatus.approved, cls: 'st-approved', dot: 'done' },
  cancelled: { ...warCopy.commandStatus.cancelled, cls: 'st-cancelled', dot: 'draft' },
}

const OUTCOME_LABEL: Record<NonNullable<BoardAttempt['outcome']> | 'live', { label: string; cls: string }> = {
  live: { label: warCopy.outcome.live.label, cls: 'oc-live' },
  reported: { label: warCopy.outcome.reported.label, cls: 'oc-reported' },
  succeeded: { label: warCopy.outcome.succeeded.label, cls: 'oc-done' },
  failed: { label: warCopy.outcome.failed.label, cls: 'oc-fail' },
}

const QUALITY_LABEL: Record<BoardQuality, string> = Object.fromEntries(QUALITY_TIERS.map(q => [q.tier, q.label])) as Record<BoardQuality, string>

/** 地图标记：「！」新悬赏待领取，「？」战报可收菜（分区时代的残留信号灯）。 */
const STATUS_MARK: Partial<Record<BoardTask['status'], { mark: string; cls: string; title: string }>> = {
  published: { ...warCopy.statusMark.published, cls: 'bang' },
  reported: { ...warCopy.statusMark.reported, cls: 'query' },
}

/** Where does this task's verdict conversation live? The owning command's
 * staff session first, the legacy HQ session as fallback (v3: 每命令一会话). */
function staffSessionFor(taskId: string, commands: BoardCommand[], hqSessionId: string | null): string | null {
  const own = commands.find(c => c.taskId === taskId && c.staffSessionId !== null)
  return own?.staffSessionId ?? hqSessionId
}

/** Done-zone day bucket key（稳定键——皮肤换词不破坏折叠状态）：今天 / 昨天 / 更早 (by attempt end, fallback start). */
type DayKey = 'today' | 'yesterday' | 'earlier'
function dayKeyOf(iso: string, now: number): DayKey {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'earlier'
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = startOf(new Date(now)) - startOf(d)
  if (diff <= 0) return 'today'
  if (diff < 2 * 24 * 3600_000) return 'yesterday'
  return 'earlier'
}

function statusMark(task: BoardTask): ReactNode {
  const m = STATUS_MARK[task.status]
  if (m === undefined) return null
  return createElement('span', { className: `war-mark ${m.cls}`, title: m.title }, m.mark)
}

function relTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = now - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(t)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function qualityChip(quality: BoardQuality): ReactNode {
  if (quality === 'common') return null
  return createElement('span', { className: `war-chip q-${quality}`, title: warCopy.qualityTitle }, QUALITY_LABEL[quality] ?? quality)
}

function depLock(task: BoardTask, statuses: Map<string, BoardTask['status']>): ReactNode {
  if (task.deps.length === 0) return null
  const pending = task.deps.filter(d => statuses.get(d) !== 'closed')
  if (pending.length === 0) return null
  return createElement('span', { className: 'war-lock', title: `${warCopy.depLock.prefix}${warCopy.depLock.list(pending)}` },
    warCopy.depLock.prefix,
    pending.map((d, i) => createElement('span', { key: d }, i > 0 ? '、' : null, d)),
  )
}

function cronBadge(task: BoardTask): ReactNode {
  if (task.schedule === null || !task.schedule.enabled) return null
  const next = task.schedule.nextRunAt !== null ? new Date(task.schedule.nextRunAt) : null
  const when = next !== null ? `${next.getMonth() + 1}-${String(next.getDate()).padStart(2, '0')} ${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}` : ''
  return createElement('span', { className: 'war-cron', title: warCopy.cron.title(task.schedule.nextRunAt) },
    warCopy.cron.badge(task.schedule.cron, when),
  )
}

function wsChip(path: string | null): ReactNode {
  if (path === null) return null
  return createElement('span', { className: 'war-ws', title: path }, warCopy.wsChip(path))
}

// --- 命令区 ------------------------------------------------------------------

/** V5 档位徽章：L0 直发 / L1 呈批 / L2 澄清（未分诊不显示）。 */
function gradeChip(cmd: BoardCommand): ReactNode {
  if (cmd.grade === null) return null
  const label = warCopy.grade[cmd.grade]
  const title = `分诊档位${cmd.gradeReason !== null ? `：${cmd.gradeReason}` : ''}${cmd.regrades > 0 ? `（元首改档 ${cmd.regrades} 次）` : ''}`
  return createElement('span', { className: `war-chip gr-${cmd.grade}`, title }, label)
}

function CommandCard(cmd: BoardCommand, hqSessionId: string | null, services: ClientServicesFace, onDetail: (cmd: BoardCommand) => void): ReactNode {
  const meta = COMMAND_STATUS[cmd.status]
  const enterSession = (): void => {
    const target = cmd.staffSessionId ?? hqSessionId
    if (target === null || services.sessions === undefined) return
    void markTalking(cmd.commandId)
    services.sessions.open(target)
  }
  const clickable = cmd.status === 'received' || cmd.status === 'talking'
  return createElement('div', {
    key: cmd.commandId,
    className: `war-card war-command-card${clickable ? ' clickable' : ''}${cmd.status === 'received' ? ' pulse' : ''}`,
    title: clickable ? meta.hint : undefined,
    onClick: () => { if (clickable) enterSession(); else onDetail(cmd) },
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-dot ${meta.dot}` }),
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    gradeChip(cmd),
    createElement('span', { className: 'war-time' }, relTime(cmd.createdAt)),
  ),
  createElement('div', { className: `war-command-text${cmd.status === 'cancelled' ? ' struck' : ''}` }, cmd.text),
  cmd.status === 'cancelled' && cmd.cancelledReason !== null
    ? createElement('div', { className: 'war-fail' }, warCopy.commandDetail.cancelledReason(cmd.cancelledReason))
    : null,
  )
}

/** The + button's composer modal: one natural-language command per card.
 * A real component (createElement-mounted): its hooks must live in its own
 * instance, never in WarView's render pass (the #310 lesson). */
function CommandComposer(props: { onClose: () => void; refresh: () => void }): ReactNode {
  const { onClose, refresh } = props
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const submit = (): void => {
    if (busy || text.trim() === '') return
    setBusy(true)
    setError(null)
    void (async () => {
      const result = await createCommand(text.trim())
      setBusy(false)
      if (result.ok) {
        refresh()
        onClose()
      } else {
        setError(result.error ?? '下达失败，请重试。')
      }
    })()
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, warCopy.composer.title),
      createElement('div', { className: 'war-modal-sub' }, warCopy.composer.sub),
      createElement('textarea', {
        className: 'war-composer',
        value: text,
        placeholder: warCopy.composer.placeholder,
        autoFocus: true,
        onChange: e => { setText((e.target as HTMLTextAreaElement).value) },
        onKeyDown: e => { if (e.key === 'Escape') onClose() },
      }),
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, warCopy.composer.cancel),
        createElement('button', { className: 'war-btn primary', disabled: busy || text.trim() === '', onClick: submit }, busy ? warCopy.composer.busy : warCopy.composer.submit),
      ),
    ),
  )
}

function CommandDetail(cmd: BoardCommand, task: BoardTask | undefined, onOpenTask: (taskId: string) => void, onClose: () => void, onRegrade: (grade: 'L0' | 'L1' | 'L2') => void, onDecidePlan: (decision: 'approve' | 'reject') => void): ReactNode {
  const GRADE_LABEL = warCopy.grade
  const regradable = cmd.grade !== null && cmd.status !== 'approved' && cmd.status !== 'cancelled'
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, `命令 ${cmd.commandId}`),
      createElement('div', { className: 'war-modal-sub' }, `${relTime(cmd.createdAt)} · ${COMMAND_STATUS[cmd.status].label}${cmd.grade !== null ? ` · ${GRADE_LABEL[cmd.grade]}${cmd.regrades > 0 ? warCopy.commandDetail.regradesNote(cmd.regrades) : ''}` : ''}`),
      createElement('div', { className: 'war-detail-body' }, cmd.text),
      cmd.gradeReason !== null ? createElement('div', { className: 'war-note' }, `${warCopy.commandDetail.gradeReasonPrefix}${cmd.gradeReason}`) : null,
      cmd.plan !== null
        ? createElement('div', { className: 'war-plan' },
          createElement('div', { className: 'war-plan-head' }, `作战计划（${warCopy.commandDetail.planTitle[cmd.plan.status]}）`),
          createElement('div', { className: 'war-plan-body' }, cmd.plan.text),
          cmd.plan.status === 'pending'
            ? createElement('div', { className: 'war-modal-actions' },
              createElement('button', { className: 'war-btn primary', onClick: () => onDecidePlan('approve') }, warCopy.commandDetail.approvePlan),
              createElement('button', { className: 'war-btn', onClick: () => onDecidePlan('reject') }, warCopy.commandDetail.rejectPlan),
            )
            : null,
        )
        : null,
      cmd.cancelledReason !== null ? createElement('div', { className: 'war-fail' }, warCopy.commandDetail.cancelledReason(cmd.cancelledReason)) : null,
      regradable
        ? createElement('div', { className: 'war-modal-sub' }, warCopy.commandDetail.regradeHint)
        : null,
      regradable
        ? createElement('div', { className: 'war-modal-actions' },
          (['L0', 'L1', 'L2'] as const).filter(g => g !== cmd.grade).map(g =>
            createElement('button', { key: g, className: 'war-btn', onClick: () => onRegrade(g) }, warCopy.commandDetail.regradeTo(GRADE_LABEL[g]))))
        : null,
      cmd.status === 'approved' && cmd.taskId !== null
        ? createElement('div', { className: 'war-modal-actions' },
          createElement('button', { className: 'war-btn primary', onClick: () => { onOpenTask(cmd.taskId as string); onClose() } }, warCopy.commandDetail.viewTask(cmd.taskId)),
        )
        : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, warCopy.commandDetail.close),
      ),
    ),
  )
}

// --- 任务区 ------------------------------------------------------------------

function TaskCard(task: BoardTask, statuses: Map<string, BoardTask['status']>, onOpen: (taskId: string) => void, onHandle: (() => void) | null): ReactNode {
  return createElement('div', { key: task.taskId, className: 'war-card clickable', onClick: () => onOpen(task.taskId) },
    createElement('div', { className: 'war-card-top' },
      statusMark(task),
      createElement('span', { className: `war-chip st-${task.status}` }, STATUS_LABEL[task.status]),
      qualityChip(task.quality),
      task.priority === 'high' ? createElement('span', { className: 'war-chip pri-high' }, '高优先') : null,
      createElement('span', { className: 'war-title' }, task.title),
    ),
    createElement('div', { className: 'war-card-top' },
      createElement('span', { className: 'war-taskid' }, task.taskId),
      task.attempts > 1 ? createElement('span', { className: 'war-chip', title: warCopy.taskCard.attemptNTitle }, warCopy.taskCard.attemptN(task.attempts)) : null,
      relTime(task.startedAt) !== '' ? createElement('span', { className: 'war-time' }, relTime(task.startedAt)) : null,
    ),
    depLock(task, statuses),
    task.schedule !== null && task.schedule.enabled ? cronBadge(task) : null,
    wsChip(task.workspacePath),
    task.brief !== '' ? createElement('div', { className: 'war-brief' }, task.brief) : null,
    task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail', title: warCopy.taskCard.failTitle }, warCopy.taskCard.failReason(task.lastError)) : null,
    task.deliverables.length > 0
      ? createElement('div', { className: 'war-loot' },
        createElement('span', { className: 'war-loot-item' }, warCopy.taskCard.lootPrefix),
        task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
      )
      : null,
    onHandle !== null
      ? createElement('div', { className: 'war-card-top' },
        createElement('button', { className: 'war-btn primary', onClick: e => { e.stopPropagation(); onHandle() } }, warCopy.taskCard.handle),
      )
      : null,
  )
}

function EvidenceBlock(evidence: NonNullable<BoardTask['reports'][number]['evidence']>): ReactNode {
  const rows: ReactNode[] = []
  for (const [i, c] of evidence.checks.entries()) {
    rows.push(createElement('span', { key: `c${i}`, className: c.passed ? 'ok' : 'bad' }, `${c.passed ? '✓' : '✗'} ${c.item}`))
  }
  if (evidence.tests !== undefined) {
    rows.push(createElement('span', { key: 't', className: evidence.tests.exitCode === 0 ? 'ok' : 'bad' }, `⚙ ${evidence.tests.command} → 退出码 ${evidence.tests.exitCode}（${evidence.tests.passed} 过/${evidence.tests.failed} 败）`))
  }
  if (evidence.diffstat !== undefined) {
    rows.push(createElement('span', { key: 'd' }, `Δ ${evidence.diffstat}`))
  }
  return createElement('div', { className: 'war-evi' }, rows)
}

function TaskDetail(props: { task: BoardTask; statuses: Map<string, BoardTask['status']>; services: ClientServicesFace; staffTarget: string | null; onClose: () => void }): ReactNode {
  const { task, statuses, services, staffTarget, onClose } = props
  const latest = task.reports.length > 0 ? task.reports[task.reports.length - 1] : undefined
  const handleable = (task.status === 'reported' || task.status === 'failed') && staffTarget !== null
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, task.title),
      createElement('div', { className: 'war-modal-sub' },
        `${task.taskId} · ${STATUS_LABEL[task.status]} · ${QUALITY_LABEL[task.quality]}${task.priority === 'high' ? ' · 高优先' : ''}${task.attempts > 1 ? ` · 第 ${task.attempts} 次尝试` : ''}`),
      createElement('div', { className: 'war-detail-body' },
        depLock(task, statuses),
        task.schedule !== null && task.schedule.enabled ? cronBadge(task) : null,
        wsChip(task.workspacePath),
        createElement('div', { className: 'war-detail-section' }, warCopy.detail.briefSection),
        createElement('div', { className: 'war-detail-text' }, task.brief !== '' ? task.brief : warCopy.detail.briefMissing),
        createElement('div', { className: 'war-detail-section' }, warCopy.detail.acceptanceSection),
        createElement('div', { className: 'war-detail-text' }, task.acceptance !== '' ? task.acceptance : warCopy.detail.acceptanceMissing),
        latest !== undefined
          ? createElement('div', { className: 'war-report' }, `${warCopy.detail.reportPrefixPlain}${latest.text}`)
          : null,
        latest !== undefined && latest.evidence !== null ? EvidenceBlock(latest.evidence) : null,
        task.deliverables.length > 0
          ? createElement('div', { className: 'war-loot' },
            createElement('span', { className: 'war-loot-item' }, warCopy.taskCard.lootPrefix),
            task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
          )
          : null,
        task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, warCopy.taskCard.failReason(task.lastError)) : null,
        task.closedVerdict !== null ? createElement('div', { className: 'war-report' }, `${warCopy.detail.verdictPrefix}${task.closedVerdict}`) : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        handleable
          ? createElement('button', { className: 'war-btn primary', onClick: () => { services.sessions?.open(staffTarget as string); onClose() } }, warCopy.taskCard.handle)
          : null,
        createElement('button', { className: 'war-btn', onClick: onClose }, warCopy.detail.close),
      ),
    ),
  )
}

// --- 会话卡（战场：进行中/已完成/已失败，详情优先）---------------------------

function SessionCard(task: BoardTask, attempt: BoardAttempt, onDetail: (task: BoardTask, attempt: BoardAttempt) => void): ReactNode {
  const key = `${attempt.sessionId}:${attempt.startedAt}`
  const outcomeKey = attempt.outcome ?? 'live'
  const meta = OUTCOME_LABEL[outcomeKey]
  const loot = task.deliverables.length > 0 ? task.deliverables.map(d => d.summary).join('；') : null
  return createElement('div', {
    key,
    className: `war-card war-session-card clickable q-edge-${task.quality}`,
    title: warCopy.session.cardTitle(attempt.sessionId),
    onClick: () => { onDetail(task, attempt) },
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    attempt.n > 1 ? createElement('span', { className: 'war-chip', title: warCopy.session.attemptNTitle }, warCopy.session.attemptN(attempt.n)) : null,
    createElement('span', { className: 'war-time' }, relTime(attempt.startedAt)),
  ),
  createElement('div', { className: 'war-title' }, task.title),
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: attempt.sessionId }, `⌁ ${attempt.sessionId.slice(0, 10)}…`),
    wsChip(task.workspacePath),
  ),
  outcomeKey === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, warCopy.session.failReason(task.lastError)) : null,
  outcomeKey === 'succeeded' && loot !== null ? createElement('div', { className: 'war-loot-summary', title: loot }, warCopy.session.lootSummary(loot, loot.slice(0, 80), loot.length > 80)) : null,
  outcomeKey === 'reported' ? createElement('div', { className: 'war-waiting' }, warCopy.session.waitingReport) : null,
  )
}

/** The battlefield's read-only detail modal (detail-first). A real component
 * (createElement-mounted) — its useEffect must live in its own instance. */
function SessionDetail(props: { task: BoardTask; attempt: BoardAttempt; services: ClientServicesFace; staffTarget: string | null; onClose: () => void }): ReactNode {
  const { task, attempt, services, staffTarget, onClose } = props
  const outcomeKey = attempt.outcome ?? 'live'
  const meta = OUTCOME_LABEL[outcomeKey]
  const latest = task.reports.length > 0 ? task.reports[task.reports.length - 1] : undefined
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const openThread = (): void => { services.sessions?.open(attempt.sessionId); onClose() }
  const openStaff = (): void => { if (staffTarget !== null) { services.sessions?.open(staffTarget); onClose() } }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal wide', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, task.title),
      createElement('div', { className: 'war-modal-sub' },
        `${task.taskId} · ${meta.label}${attempt.n > 1 ? ` · 第 ${attempt.n} 次尝试` : ''} · ${relTime(attempt.startedAt)}${attempt.endedAt !== null ? ` → ${relTime(attempt.endedAt)}` : ''} · ⌁ ${attempt.sessionId}`),
      createElement('div', { className: 'war-detail-body' },
        wsChip(task.workspacePath),
        createElement('div', { className: 'war-detail-section' }, warCopy.detail.briefSection),
        createElement('div', { className: 'war-detail-text' }, task.brief !== '' ? task.brief : warCopy.detail.briefMissing),
        createElement('div', { className: 'war-detail-section' }, warCopy.detail.acceptanceSection),
        createElement('div', { className: 'war-detail-text' }, task.acceptance !== '' ? task.acceptance : warCopy.detail.acceptanceMissing),
        task.reports.length > 0 ? createElement('div', { className: 'war-detail-section' }, warCopy.detail.reportsSection) : null,
        task.reports.map((r, i) => createElement('div', { key: `r${i}`, className: 'war-report' }, `${warCopy.detail.reportPrefix(relTime(r.ts))}${r.text}`)),
        latest !== undefined && latest.evidence !== null ? EvidenceBlock(latest.evidence) : null,
        task.comments.length > 0 ? createElement('div', { className: 'war-detail-section' }, warCopy.detail.commentsSection) : null,
        task.comments.map((c, i) => createElement('div', { key: `c${i}`, className: 'war-report' }, `${warCopy.detail.commentPrefix(relTime(c.ts))}${c.text}`)),
        task.deliverables.length > 0
          ? createElement('div', { className: 'war-loot' },
            createElement('span', { className: 'war-loot-item' }, warCopy.session.lootPrefix),
            task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
          )
          : null,
        outcomeKey === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, warCopy.session.failReason(task.lastError)) : null,
        task.closedVerdict !== null ? createElement('div', { className: 'war-report' }, `${warCopy.detail.verdictPrefix}${task.closedVerdict}`) : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        outcomeKey === 'reported' && staffTarget !== null
          ? createElement('button', { className: 'war-btn', onClick: openStaff }, warCopy.session.goHandle)
          : null,
        createElement('button', { className: 'war-btn primary', onClick: openThread }, warCopy.session.enterReview),
        createElement('button', { className: 'war-btn', onClick: onClose }, warCopy.detail.close),
      ),
    ),
  )
}

// --- 挂载 thread（v3：外部会话上战场）-----------------------------------------

/** An externally-attached session: 「外部」badge, jump + detach only. */
function ExternalThreadCard(thread: BoardThread, services: ClientServicesFace, onDetach: (sessionId: string) => void): ReactNode {
  return createElement('div', {
    key: `ext-${thread.sessionId}`,
    className: 'war-card war-external-card clickable',
    title: warCopy.attach.cardTitle(thread.sessionId),
    onClick: () => { services.sessions?.open(thread.sessionId) },
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-chip ext-badge' }, warCopy.attach.badge),
    createElement('span', { className: 'war-time' }, relTime(thread.attachedAt)),
  ),
  createElement('div', { className: 'war-title' }, thread.note !== '' ? thread.note : warCopy.attach.noNote),
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: thread.sessionId }, `⌁ ${thread.sessionId.slice(0, 10)}…`),
    createElement('button', {
      className: 'war-btn war-detach',
      title: warCopy.attach.detachTitle,
      onClick: e => { e.stopPropagation(); onDetach(thread.sessionId) },
    }, warCopy.attach.detach),
  ),
  )
}

/** The attach modal: paste a sessionId + one-line note. A real component
 * (createElement-mounted) — its hooks live in its own instance (#310). */
function AttachThreadModal(props: { onClose: () => void; refresh: () => void }): ReactNode {
  const { onClose, refresh } = props
  const [sessionId, setSessionId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const submit = (): void => {
    if (busy || sessionId.trim() === '') return
    setBusy(true)
    setError(null)
    void (async () => {
      const result = await attachThread(sessionId.trim(), note.trim())
      setBusy(false)
      if (result.ok) {
        refresh()
        onClose()
      } else {
        setError(result.error ?? warCopy.attach.failFallback)
      }
    })()
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, warCopy.attach.title),
      createElement('div', { className: 'war-modal-sub' }, warCopy.attach.sub),
      createElement('input', {
        className: 'war-attach-input',
        value: sessionId,
        placeholder: warCopy.attach.sessionIdPlaceholder,
        autoFocus: true,
        onChange: e => { setSessionId((e.target as HTMLInputElement).value) },
        onKeyDown: e => { if (e.key === 'Escape') onClose() },
      }),
      createElement('input', {
        className: 'war-attach-input',
        value: note,
        placeholder: warCopy.attach.notePlaceholder,
        onChange: e => { setNote((e.target as HTMLInputElement).value) },
        onKeyDown: e => { if (e.key === 'Enter') submit() },
      }),
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, warCopy.attach.cancel),
        createElement('button', { className: 'war-btn primary', disabled: busy || sessionId.trim() === '', onClick: submit }, busy ? warCopy.attach.busy : warCopy.attach.submit),
      ),
    ),
  )
}

// --- 区块与主视图 --------------------------------------------------------------

/** A board column. `key` is the stable style/state hook — 皮肤改标题不破坏类名。 */
function Zone(key: string, title: string, count: number, empty: string, children: ReactNode[], extra?: ReactNode): ReactNode {
  return createElement('div', { key, className: `war-col zone-${key}` },
    createElement('div', { className: 'war-col-head' },
      createElement('span', { className: 'war-col-title' }, title),
      createElement('span', { className: 'war-col-count' }, String(count)),
      extra,
    ),
    createElement('div', { className: 'war-col-body' },
      count === 0 ? createElement('div', { className: 'war-empty' }, empty) : children,
    ),
  )
}

/** A region header: 指挥中心 / 战场 with their one-line duty note. */
function zoneHead(title: string, note: string): ReactNode {
  return createElement('div', { className: 'war-zone-head' },
    createElement('span', { className: 'war-zone-title' }, title),
    createElement('span', { className: 'war-zone-note' }, note))
}

/** Build the war map tab component bound to the framework services. */
export function warView(services: ClientServicesFace): () => ReactNode {
  return function WarView(): ReactNode {
    const { data, error, refresh } = useWar()
    // All hooks before any conditional rendering (React #310 discipline).
    const [composerOpen, setComposerOpen] = useState(false)
    const [attachOpen, setAttachOpen] = useState(false)
    const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
    const [detailCommandId, setDetailCommandId] = useState<string | null>(null)
    const [detailAttempt, setDetailAttempt] = useState<{ taskId: string; attemptId: string } | null>(null)
    const [collapsedGroups, setCollapsedGroups] = useState<Set<DayKey>>(() => new Set(['yesterday', 'earlier']))
    const tasks = data?.tasks ?? []
    const commands = data?.commands ?? []
    const threads = data?.threads ?? []
    const hqSessionId = data?.hqSessionId ?? null
    const statuses = new Map(tasks.map(t => [t.taskId, t.status] as const))
    const staffFor = (taskId: string): string | null => staffSessionFor(taskId, commands, hqSessionId)
    const openStaff = (taskId: string): void => {
      const target = staffFor(taskId)
      if (target !== null) services.sessions?.open(target)
    }
    const detailTask = detailTaskId !== null ? tasks.find(t => t.taskId === detailTaskId) : undefined
    const detailCommand = detailCommandId !== null ? commands.find(c => c.commandId === detailCommandId) : undefined
    const detailCommandTask = detailCommand?.taskId !== null && detailCommand?.taskId !== undefined ? tasks.find(t => t.taskId === detailCommand.taskId) : undefined
    const detailTaskForAttempt = detailAttempt !== null ? tasks.find(t => t.taskId === detailAttempt.taskId) : undefined
    const detailAttemptEntry = detailTaskForAttempt !== undefined && detailAttempt !== null
      ? detailTaskForAttempt.attemptLog.find(a => a.id === detailAttempt.attemptId)
      : undefined
    // Session cards: attempt-level, newest first inside each zone (defensive
    // ?? [] — a stale projection without attemptLog must not crash the board).
    const byStart = (a: BoardAttempt, b: BoardAttempt): number => (a.startedAt < b.startedAt ? 1 : -1)
    const live = tasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === null).map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const done = tasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === 'succeeded' || a.outcome === 'reported').map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const failed = tasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === 'failed').map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const commandsNewest = [...commands].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    // Done-zone day buckets (stable keys — 皮肤换词不破坏折叠状态).
    const now = Date.now()
    const doneGroups: Array<{ key: DayKey; items: Array<{ t: BoardTask; a: BoardAttempt }> }> = []
    for (const entry of done) {
      const key = dayKeyOf(entry.a.endedAt ?? entry.a.startedAt, now)
      const last = doneGroups[doneGroups.length - 1]
      if (last !== undefined && last.key === key) last.items.push(entry)
      else doneGroups.push({ key, items: [entry] })
    }
    const toggleGroup = (key: DayKey): void => {
      setCollapsedGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }
    const openSessionDetail = (t: BoardTask, a: BoardAttempt): void => { setDetailAttempt({ taskId: t.taskId, attemptId: a.id }) }
    const doneChildren: ReactNode[] = doneGroups.map(g => createElement('div', { key: g.key, className: `war-day-group${collapsedGroups.has(g.key) ? ' collapsed' : ''}` },
      createElement('button', { className: 'war-day-head', onClick: () => { toggleGroup(g.key) } },
        createElement('span', { className: 'war-day-caret' }, '▼'),
        createElement('span', null, warCopy.days[g.key]),
        createElement('span', { className: 'war-day-count' }, String(g.items.length)),
      ),
      collapsedGroups.has(g.key) ? null : g.items.map(({ t, a }) => SessionCard(t, a, openSessionDetail)),
    ))
    return createElement('div', { className: 'war-root' },
      createElement('div', { className: 'war-head' },
        createElement('span', { className: `war-head-dot${data?.active === true ? ' on' : ''}` }),
        createElement('span', { className: 'war-head-title' }, warCopy.head.title),
        createElement('span', { className: 'war-head-sub' }, data !== null && data.active ? warCopy.head.subActive : warCopy.head.subIdle),
      ),
      data === null
        ? createElement('div', { className: 'war-body' },
          error !== null ? createElement('span', { className: 'war-err' }, warCopy.loading.unreachable(error)) : createElement('span', { className: 'war-empty' }, warCopy.loading.connecting),
        )
        : createElement('div', { className: 'war-board' },
          createElement('div', { className: 'war-zone war-hq' },
            zoneHead(warCopy.zones.hq.title, warCopy.zones.hq.note),
            createElement('div', { className: 'war-zone-cols' },
              Zone('commands', warCopy.columns.commands.title, commandsNewest.length, warCopy.columns.commands.empty,
                commandsNewest.map(c => CommandCard(c, hqSessionId, services, cmd => setDetailCommandId(cmd.commandId))),
                createElement('span', { className: 'war-col-actions' },
                  createElement('button', { className: 'war-btn war-attach-btn', title: warCopy.colActions.attachTitle, onClick: () => setAttachOpen(true) }, warCopy.colActions.attachLabel),
                  createElement('button', { className: 'war-btn primary war-plus', title: warCopy.colActions.newTitle, onClick: () => setComposerOpen(true) }, '+'),
                ),
              ),
              Zone('tasks', warCopy.columns.tasks.title, tasks.length, warCopy.columns.tasks.empty,
                tasks.map(t => TaskCard(t, statuses, id => setDetailTaskId(id),
                  (t.status === 'reported' || t.status === 'failed') && staffFor(t.taskId) !== null
                    ? () => { openStaff(t.taskId) }
                    : null)),
              ),
            ),
          ),
          createElement('div', { className: 'war-zone war-field' },
            zoneHead(warCopy.zones.field.title, warCopy.zones.field.note),
            createElement('div', { className: 'war-zone-cols' },
              Zone('live', warCopy.columns.live.title, live.length + threads.length, warCopy.columns.live.empty,
                [...live.map(({ t, a }) => SessionCard(t, a, openSessionDetail)),
                  ...threads.map(th => ExternalThreadCard(th, services, sessionId => { void detachThread(sessionId).then(refresh) }))],
              ),
              Zone('done', warCopy.columns.done.title, done.length, warCopy.columns.done.empty,
                doneChildren,
              ),
              Zone('failed', warCopy.columns.failed.title, failed.length, warCopy.columns.failed.empty,
                failed.map(({ t, a }) => SessionCard(t, a, openSessionDetail)),
              ),
            ),
          ),
        ),
      composerOpen ? createElement(CommandComposer, { key: 'composer', onClose: () => setComposerOpen(false), refresh }) : null,
      attachOpen ? createElement(AttachThreadModal, { key: 'attach', onClose: () => setAttachOpen(false), refresh }) : null,
      detailTask !== undefined ? createElement(TaskDetail, { key: `task-${detailTask.taskId}`, task: detailTask, statuses, services, staffTarget: staffFor(detailTask.taskId), onClose: () => setDetailTaskId(null) }) : null,
      detailCommand !== undefined ? CommandDetail(detailCommand, detailCommandTask, id => setDetailTaskId(id), () => setDetailCommandId(null), grade => {
        void regradeCommand(detailCommand.commandId, grade).then(r => { if (r.ok) refresh() })
      }, decision => {
        void decidePlan(detailCommand.commandId, decision).then(r => { if (r.ok) refresh() })
      }) : null,
      detailTaskForAttempt !== undefined && detailAttemptEntry !== undefined
        ? createElement(SessionDetail, { key: `attempt-${detailAttemptEntry.id}`, task: detailTaskForAttempt, attempt: detailAttemptEntry, services, staffTarget: staffFor(detailTaskForAttempt.taskId), onClose: () => setDetailAttempt(null) })
        : null,
    )
  }
}

/** The composer dock status pill — v3: also the warroom HOME button (click
 * reopens the board via the shell entry) with an unread-since-last-seen badge. */
export function WarDockPill(): ReactNode {
  const { data } = useWar()
  if (data === null || !data.active) return null
  const pending = data.commands.filter(c => c.status === 'received' || c.status === 'talking').length
  const active = data.tasks.filter(t => t.status === 'in_progress').length
  const waiting = data.tasks.filter(t => t.status === 'published').length
  const failed = data.tasks.filter(t => t.status === 'failed').length
  let lastSeen = 0
  try { lastSeen = Date.parse(localStorage.getItem('warroom-last-seen') ?? '') || 0 } catch { lastSeen = 0 }
  const fresh = (iso: string | null | undefined): boolean => iso !== undefined && iso !== null && Date.parse(iso) > lastSeen
  const unread = data.commands.filter(c => (c.status === 'received' || c.status === 'talking') && fresh(c.createdAt)).length
    + data.tasks.filter(t => t.status === 'reported' && fresh(t.reports.length > 0 ? t.reports[t.reports.length - 1]!.ts : t.startedAt)).length
    + data.tasks.filter(t => t.status === 'failed' && fresh(t.attemptLog.find(a => a.outcome === 'failed')?.endedAt ?? t.startedAt)).length
  const goHome = (): void => { document.dispatchEvent(new CustomEvent('warroom-open-request')) }
  const counts = { pending, waiting, active, failed }
  return createElement('button', { className: 'war-dockpill war-dock-home', type: 'button', onClick: goHome, title: warCopy.dock.titleLine(counts) },
    createElement('span', { className: 'war-dockseg' }, warCopy.dock.segLine(counts)),
    unread > 0 ? createElement('span', { className: 'war-dock-unread' }, warCopy.dock.unread(unread)) : null,
  )
}
