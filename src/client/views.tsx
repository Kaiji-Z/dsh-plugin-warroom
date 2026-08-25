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

const STATUS_LABEL: Record<BoardTask['status'], string> = {
  published: '待领取',
  in_progress: '进行中',
  reported: '待翻阅',
  draft: '草稿',
  failed: '已失败',
  closed: '已收官',
}

const COMMAND_STATUS: Record<BoardCommand['status'], { label: string; cls: string; dot: string; hint?: string }> = {
  draft: { label: '已下达', cls: 'st-draft', dot: 'draft', hint: '参谋接收中（约 15 秒内）' },
  received: { label: '已接收 · 点击进入对话', cls: 'st-received', dot: 'received', hint: '参谋已接收，点击卡片进入对话回答提问' },
  talking: { label: '对话中', cls: 'st-talking', dot: 'received' },
  approved: { label: '已批准', cls: 'st-approved', dot: 'done', hint: '任务已发布，点击查看对应任务卡' },
  cancelled: { label: '已取消', cls: 'st-cancelled', dot: 'draft' },
}

const OUTCOME_LABEL: Record<NonNullable<BoardAttempt['outcome']> | 'live', { label: string; cls: string }> = {
  live: { label: '作战中', cls: 'oc-live' },
  reported: { label: '待元首翻阅', cls: 'oc-reported' },
  succeeded: { label: '打赢了', cls: 'oc-done' },
  failed: { label: '失败', cls: 'oc-fail' },
}

const QUALITY_LABEL: Record<BoardQuality, string> = Object.fromEntries(QUALITY_TIERS.map(q => [q.tier, q.label])) as Record<BoardQuality, string>

/** 地图标记：「！」新悬赏待领取，「？」战报可收菜（分区时代的残留信号灯）。 */
const STATUS_MARK: Partial<Record<BoardTask['status'], { mark: string; cls: string; title: string }>> = {
  published: { mark: '！', cls: 'bang', title: '新悬赏，等待指挥官领取' },
  reported: { mark: '？', cls: 'query', title: '战报已呈递，等元首翻阅收菜' },
}

/** Where does this task's verdict conversation live? The owning command's
 * staff session first, the legacy HQ session as fallback (v3: 每命令一会话). */
function staffSessionFor(taskId: string, commands: BoardCommand[], hqSessionId: string | null): string | null {
  const own = commands.find(c => c.taskId === taskId && c.staffSessionId !== null)
  return own?.staffSessionId ?? hqSessionId
}

/** Done-zone day bucket: 今天 / 昨天 / 更早 (by attempt end, fallback start). */
function dayLabel(iso: string, now: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '更早'
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = startOf(new Date(now)) - startOf(d)
  if (diff <= 0) return '今天'
  if (diff < 2 * 24 * 3600_000) return '昨天'
  return '更早'
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
  return createElement('span', { className: `war-chip q-${quality}`, title: '悬赏品质（复杂度分档）' }, QUALITY_LABEL[quality] ?? quality)
}

function depLock(task: BoardTask, statuses: Map<string, BoardTask['status']>): ReactNode {
  if (task.deps.length === 0) return null
  const pending = task.deps.filter(d => statuses.get(d) !== 'closed')
  if (pending.length === 0) return null
  return createElement('span', { className: 'war-lock', title: `前置任务全部收官后解锁；未完成：${pending.join('、')}` },
    '🔒 前置未解锁：',
    pending.map((d, i) => createElement('span', { key: d }, i > 0 ? '、' : null, d)),
  )
}

function cronBadge(task: BoardTask): ReactNode {
  if (task.schedule === null || !task.schedule.enabled) return null
  const next = task.schedule.nextRunAt !== null ? new Date(task.schedule.nextRunAt) : null
  const when = next !== null ? `${next.getMonth() + 1}-${String(next.getDate()).padStart(2, '0')} ${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}` : ''
  return createElement('span', { className: 'war-cron', title: `日常悬赏，错过不补跑${task.schedule.nextRunAt !== null ? `；下次 ${task.schedule.nextRunAt}` : ''}` },
    `⏳ 日常 ${task.schedule.cron}${when !== '' ? ` · 下次 ${when}` : ''}`,
  )
}

function wsChip(path: string | null): ReactNode {
  if (path === null) return null
  return createElement('span', { className: 'war-ws', title: path }, `工作区 ${path}`)
}

// --- 命令区 ------------------------------------------------------------------

/** V5 档位徽章：L0 直发 / L1 呈批 / L2 澄清（未分诊不显示）。 */
function gradeChip(cmd: BoardCommand): ReactNode {
  if (cmd.grade === null) return null
  const label = cmd.grade === 'L0' ? 'L0 直发' : cmd.grade === 'L1' ? 'L1 呈批' : 'L2 澄清'
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
    ? createElement('div', { className: 'war-fail' }, `取消原因：${cmd.cancelledReason}`)
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
      createElement('div', { className: 'war-modal-title' }, '下达命令'),
      createElement('div', { className: 'war-modal-sub' }, '用一句大白话写下元首的意图——参谋会接收并向你澄清细节。'),
      createElement('textarea', {
        className: 'war-composer',
        value: text,
        placeholder: '例：帮我做个记账的小工具，每天记一句，能翻回去看以前记的',
        autoFocus: true,
        onChange: e => { setText((e.target as HTMLTextAreaElement).value) },
        onKeyDown: e => { if (e.key === 'Escape') onClose() },
      }),
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, '取消'),
        createElement('button', { className: 'war-btn primary', disabled: busy || text.trim() === '', onClick: submit }, busy ? '下达中…' : '下达命令'),
      ),
    ),
  )
}

function CommandDetail(cmd: BoardCommand, task: BoardTask | undefined, onOpenTask: (taskId: string) => void, onClose: () => void, onRegrade: (grade: 'L0' | 'L1' | 'L2') => void, onDecidePlan: (decision: 'approve' | 'reject') => void): ReactNode {
  const GRADE_LABEL: Record<'L0' | 'L1' | 'L2', string> = { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' }
  const PLAN_LABEL: Record<'pending' | 'approved' | 'rejected', string> = { pending: '待批', approved: '已批准', rejected: '已驳回' }
  const regradable = cmd.grade !== null && cmd.status !== 'approved' && cmd.status !== 'cancelled'
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, `命令 ${cmd.commandId}`),
      createElement('div', { className: 'war-modal-sub' }, `${relTime(cmd.createdAt)} · ${COMMAND_STATUS[cmd.status].label}${cmd.grade !== null ? ` · ${GRADE_LABEL[cmd.grade]}${cmd.regrades > 0 ? `（元首改档 ${cmd.regrades} 次）` : ''}` : ''}`),
      createElement('div', { className: 'war-detail-body' }, cmd.text),
      cmd.gradeReason !== null ? createElement('div', { className: 'war-note' }, `分诊理由：${cmd.gradeReason}`) : null,
      cmd.plan !== null
        ? createElement('div', { className: 'war-plan' },
          createElement('div', { className: 'war-plan-head' }, `作战计划（${PLAN_LABEL[cmd.plan.status]}）`),
          createElement('div', { className: 'war-plan-body' }, cmd.plan.text),
          cmd.plan.status === 'pending'
            ? createElement('div', { className: 'war-modal-actions' },
              createElement('button', { className: 'war-btn primary', onClick: () => onDecidePlan('approve') }, '批准计划'),
              createElement('button', { className: 'war-btn', onClick: () => onDecidePlan('reject') }, '驳回重呈'),
            )
            : null,
        )
        : null,
      cmd.cancelledReason !== null ? createElement('div', { className: 'war-fail' }, `取消原因：${cmd.cancelledReason}`) : null,
      regradable
        ? createElement('div', { className: 'war-modal-sub' }, '升降档（元首覆写参谋分诊，改后需通知参谋按新档执行）：')
        : null,
      regradable
        ? createElement('div', { className: 'war-modal-actions' },
          (['L0', 'L1', 'L2'] as const).filter(g => g !== cmd.grade).map(g =>
            createElement('button', { key: g, className: 'war-btn', onClick: () => onRegrade(g) }, `改为 ${GRADE_LABEL[g]}`)))
        : null,
      cmd.status === 'approved' && cmd.taskId !== null
        ? createElement('div', { className: 'war-modal-actions' },
          createElement('button', { className: 'war-btn primary', onClick: () => { onOpenTask(cmd.taskId as string); onClose() } }, `查看任务 ${cmd.taskId}`),
        )
        : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, '关闭'),
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
      task.attempts > 1 ? createElement('span', { className: 'war-chip', title: '含自动重派的尝试次数' }, `第 ${task.attempts} 次尝试`) : null,
      relTime(task.startedAt) !== '' ? createElement('span', { className: 'war-time' }, relTime(task.startedAt)) : null,
    ),
    depLock(task, statuses),
    task.schedule !== null && task.schedule.enabled ? cronBadge(task) : null,
    wsChip(task.workspacePath),
    task.brief !== '' ? createElement('div', { className: 'war-brief' }, task.brief) : null,
    task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail', title: '重试已用尽，等元首让参谋重新立案' }, `败因：${task.lastError}`) : null,
    task.deliverables.length > 0
      ? createElement('div', { className: 'war-loot' },
        createElement('span', { className: 'war-loot-item' }, '战利品：'),
        task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
      )
      : null,
    onHandle !== null
      ? createElement('div', { className: 'war-card-top' },
        createElement('button', { className: 'war-btn primary', onClick: e => { e.stopPropagation(); onHandle() } }, '去处理 · 参谋会话'),
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
        createElement('div', { className: 'war-detail-section' }, '任务书'),
        createElement('div', { className: 'war-detail-text' }, task.brief !== '' ? task.brief : '（参谋未附任务书正文）'),
        createElement('div', { className: 'war-detail-section' }, '验收标准'),
        createElement('div', { className: 'war-detail-text' }, task.acceptance !== '' ? task.acceptance : '（未声明）'),
        latest !== undefined
          ? createElement('div', { className: 'war-report' }, `【汇报】${latest.text}`)
          : null,
        latest !== undefined && latest.evidence !== null ? EvidenceBlock(latest.evidence) : null,
        task.deliverables.length > 0
          ? createElement('div', { className: 'war-loot' },
            createElement('span', { className: 'war-loot-item' }, '战利品：'),
            task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
          )
          : null,
        task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, `败因：${task.lastError}`) : null,
        task.closedVerdict !== null ? createElement('div', { className: 'war-report' }, `【判定】${task.closedVerdict}`) : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        handleable
          ? createElement('button', { className: 'war-btn primary', onClick: () => { services.sessions?.open(staffTarget as string); onClose() } }, '去处理 · 参谋会话')
          : null,
        createElement('button', { className: 'war-btn', onClick: onClose }, '关闭'),
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
    title: `指挥官会话 ${attempt.sessionId}——点击查看作战详情`,
    onClick: () => { onDetail(task, attempt) },
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    attempt.n > 1 ? createElement('span', { className: 'war-chip', title: '重试尝试' }, `第 ${attempt.n} 次`) : null,
    createElement('span', { className: 'war-time' }, relTime(attempt.startedAt)),
  ),
  createElement('div', { className: 'war-title' }, task.title),
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: attempt.sessionId }, `⌁ ${attempt.sessionId.slice(0, 10)}…`),
    wsChip(task.workspacePath),
  ),
  outcomeKey === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, `败因：${task.lastError}`) : null,
  outcomeKey === 'succeeded' && loot !== null ? createElement('div', { className: 'war-loot-summary', title: loot }, `战利品：${loot.slice(0, 80)}${loot.length > 80 ? '…' : ''}`) : null,
  outcomeKey === 'reported' ? createElement('div', { className: 'war-waiting' }, '证据已核验，等元首翻阅收官') : null,
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
        createElement('div', { className: 'war-detail-section' }, '任务书'),
        createElement('div', { className: 'war-detail-text' }, task.brief !== '' ? task.brief : '（参谋未附任务书正文）'),
        createElement('div', { className: 'war-detail-section' }, '验收标准'),
        createElement('div', { className: 'war-detail-text' }, task.acceptance !== '' ? task.acceptance : '（未声明）'),
        task.reports.length > 0 ? createElement('div', { className: 'war-detail-section' }, '战报') : null,
        task.reports.map((r, i) => createElement('div', { key: `r${i}`, className: 'war-report' }, `【汇报 · ${relTime(r.ts)}】${r.text}`)),
        latest !== undefined && latest.evidence !== null ? EvidenceBlock(latest.evidence) : null,
        task.comments.length > 0 ? createElement('div', { className: 'war-detail-section' }, '批注') : null,
        task.comments.map((c, i) => createElement('div', { key: `c${i}`, className: 'war-report' }, `【批注 · ${relTime(c.ts)}】${c.text}`)),
        task.deliverables.length > 0
          ? createElement('div', { className: 'war-loot' },
            createElement('span', { className: 'war-loot-item' }, '战利品：'),
            task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
          )
          : null,
        outcomeKey === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, `败因：${task.lastError}`) : null,
        task.closedVerdict !== null ? createElement('div', { className: 'war-report' }, `【判定】${task.closedVerdict}`) : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        outcomeKey === 'reported' && staffTarget !== null
          ? createElement('button', { className: 'war-btn', onClick: openStaff }, '去处理 · 参谋会话')
          : null,
        createElement('button', { className: 'war-btn primary', onClick: openThread }, '进入会话复盘'),
        createElement('button', { className: 'war-btn', onClick: onClose }, '关闭'),
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
    title: `外部挂载的会话 ${thread.sessionId}——点击进入该会话窗口`,
    onClick: () => { services.sessions?.open(thread.sessionId) },
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-chip ext-badge' }, '外部'),
    createElement('span', { className: 'war-time' }, relTime(thread.attachedAt)),
  ),
  createElement('div', { className: 'war-title' }, thread.note !== '' ? thread.note : '（未备注的外部会话）'),
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: thread.sessionId }, `⌁ ${thread.sessionId.slice(0, 10)}…`),
    createElement('button', {
      className: 'war-btn war-detach',
      title: '从战场摘除这张外部卡（不影响会话本身）',
      onClick: e => { e.stopPropagation(); onDetach(thread.sessionId) },
    }, '摘除'),
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
        setError(result.error ?? '挂载失败，请重试。')
      }
    })()
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, '挂载会话'),
      createElement('div', { className: 'war-modal-sub' }, '把一个已存在的 thread 会话号挂上战场，作为「外部」卡管理（只读 + 跳转，不影响会话本身）。'),
      createElement('input', {
        className: 'war-attach-input',
        value: sessionId,
        placeholder: '会话号（sessionId）',
        autoFocus: true,
        onChange: e => { setSessionId((e.target as HTMLInputElement).value) },
        onKeyDown: e => { if (e.key === 'Escape') onClose() },
      }),
      createElement('input', {
        className: 'war-attach-input',
        value: note,
        placeholder: '备注（可选，一句话：这个 thread 在干什么）',
        onChange: e => { setNote((e.target as HTMLInputElement).value) },
        onKeyDown: e => { if (e.key === 'Enter') submit() },
      }),
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, '取消'),
        createElement('button', { className: 'war-btn primary', disabled: busy || sessionId.trim() === '', onClick: submit }, busy ? '挂载中…' : '挂载'),
      ),
    ),
  )
}

// --- 区块与主视图 --------------------------------------------------------------

function Zone(title: string, count: number, empty: string, children: ReactNode[], extra?: ReactNode): ReactNode {
  return createElement('div', { key: title, className: `war-col zone-${title}` },
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
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['昨天', '更早']))
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
    // Done-zone day buckets (newest-first input keeps label order 今天→昨天→更早).
    const now = Date.now()
    const doneGroups: Array<{ label: string; items: Array<{ t: BoardTask; a: BoardAttempt }> }> = []
    for (const entry of done) {
      const label = dayLabel(entry.a.endedAt ?? entry.a.startedAt, now)
      const last = doneGroups[doneGroups.length - 1]
      if (last !== undefined && last.label === label) last.items.push(entry)
      else doneGroups.push({ label, items: [entry] })
    }
    const toggleGroup = (label: string): void => {
      setCollapsedGroups(prev => {
        const next = new Set(prev)
        if (next.has(label)) next.delete(label)
        else next.add(label)
        return next
      })
    }
    const openSessionDetail = (t: BoardTask, a: BoardAttempt): void => { setDetailAttempt({ taskId: t.taskId, attemptId: a.id }) }
    const doneChildren: ReactNode[] = doneGroups.map(g => createElement('div', { key: g.label, className: `war-day-group${collapsedGroups.has(g.label) ? ' collapsed' : ''}` },
      createElement('button', { className: 'war-day-head', onClick: () => { toggleGroup(g.label) } },
        createElement('span', { className: 'war-day-caret' }, '▼'),
        createElement('span', null, g.label),
        createElement('span', { className: 'war-day-count' }, String(g.items.length)),
      ),
      collapsedGroups.has(g.label) ? null : g.items.map(({ t, a }) => SessionCard(t, a, openSessionDetail)),
    ))
    return createElement('div', { className: 'war-root' },
      createElement('div', { className: 'war-head' },
        createElement('span', { className: `war-head-dot${data?.active === true ? ' on' : ''}` }),
        createElement('span', { className: 'war-head-title' }, '作战室 · 指挥中心'),
        createElement('span', { className: 'war-head-sub' }, data !== null && data.active ? '命令 → 任务 → 作战 → 结果 · 左区指挥 · 右区战场' : '退役中（/war 启用）'),
      ),
      data === null
        ? createElement('div', { className: 'war-body' },
          error !== null ? createElement('span', { className: 'war-err' }, `任务栏不可达：${error}`) : createElement('span', { className: 'war-empty' }, '连接任务栏…'),
        )
        : createElement('div', { className: 'war-board' },
          createElement('div', { className: 'war-zone war-hq' },
            zoneHead('指挥中心', '元首的输入都在这里'),
            createElement('div', { className: 'war-zone-cols' },
              Zone('命令', commandsNewest.length, '点 + 下达第一道命令',
                commandsNewest.map(c => CommandCard(c, hqSessionId, services, cmd => setDetailCommandId(cmd.commandId))),
                createElement('span', { className: 'war-col-actions' },
                  createElement('button', { className: 'war-btn war-attach-btn', title: '挂载一个外部会话上战场', onClick: () => setAttachOpen(true) }, '⌁ 挂载'),
                  createElement('button', { className: 'war-btn primary war-plus', title: '新建命令', onClick: () => setComposerOpen(true) }, '+'),
                ),
              ),
              Zone('任务', tasks.length, '等参谋发布第一张悬赏',
                tasks.map(t => TaskCard(t, statuses, id => setDetailTaskId(id),
                  (t.status === 'reported' || t.status === 'failed') && staffFor(t.taskId) !== null
                    ? () => { openStaff(t.taskId) }
                    : null)),
              ),
            ),
          ),
          createElement('div', { className: 'war-zone war-field' },
            zoneHead('战场', '只读结果 · 点卡看详情 · 复盘跳 thread'),
            createElement('div', { className: 'war-zone-cols' },
              Zone('进行中', live.length + threads.length, '下达命令后，指挥官的作战会话会出现在这里',
                [...live.map(({ t, a }) => SessionCard(t, a, openSessionDetail)),
                  ...threads.map(th => ExternalThreadCard(th, services, sessionId => { void detachThread(sessionId).then(refresh) }))],
              ),
              Zone('已完成', done.length, '还没有打赢的会话',
                doneChildren,
              ),
              Zone('已失败', failed.length, '暂无失败会话',
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
  return createElement('button', { className: 'war-dockpill war-dock-home', type: 'button', onClick: goHome, title: `待接命令 ${pending} · 待领取 ${waiting} · 进行中 ${active}${failed > 0 ? ` · 已失败 ${failed}` : ''} —— 点击回到作战室` },
    createElement('span', { className: 'war-dockseg' }, `作战室${pending > 0 ? ` 命令${pending}` : ''} 待领${waiting} 进行${active}${failed > 0 ? ` 失败${failed}` : ''}`),
    unread > 0 ? createElement('span', { className: 'war-dock-unread' }, `${unread} 新`) : null,
  )
}
