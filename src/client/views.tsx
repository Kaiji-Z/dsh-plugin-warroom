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

import { createElement, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { attachThread, createCommand, decidePlan, detachThread, markTalking, regradeCommand, useWar, type BoardAttempt, type BoardCommand, type BoardQuality, type BoardTask, type BoardThread } from './data.ts'
import { activeCopy, setSkin, skinId, subscribeSkin } from './copy.ts'
import { collectInbox, formatWait, type InboxItem, type InboxKind } from './inbox.ts'
import { visitDelta, type VisitDelta } from './visit.ts'
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

/** 文案一律经 activeCopy()（皮肤词典）取——不写内联字面量；词典在渲染期取值，
 * 皮肤切换后由 WarView/WarDockPill 的 useSyncExternalStore 订阅触发重渲染拉新文案。
 *  cls/dot 是样式键不属于皮肤文案，留在视图层（皮肤只换词不换样式）。 */
const COMMAND_STATUS_STYLE: Record<BoardCommand['status'], { cls: string; dot: string }> = {
  draft: { cls: 'st-draft', dot: 'draft' },
  received: { cls: 'st-received', dot: 'received' },
  talking: { cls: 'st-talking', dot: 'received' },
  approved: { cls: 'st-approved', dot: 'done' },
  cancelled: { cls: 'st-cancelled', dot: 'draft' },
}

const OUTCOME_STYLE: Record<NonNullable<BoardAttempt['outcome']> | 'live', string> = {
  live: 'oc-live',
  reported: 'oc-reported',
  succeeded: 'oc-done',
  failed: 'oc-fail',
}

const STATUS_MARK_STYLE: Partial<Record<BoardTask['status'], string>> = {
  published: 'bang',
  reported: 'query',
}

const QUALITY_LABEL: Record<BoardQuality, string> = Object.fromEntries(QUALITY_TIERS.map(q => [q.tier, q.label])) as Record<BoardQuality, string>

function commandStatus(status: BoardCommand['status']): { label: string; cls: string; dot: string; hint?: string } {
  return { ...activeCopy().commandStatus[status], ...COMMAND_STATUS_STYLE[status] }
}

function outcomeLabel(outcome: NonNullable<BoardAttempt['outcome']> | 'live'): { label: string; cls: string } {
  return { label: activeCopy().outcome[outcome].label, cls: OUTCOME_STYLE[outcome] }
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

/** 地图标记：「！」新悬赏待领取，「？」战报可收菜（分区时代的残留信号灯）。 */
function statusMark(task: BoardTask): ReactNode {
  const m = activeCopy().statusMark[task.status]
  if (m === undefined) return null
  const cls = STATUS_MARK_STYLE[task.status] ?? ''
  return createElement('span', { className: `war-mark ${cls}`, title: m.title }, m.mark)
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

/** V7-③ 族系追踪（悬停高亮 + 聚焦压暗）：active 非空时，familyId 相同的卡
 * 点亮（war-rel-same）、其余压暗（war-rel-dim）；familyId=null 的卡（外部
 * 挂载）只被压暗、不参与点亮。悬停优先于聚焦（hover 即时预览，聚焦常驻）。 */
export interface CardTrace {
  familyId: string | null
  active: string | null
  onHover: (familyId: string | null) => void
  onFocus: (commandId: string) => void
}

function relClass(trace: CardTrace): string {
  if (trace.active === null) return ''
  return trace.familyId === trace.active ? ' war-rel-same' : ' war-rel-dim'
}

function traceMouse(trace: CardTrace): { onMouseEnter?: () => void; onMouseLeave: () => void } {
  return {
    onMouseEnter: trace.familyId !== null ? () => { trace.onHover(trace.familyId) } : undefined,
    onMouseLeave: () => { trace.onHover(null) },
  }
}

function qualityChip(quality: BoardQuality): ReactNode {
  if (quality === 'common') return null
  return createElement('span', { className: `war-chip q-${quality}`, title: activeCopy().qualityTitle }, QUALITY_LABEL[quality] ?? quality)
}

function depLock(task: BoardTask, statuses: Map<string, BoardTask['status']>): ReactNode {
  if (task.deps.length === 0) return null
  const pending = task.deps.filter(d => statuses.get(d) !== 'closed')
  if (pending.length === 0) return null
  return createElement('span', { className: 'war-lock', title: `${activeCopy().depLock.prefix}${activeCopy().depLock.list(pending)}` },
    activeCopy().depLock.prefix,
    pending.map((d, i) => createElement('span', { key: d }, i > 0 ? '、' : null, d)),
  )
}

function cronBadge(task: BoardTask): ReactNode {
  if (task.schedule === null || !task.schedule.enabled) return null
  const next = task.schedule.nextRunAt !== null ? new Date(task.schedule.nextRunAt) : null
  const when = next !== null ? `${next.getMonth() + 1}-${String(next.getDate()).padStart(2, '0')} ${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}` : ''
  return createElement('span', { className: 'war-cron', title: activeCopy().cron.title(task.schedule.nextRunAt) },
    activeCopy().cron.badge(task.schedule.cron, when),
  )
}

function wsChip(path: string | null): ReactNode {
  if (path === null) return null
  return createElement('span', { className: 'war-ws', title: path }, activeCopy().wsChip(path))
}

// --- 命令区 ------------------------------------------------------------------

/** 命令的任务域（全生命周期追踪的核心）：头任务 + 全部传递依赖它的任务
 *  （V6 链的后继经 deps 闭包归队）。命令卡/命令详情据此聚合进度。 */
function commandTasks(cmd: BoardCommand, tasks: BoardTask[]): BoardTask[] {
  if (cmd.taskId === null) return []
  const members = new Set<string>([cmd.taskId])
  let grew = true
  while (grew) {
    grew = false
    for (const t of tasks) {
      if (members.has(t.taskId)) continue
      if (t.deps.some(d => members.has(d))) {
        members.add(t.taskId)
        grew = true
      }
    }
  }
  return tasks.filter(t => members.has(t.taskId))
}

type LifeStage = 'command' | 'task' | 'battle' | 'report'

/** 阶段条状态机：命令→任务→执行→战报，now 是当前关注位（呼吸条）。 */
function lifecycleOf(cmd: BoardCommand, chain: BoardTask[]): { reached: Record<LifeStage, boolean>; now: LifeStage | null; status: string; tone: '' | 'warn' | 'err' } {
  const copy = activeCopy().lifecycle
  if (cmd.status === 'cancelled') {
    return { reached: { command: true, task: false, battle: false, report: false }, now: null, status: copy.cancelled, tone: 'err' }
  }
  // 计划待批是最要紧的行动位（不属任何阶段——压在状态行上高亮）。
  const planPending = cmd.plan?.status === 'pending'
  if (chain.length === 0) {
    const status = cmd.status === 'talking' ? copy.waitingClarify : planPending ? copy.planPending : copy.waitingStaff
    return { reached: { command: true, task: false, battle: false, report: false }, now: 'command', status, tone: 'warn' }
  }
  const closed = chain.filter(t => t.status === 'closed').length
  const battleLive = chain.some(t => t.status === 'in_progress' || t.status === 'reported' || t.attemptLog.length > 0)
  const reportDone = chain.some(t => t.status === 'closed' || t.status === 'failed')
  const chainPrefix = chain.length > 1 ? `${copy.chain(closed, chain.length)} · ` : ''
  if (reportDone) {
    const terminal = chain.find(t => t.status === 'closed') ?? chain.find(t => t.status === 'failed')
    const label = terminal !== undefined ? activeCopy().taskStatus[terminal.status] : ''
    return { reached: { command: true, task: true, battle: true, report: true }, now: 'report', status: `${chainPrefix}${label}`, tone: '' }
  }
  if (battleLive) {
    const current = chain.find(t => t.status === 'in_progress' || t.status === 'reported') ?? chain[chain.length - 1]!
    const attemptSuffix = current.attempts > 1 ? ` · ${copy.attemptN(current.attempts)}` : ''
    return { reached: { command: true, task: true, battle: true, report: false }, now: 'battle', status: `${chainPrefix}${activeCopy().taskStatus[current.status]}${attemptSuffix}`, tone: '' }
  }
  return { reached: { command: true, task: true, battle: false, report: false }, now: 'task', status: copy.waitingClaim, tone: '' }
}

/** 阶段条（4 段分段进度：done 绿 / now 蓝呼吸 / 其余灰）。 */
function LifeStrip(cmd: BoardCommand, chain: BoardTask[]): ReactNode {
  const copy = activeCopy().lifecycle
  const life = lifecycleOf(cmd, chain)
  const stages: Array<{ key: LifeStage; label: string }> = [
    { key: 'command', label: copy.stages.command },
    { key: 'task', label: copy.stages.task },
    { key: 'battle', label: copy.stages.battle },
    { key: 'report', label: copy.stages.report },
  ]
  return createElement('div', { className: 'war-life' },
    ...stages.map(s => createElement('div', { key: s.key, className: 'war-life-stage' },
      createElement('span', { className: `war-life-bar${life.now === s.key ? ' now' : life.reached[s.key] ? ' done' : ''}` }),
      createElement('span', { className: `war-life-label${life.now === s.key ? ' now' : life.reached[s.key] ? ' done' : ''}` }, s.label),
    )),
    createElement('span', { className: `war-life-status${life.tone !== '' ? ` ${life.tone}` : ''}`, style: { gridColumn: '1 / -1' } }, life.status),
  )
}

/** V5 档位徽章：L0 直发 / L1 呈批 / L2 澄清（未分诊不显示）。 */
function gradeChip(cmd: BoardCommand): ReactNode {
  if (cmd.grade === null) return null
  const label = activeCopy().grade[cmd.grade]
  const title = `分诊档位${cmd.gradeReason !== null ? `：${cmd.gradeReason}` : ''}${cmd.regrades > 0 ? `（元首改档 ${cmd.regrades} 次）` : ''}`
  return createElement('span', { className: `war-chip gr-${cmd.grade}`, title }, label)
}

function CommandCard(cmd: BoardCommand, hqSessionId: string | null, services: ClientServicesFace, onDetail: (cmd: BoardCommand) => void, chain: BoardTask[], trace: CardTrace): ReactNode {
  const meta = commandStatus(cmd.status)
  const enterSession = (): void => {
    const target = cmd.staffSessionId ?? hqSessionId
    if (target === null || services.sessions === undefined) return
    void markTalking(cmd.commandId)
    services.sessions.open(target)
  }
  const clickable = cmd.status === 'received' || cmd.status === 'talking'
  return createElement('div', {
    key: cmd.commandId,
    className: `war-card war-command-card${clickable ? ' clickable' : ''}${cmd.status === 'received' ? ' pulse' : ''}${relClass(trace)}`,
    title: clickable ? meta.hint : undefined,
    onClick: () => { if (clickable) enterSession(); else onDetail(cmd) },
    ...traceMouse(trace),
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-dot ${meta.dot}` }),
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    gradeChip(cmd),
    createElement('span', { className: 'war-time' }, relTime(cmd.createdAt)),
    createElement('button', {
      className: 'war-btn war-focus-btn',
      title: activeCopy().trace.focusBtnTitle,
      onClick: e => { e.stopPropagation(); trace.onFocus(cmd.commandId) },
    }, '◎'),
  ),
  createElement('div', { className: `war-command-text${cmd.status === 'cancelled' ? ' struck' : ''}` }, cmd.text),
  // 全生命周期阶段条：命令不因发布而死卡——任务/执行/战报进度常驻卡上。
  LifeStrip(cmd, chain),
  cmd.status === 'cancelled' && cmd.cancelledReason !== null
    ? createElement('div', { className: 'war-fail' }, activeCopy().commandDetail.cancelledReason(cmd.cancelledReason))
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
      createElement('div', { className: 'war-modal-title' }, activeCopy().composer.title),
      createElement('div', { className: 'war-modal-sub' }, activeCopy().composer.sub),
      createElement('textarea', {
        className: 'war-composer',
        value: text,
        placeholder: activeCopy().composer.placeholder,
        autoFocus: true,
        onChange: e => { setText((e.target as HTMLTextAreaElement).value) },
        onKeyDown: e => { if (e.key === 'Escape') onClose() },
      }),
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, activeCopy().composer.cancel),
        createElement('button', { className: 'war-btn primary', disabled: busy || text.trim() === '', onClick: submit }, busy ? activeCopy().composer.busy : activeCopy().composer.submit),
      ),
    ),
  )
}

/** 命令全生命周期详情（追踪中枢）：原文 → 分诊/计划 → 任务链逐环 → 最新战报。 */
function CommandDetail(cmd: BoardCommand, chain: BoardTask[], onOpenTask: (taskId: string) => void, onClose: () => void, onRegrade: (grade: 'L0' | 'L1' | 'L2') => void, onDecidePlan: (decision: 'approve' | 'reject') => void, onFocus: (commandId: string) => void): ReactNode {
  const GRADE_LABEL = activeCopy().grade
  const copy = activeCopy().commandDetail
  const regradable = cmd.grade !== null && cmd.status !== 'approved' && cmd.status !== 'cancelled'
  const closed = chain.filter(t => t.status === 'closed').length
  // 最新战报：链上任一环的最新一条汇报（各环取末条，再按时间取最新）。
  const lastReport = chain
    .flatMap(t => (t.reports.length > 0 ? [{ r: t.reports[t.reports.length - 1]!, t }] : []))
    .sort((a, b) => (a.r.ts < b.r.ts ? 1 : -1))[0]
  const verdictTask = chain.find(t => t.closedVerdict !== null)
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal wide', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, `命令 ${cmd.commandId}`),
      createElement('div', { className: 'war-modal-sub' }, `${relTime(cmd.createdAt)} · ${commandStatus(cmd.status).label}${cmd.grade !== null ? ` · ${GRADE_LABEL[cmd.grade]}${cmd.regrades > 0 ? copy.regradesNote(cmd.regrades) : ''}` : ''}`),
      createElement('div', { className: 'war-detail-body' },
        createElement('div', { className: 'war-detail-text' }, cmd.text),
        cmd.gradeReason !== null ? createElement('div', { className: 'war-note' }, `${copy.gradeReasonPrefix}${cmd.gradeReason}`) : null,
        cmd.plan !== null
          ? createElement('div', { className: 'war-plan' },
            createElement('div', { className: 'war-plan-head' }, `作战计划（${copy.planTitle[cmd.plan.status]}）`),
            createElement('div', { className: 'war-plan-body' }, cmd.plan.text),
            cmd.plan.status === 'pending'
              ? createElement('div', { className: 'war-modal-actions' },
                createElement('button', { className: 'war-btn primary', onClick: () => onDecidePlan('approve') }, copy.approvePlan),
                createElement('button', { className: 'war-btn', onClick: () => onDecidePlan('reject') }, copy.rejectPlan),
              )
              : null,
          )
          : null,
        // 任务链：一环一行（状态/标题/元信息），点行进任务卡——追踪即跳转。
        createElement('div', { className: 'war-detail-section' }, copy.chainSection),
        chain.length === 0
          ? createElement('div', { className: 'war-detail-text' }, copy.noTasks)
          : createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            chain.length > 1 ? createElement('div', { className: 'war-life-status' }, copy.chainDone(closed, chain.length)) : null,
            chain.map(t => createElement('div', {
              key: t.taskId,
              className: 'war-chain-row',
              onClick: () => { onOpenTask(t.taskId); onClose() },
            },
            createElement('span', { className: `war-chip st-${t.status}` }, activeCopy().taskStatus[t.status]),
            createElement('span', { className: 'war-title' }, t.title),
            createElement('span', { className: 'war-chain-meta' }, `${t.taskId}${t.attempts > 1 ? ` · ${activeCopy().lifecycle.attemptN(t.attempts)}` : ''}`),
            )),
          ),
        lastReport !== undefined
          ? createElement('div', { className: 'war-detail-section' }, copy.latestReport)
          : null,
        lastReport !== undefined
          ? createElement('div', { className: 'war-report' }, `${activeCopy().detail.reportPrefix(relTime(lastReport.r.ts))}${lastReport.r.text}`)
          : null,
        lastReport !== undefined && lastReport.r.evidence !== null ? EvidenceBlock(lastReport.r.evidence) : null,
        verdictTask !== undefined && verdictTask.closedVerdict !== null
          ? createElement('div', { className: 'war-report' }, `${activeCopy().detail.verdictPrefix}${verdictTask.closedVerdict}`)
          : null,
        cmd.cancelledReason !== null ? createElement('div', { className: 'war-fail' }, copy.cancelledReason(cmd.cancelledReason)) : null,
        regradable ? createElement('div', { className: 'war-modal-sub' }, copy.regradeHint) : null,
        regradable
          ? createElement('div', { className: 'war-modal-actions' },
            (['L0', 'L1', 'L2'] as const).filter(g => g !== cmd.grade).map(g =>
              createElement('button', { key: g, className: 'war-btn', onClick: () => onRegrade(g) }, copy.regradeTo(GRADE_LABEL[g]))))
          : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        cmd.status === 'approved' && cmd.taskId !== null
          ? createElement('button', { className: 'war-btn primary', onClick: () => { onOpenTask(cmd.taskId as string); onClose() } }, copy.viewTask(cmd.taskId))
          : null,
        createElement('button', { className: 'war-btn', title: activeCopy().trace.focusBtnTitle, onClick: () => { onFocus(cmd.commandId); onClose() } }, `◎ ${activeCopy().trace.focus}`),
        createElement('button', { className: 'war-btn', onClick: onClose }, copy.close),
      ),
    ),
  )
}

// --- 任务区 ------------------------------------------------------------------

function TaskCard(task: BoardTask, statuses: Map<string, BoardTask['status']>, onOpen: (taskId: string) => void, onHandle: (() => void) | null, lineageCmd: BoardCommand | null, onOpenCommand: (commandId: string) => void, trace: CardTrace): ReactNode {
  return createElement('div', {
    key: task.taskId,
    className: `war-card clickable${relClass(trace)}`,
    onClick: () => onOpen(task.taskId),
    ...traceMouse(trace),
  },
    createElement('div', { className: 'war-card-top' },
      statusMark(task),
      createElement('span', { className: `war-chip st-${task.status}` }, activeCopy().taskStatus[task.status]),
      qualityChip(task.quality),
      task.priority === 'high' ? createElement('span', { className: 'war-chip pri-high' }, activeCopy().taskCard.highPriority) : null,
      lineageCmd !== null
        ? createElement('span', {
            className: 'war-chip war-lineage',
            title: `${activeCopy().detail.lineageLabel} ${lineageCmd.commandId}——点击追踪全生命周期`,
            onClick: e => { e.stopPropagation(); onOpenCommand(lineageCmd.commandId) },
          }, `↩ ${lineageCmd.commandId}`)
        : null,
      createElement('span', { className: 'war-title' }, task.title),
    ),
    createElement('div', { className: 'war-card-top' },
      createElement('span', { className: 'war-taskid' }, task.taskId),
      task.attempts > 1 ? createElement('span', { className: 'war-chip', title: activeCopy().taskCard.attemptNTitle }, activeCopy().taskCard.attemptN(task.attempts)) : null,
      relTime(task.startedAt) !== '' ? createElement('span', { className: 'war-time' }, relTime(task.startedAt)) : null,
    ),
    depLock(task, statuses),
    task.schedule !== null && task.schedule.enabled ? cronBadge(task) : null,
    wsChip(task.workspacePath),
    task.brief !== '' ? createElement('div', { className: 'war-brief' }, task.brief) : null,
    task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail', title: activeCopy().taskCard.failTitle }, activeCopy().taskCard.failReason(task.lastError)) : null,
    task.deliverables.length > 0
      ? createElement('div', { className: 'war-loot' },
        createElement('span', { className: 'war-loot-item' }, activeCopy().taskCard.lootPrefix),
        task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
      )
      : null,
    onHandle !== null
      ? createElement('div', { className: 'war-card-top' },
        createElement('button', { className: 'war-btn primary', onClick: e => { e.stopPropagation(); onHandle() } }, activeCopy().taskCard.handle),
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

function TaskDetail(props: { task: BoardTask; statuses: Map<string, BoardTask['status']>; services: ClientServicesFace; staffTarget: string | null; lineageCmd: BoardCommand | null; onOpenCommand: (commandId: string) => void; onClose: () => void }): ReactNode {
  const { task, statuses, services, staffTarget, lineageCmd, onOpenCommand, onClose } = props
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
        `${task.taskId} · ${activeCopy().taskStatus[task.status]} · ${QUALITY_LABEL[task.quality]}${task.priority === 'high' ? ` · ${activeCopy().taskCard.highPriority}` : ''}${task.attempts > 1 ? ` · ${activeCopy().taskCard.attemptN(task.attempts)}` : ''}`),
      lineageCmd !== null
        ? createElement('div', { className: 'war-modal-sub' },
          `${activeCopy().detail.lineageLabel} `,
          createElement('span', {
            className: 'war-chip war-lineage',
            onClick: () => { onOpenCommand(lineageCmd.commandId); onClose() },
          }, `↩ ${lineageCmd.commandId}`))
        : null,
      createElement('div', { className: 'war-detail-body' },
        depLock(task, statuses),
        task.schedule !== null && task.schedule.enabled ? cronBadge(task) : null,
        wsChip(task.workspacePath),
        createElement('div', { className: 'war-detail-section' }, activeCopy().detail.briefSection),
        createElement('div', { className: 'war-detail-text' }, task.brief !== '' ? task.brief : activeCopy().detail.briefMissing),
        createElement('div', { className: 'war-detail-section' }, activeCopy().detail.acceptanceSection),
        createElement('div', { className: 'war-detail-text' }, task.acceptance !== '' ? task.acceptance : activeCopy().detail.acceptanceMissing),
        latest !== undefined
          ? createElement('div', { className: 'war-report' }, `${activeCopy().detail.reportPrefixPlain}${latest.text}`)
          : null,
        latest !== undefined && latest.evidence !== null ? EvidenceBlock(latest.evidence) : null,
        task.deliverables.length > 0
          ? createElement('div', { className: 'war-loot' },
            createElement('span', { className: 'war-loot-item' }, activeCopy().taskCard.lootPrefix),
            task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
          )
          : null,
        task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, activeCopy().taskCard.failReason(task.lastError)) : null,
        task.closedVerdict !== null ? createElement('div', { className: 'war-report' }, `${activeCopy().detail.verdictPrefix}${task.closedVerdict}`) : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        handleable
          ? createElement('button', { className: 'war-btn primary', onClick: () => { services.sessions?.open(staffTarget as string); onClose() } }, activeCopy().taskCard.handle)
          : null,
        createElement('button', { className: 'war-btn', onClick: onClose }, activeCopy().detail.close),
      ),
    ),
  )
}

// --- 会话卡（战场：进行中/已完成/已失败，详情优先）---------------------------

function SessionCard(task: BoardTask, attempt: BoardAttempt, onDetail: (task: BoardTask, attempt: BoardAttempt) => void, trace: CardTrace): ReactNode {
  const key = `${attempt.sessionId}:${attempt.startedAt}`
  const outcomeKey = attempt.outcome ?? 'live'
  const meta = outcomeLabel(outcomeKey)
  const loot = task.deliverables.length > 0 ? task.deliverables.map(d => d.summary).join('；') : null
  return createElement('div', {
    key,
    className: `war-card war-session-card clickable q-edge-${task.quality}${relClass(trace)}`,
    title: activeCopy().session.cardTitle(attempt.sessionId),
    onClick: () => { onDetail(task, attempt) },
    ...traceMouse(trace),
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    attempt.n > 1 ? createElement('span', { className: 'war-chip', title: activeCopy().session.attemptNTitle }, activeCopy().session.attemptN(attempt.n)) : null,
    createElement('span', { className: 'war-time' }, relTime(attempt.startedAt)),
  ),
  createElement('div', { className: 'war-title' }, task.title),
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: attempt.sessionId }, `⌁ ${attempt.sessionId.slice(0, 10)}…`),
    wsChip(task.workspacePath),
  ),
  outcomeKey === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, activeCopy().session.failReason(task.lastError)) : null,
  outcomeKey === 'succeeded' && loot !== null ? createElement('div', { className: 'war-loot-summary', title: loot }, activeCopy().session.lootSummary(loot, loot.slice(0, 80), loot.length > 80)) : null,
  outcomeKey === 'reported' ? createElement('div', { className: 'war-waiting' }, activeCopy().session.waitingReport) : null,
  )
}

/** The battlefield's read-only detail modal (detail-first). A real component
 * (createElement-mounted) — its useEffect must live in its own instance. */
function SessionDetail(props: { task: BoardTask; attempt: BoardAttempt; services: ClientServicesFace; staffTarget: string | null; lineageCmd: BoardCommand | null; onOpenCommand: (commandId: string) => void; onClose: () => void }): ReactNode {
  const { task, attempt, services, staffTarget, lineageCmd, onOpenCommand, onClose } = props
  const outcomeKey = attempt.outcome ?? 'live'
  const meta = outcomeLabel(outcomeKey)
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
        `${task.taskId} · ${meta.label}${attempt.n > 1 ? ` · ${activeCopy().session.attemptN(attempt.n)}` : ''} · ${relTime(attempt.startedAt)}${attempt.endedAt !== null ? ` → ${relTime(attempt.endedAt)}` : ''} · ⌁ ${attempt.sessionId}`),
      lineageCmd !== null
        ? createElement('div', { className: 'war-modal-sub' },
          `${activeCopy().detail.lineageLabel} `,
          createElement('span', {
            className: 'war-chip war-lineage',
            onClick: () => { onOpenCommand(lineageCmd.commandId); onClose() },
          }, `↩ ${lineageCmd.commandId}`))
        : null,
      createElement('div', { className: 'war-detail-body' },
        wsChip(task.workspacePath),
        createElement('div', { className: 'war-detail-section' }, activeCopy().detail.briefSection),
        createElement('div', { className: 'war-detail-text' }, task.brief !== '' ? task.brief : activeCopy().detail.briefMissing),
        createElement('div', { className: 'war-detail-section' }, activeCopy().detail.acceptanceSection),
        createElement('div', { className: 'war-detail-text' }, task.acceptance !== '' ? task.acceptance : activeCopy().detail.acceptanceMissing),
        task.reports.length > 0 ? createElement('div', { className: 'war-detail-section' }, activeCopy().detail.reportsSection) : null,
        task.reports.map((r, i) => createElement('div', { key: `r${i}`, className: 'war-report' }, `${activeCopy().detail.reportPrefix(relTime(r.ts))}${r.text}`)),
        latest !== undefined && latest.evidence !== null ? EvidenceBlock(latest.evidence) : null,
        task.comments.length > 0 ? createElement('div', { className: 'war-detail-section' }, activeCopy().detail.commentsSection) : null,
        task.comments.map((c, i) => createElement('div', { key: `c${i}`, className: 'war-report' }, `${activeCopy().detail.commentPrefix(relTime(c.ts))}${c.text}`)),
        task.deliverables.length > 0
          ? createElement('div', { className: 'war-loot' },
            createElement('span', { className: 'war-loot-item' }, activeCopy().session.lootPrefix),
            task.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)),
          )
          : null,
        outcomeKey === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail' }, activeCopy().session.failReason(task.lastError)) : null,
        task.closedVerdict !== null ? createElement('div', { className: 'war-report' }, `${activeCopy().detail.verdictPrefix}${task.closedVerdict}`) : null,
      ),
      createElement('div', { className: 'war-modal-actions' },
        outcomeKey === 'reported' && staffTarget !== null
          ? createElement('button', { className: 'war-btn', onClick: openStaff }, activeCopy().session.goHandle)
          : null,
        createElement('button', { className: 'war-btn primary', onClick: openThread }, activeCopy().session.enterReview),
        createElement('button', { className: 'war-btn', onClick: onClose }, activeCopy().detail.close),
      ),
    ),
  )
}

// --- 挂载 thread（v3：外部会话上战场）-----------------------------------------

/** An externally-attached session: 「外部」badge, jump + detach only. */
function ExternalThreadCard(thread: BoardThread, services: ClientServicesFace, onDetach: (sessionId: string) => void, trace: CardTrace): ReactNode {
  return createElement('div', {
    key: `ext-${thread.sessionId}`,
    className: `war-card war-external-card clickable${relClass(trace)}`,
    title: activeCopy().attach.cardTitle(thread.sessionId),
    onClick: () => { services.sessions?.open(thread.sessionId) },
    ...traceMouse(trace), // familyId=null：只被压暗，不点亮
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-chip ext-badge' }, activeCopy().attach.badge),
    createElement('span', { className: 'war-time' }, relTime(thread.attachedAt)),
  ),
  createElement('div', { className: 'war-title' }, thread.note !== '' ? thread.note : activeCopy().attach.noNote),
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: thread.sessionId }, `⌁ ${thread.sessionId.slice(0, 10)}…`),
    createElement('button', {
      className: 'war-btn war-detach',
      title: activeCopy().attach.detachTitle,
      onClick: e => { e.stopPropagation(); onDetach(thread.sessionId) },
    }, activeCopy().attach.detach),
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
        setError(result.error ?? activeCopy().attach.failFallback)
      }
    })()
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', onClick: e => e.stopPropagation() },
      createElement('div', { className: 'war-modal-title' }, activeCopy().attach.title),
      createElement('div', { className: 'war-modal-sub' }, activeCopy().attach.sub),
      createElement('input', {
        className: 'war-attach-input',
        value: sessionId,
        placeholder: activeCopy().attach.sessionIdPlaceholder,
        autoFocus: true,
        onChange: e => { setSessionId((e.target as HTMLInputElement).value) },
        onKeyDown: e => { if (e.key === 'Escape') onClose() },
      }),
      createElement('input', {
        className: 'war-attach-input',
        value: note,
        placeholder: activeCopy().attach.notePlaceholder,
        onChange: e => { setNote((e.target as HTMLInputElement).value) },
        onKeyDown: e => { if (e.key === 'Enter') submit() },
      }),
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, activeCopy().attach.cancel),
        createElement('button', { className: 'war-btn primary', disabled: busy || sessionId.trim() === '', onClick: submit }, busy ? activeCopy().attach.busy : activeCopy().attach.submit),
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

/** V7-① 等你发落收件箱：四类需要元首的动作（答澄清/批计划/翻战报/决重试）
 * 聚合成一条队列，带等待时长与 aging 警示；点击直达动作发生地（进会话/开
 * 决策卡/开任务详情）——板子只导航，不长任务写操作（红线）。 */
function InboxStrip(items: InboxItem[], onAct: (item: InboxItem) => void): ReactNode {
  const copy = activeCopy().inbox
  const kindLabel: Record<InboxKind, string> = { clarify: copy.clarify, plan: copy.plan, review: copy.review, retry: copy.retry }
  return createElement('div', { className: 'war-inbox' },
    createElement('div', { className: 'war-inbox-head' },
      createElement('span', { className: 'war-inbox-title' }, copy.title),
      createElement('span', { className: 'war-inbox-count' }, String(items.length)),
    ),
    items.length === 0
      ? createElement('div', { className: 'war-inbox-empty' }, copy.empty)
      : createElement('div', { className: 'war-inbox-items' },
        items.map(it => createElement('div', {
          key: `${it.kind}:${it.refId}`,
          className: `war-inbox-item clickable${it.tone !== '' ? ` tone-${it.tone}` : ''}`,
          title: it.tone === 'err' ? copy.errTitle : it.tone === 'warn' ? copy.warnTitle : undefined,
          onClick: () => { onAct(it) },
        },
        createElement('span', { className: `war-chip k-${it.kind}` }, kindLabel[it.kind]),
        createElement('span', { className: 'war-inbox-text' }, it.title),
        createElement('span', { className: 'war-inbox-wait' }, copy.waited(formatWait(it.waitMs))),
        )),
      ),
  )
}

/** V7-② 到访摘要横幅：自上次看过以来——收官/折戟/新命令/等你发落，点段跳
 * 对应区。lastSeen 是挂载快照（关板时由 shell-entry 落），到访期间数字不跳。 */
function VisitBanner(delta: VisitDelta, lastSeen: number, now: number): ReactNode {
  if (!delta.any) return null
  const copy = activeCopy().visit
  const jump = (selector: string): void => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const since = lastSeen > 0 ? copy.since(relTime(new Date(lastSeen).toISOString(), now)) : copy.firstSeen
  return createElement('div', { className: 'war-visit' },
    createElement('span', { className: 'war-visit-since' }, since),
    delta.closed > 0
      ? createElement('span', { className: 'war-visit-seg s-closed clickable', onClick: () => { jump('.war-zone.war-report') } }, copy.closed(delta.closed))
      : null,
    delta.failed > 0
      ? createElement('span', { className: 'war-visit-seg s-failed clickable', onClick: () => { jump('.war-zone.war-report') } }, copy.failed(delta.failed))
      : null,
    delta.commands > 0
      ? createElement('span', { className: 'war-visit-seg clickable', onClick: () => { jump('.war-col.zone-commands') } }, copy.commands(delta.commands))
      : null,
    delta.pending > 0
      ? createElement('span', { className: 'war-visit-seg s-pending clickable', onClick: () => { jump('.war-inbox') } }, copy.pending(delta.pending))
      : null,
  )
}

/** V7-③ 聚焦条：常驻族系追踪的顶栏（命令文本 + 退出钮；Esc 同效）。 */
function FocusBar(text: string, onExit: () => void): ReactNode {
  const copy = activeCopy().trace
  return createElement('div', { className: 'war-focusbar' },
    createElement('span', { className: 'war-focusbar-tag' }, '◎'),
    createElement('span', { className: 'war-focusbar-text', title: text }, `${copy.focusing}${text}`),
    createElement('button', { className: 'war-btn', onClick: onExit }, copy.exitFocus),
  )
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
    // V7-② 到访摘要：挂载时读一次 last-seen 快照（关板时写入）——到访期间不跳动。
    const [lastSeenSnapshot] = useState<number>(() => {
      try { return Date.parse(localStorage.getItem('warroom-last-seen') ?? '') || 0 } catch { return 0 }
    })
    // V7-③ 族系追踪：悬停即时预览（hover 优先），聚焦常驻（Esc/退出钮解除）。
    const [hoverFamily, setHoverFamily] = useState<string | null>(null)
    const [focusCommandId, setFocusCommandId] = useState<string | null>(null)
    useEffect(() => {
      if (focusCommandId === null) return
      const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setFocusCommandId(null) }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [focusCommandId])
    // 皮肤切换 → 整板重渲染拉新文案（词典经 activeCopy() 渲染期取值）。
    useSyncExternalStore(subscribeSkin, skinId)
    const tasks = data?.tasks ?? []
    const commands = data?.commands ?? []
    const threads = data?.threads ?? []
    const hqSessionId = data?.hqSessionId ?? null
    const statuses = new Map(tasks.map(t => [t.taskId, t.status] as const))
    const staffFor = (taskId: string): string | null => staffSessionFor(taskId, commands, hqSessionId)
    // 全生命周期溯源：任务（含 V6 链后继）→ 源命令。命令卡/任务卡/会话详情共享。
    const lineageMap = new Map<string, BoardCommand>()
    for (const c of commands) for (const t of commandTasks(c, tasks)) if (!lineageMap.has(t.taskId)) lineageMap.set(t.taskId, c)
    const lineageOf = (taskId: string): BoardCommand | null => lineageMap.get(taskId) ?? null
    const chainOf = (c: BoardCommand): BoardTask[] => commandTasks(c, tasks)
    const openCommand = (commandId: string): void => { setDetailTaskId(null); setDetailAttempt(null); setDetailCommandId(commandId) }
    const openStaff = (taskId: string): void => {
      const target = staffFor(taskId)
      if (target !== null) services.sessions?.open(target)
    }
    const detailTask = detailTaskId !== null ? tasks.find(t => t.taskId === detailTaskId) : undefined
    const detailCommand = detailCommandId !== null ? commands.find(c => c.commandId === detailCommandId) : undefined
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
    // V7-③ trace 注入器：命令卡 family=自身；任务/会话卡 family=源命令；外部挂载 null（只压暗）。
    const traceActive = hoverFamily ?? focusCommandId
    const traceFor = (familyId: string | null): CardTrace => ({ familyId, active: traceActive, onHover: setHoverFamily, onFocus: setFocusCommandId })
    const focusCmd = focusCommandId !== null ? commands.find(c => c.commandId === focusCommandId) : undefined
    // V7-① 收件箱：聚合 + 点击导航（clarify 进参谋会话，plan 开决策卡，review/retry 开任务详情）。
    const inbox = collectInbox(commands, tasks, now)
    // V7-② 摘要：以挂载快照算增量（pending 用当前收件箱长度）。
    const visit = visitDelta(commands, tasks, inbox.length, lastSeenSnapshot, now)
    const inboxAct = (it: InboxItem): void => {
      if (it.kind === 'clarify') {
        const cmd = commands.find(c => c.commandId === it.refId)
        const target = cmd?.staffSessionId ?? hqSessionId
        if (cmd !== undefined && target !== null) {
          void markTalking(cmd.commandId)
          services.sessions?.open(target)
        }
      } else if (it.kind === 'plan') {
        openCommand(it.refId)
      } else {
        setDetailTaskId(it.refId)
      }
    }
    const doneChildren: ReactNode[] = doneGroups.map(g => createElement('div', { key: g.key, className: `war-day-group${collapsedGroups.has(g.key) ? ' collapsed' : ''}` },
      createElement('button', { className: 'war-day-head', onClick: () => { toggleGroup(g.key) } },
        createElement('span', { className: 'war-day-caret' }, '▼'),
        createElement('span', null, activeCopy().days[g.key]),
        createElement('span', { className: 'war-day-count' }, String(g.items.length)),
      ),
      collapsedGroups.has(g.key) ? null : g.items.map(({ t, a }) => SessionCard(t, a, openSessionDetail, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
    ))
    return createElement('div', { className: 'war-root' },
      createElement('div', { className: 'war-head' },
        createElement('span', { className: `war-head-dot${data?.active === true ? ' on' : ''}` }),
        createElement('span', { className: 'war-head-title' }, activeCopy().head.title),
        createElement('span', { className: 'war-head-sub' }, data !== null && data.active ? activeCopy().head.subActive : activeCopy().head.subIdle),
        // 皮肤切换是元 UI（控制文案层本身），不进皮肤词典——任何皮肤下都可用。
        createElement('button', { className: 'war-btn war-skin-btn', type: 'button', title: '切换文案皮肤（只换措辞，不改机制）', onClick: () => setSkin(skinId() === 'war' ? 'plain' : 'war') }, skinId() === 'war' ? '平话皮肤' : '军事皮肤'),
      ),
      data === null
        ? createElement('div', { className: 'war-body' },
          error !== null ? createElement('span', { className: 'war-err' }, activeCopy().loading.unreachable(error)) : createElement('span', { className: 'war-empty' }, activeCopy().loading.connecting),
        )
        : createElement('div', { className: 'war-board' },
          // 三区：指挥中心（命令+任务）| 战场（进行中）| 战报（已完成+已失败）。
          createElement('div', { className: 'war-zone war-hq' },
            zoneHead(activeCopy().zones.hq.title, activeCopy().zones.hq.note),
            VisitBanner(visit, lastSeenSnapshot, now),
            InboxStrip(inbox, inboxAct),
            createElement('div', { className: 'war-zone-cols' },
              Zone('commands', activeCopy().columns.commands.title, commandsNewest.length, activeCopy().columns.commands.empty,
                commandsNewest.map(c => CommandCard(c, hqSessionId, services, cmd => setDetailCommandId(cmd.commandId), chainOf(c), traceFor(c.commandId))),
                createElement('span', { className: 'war-col-actions' },
                  createElement('button', { className: 'war-btn war-attach-btn', title: activeCopy().colActions.attachTitle, onClick: () => setAttachOpen(true) }, activeCopy().colActions.attachLabel),
                  createElement('button', { className: 'war-btn primary war-plus', title: activeCopy().colActions.newTitle, onClick: () => setComposerOpen(true) }, '+'),
                ),
              ),
              Zone('tasks', activeCopy().columns.tasks.title, tasks.length, activeCopy().columns.tasks.empty,
                tasks.map(t => TaskCard(t, statuses, id => setDetailTaskId(id),
                  (t.status === 'reported' || t.status === 'failed') && staffFor(t.taskId) !== null
                    ? () => { openStaff(t.taskId) }
                    : null,
                  lineageOf(t.taskId), openCommand, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
              ),
            ),
          ),
          createElement('div', { className: 'war-zone war-field' },
            zoneHead(activeCopy().zones.field.title, activeCopy().zones.field.note),
            createElement('div', { className: 'war-zone-cols' },
              Zone('live', activeCopy().columns.live.title, live.length + threads.length, activeCopy().columns.live.empty,
                [...live.map(({ t, a }) => SessionCard(t, a, openSessionDetail, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
                  ...threads.map(th => ExternalThreadCard(th, services, sessionId => { void detachThread(sessionId).then(refresh) }, traceFor(null)))],
              ),
            ),
          ),
          createElement('div', { className: 'war-zone war-report' },
            zoneHead(activeCopy().zones.report.title, activeCopy().zones.report.note),
            createElement('div', { className: 'war-zone-cols' },
              Zone('done', activeCopy().columns.done.title, done.length, activeCopy().columns.done.empty,
                doneChildren,
              ),
              Zone('failed', activeCopy().columns.failed.title, failed.length, activeCopy().columns.failed.empty,
                failed.map(({ t, a }) => SessionCard(t, a, openSessionDetail, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
              ),
            ),
          ),
        ),
      focusCommandId !== null && focusCmd !== undefined
        ? FocusBar(focusCmd.text, () => { setFocusCommandId(null) })
        : null,
      composerOpen ? createElement(CommandComposer, { key: 'composer', onClose: () => setComposerOpen(false), refresh }) : null,
      attachOpen ? createElement(AttachThreadModal, { key: 'attach', onClose: () => setAttachOpen(false), refresh }) : null,
      detailTask !== undefined ? createElement(TaskDetail, { key: `task-${detailTask.taskId}`, task: detailTask, statuses, services, staffTarget: staffFor(detailTask.taskId), lineageCmd: lineageOf(detailTask.taskId), onOpenCommand: openCommand, onClose: () => setDetailTaskId(null) }) : null,
      detailCommand !== undefined ? CommandDetail(detailCommand, chainOf(detailCommand), id => setDetailTaskId(id), () => setDetailCommandId(null), grade => {
        void regradeCommand(detailCommand.commandId, grade).then(r => { if (r.ok) refresh() })
      }, decision => {
        void decidePlan(detailCommand.commandId, decision).then(r => { if (r.ok) refresh() })
      }, commandId => { setFocusCommandId(commandId) }) : null,
      detailTaskForAttempt !== undefined && detailAttemptEntry !== undefined
        ? createElement(SessionDetail, { key: `attempt-${detailAttemptEntry.id}`, task: detailTaskForAttempt, attempt: detailAttemptEntry, services, staffTarget: staffFor(detailTaskForAttempt.taskId), lineageCmd: lineageOf(detailTaskForAttempt.taskId), onOpenCommand: openCommand, onClose: () => setDetailAttempt(null) })
        : null,
    )
  }
}

/** The composer dock status pill — v3: also the warroom HOME button (click
 * reopens the board via the shell entry) with an unread-since-last-seen badge. */
export function WarDockPill(): ReactNode {
  const { data } = useWar()
  useSyncExternalStore(subscribeSkin, skinId)
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
  return createElement('button', { className: 'war-dockpill war-dock-home', type: 'button', onClick: goHome, title: activeCopy().dock.titleLine(counts) },
    createElement('span', { className: 'war-dockseg' }, activeCopy().dock.segLine(counts)),
    unread > 0 ? createElement('span', { className: 'war-dock-unread' }, activeCopy().dock.unread(unread)) : null,
  )
}
