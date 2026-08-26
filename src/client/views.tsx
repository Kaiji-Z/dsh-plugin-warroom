/**
 * The war map (三列局势墙 + 调度条) — the warroom's V9 operating surface.
 * Three monitor columns (任务 / 作战中+外部 / 战报) plus the bottom command
 * dispatch strip. V9.9 wiring discipline: clicking ANY card opens the source
 * command's focus page (聚焦页 — a lifecycle tour that pulls the main-UI
 * cards into one window); there are no per-task/per-session detail modals
 * anymore. Battlefield cards jump via sessions.open (live cards direct,
 * settled cards through the tour's report stage); reported/failed task cards
 * also carry a 「去处理」 shortcut to the owning command's staff conversation.
 * @module dsh-plugin-warroom/client/views
 */

import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createCommand, decidePlan, detachThread, markTalking, regradeCommand, useWar, type BoardAttempt, type BoardCommand, type BoardQuality, type BoardTask, type BoardThread } from './data.ts'
import { activeCopy, setSkin, skinId, subscribeSkin } from './copy.ts'
import { agingLeader, collectInbox, formatWait, type InboxItem, type InboxKind } from './inbox.ts'
import { visitDelta, type VisitDelta } from './visit.ts'
import { applyGradeMarker, stalledOnUserPlan, type ComposerGrade } from './preflight.ts'
import { nextRunOf, parseCron } from '../schedule.ts'
import { waitKindOf } from './waithint.ts'
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
/** V9.9 聚焦页内嵌卡片用的中性 trace：不参与族系高亮/压暗（窗口里只有这一
 * 条命令的卡，亮暗没有信息量），也不响应悬停上报。 */
const NO_TRACE: CardTrace = { familyId: null, active: null, onHover: () => {}, onFocus: () => {} }

/** 档位标记（协议 token，跨皮肤同文——与 preflight.applyGradeMarker 同源）：
 * 聚焦页「下达配置」的自主度行展示用。 */
const GRADE_MARKER: Record<'L0' | 'L1' | 'L2', string> = { L0: ' · !!直接做', L1: '', L2: ' · ??先看方案' }

/** 键盘激活（Enter/Space）——卡片是 div role="button"，键盘通道与点击同路（V7.1 审查整改）。 */
function keyActivate(fn: () => void): (e: { key: string; preventDefault(): void; target: unknown; currentTarget: unknown }) => void {
  // V9.6（复评 P0）：事件源不是宿主卡本身（嵌套按钮/chip 的键盘激活）时
  // 放行原生行为——否则 ◎ 聚焦键回车会错开详情、进入对话 chip 键盘失灵。
  return e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    fn()
  }
}

function qualityChip(quality: BoardQuality): ReactNode {
  if (quality === 'common') return null
  return createElement('span', { className: `war-chip q-${quality}`, title: activeCopy().qualityTitle }, QUALITY_LABEL[quality] ?? quality)
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
    // V9.3（复评 P2-1）：approved→publish 窗口期不再是「参谋接收中」——绿
    // 「已批准」旁挂 warn 接收中是两个状态通道打架，给中性「任务待发布」。
    // V9.9：此窗口任务卡尚未成形，reached.task 不再点亮（now 仍指 task 作
    // 前沿呼吸位）——阶段条只反映真实在场的卡片，不预告还没发生的事。
    if (cmd.status === 'approved') {
      return { reached: { command: true, task: false, battle: false, report: false }, now: 'task', status: copy.approvedAwaitingPublish, tone: '' }
    }
    const status = cmd.status === 'talking' ? copy.waitingClarify : planPending ? copy.planPending : copy.waitingStaff
    return { reached: { command: true, task: false, battle: false, report: false }, now: 'command', status, tone: 'warn' }
  }
  const closed = chain.filter(t => t.status === 'closed').length
  const battleLive = chain.some(t => t.status === 'in_progress' || t.status === 'reported' || t.attemptLog.length > 0)
  // V9.11：上报（reported）即进战报段——执行卡已平移到战报列，生命条不许停在执行段
  // 打架；状态标签优先级 定论(closed/failed) > 待验收(reported)。
  const reportDone = chain.some(t => t.status === 'closed' || t.status === 'failed' || t.status === 'reported')
  const chainPrefix = chain.length > 1 ? `${copy.chain(closed, chain.length)} · ` : ''
  if (reportDone) {
    const terminal = chain.find(t => t.status === 'closed') ?? chain.find(t => t.status === 'failed') ?? chain.find(t => t.status === 'reported')
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

/** V9.11 成形态判定（聚焦页 ghost 与主界面任务列成形卡同源，保持分岔一致）：
 *  空链未取消时 计划 > 等你答问 > 已接令起草；转达中/定时/已取消/已挂任务书无卡。 */
function formingVariantOf(cmd: BoardCommand, chain: BoardTask[]): 'plan' | 'talking' | 'drafting' | null {
  if (chain.length > 0 || cmd.status === 'cancelled') return null
  return cmd.plan !== null ? 'plan' : cmd.status === 'talking' ? 'talking' : cmd.staffSessionId !== null ? 'drafting' : null
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

/** V9.3（复评 P2-2）：task.lastError 是任务级最新败因——挂在每次失败尝试卡上
 * 会把第 2 次的败因安到第 1 次头上且双计。只在该卡确为最新失败尝试时展示，
 * 更早的尝试给中性文案（复盘进详情看全程）。 */
function isLatestFailedAttempt(task: BoardTask, attempt: BoardAttempt): boolean {
  const failed = (task.attemptLog ?? []).filter(a => a.outcome === 'failed')
  return failed.length === 0 || failed[failed.length - 1]!.id === attempt.id
}

/** V9.3 Esc 层协调器：所有「Esc 可关」的层（弹窗/抽屉/聚焦）入栈，一次 Esc
 * 只关最顶层——修复「聚焦+弹窗叠加时第一个 Esc 关错层」（复评 P1-3：监听器
 * 随渲染重注册 + React 离散刷新中途摘除，竞争出「Esc 只退聚焦」假象）。 */
const escLayers: Array<() => void> = []

/** 弹窗层三件套（复评 P1-2）：dialog 语义 + 焦点移入/归还 + Tab 圈禁。
 * onClose 经 ref 稳定持有——监听器空依赖注册一次，永不重挂。 */
function useModalLayer(onClose: () => void, label: string): {
  ref: { current: HTMLDivElement | null }
  props: { role: 'dialog'; 'aria-modal': 'true'; 'aria-label': string; tabIndex: number }
} {
  const ref = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus()
    const mine = (): void => { closeRef.current() }
    escLayers.push(mine)
    const onKey = (e: KeyboardEvent): void => {
      const el = ref.current
      if (e.key === 'Escape') {
        if (escLayers[escLayers.length - 1] !== mine) return
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || el === null) return
      const focusables = el.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      else if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = escLayers.indexOf(mine)
      if (i >= 0) escLayers.splice(i, 1)
      prev?.focus()
    }
  }, [])
  return { ref, props: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabIndex: -1 } }
}

/** 非 弹窗的 Esc 层（聚焦模式等）：同样只关最顶层。 */
function useEscOnlyLayer(active: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!active) return
    const mine = (): void => { closeRef.current() }
    escLayers.push(mine)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || escLayers[escLayers.length - 1] !== mine) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = escLayers.indexOf(mine)
      if (i >= 0) escLayers.splice(i, 1)
    }
  }, [active])
}

/** V9.2 定时命令角标的时间格式（本地时区 MM-DD HH:mm；无效/缺失给 —）。 */
function fmtSchedule(iso: string | null): string {
  if (iso === null) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CommandCard(cmd: BoardCommand, hqSessionId: string | null, services: ClientServicesFace, onDetail: (cmd: BoardCommand) => void, chain: BoardTask[], trace: CardTrace, onRegrade: (grade: 'L0' | 'L1' | 'L2') => void, tour = false): ReactNode {
  const meta = commandStatus(cmd.status)
  const enterSession = (): void => {
    const target = cmd.staffSessionId ?? hqSessionId
    if (target === null || services.sessions === undefined) return
    void markTalking(cmd.commandId)
    services.sessions.open(target)
  }
  // V9.5（复评 P1-1）：命令卡点击语义统一——一律打开全生命周期详情（板是
  // 叙事中心，好奇不该瞬移出板）；对话入口改为卡上视觉独立的虚线 chip。
  // V9.9 tour 变体（聚焦页内嵌）：点击=展开下达配置，◎/进入对话收起（底部
  // 「任务会话」跳钮覆盖对话入口，窗口内不需要二次聚焦）。
  const conversational = !tour && (cmd.status === 'received' || cmd.status === 'talking')
  const activate = (): void => { onDetail(cmd) }
  return createElement('div', {
    key: cmd.commandId,
    className: `war-card war-command-card clickable${cmd.status === 'received' ? ' pulse' : ''}${relClass(trace)}`,
    title: undefined,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${meta.label}：${cmd.text}`,
    onClick: activate,
    onKeyDown: keyActivate(activate),
    ...traceMouse(trace),
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-dot ${meta.dot}` }),
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    gradeChip(cmd),
    cmd.schedule !== null && cmd.schedule.dispatchedAt === null
      ? createElement('span', {
          className: 'war-chip sched',
          title: activeCopy().scheduleChip.cardTitle(fmtSchedule(cmd.schedule.nextRunAt)),
        }, activeCopy().scheduleChip.chip(fmtSchedule(cmd.schedule.nextRunAt)))
      : null,
    conversational
      ? createElement('button', {
          className: 'war-chip war-enter-chip',
          type: 'button',
          title: meta.hint,
          onClick: e => { e.stopPropagation(); enterSession() },
        }, '进入对话')
      : null,
    createElement('span', { className: 'war-time' }, relTime(cmd.createdAt)),
    !tour
      ? createElement('button', {
          className: 'war-btn war-focus-btn',
          title: activeCopy().trace.focusBtnTitle,
          'aria-label': activeCopy().trace.focusBtnTitle,
          onClick: e => { e.stopPropagation(); trace.onFocus(cmd.commandId) },
        }, '◎')
      : null,
  ),
  createElement('div', { className: `war-command-text${cmd.status === 'cancelled' ? ' struck' : ''}` }, cmd.text),
  // 全生命周期阶段条：命令不因发布而死卡——任务/执行/战报进度常驻卡上。
  LifeStrip(cmd, chain),
  // V7-④ 夜间预检：将停在「等你批计划」的命令给后果提示 + 改直发出口（既有 regrade API）。
  stalledOnUserPlan(cmd)
    ? createElement('div', { className: 'war-preflight', title: activeCopy().preflight.title },
      createElement('span', { className: 'war-preflight-text' }, activeCopy().preflight.hint),
      createElement('button', { className: 'war-btn war-preflight-btn', onClick: e => { e.stopPropagation(); onRegrade('L0') } }, activeCopy().preflight.toDirect),
    )
    : null,
  cmd.status === 'cancelled' && cmd.cancelledReason !== null
    ? createElement('div', { className: 'war-fail' }, activeCopy().commandDetail.cancelledReason(cmd.cancelledReason))
    : null,
  )
}

/** 调度条 ✚ 的起草器（V9.2 重设计）：先一句话讲清「你能做什么」，再给两组
 * 选项卡——自主度（放权多少）与发布时机（立即 / cron 定时，到点 tick 自动
 * 下达、一次有效）。档位标记仍拼入命令文本（机制不变）；Ctrl+Enter 提交。
 * 真组件（createElement 挂载）：hooks 各归各实例（#310 教训）。 */
function CommandComposer(props: { recent: string[]; onClose: () => void; refresh: () => void }): ReactNode {
  const { recent, onClose, refresh } = props
  const layer = useModalLayer(onClose, activeCopy().composer.title)
  // V9.5（复评 P2-1）：草稿落 localStorage——误点背板/顺手 Esc 不再焚稿，
  // 重开起草器自动续写；提交成功才清。
  const [text, setText] = useState(() => { try { return localStorage.getItem('warroom-draft') ?? '' } catch { return '' } })
  const [grade, setGrade] = useState<ComposerGrade>('auto')
  const [sched, setSched] = useState<'now' | 'cron'>('now')
  const [cronExpr, setCronExpr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cronErr: string | null = useMemo(() => {
    if (sched !== 'cron' || cronExpr.trim() === '') return null
    try {
      parseCron(cronExpr)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }, [sched, cronExpr])
  const nextPreview: string | null = useMemo(() => {
    if (sched !== 'cron' || cronErr !== null || cronExpr.trim() === '') return null
    try {
      const next = nextRunOf(cronExpr.trim(), Date.now())
      return next === undefined ? null : fmtSchedule(new Date(next).toISOString())
    } catch {
      return null
    }
  }, [sched, cronErr, cronExpr])
  const submit = (): void => {
    if (busy || text.trim() === '' || cronErr !== null) return
    if (sched === 'cron' && cronExpr.trim() === '') return
    setBusy(true)
    setError(null)
    void (async () => {
      const result = await createCommand(applyGradeMarker(text, grade), sched === 'cron' ? cronExpr.trim() : undefined)
      setBusy(false)
      if (result.ok) {
        try { localStorage.removeItem('warroom-draft') } catch { /* noop */ }
        setText('')
        refresh()
        onClose()
      } else {
        setError(result.error ?? '下达失败，请重试。')
      }
    })()
  }
  useEffect(() => {
    try { text === '' ? localStorage.removeItem('warroom-draft') : localStorage.setItem('warroom-draft', text) } catch { /* 隐私模式无 localStorage */ }
  }, [text])
  const copy = activeCopy().composer
  const optionCard = (key: string, on: boolean, entry: { name: string; hint: string }, cls: string, onPick: () => void): ReactNode =>
    createElement('button', {
      key, type: 'button',
      className: `${cls}${on ? ' on' : ''}`,
      'aria-pressed': on,
      onClick: onPick,
    },
      createElement('span', { className: 'war-grade-card-name' }, entry.name),
      createElement('span', { className: 'war-grade-card-hint' }, entry.hint),
    )
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal war-composer-modal', onClick: e => e.stopPropagation(), ref: layer.ref, ...layer.props },
      createElement('div', { className: 'war-modal-title' }, copy.title),
      createElement('div', { className: 'war-modal-sub' }, copy.lead),
      createElement('textarea', {
        className: 'war-composer',
        value: text,
        placeholder: copy.placeholder,
        'aria-label': copy.title,
        autoFocus: true,
        onChange: e => { setText((e.target as HTMLTextAreaElement).value) },
        onKeyDown: e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit() },
      }),
      createElement('div', { className: 'war-cp-section' }, copy.gradeSection),
      createElement('div', { className: 'war-grade-cards' },
        optionCard('auto', grade === 'auto', copy.gradeAuto, 'war-grade-card', () => { setGrade('auto') }),
        optionCard('L0', grade === 'L0', copy.gradeL0, 'war-grade-card', () => { setGrade('L0') }),
        optionCard('L2', grade === 'L2', copy.gradeL2, 'war-grade-card', () => { setGrade('L2') }),
      ),
      createElement('div', { className: 'war-cp-section' }, copy.scheduleSection),
      createElement('div', { className: 'war-grade-cards war-sched-cards' },
        optionCard('now', sched === 'now', copy.schedNow, 'war-sched-card', () => { setSched('now') }),
        optionCard('cron', sched === 'cron', copy.schedCron, 'war-sched-card', () => { setSched('cron') }),
      ),
      sched === 'cron'
        ? createElement('div', { className: 'war-cron-block' },
          createElement('div', { className: 'war-cron-presets' },
            copy.cronPresets.map(pr => createElement('button', {
              key: pr.cron, type: 'button',
              className: `war-cron-preset${cronExpr.trim() === pr.cron ? ' on' : ''}`,
              title: pr.cron,
              onClick: () => { setCronExpr(pr.cron) },
            }, pr.label)),
          ),
          createElement('input', {
            className: 'war-cron-input',
            type: 'text',
            value: cronExpr,
            placeholder: copy.cronPlaceholder,
            'aria-label': copy.cronLabel,
            onChange: e => { setCronExpr((e.target as HTMLInputElement).value) },
          }),
          cronErr !== null ? createElement('div', { className: 'war-err' }, copy.cronError(cronErr)) : null,
          nextPreview !== null ? createElement('div', { className: 'war-cron-next' }, copy.nextRun(nextPreview)) : null,
        )
        : null,
      recent.length > 0
        ? createElement('div', { className: 'war-recent-row' },
          createElement('span', { className: 'war-recent-label' }, copy.recentLabel),
          recent.map((r, i) => createElement('button', {
            key: `recent-${i}`,
            type: 'button',
            className: 'war-recent-item',
            title: r,
            onClick: () => { setText(r) },
          }, r)),
        )
        : null,
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, copy.cancel),
        createElement('button', {
          className: 'war-btn primary',
          disabled: busy || text.trim() === '' || cronErr !== null || (sched === 'cron' && cronExpr.trim() === ''),
          onClick: submit,
        }, busy ? copy.busy : sched === 'cron' ? copy.submitScheduled : copy.submit),
      ),
      createElement('div', { className: 'war-cp-kbd' }, copy.kbdHint),
    ),
  )
}

/** V9.9 聚焦页（元首定案）：主界面是所有卡片的全生命周期监控版；这里是一条
 * 命令的全生命周期聚焦导览——把主界面的卡片拉进这个窗口。四段各放真实在场
 * 的卡（①命令卡 / ②任务卡按链全列 / ③执行卡=仅进行中的会话 / ④战报卡），
 * 点卡在卡下原地展开子详情（命令→下达配置；任务→最终计划原文，计划中给进
 * 任务会话钮；战报→收官结论原文），执行卡点击直接跳原生会话窗口。底部两颗
 * 会话跳钮（任务会话=参谋计划会话 / 执行会话=指挥官实施会话）代替旧 footer
 * 全部按钮，未形成给禁用占位。顶部标题与「等你发落」决策带沿用 V9.8；阶段
 * 导航只反映真实在场的卡片——没卡的阶段给灰提示行，不预告未发生的事。 */
function FocusPage(props: { cmd: BoardCommand; chain: BoardTask[]; statuses: Map<string, BoardTask['status']>; hqSessionId: string | null; services: ClientServicesFace; focusSegment: 'plan' | 'chain' | 'report' | null; onClose: () => void; onRegrade: (grade: 'L0' | 'L1' | 'L2') => void; onDecidePlan: (decision: 'approve' | 'reject') => void }): ReactNode {
  const { cmd, chain, statuses, hqSessionId, services, focusSegment, onClose, onRegrade, onDecidePlan } = props
  const layer = useModalLayer(onClose, `命令 ${cmd.text.slice(0, 24)}${cmd.text.length > 24 ? '…' : ''}`)
  // 卡下原地展开的子详情（同卡再点收起；换卡即切换）：命令配置 / 某任务卡下的
  // 计划+任务书（空链 ghost 卡用 '' 占位 taskId）/ 战报结论。
  const [open, setOpen] = useState<{ kind: 'config' } | { kind: 'plan'; taskId: string } | { kind: 'report' } | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // 分段直达：打开即滚到需要元首发落的环节（plan/chain→任务段，report→战报段）。
  useEffect(() => {
    if (focusSegment === null) return
    const stage = focusSegment === 'report' ? 'report' : 'task'
    document.querySelector(`.war-modal .war-cd-stage[data-stage='${stage}']`)?.scrollIntoView({ block: 'center' })
  }, [focusSegment])
  // 滚动高亮随 V9.10 导航钮一起退役：四段本身不长，滚动即读，无需段落指示。
  const GRADE_LABEL = activeCopy().grade
  const copy = activeCopy().commandDetail
  const fp = activeCopy().focusPage
  const detailCopy = activeCopy().detail
  const band = activeCopy().commandBand
  const life = lifecycleOf(cmd, chain)
  const closed = chain.filter(t => t.status === 'closed').length
  // 最新战报：链上任一环的最新一条汇报（各环取末条，再按时间取最新）。
  const lastReport = chain
    .flatMap(t => (t.reports.length > 0 ? [{ r: t.reports[t.reports.length - 1]!, t }] : []))
    .sort((a, b) => (a.r.ts < b.r.ts ? 1 : -1))[0]
  const verdictTask = chain.find(t => t.closedVerdict !== null)
  const execSessions = chain
    .flatMap(t => (t.attemptLog ?? []).map(a => ({ t, a })))
    .sort((x, y) => (x.a.startedAt < y.a.startedAt ? 1 : -1))
  // 执行段只认「正在进行」的尝试（outcome===null）；战报卡的宿主=最新战报所在
  // 环（无战报退到有收官判定的一环），取其末次尝试还原成主界面会话卡。
  const liveAttempts = execSessions.filter(({ a }) => a.outcome === null)
  const reportHost = lastReport?.t ?? verdictTask
  const reportEntry = reportHost !== undefined && (reportHost.attemptLog ?? []).length > 0
    ? { t: reportHost, a: reportHost.attemptLog[reportHost.attemptLog.length - 1]! }
    : null
  // 底部两颗会话跳钮的目标：任务会话=参谋计划会话（无则 hq 兜底）；执行会话=
  // 进行中的那次尝试，无进行中退到最近一次尝试。
  const staffTarget = cmd.staffSessionId ?? hqSessionId
  const execTarget = liveAttempts[0]?.a.sessionId ?? execSessions[0]?.a.sessionId ?? null
  const failedChain = chain.some(t => t.status === 'failed')
  const scheduled = cmd.schedule !== null && cmd.schedule.dispatchedAt === null
  // V9.10 任务段状态机（空链时的卡片/提示分岔，元首定案）——变体判定与主界面
  // 任务列成形卡同源（formingVariantOf），分岔口径永不分叉。
  const talking = cmd.status === 'talking'
  const ghostVariant = formingVariantOf(cmd, chain)
  const taskHint = chain.length > 0 || ghostVariant !== null ? null
    : cmd.status === 'cancelled' ? fp.taskCancelled
    : scheduled ? fp.taskScheduledHint(fmtSchedule(cmd.schedule !== null ? cmd.schedule.nextRunAt : null))
    : cmd.status === 'approved' ? fp.taskAwaitingPublish
    : fp.taskRelaying
  // 配置展开里的改档出口（旧 footer 折叠的语义新家）：已分诊且未批准未取消。
  const regradable = cmd.grade !== null && cmd.status !== 'approved' && cmd.status !== 'cancelled'
  // 决策带动作判定（与收件箱四类同源，plan 优先级最高）。
  const actionKind = cmd.plan?.status === 'pending'
    ? 'plan'
    : cmd.status === 'talking'
      ? 'clarify'
      : lastReport !== undefined && chain.some(t => t.status === 'reported')
        ? 'review'
        : failedChain
          ? 'retry'
          : null
  // 证据摘要行（收起态的一行结论）。
  const evSummary = (lastReport?.r.evidence !== undefined && lastReport?.r.evidence !== null)
    ? (() => {
        const ev = lastReport.r.evidence!
        const ok = ev.checks.filter(c => c.passed).length
        const t = ev.tests
        return `✓ ${ok}/${ev.checks.length} ${band.evChecks}${t !== undefined ? ` · ${band.evTests(t.passed, t.failed)}` : ''}${ev.diffstat !== undefined ? ` · ${ev.diffstat}` : ''}`
      })()
    : null
  const stages = activeCopy().lifecycle.stages
  const scrollToStage = (key: string): void => {
    bodyRef.current?.querySelector(`.war-cd-stage[data-stage='${key}']`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const Fold = (summary: string, children: ReactNode[]): ReactNode =>
    createElement('details', { className: 'war-fold' },
      createElement('summary', null, summary),
      ...children,
    )
  // V9.10 段头去编号（①②③④随导航钮退役）：静态「阶段名+结论」，不跳转。
  const stageHead = (key: 'command' | 'task' | 'battle' | 'report', conclusion: string): ReactNode =>
    createElement('div', { className: 'war-cd-stage-head' },
      createElement('span', { className: 'war-cd-stage-name' }, stages[key]),
      createElement('span', { className: 'war-cd-stage-conc' }, conclusion),
    )
  // 子详情行（配置/计划/战报共用的「标签: 值」行，值可长文换行）。
  const subRow = (label: string, value: ReactNode): ReactNode =>
    createElement('div', { className: 'war-sub-row' },
      createElement('span', { className: 'war-sub-label' }, label),
      createElement('div', { className: 'war-sub-value' }, value),
    )
  const subActions = (children: ReactNode[]): ReactNode =>
    createElement('div', { className: 'war-modal-actions' }, ...children)
  // 空链 ghost 卡的展开（V9.10 按命令状态分岔）：计划（待批=原文+顺手批驳+进
  // 任务会话）/ 等你答问（进入对话回答=markTalking+跳）/ 已接令（分诊结果+进
  // 任务会话）——任务成形的车间就是参谋会话，操作落在读到的位置。
  const ghostPanel = (key?: string): ReactNode => {
    if (ghostVariant === 'plan') {
      const pending = cmd.plan?.status === 'pending'
      return createElement('div', { key, className: 'war-subdetail' },
        createElement('div', { className: 'war-subdetail-title' }, `${fp.planTitle}（${copy.planTitle[(cmd.plan as { status: 'pending' | 'approved' | 'rejected' }).status]}）`),
        pending ? createElement('div', { className: 'war-sub-value' }, fp.planPending) : null,
        createElement('div', { className: 'war-sub-value war-plan-body' }, (cmd.plan as { text: string }).text),
        pending
          ? subActions([
            createElement('button', { key: 'ap', className: 'war-btn primary', onClick: () => { onDecidePlan('approve') } }, copy.approvePlan),
            createElement('button', { key: 'rj', className: 'war-btn', onClick: () => { onDecidePlan('reject') } }, copy.rejectPlan),
            staffTarget !== null
              ? createElement('button', { key: 'in', className: 'war-btn', onClick: () => { services.sessions?.open(staffTarget) } }, fp.planEnterSession)
              : null,
          ])
          : null,
      )
    }
    if (ghostVariant === 'talking') {
      return createElement('div', { key, className: 'war-subdetail' },
        createElement('div', { className: 'war-subdetail-title' }, fp.talkingGhostTitle),
        createElement('div', { className: 'war-sub-value' }, fp.talkingGhostNote),
        staffTarget !== null
          ? subActions([createElement('button', {
              className: 'war-btn primary war-btn-warn',
              onClick: () => { void markTalking(cmd.commandId); services.sessions?.open(staffTarget) },
            }, fp.talkingEnterBtn)])
          : null,
      )
    }
    return createElement('div', { key, className: 'war-subdetail' },
      createElement('div', { className: 'war-subdetail-title' }, fp.draftingGhostTitle),
      subRow(fp.triageLabel, cmd.grade !== null
        ? `${GRADE_LABEL[cmd.grade]}${GRADE_MARKER[cmd.grade]}${cmd.gradeConfidence !== null ? ` · 置信 ${Math.round(cmd.gradeConfidence * 100)}%` : ''}`
        : fp.triagePending),
      cmd.gradeReason !== null ? subRow(copy.gradeReasonPrefix, cmd.gradeReason) : null,
      staffTarget !== null
        ? subActions([createElement('button', { className: 'war-btn primary', onClick: () => { services.sessions?.open(staffTarget) } }, fp.planEnterSession)])
        : null,
    )
  }
  // 链上任务卡的展开（V9.10 补全）：命令级最终计划（若有）+ 该环任务书 + 验收
  // 标准；reported/failed 环给「去处理」直达参谋会话（与主界面任务卡同动作）。
  const taskPanel = (t: BoardTask, key?: string): ReactNode => createElement('div', { key, className: 'war-subdetail' },
    cmd.plan !== null
      ? createElement('div', { className: 'war-subdetail-title' }, `${fp.planTitle}（${copy.planTitle[cmd.plan.status]}）`)
      : null,
    cmd.plan !== null
      ? createElement('div', { className: 'war-sub-value war-plan-body' }, cmd.plan.text)
      : null,
    subRow(fp.taskBrief, t.brief !== '' ? t.brief : fp.briefMissing),
    subRow(fp.taskAcceptance, t.acceptance !== '' ? t.acceptance : fp.acceptanceMissing),
    (t.status === 'reported' || t.status === 'failed') && staffTarget !== null
      ? subActions([createElement('button', { className: 'war-btn primary', onClick: () => { services.sessions?.open(staffTarget) } }, activeCopy().taskCard.handle)])
      : null,
  )
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal wide war-cd-modal', onClick: e => e.stopPropagation(), ref: layer.ref, ...layer.props },
      // V9.9：footer 收编为两颗会话跳钮，窗口关闭走右上 ✕（+Esc+点背板）。
      createElement('button', { className: 'war-cd-x', type: 'button', 'aria-label': copy.close, title: copy.close, onClick: onClose }, '✕'),
      createElement('div', { className: 'war-modal-title war-cd-title', title: cmd.text }, `「${cmd.text.slice(0, 42)}${cmd.text.length > 42 ? '…' : ''}」`),
      createElement('div', { className: 'war-modal-sub' }, `${relTime(cmd.createdAt)} · ${cmd.commandId} · ${commandStatus(cmd.status).label}${cmd.grade !== null ? ` · ${GRADE_LABEL[cmd.grade]}${cmd.regrades > 0 ? copy.regradesNote(cmd.regrades) : ''}` : ''}`),
      cmd.cancelledReason !== null ? createElement('div', { className: 'war-fail' }, copy.cancelledReason(cmd.cancelledReason)) : null,
      // 决策带（置顶常驻）：有事给动作，无事给安神行。
      createElement('div', { className: `war-cd-band${actionKind === null ? ' quiet' : ''}`, role: actionKind === null ? undefined : 'region', 'aria-label': actionKind === null ? undefined : band.title },
        actionKind === 'plan'
          ? createElement('div', { className: 'war-cd-band-in' },
            createElement('span', { className: 'war-cd-band-tag' }, `⚠ ${band.title}`),
            createElement('span', { className: 'war-cd-band-hint' }, band.planHint),
            createElement('span', { className: 'war-cd-band-actions' },
              createElement('button', { className: 'war-btn primary', onClick: () => onDecidePlan('approve') }, copy.approvePlan),
              createElement('button', { className: 'war-btn', onClick: () => onDecidePlan('reject') }, copy.rejectPlan),
            ),
          )
          : actionKind === 'clarify'
            ? createElement('div', { className: 'war-cd-band-in' },
              createElement('span', { className: 'war-cd-band-tag' }, `⚠ ${band.title}`),
              createElement('span', { className: 'war-cd-band-hint' }, band.clarifyHint),
              createElement('span', { className: 'war-cd-band-actions' },
                createElement('button', { className: 'war-btn primary', onClick: () => { if (cmd.staffSessionId !== null) { void markTalking(cmd.commandId); services.sessions?.open(cmd.staffSessionId) } } }, band.clarifyBtn),
              ),
            )
            : actionKind === 'review'
              ? createElement('div', { className: 'war-cd-band-in' },
                createElement('span', { className: 'war-cd-band-tag' }, `⚠ ${band.title}`),
                createElement('span', { className: 'war-cd-band-hint' }, band.reviewHint),
                createElement('span', { className: 'war-cd-band-actions' },
                  createElement('button', { className: 'war-btn primary', onClick: () => { scrollToStage('report') } }, band.reviewBtn),
                ),
              )
              : actionKind === 'retry'
                ? createElement('div', { className: 'war-cd-band-in' },
                  createElement('span', { className: 'war-cd-band-tag' }, `⚠ ${band.title}`),
                  createElement('span', { className: 'war-cd-band-hint' }, band.retryHint),
                  createElement('span', { className: 'war-cd-band-actions' },
                    createElement('button', { className: 'war-btn primary', onClick: () => { scrollToStage('report') } }, band.retryBtn),
                  ),
                )
                : scheduled
                  ? createElement('div', { className: 'war-cd-band-in' },
                    createElement('span', { className: 'war-cd-band-tag' }, '⏰'),
                    createElement('span', { className: 'war-cd-band-hint' }, band.scheduledHint(fmtSchedule(cmd.schedule.nextRunAt))),
                  )
                  : createElement('div', { className: 'war-cd-band-in' },
                    createElement('span', { className: 'war-cd-band-tag' }, '✓'),
                    createElement('span', { className: 'war-cd-band-hint' }, band.quiet),
                  ),
      ),
      createElement('div', { className: 'war-detail-body war-cd-body', ref: bodyRef },
        // ① 命令 · 你说了什么：主界面命令卡原样拉进来，点卡展开「下达配置」
        // （V9.10 配置即改档之家——看当时怎么配的，顺手改档）。
        createElement('section', { className: 'war-cd-stage', 'data-stage': 'command' },
          stageHead('command', cmd.grade !== null ? `${GRADE_LABEL[cmd.grade]}${cmd.gradeConfidence !== null ? ` · 置信 ${Math.round(cmd.gradeConfidence * 100)}%` : ''}` : band.noGrade),
          CommandCard(cmd, hqSessionId, services, () => { setOpen(o => o !== null && o.kind === 'config' ? null : { kind: 'config' }) }, chain, NO_TRACE, onRegrade, true),
          open !== null && open.kind === 'config'
            ? createElement('div', { className: 'war-subdetail' },
              createElement('div', { className: 'war-subdetail-title' }, fp.configTitle),
              subRow(fp.configTiming,
                cmd.schedule !== null
                  ? cmd.schedule.dispatchedAt !== null
                    ? fp.configTimingFired(cmd.schedule.cron, fmtSchedule(cmd.schedule.dispatchedAt))
                    : fp.configTimingNext(cmd.schedule.cron, fmtSchedule(cmd.schedule.nextRunAt))
                  : fp.configTimingNow(relTime(cmd.createdAt))),
              subRow(fp.configAutonomy, cmd.grade !== null
                ? `${GRADE_LABEL[cmd.grade]}${GRADE_MARKER[cmd.grade]}${cmd.regrades > 0 ? copy.regradesNote(cmd.regrades) : ''}`
                : fp.configAutonomyAuto),
              cmd.gradeReason !== null ? subRow(copy.gradeReasonPrefix, cmd.gradeReason) : null,
              subRow(fp.configText, cmd.text),
              regradable
                ? subRow(fp.configRegrade, createElement('span', { className: 'war-sub-btns' },
                  (['L0', 'L1', 'L2'] as const).filter(g => g !== cmd.grade).map(g =>
                    createElement('button', { key: g, className: 'war-btn', onClick: () => { onRegrade(g) } }, copy.regradeTo(GRADE_LABEL[g])))))
                : null,
            )
            : null,
        ),
        // ② 任务 · 变成了什么：链上全部任务卡按序拉进来，点任一张卡下展开
        // 「最终计划+该环任务书+验收标准」（reported/failed 环带去处理）；空链
        // 按状态机给 ghost 卡（计划/等你答问/起草中——任务成形的车间入口）或
        // 分岔后的灰提示（定时待发/转达中/已批准待发布/已取消）。
        createElement('section', { className: 'war-cd-stage', 'data-stage': 'task' },
          stageHead('task', chain.length > 1 ? copy.chainDone(closed, chain.length) : life.status),
          createElement('div', { className: 'war-tour-cards' },
            ...chain.map(t => [
              TaskCard(t, statuses,
                () => { setOpen(o => o !== null && o.kind === 'plan' && o.taskId === t.taskId ? null : { kind: 'plan', taskId: t.taskId }) },
                null, null, () => {}, NO_TRACE),
              open !== null && open.kind === 'plan' && open.taskId === t.taskId ? taskPanel(t, `panel-${t.taskId}`) : null,
            ]),
            ghostVariant !== null
              ? [(() => {
                  const toggleGhost = (): void => { setOpen(o => o !== null && o.kind === 'plan' ? null : { kind: 'plan', taskId: '' }) }
                  return createElement('div', {
                    key: 'ghost', className: `war-tour-ghost clickable${ghostVariant === 'talking' ? ' warn' : ''}`, role: 'button', tabIndex: 0,
                    'aria-label': ghostVariant === 'talking' ? fp.talkingGhostTitle : ghostVariant === 'drafting' ? fp.draftingGhostTitle : fp.planTitle,
                    onClick: toggleGhost,
                    onKeyDown: keyActivate(toggleGhost),
                  },
                  createElement('span', { className: 'war-tour-ghost-icon' }, ghostVariant === 'talking' ? '⚠' : '◷'),
                  createElement('span', null,
                    ghostVariant === 'plan'
                      ? ((cmd.plan as { status: 'pending' | 'approved' | 'rejected' }).status === 'pending' ? fp.taskGhostPlanning : fp.taskGhostApproved)
                      : ghostVariant === 'talking' ? fp.talkingGhostCard : fp.draftingGhostCard))
                })(),
                open !== null && open.kind === 'plan' && open.taskId === '' ? ghostPanel('panel-ghost') : null]
              : null,
            taskHint !== null ? createElement('div', { key: 'hint', className: 'war-tour-hint' }, taskHint) : null,
          ),
        ),
        // ③ 执行 · 谁在干：只有正在进行的会话才有卡（点卡直跳原生会话窗口）；
        // 执行完了就没有可点卡片，只给提示行（段头不重复同一句话）。
        createElement('section', { className: 'war-cd-stage', 'data-stage': 'battle' },
          stageHead('battle', liveAttempts.length > 0 ? fp.battleLive(liveAttempts.length) : ''),
          liveAttempts.length > 0
            ? createElement('div', { className: 'war-tour-cards' },
              ...liveAttempts.map(({ t, a }) => SessionCard(t, a, (_t, a2) => { services.sessions?.open(a2.sessionId) }, NO_TRACE)))
            : createElement('div', { className: 'war-tour-hint' }, execSessions.length > 0 ? fp.battleDone : fp.battleNone),
        ),
        // ④ 战报 · 结果如何：战报卡（最新战报宿主环的末次会话卡）点开看收官
        // 结论原文 + 最新战报 + 证据折叠；无战报只给提示行（段头不重复）。
        createElement('section', { className: 'war-cd-stage war-cd-report', 'data-stage': 'report' },
          reportEntry !== null
            ? stageHead('report', verdictTask !== undefined && verdictTask.closedVerdict !== null
              ? `${verdictTask.closedVerdict.slice(0, 24)}${verdictTask.closedVerdict.length > 24 ? '…' : ''}`
              : lastReport !== undefined ? relTime(lastReport.r.ts) : '')
            : stageHead('report', ''),
          reportEntry !== null
            ? createElement('div', { className: 'war-tour-cards' },
              SessionCard(reportEntry.t, reportEntry.a, () => { setOpen(o => o !== null && o.kind === 'report' ? null : { kind: 'report' }) }, NO_TRACE),
              open !== null && open.kind === 'report'
                ? createElement('div', { className: 'war-subdetail' },
                  verdictTask !== undefined && verdictTask.closedVerdict !== null ? subRow(fp.reportVerdict, verdictTask.closedVerdict) : null,
                  lastReport !== undefined ? subRow(fp.reportLatest, `${detailCopy.reportPrefix(relTime(lastReport.r.ts))}${lastReport.r.text}`) : null,
                  evSummary !== null && lastReport?.r.evidence !== null && lastReport?.r.evidence !== undefined ? Fold(evSummary, [EvidenceBlock(lastReport.r.evidence!)]) : null,
                  // V9.10 收菜三件：战利品/交付物 + 历次作战会话（逐次可跳）+ 待发落时的去处理。
                  reportHost !== undefined && reportHost.deliverables.length > 0
                    ? subRow(fp.lootLabel, createElement('span', { className: 'war-loot' },
                      reportHost.deliverables.map((d, i) => createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary))))
                    : null,
                  execSessions.length > 0
                    ? subRow(fp.attemptsSection, createElement('span', { className: 'war-sub-attempts' },
                      execSessions.map(({ t, a }) => createElement('button', {
                        key: a.id, className: 'war-cd-session', type: 'button', title: a.sessionId,
                        onClick: () => { services.sessions?.open(a.sessionId) },
                      },
                      createElement('span', { className: `war-chip ${(a.outcome ?? 'live') === 'live' ? 'st-in_progress' : a.outcome === 'failed' ? 'oc-fail' : a.outcome === 'reported' ? 'oc-reported' : 'oc-done'}` }, outcomeLabel(a.outcome ?? 'live').label),
                      createElement('span', { className: 'war-taskid' }, `⌁ ${a.sessionId.slice(0, 10)}… · ${t.taskId}`),
                      createElement('span', { className: 'war-time' }, relTime(a.startedAt)),
                      ))))
                    : null,
                  (lastReport !== undefined && chain.some(t => t.status === 'reported') || failedChain) && staffTarget !== null
                    ? subActions([createElement('button', { className: 'war-btn primary', onClick: () => { services.sessions?.open(staffTarget) } }, activeCopy().taskCard.handle)])
                    : null,
                )
                : null)
            : createElement('div', { className: 'war-tour-hint' }, fp.reportNone),
        ),
      ),
      // 底部两颗会话跳钮（V9.9 元首定案，代替旧 footer 全部按钮）：直跳原生会话
      // 窗口；未形成给同名禁用占位（title 说明何时会出现）。
      createElement('div', { className: 'war-tour-jumps' },
        createElement('button', {
          className: 'war-btn war-jump-btn', type: 'button',
          disabled: staffTarget === null,
          title: staffTarget !== null ? staffTarget : fp.taskSessionHint,
          onClick: () => { if (staffTarget !== null) services.sessions?.open(staffTarget) },
        }, `⌁ ${fp.taskSessionBtn}`),
        createElement('button', {
          className: 'war-btn war-jump-btn', type: 'button',
          disabled: execTarget === null,
          title: execTarget !== null ? execTarget : fp.execSessionHint,
          onClick: () => { if (execTarget !== null) services.sessions?.open(execTarget) },
        }, `⌁ ${fp.execSessionBtn}`),
      ),
    ),
  )
}

// --- 任务区 ------------------------------------------------------------------

// --- 成形卡（V9.11 任务列=参谋侧台账：任务书挂出前的占位形态，变体同聚焦页 ghost）---

function FormingCard(cmd: BoardCommand, variant: 'plan' | 'talking' | 'drafting', onOpen: () => void, trace: CardTrace): ReactNode {
  const lc = activeCopy().lifecycle
  const fp = activeCopy().focusPage
  const planPending = cmd.plan?.status === 'pending'
  const chip = variant === 'talking' ? lc.waitingClarify
    : variant === 'plan' ? (planPending ? lc.planPending : lc.approvedAwaitingPublish)
    : lc.formingDrafting
  const note = variant === 'talking' ? fp.talkingGhostCard
    : variant === 'plan' ? (planPending ? fp.taskGhostPlanning : fp.taskGhostApproved)
    : fp.draftingGhostCard
  return createElement('div', {
    key: `forming-${cmd.commandId}`,
    className: `war-card war-forming clickable${variant === 'talking' ? ' warn' : ''}${relClass(trace)}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${chip}：${cmd.text}`,
    onClick: onOpen,
    onKeyDown: keyActivate(onOpen),
    ...traceMouse(trace),
  },
    createElement('div', { className: 'war-card-top' },
      createElement('span', { className: 'war-forming-icon', 'aria-hidden': 'true' }, variant === 'talking' ? '⚠' : '◷'),
      createElement('span', { className: `war-chip ${variant === 'talking' ? 'st-talking' : 'st-received'}` }, chip),
      createElement('span', { className: 'war-title' }, cmd.text),
    ),
    createElement('div', { className: 'war-card-top' },
      createElement('span', { className: 'war-taskid' }, cmd.commandId),
      relTime(cmd.createdAt) !== '' ? createElement('span', { className: 'war-time' }, relTime(cmd.createdAt)) : null,
    ),
    createElement('div', { className: 'war-waithint' }, note),
  )
}

function TaskCard(task: BoardTask, statuses: Map<string, BoardTask['status']>, onOpen: (taskId: string) => void, onHandle: (() => void) | null, lineageCmd: BoardCommand | null, onOpenCommand: (commandId: string) => void, trace: CardTrace): ReactNode {
  // V9.11 台账终局态：closed/failed 任务书卡常驻任务列但调暗；reported 是待验收
  // 动作态（收件箱有「去处理」），保持全亮不许被埋。
  const settled = task.status === 'closed' || task.status === 'failed'
  return createElement('div', {
    key: task.taskId,
    className: `war-card clickable${settled ? ' settled' : ''}${relClass(trace)}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${activeCopy().taskStatus[task.status]}：${task.title}`,
    onClick: () => onOpen(task.taskId),
    onKeyDown: keyActivate(() => onOpen(task.taskId)),
    ...traceMouse(trace),
  },
    createElement('div', { className: 'war-card-top' },
      statusMark(task),
      createElement('span', { className: `war-chip st-${task.status}` }, activeCopy().taskStatus[task.status]),
      lineageCmd !== null
        ? createElement('span', {
            className: 'war-chip war-lineage',
            role: 'button',
            tabIndex: 0,
            title: `${activeCopy().detail.lineageLabel} ${lineageCmd.commandId}——点击追踪全生命周期`,
            onClick: e => { e.stopPropagation(); onOpenCommand(lineageCmd.commandId) },
            onKeyDown: keyActivate(() => onOpenCommand(lineageCmd.commandId)),
          }, `↩ ${lineageCmd.commandId}`)
        : null,
      createElement('span', { className: 'war-title' }, task.title),
    ),
    createElement('div', { className: 'war-card-top' },
      createElement('span', { className: 'war-taskid' }, task.taskId),
      task.attempts > 1 ? createElement('span', { className: 'war-chip', title: activeCopy().taskCard.attemptNTitle }, activeCopy().taskCard.attemptN(task.attempts)) : null,
      relTime(task.startedAt) !== '' ? createElement('span', { className: 'war-time' }, relTime(task.startedAt)) : null,
    ),
    // V8 卡片保守瘦身：品质/高优先/依赖锁/cron/工作区/任务书/战利品挪进详情浮层；
    // 卡上只留 标记+状态+溯源+标题 与解释行（等待/败因）——一眼可扫。
    waitKindOf(task, statuses) === 'queued'
      ? createElement('div', { className: 'war-waithint' }, activeCopy().waitHint.queued(task.queueAhead ?? 0))
      : null,
    waitKindOf(task, statuses) === 'awaitingClaim'
      ? createElement('div', { className: 'war-waithint' }, activeCopy().waitHint.awaitingClaim)
      : null,
    waitKindOf(task, statuses) === 'quotaPaused'
      ? createElement('div', { className: 'war-waithint' }, activeCopy().waitHint.quotaPaused)
      : null,
    task.status === 'failed' && task.lastError !== null ? createElement('div', { className: 'war-fail', title: activeCopy().taskCard.failTitle }, activeCopy().taskCard.failReason(task.lastError)) : null,
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

// --- 会话卡（战场：进行中/已完成/已失败，详情优先）---------------------------

function SessionCard(task: BoardTask, attempt: BoardAttempt, onDetail: (task: BoardTask, attempt: BoardAttempt) => void, trace: CardTrace): ReactNode {
  const key = `${attempt.sessionId}:${attempt.startedAt}`
  const outcomeKey = attempt.outcome ?? 'live'
  const meta = outcomeLabel(outcomeKey)
  return createElement('div', {
    key,
    className: `war-card war-session-card clickable${relClass(trace)}`,
    title: activeCopy().session.cardTitle(attempt.sessionId),
    role: 'button',
    tabIndex: 0,
    'aria-label': `${meta.label}：${task.title}`,
    onClick: () => { onDetail(task, attempt) },
    onKeyDown: keyActivate(() => { onDetail(task, attempt) }),
    ...traceMouse(trace),
  },
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    attempt.n > 1 ? createElement('span', { className: 'war-chip', title: activeCopy().session.attemptNTitle }, activeCopy().session.attemptN(attempt.n)) : null,
    createElement('span', { className: 'war-time' }, relTime(attempt.startedAt)),
  ),
  createElement('div', { className: 'war-title' }, task.title),
  // V8 卡片保守瘦身：品质/工作区/战利品摘要挪进会话详情；卡上留状态+尝试+时间。
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: 'war-taskid', title: attempt.sessionId }, `⌁ ${attempt.sessionId.slice(0, 10)}…`),
  ),
  // V9.11 R2 实时活动行：live attempt 上宿主动词单点计算的 label（思考中/探索中/
  // 编辑中…双皮肤同词）——原生会话窗口的过程语汇简略版，点卡仍直跳原生全文。
  outcomeKey === 'live' && attempt.activity != null && attempt.activity.label !== ''
    ? createElement('div', { className: 'war-activity', title: `${attempt.activity.label} · ${attempt.activity.ts}` },
        createElement('span', { className: 'war-activity-dot', 'aria-hidden': 'true' }),
        createElement('span', { className: 'war-activity-label' }, attempt.activity.label),
      )
    : null,
  outcomeKey === 'failed'
    ? task.lastError !== null && isLatestFailedAttempt(task, attempt)
      ? createElement('div', { className: 'war-fail' }, activeCopy().session.failReason(task.lastError))
      : createElement('div', { className: 'war-fail' }, activeCopy().session.attemptFailedNeutral)
    : null,
  outcomeKey === 'reported' ? createElement('div', { className: 'war-waiting' }, activeCopy().session.waitingReport) : null,
  )
}

// --- 挂载 thread（v3：外部会话上战场）-----------------------------------------

/** An externally-attached session: 「外部」badge, jump + detach only. */
function ExternalThreadCard(thread: BoardThread, services: ClientServicesFace, onDetach: (sessionId: string) => void, trace: CardTrace): ReactNode {
  return createElement('div', {
    key: `ext-${thread.sessionId}`,
    className: `war-card war-external-card clickable${relClass(trace)}`,
    title: activeCopy().attach.cardTitle(thread.sessionId),
    role: 'button',
    tabIndex: 0,
    'aria-label': activeCopy().attach.cardTitle(thread.sessionId),
    onClick: () => { services.sessions?.open(thread.sessionId) },
    onKeyDown: keyActivate(() => { services.sessions?.open(thread.sessionId) }),
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

// --- 区块与主视图 --------------------------------------------------------------

/** A board column. `key` is the stable style/state hook — 皮肤改标题不破坏类名。 */
function Zone(key: string, title: string, count: number, empty: string, children: ReactNode[], extra?: ReactNode): ReactNode {
  return createElement('div', { key, className: `war-col zone-${key}` },
    createElement('div', { className: 'war-col-head' },
      // V9.6：列标题升格 h2——屏幕阅读器有结构可导航（板原先零标题）。
      createElement('h2', { className: 'war-col-title' }, title),
      createElement('span', { className: 'war-col-count' }, String(count)),
      extra,
    ),
    createElement('div', { className: 'war-col-body' },
      count === 0 ? createElement('div', { className: 'war-empty' }, empty) : children,
    ),
  )
}

/** V7-① 等你发落收件箱：四类需要元首的动作（答澄清/批计划/翻战报/决重试）
 * 聚合成一条队列，带等待时长与 aging 警示；点击直达动作发生地（进会话/开
 * 决策卡/开任务详情）——板子只导航，不长任务写操作（红线）。 */
function InboxStrip(items: InboxItem[], onAct: (item: InboxItem) => void): ReactNode {
  const copy = activeCopy().inbox
  const kindLabel: Record<InboxKind, string> = { clarify: copy.clarify, plan: copy.plan, review: copy.review, retry: copy.retry }
  const leader = agingLeader(items)
  return createElement('div', { className: 'war-inbox' },
    createElement('div', { className: 'war-inbox-head' },
      createElement('span', { className: 'war-inbox-title' }, copy.title),
      createElement('span', { className: 'war-inbox-count' }, String(items.length)),
    ),
    items.length === 0
      ? createElement('div', { className: 'war-inbox-empty' }, copy.empty)
      : createElement('div', { className: 'war-inbox-items' },
        items.map(it => {
          const key = `${it.kind}:${it.refId}`
          return createElement('div', {
            key,
            className: `war-inbox-item clickable${it.tone !== '' ? ` tone-${it.tone}` : ''}${leader === key ? ' leader' : ''}`,
            role: 'button',
            tabIndex: 0,
            title: it.tone === 'err' ? copy.errTitle : it.tone === 'warn' ? copy.warnTitle : undefined,
            onClick: () => { onAct(it) },
            onKeyDown: keyActivate(() => { onAct(it) }),
          },
          createElement('span', { className: `war-chip k-${it.kind}` }, kindLabel[it.kind]),
          leader === key ? createElement('span', { className: 'war-inbox-oldest' }, copy.oldest) : null,
          createElement('span', { className: 'war-inbox-text' }, it.title),
          createElement('span', { className: 'war-inbox-wait' }, copy.waited(formatWait(it.waitMs))),
          )
        }),
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
  const seg = (cls: string, selector: string, node: string): ReactNode =>
    createElement('span', {
      className: `war-visit-seg clickable${cls}`,
      role: 'button',
      tabIndex: 0,
      onClick: () => { jump(selector) },
      onKeyDown: keyActivate(() => { jump(selector) }),
    }, node)
  const since = lastSeen > 0 ? copy.since(relTime(new Date(lastSeen).toISOString(), now)) : copy.firstSeen
  return createElement('div', { className: 'war-visit' },
    createElement('span', { className: 'war-visit-since' }, since),
    delta.closed > 0 ? seg(' s-closed', '.war-zone.war-report', copy.closed(delta.closed)) : null,
    delta.failed > 0 ? seg(' s-failed', '.war-zone.war-report', copy.failed(delta.failed)) : null,
    delta.commands > 0 ? seg('', '.war-dispatch', copy.commands(delta.commands)) : null,
    delta.pending > 0 ? seg(' s-pending', '.war-inbox', copy.pending(delta.pending)) : null,
  )
}

/** V9.2 hero 灵动岛：标题栏的替代——大盘计数、收件箱、到访摘要收进顶部一颗
 * 胶囊；hover 展开（浮层盖列区，列纹丝不动）、点击钉住常驻。操作件只剩 ⚙
 * 设置（下达 ✚ 在调度条左端常驻，挂载入口退役）；聚焦不再撑开岛——只在
 * 胶囊中间显示「聚焦中」chip（点击即退出），看板本体始终可见（审查 P1-3
 * 修复：hover 面板不得在到访第一屏挡住列区/吸附点击）。操作钮冒泡阻断。 */
function WarIsland(props: {
  active: boolean
  counts: { pending: number; waiting: number; active: number; failed: number }
  inbox: InboxItem[]
  visit: VisitDelta
  lastSeen: number
  now: number
  focusText: string | null
  onExitFocus: () => void
  onSettings: () => void
  onInboxAct: (it: InboxItem) => void
}): ReactNode {
  const { active, counts, inbox, visit, lastSeen, now, focusText, onExitFocus, onSettings, onInboxAct } = props
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const copy = activeCopy().island
  // V9.2：聚焦不再是展开条件——聚焦时看板必须可见（只是变暗非族系）。
  // V9.5：hover 加 150ms 意图延迟；V9.6：离岛必须清定时器——否则快速划过
  // 后面板在指针离开后才弹开并卡在打开态（复评实锤竞态）。
  const hoverTimer = useRef<number | null>(null)
  useEffect(() => () => { if (hoverTimer.current !== null) clearTimeout(hoverTimer.current) }, [])
  const open = hover || pinned
  return createElement('div', {
    className: `war-island${open ? ' open' : ''}${pinned ? ' pinned' : ''}`,
    onMouseEnter: () => { hoverTimer.current = setTimeout(() => { setHover(true) }, 150) },
    onMouseLeave: () => {
      if (hoverTimer.current !== null) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
      setHover(false)
    },
  },
  createElement('div', {
    className: `war-island-pill${inbox.length > 0 ? ' has-inbox' : ''}`,
    role: 'button',
    tabIndex: 0,
    'aria-expanded': open,
    'aria-label': `${activeCopy().head.title}——${copy.expandTitle}`,
    title: pinned ? copy.unpin : copy.pin,
    onClick: () => { setPinned(!pinned) },
    onKeyDown: keyActivate(() => { setPinned(!pinned) }),
  },
    createElement('span', { className: `war-head-dot${active ? ' on' : ''}` }),
    createElement('span', { className: 'war-island-title' }, activeCopy().head.title),
    createElement('span', { className: 'war-island-counts' }, copy.counts(counts)),
    inbox.length > 0
      ? createElement('span', {
          className: `war-island-badge${inbox.some(i => i.tone === 'err') ? ' hot' : ''}`,
          title: activeCopy().inbox.title,
        }, copy.inboxBadge(inbox.length))
      : null,
    visit.any
      ? createElement('span', {
          className: 'war-island-visitmini',
          title: lastSeen > 0 ? activeCopy().visit.since(relTime(new Date(lastSeen).toISOString(), now)) : activeCopy().visit.firstSeen,
        }, copy.visitMini(visit.closed, visit.failed, visit.commands))
      : null,
    focusText !== null
      ? createElement('button', {
          className: 'war-island-focus',
          type: 'button',
          title: `${activeCopy().trace.focusing}${focusText}——${activeCopy().trace.exitFocus}`,
          onClick: e => { e.stopPropagation(); onExitFocus() },
        }, `◎ ${focusText.slice(0, 18)}${focusText.length > 18 ? '…' : ''}`)
      : null,
    createElement('span', { className: 'war-island-spacer' }),
    pinned ? createElement('span', { className: 'war-island-pinned', title: copy.unpin }, '📌') : null,
    createElement('button', {
      className: 'war-btn war-island-gear',
      type: 'button',
      title: activeCopy().settings.title,
      'aria-label': activeCopy().settings.title,
      'aria-haspopup': 'dialog',
      onClick: e => { e.stopPropagation(); onSettings() },
    }, '⚙'),
  ),
  open
    ? createElement('div', { className: 'war-island-panel' },
      VisitBanner(visit, lastSeen, now),
      InboxStrip(inbox, onInboxAct),
    )
    : null,
  )
}

/** V7-⑥ 空板首用引导：无命令无任务时的第一屏——一句话定位 + 三步示意 +
 * 直达起草器；有数据即隐退（三区板接管）。 */
function OnboardPanel(onCompose: () => void): ReactNode {
  const copy = activeCopy().onboard
  return createElement('div', { className: 'war-onboard' },
    createElement('div', { className: 'war-onboard-title' }, copy.title),
    createElement('div', { className: 'war-onboard-lead' }, copy.lead),
    createElement('div', { className: 'war-onboard-steps' },
      copy.steps.map((s, i) => createElement('div', { key: i }, s)),
    ),
    createElement('button', { className: 'war-btn primary war-onboard-cta', onClick: onCompose }, copy.cta),
  )
}

/** V9.4 底部命令调度坞（容器化，元首定案）：整坞一个大容器（与三区同语言
 * 的圆角容器、物种差保留——主色淡染凹槽）；左端 ＝ ＋ 下达瓦片（容器的
 * 一部分，幽灵虚线态）；命令卡全部进 .war-dispatch-track 轨道横滚（滚轮
 * 横移；右缘渐隐只在还能向右滚时出现——动态 can-scroll）。铭牌「命令调度」
 * 退役（元首：不需要文字）。wheel 必须 passive:false 原生监听（React 合成
 * wheel 是 passive 的）。 */
function DispatchStrip(props: { onCompose: () => void; children: ReactNode[] }): ReactNode {
  const { onCompose, children } = props
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const onWheel = (e: WheelEvent): void => {
      // 横向手势（触控板 deltaX）交给原生；只接管纯垂直滚轮。
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      // 两端到头就放行——不把整页滚动困死在轨道里。
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    const onScroll = (): void => {
      const max = el.scrollWidth - el.clientWidth
      el.classList.toggle('can-scroll', el.scrollLeft < max - 2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', onScroll, { passive: true })
    // V9.7：ResizeObserver 观察轨道盒——SSE 水合/布局变化/窗口缩放任何一条
    // 路径都能重算 can-scroll（此前 window resize + 卡数 deps 仍漏布局变化，
    // 首帧渐隐缺席，终评 P0）。
    const ro = new ResizeObserver(() => { onScroll() })
    ro.observe(el)
    onScroll()
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [children.length])
  return createElement('div', { className: 'war-dispatch', role: 'region', 'aria-label': activeCopy().dispatch.label },
    createElement('button', {
      className: 'war-dispatch-add',
      type: 'button',
      title: activeCopy().dispatch.addTitle,
      'aria-label': activeCopy().dispatch.addTitle,
      onClick: onCompose,
    }, '＋'),
    createElement('div', { className: 'war-dispatch-track', ref }, ...children),
  )
}


/** V9.2 设置抽屉（岛 ⚙）：皮肤 / 图例 / 看板行为开关 / 连接状态。右侧滑入，
 * 不遮岛不推列；开关落 localStorage——纯展示层偏好，不碰账本（读投影红线）。 */
function SettingsDrawer(props: {
  onClose: () => void
  hoverFamily: boolean
  onToggleHoverFamily: (v: boolean) => void
  autoScroll: boolean
  onToggleAutoScroll: (v: boolean) => void
  connected: boolean
  onRefresh: () => void
}): ReactNode {
  const { onClose, hoverFamily, onToggleHoverFamily, autoScroll, onToggleAutoScroll, connected, onRefresh } = props
  const copy = activeCopy().settings
  const [skin, setSkinState] = useState(skinId())
  const layer = useModalLayer(onClose, copy.title)
  const skinBtn = (id: 'war' | 'plain', label: string): ReactNode =>
    createElement('button', {
      key: id, type: 'button',
      className: `war-skin-opt${skin === id ? ' on' : ''}`,
      'aria-pressed': skin === id,
      onClick: () => { setSkin(id); setSkinState(id) },
    }, label)
  const toggle = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void): ReactNode =>
    createElement('div', { className: 'war-set-toggle' },
      createElement('div', { className: 'war-set-toggle-text' },
        createElement('span', { className: 'war-set-toggle-label' }, label),
        createElement('span', { className: 'war-set-toggle-hint' }, hint)),
      createElement('button', {
        type: 'button',
        className: `war-switch${value ? ' on' : ''}`,
        role: 'switch',
        'aria-checked': value,
        'aria-label': label,
        onClick: () => { onChange(!value) },
      }, createElement('span', { className: 'war-switch-knob' })),
    )
  return createElement('div', { className: 'war-settings-backdrop', onClick: onClose },
    createElement('div', { className: 'war-settings-drawer', onClick: e => e.stopPropagation(), ref: layer.ref, ...layer.props },
      createElement('div', { className: 'war-settings-head' },
        createElement('span', { className: 'war-settings-title' }, copy.title),
        createElement('button', { className: 'war-btn', onClick: onClose }, copy.close)),
      createElement('div', { className: 'war-settings-body' },
        createElement('div', { className: 'war-settings-section' }, copy.skinSection),
        createElement('div', { className: 'war-skin-row' },
          skinBtn('war', copy.skinWar),
          skinBtn('plain', copy.skinPlain)),
        createElement('div', { className: 'war-settings-note' }, copy.skinHint),
        createElement('div', { className: 'war-settings-section' }, copy.legendSection),
        createElement('div', { className: 'war-legend-rows' },
          activeCopy().legend.rows.flatMap(([sym, text]) => [
            createElement('span', { key: `${sym}-sym`, className: 'war-legend-sym' }, sym),
            createElement('span', { key: `${sym}-text`, className: 'war-legend-text' }, text),
          ])),
        createElement('div', { className: 'war-settings-section' }, copy.behaviorSection),
        toggle(copy.hoverFamily, copy.hoverFamilyHint, hoverFamily, onToggleHoverFamily),
        toggle(copy.autoScroll, copy.autoScrollHint, autoScroll, onToggleAutoScroll),
        createElement('div', { className: 'war-settings-section' }, copy.connSection),
        createElement('div', { className: 'war-set-conn' },
          createElement('span', { className: `war-set-conn-dot${connected ? '' : ' down'}` }),
          createElement('span', { className: 'war-set-conn-text' }, connected ? copy.connOk : copy.connDown),
          createElement('button', { className: 'war-btn', onClick: onRefresh }, copy.refresh)),
      ),
    ),
  )
}

/** Build the war map tab component bound to the framework services. */
export function warView(services: ClientServicesFace): () => ReactNode {
  return function WarView(): ReactNode {
    const { data, error, refresh } = useWar()
    // All hooks before any conditional rendering (React #310 discipline).
    const [composerOpen, setComposerOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [detailCommandId, setDetailCommandId] = useState<string | null>(null)
    // V9 分段直达：打开聚焦页时滚到需要发落的环节（计划/任务链/战报）。
    const [detailSegment, setDetailSegment] = useState<'plan' | 'chain' | 'report' | null>(null)
    // V7-② 到访摘要：挂载时读一次 last-seen 快照（关板时写入）——到访期间不跳动。
    const [lastSeenSnapshot] = useState<number>(() => {
      try { return Date.parse(localStorage.getItem('warroom-last-seen') ?? '') || 0 } catch { return 0 }
    })
    // V7-③ 族系追踪：悬停即时预览（hover 优先），聚焦常驻（Esc/退出钮解除）。
    const [hoverFamily, setHoverFamily] = useState<string | null>(null)
    const [focusCommandId, setFocusCommandId] = useState<string | null>(null)
    // V7.1 审查整改：决策写操作失败的就地反馈（6 秒自清）。
    const [actionError, setActionError] = useState<string | null>(null)
    // V9.2 设置抽屉的看板行为开关（纯展示层偏好，localStorage 持久化）。
    const [hoverFamilyOn, setHoverFamilyOn] = useState(() => localStorage.getItem('warroom-cfg-hover-family') !== '0')
    const [autoScrollOn, setAutoScrollOn] = useState(() => localStorage.getItem('warroom-cfg-auto-scroll') !== '0')
    useEscOnlyLayer(focusCommandId !== null, () => { setFocusCommandId(null) })
    // V9.5（复评 P2-2）：全板快捷键 n = 新建命令（无弹窗层且不在输入框时）——
    // 主写操作不再藏在 20 个 Tab 之后的坞左端。
    useEffect(() => {
      const onKey = (e: KeyboardEvent): void => {
        if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return
        if (escLayers.length > 0) return
        const el = e.target instanceof Element ? e.target : null
        if (el !== null && el.closest('input, textarea, select, [contenteditable], .war-modal-backdrop, .war-settings-backdrop') !== null) return
        setComposerOpen(true)
      }
      document.addEventListener('keydown', onKey)
      return () => { document.removeEventListener('keydown', onKey) }
    }, [])
    // V9.2 聚焦点空白即退（元首指令）：点到非卡片/非岛/非弹窗/非控件处退出聚焦。
    useEffect(() => {
      if (focusCommandId === null) return
      const onClick = (e: MouseEvent): void => {
        const el = e.target instanceof Element ? e.target : null
        if (el === null) return
        if (el.closest('.war-card, .war-island, .war-modal-backdrop, .war-dispatch, .war-onboard, button, a, input, textarea, [role=\"switch\"]') !== null) return
        setFocusCommandId(null)
      }
      document.addEventListener('click', onClick)
      return () => { document.removeEventListener('click', onClick) }
    }, [focusCommandId])
    useEffect(() => {
      if (actionError === null) return
      const timer = setTimeout(() => { setActionError(null) }, 6000)
      return () => { clearTimeout(timer) }
    }, [actionError])
    // V8 悬停自动滚动：族系高亮确定后（300ms 防抖），把各滚动容器里被高亮但
    // 不在视口内的卡片滚到眼前——上方三列（纵向）+ 底部调度条（横向）都要管；
    // nearest 只滚最小必要距离，已可见的不动；reduced-motion 用户用瞬移。
    // 悬停离开（null）不滚——不抢用户的滚动权。
    useEffect(() => {
      if (hoverFamily === null || !autoScrollOn) return
      const timer = setTimeout(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        document.querySelectorAll<HTMLElement>('.war-col-body .war-rel-same, .war-dispatch .war-rel-same').forEach(el => {
          el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
        })
      }, 300)
      return () => { clearTimeout(timer) }
    }, [hoverFamily, autoScrollOn])
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
    // V9.9 打开聚焦页（唯一详情叙事面）；segment=需要发落的环节（收件箱/上方卡直达）。
    const openCommand = (commandId: string, segment: 'plan' | 'chain' | 'report' | null = null): void => {
      setDetailSegment(segment)
      setDetailCommandId(commandId)
    }
    const openStaff = (taskId: string): void => {
      const target = staffFor(taskId)
      if (target !== null) services.sessions?.open(target)
    }
    // V7.1 决策写操作（改档/批计划）失败必须出声——静默失败击穿信任（审查 P1）。
    const actNote = (p: Promise<{ ok: boolean }>, what: string): void => {
      void p.then(r => {
        if (r.ok) { setActionError(null); refresh() }
        else setActionError(activeCopy().actions.failToast(what))
      })
    }
    const detailCommand = detailCommandId !== null ? commands.find(c => c.commandId === detailCommandId) : undefined
    // Session cards: attempt-level, newest first inside each zone (defensive
    // ?? [] — a stale projection without attemptLog must not crash the board).
    const byStart = (a: BoardAttempt, b: BoardAttempt): number => (a.startedAt < b.startedAt ? 1 : -1)
    const live = tasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === null).map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const done = tasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === 'succeeded' || a.outcome === 'reported').map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const failed = tasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === 'failed').map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const commandsNewest = [...commands].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const now = Date.now()
    // V9 战报列：成功+失败合并、纯时间倒序（无按天分组——组头是单组时的噪音）。
    const report = [...done, ...failed].sort((x, y) => byStart(x.a, y.a))
    // V9 底部调度条：全部命令，活跃优先（未取消且链未全终局）+ 新→旧——Dispatch 调度中心的一排英雄位。
    const cmdActive = (c: BoardCommand): boolean => {
      const ch = chainOf(c)
      return c.status !== 'cancelled' && !(ch.length > 0 && ch.every(t => t.status === 'closed' || t.status === 'failed'))
    }
    const dispatchCommands = [...commandsNewest].sort((a, b) => (cmdActive(b) ? 1 : 0) - (cmdActive(a) ? 1 : 0))
    // V7-③ trace 注入器：命令卡 family=自身；任务/会话卡 family=源命令；外部挂载 null（只压暗）。
    const traceActive = hoverFamily ?? focusCommandId
    const traceFor = (familyId: string | null): CardTrace => ({ familyId, active: hoverFamilyOn ? traceActive : null, onHover: hoverFamilyOn ? setHoverFamily : () => {}, onFocus: setFocusCommandId })
    // V9.11 任务列=参谋侧台账：成形卡（接令起、任务书未挂出的命令）置顶——参谋
    // 产线全览；任务书卡（tasks 全量，终局调暗）随后。成形中列首正是「参谋在做什么」。
    const formingCards = commandsNewest.flatMap(c => {
      const v = formingVariantOf(c, chainOf(c))
      return v === null ? [] : [FormingCard(c, v, () => { openCommand(c.commandId, 'plan') }, traceFor(c.commandId))]
    })
    const focusCmd = focusCommandId !== null ? commands.find(c => c.commandId === focusCommandId) : undefined
    // V7-① 收件箱：聚合 + 点击导航（clarify 进参谋会话，plan 开决策卡，review/retry 开任务详情）。
    const inbox = collectInbox(commands, tasks, now)
    // V7-② 摘要：以挂载快照算增量（pending 用当前收件箱长度）。
    const visit = visitDelta(commands, tasks, inbox.length, lastSeenSnapshot, now)
    // V8 大盘计数（灵动岛收起态仪表）：与 dock 徽章同源。
    const counts = {
      pending: commands.filter(c => c.status === 'received' || c.status === 'talking').length,
      waiting: tasks.filter(t => t.status === 'published').length,
      active: tasks.filter(t => t.status === 'in_progress').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    }
    // V9.9 收件箱路由：批计划→任务段；翻战报→战报段；决重试→任务链段；答澄清
    // 仍是进会话对话。孤儿任务（无源命令，防御分支）退到参谋会话/末次会话直跳。
    const inboxAct = (it: InboxItem): void => {
      if (it.kind === 'clarify') {
        const cmd = commands.find(c => c.commandId === it.refId)
        const target = cmd?.staffSessionId ?? hqSessionId
        if (cmd !== undefined && target !== null) {
          void markTalking(cmd.commandId)
          services.sessions?.open(target)
        }
      } else if (it.kind === 'plan') {
        openCommand(it.refId, 'plan')
      } else {
        const lc = lineageOf(it.refId)
        if (lc !== null) openCommand(lc.commandId, it.kind === 'review' ? 'report' : 'chain')
        else {
          const staff = staffFor(it.refId)
          if (staff !== null) services.sessions?.open(staff)
        }
      }
    }
    // V9.9 点击接线梳理（元首定案）：详情面只剩聚焦页——任务卡有溯源开聚焦页，
    // 孤儿任务（真实流程不会出现）直跳其末次会话，不再进旧任务详情。
    const openTaskVia = (taskId: string): void => {
      const lc = lineageOf(taskId)
      if (lc !== null) { openCommand(lc.commandId); return }
      const t = tasks.find(x => x.taskId === taskId)
      const last = t !== undefined ? (t.attemptLog ?? []).at(-1) : undefined
      if (last !== undefined) services.sessions?.open(last.sessionId)
    }
    // 会话卡：作战中→聚焦页执行段，战报列→聚焦页战报段；孤儿直跳原生会话。
    const openSessionVia = (t: BoardTask, a: BoardAttempt, segment: 'battle' | 'report'): void => {
      const lc = lineageOf(t.taskId)
      if (lc !== null) openCommand(lc.commandId, segment)
      else services.sessions?.open(a.sessionId)
    }
    return createElement('div', { className: 'war-root' },
      // V8 hero 灵动岛：替代标题栏——操作件与大盘状态全收进顶部胶囊（展开浮层
      // 盖列区，不推挤；聚焦模式 = 岛的常驻形态）。
      createElement(WarIsland, {
        key: 'island',
        active: data?.active === true,
        counts,
        inbox,
        visit,
        lastSeen: lastSeenSnapshot,
        now,
        focusText: focusCommandId !== null && focusCmd !== undefined ? focusCmd.text : null,
        onExitFocus: () => { setFocusCommandId(null) },
        onSettings: () => { setSettingsOpen(true) },
        onInboxAct: inboxAct,
      }),
      actionError !== null ? createElement('div', { className: 'war-actionerr', role: 'alert' }, actionError) : null,
      data === null
        ? createElement('div', { className: 'war-body' },
          error !== null ? createElement('span', { className: 'war-err' }, activeCopy().loading.unreachable(error)) : createElement('span', { className: 'war-empty' }, activeCopy().loading.connecting),
        )
        : commands.length === 0 && tasks.length === 0
          ? OnboardPanel(() => { setComposerOpen(true) })
          : createElement('div', { className: 'war-board' },
          // V9 板体 = 纵向 flex：上三列局势墙（.war-ops 网格）+ 下全宽命令调度条。
          // 调度条必须是 .war-ops 的兄弟而非网格第 4 项——塞进三列网格会被放到
          // 第 2 行第 1 列，宽度只剩一列（2026-08-25 元首抓到的真 bug）。
          createElement('div', { className: 'war-ops' },
            createElement('div', { className: 'war-zone war-tasks' },
              Zone('tasks', activeCopy().columns.tasks.title, formingCards.length + tasks.length, activeCopy().columns.tasks.empty,
                [...formingCards,
                  ...tasks.map(t => TaskCard(t, statuses, openTaskVia,
                    (t.status === 'reported' || t.status === 'failed') && staffFor(t.taskId) !== null
                      ? () => { openStaff(t.taskId) }
                      : null,
                    lineageOf(t.taskId), openCommand, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
                ],
              ),
            ),
            createElement('div', { className: 'war-zone war-field' },
              Zone('live', activeCopy().columns.live.title, live.length + threads.length, activeCopy().columns.live.empty,
                [...live.map(({ t, a }) => SessionCard(t, a, (t2, a2) => { openSessionVia(t2, a2, 'battle') }, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
                  ...threads.map(th => ExternalThreadCard(th, services, sessionId => { void detachThread(sessionId).then(refresh) }, traceFor(null)))],
              ),
            ),
            createElement('div', { className: 'war-zone war-report' },
              Zone('report', activeCopy().zones.report.title, report.length, activeCopy().columns.done.empty,
                report.map(({ t, a }) => SessionCard(t, a, (t2, a2) => { openSessionVia(t2, a2, 'report') }, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
              ),
            ),
          ),
          // V9 底部命令调度条：所有命令卡横向一排（活跃优先 + 新→旧），每张带
          // 四段生命条显示所处阶段——命令是唯一可点入口，点开=全生命周期详情。
          createElement(DispatchStrip, { key: 'dispatch', onCompose: () => { setComposerOpen(true) } },
            ...dispatchCommands.map(c => CommandCard(c, hqSessionId, services, cmd => openCommand(cmd.commandId), chainOf(c), traceFor(c.commandId), grade => {
              actNote(regradeCommand(c.commandId, grade), activeCopy().commandDetail.regradeTo(activeCopy().grade[grade]))
            })),
          ),
        ),
      composerOpen ? createElement(CommandComposer, { key: 'composer', recent: [...new Set(commandsNewest.map(c => c.text))].slice(0, 3), onClose: () => { setComposerOpen(false) }, refresh }) : null,
      detailCommand !== undefined ? createElement(FocusPage, {
        key: `cmd-${detailCommand.commandId}`,
        cmd: detailCommand,
        chain: chainOf(detailCommand),
        statuses,
        hqSessionId,
        services,
        focusSegment: detailSegment,
        onClose: () => { setDetailCommandId(null) },
        onRegrade: grade => { actNote(regradeCommand(detailCommand.commandId, grade), activeCopy().commandDetail.regradeTo(activeCopy().grade[grade])) },
        onDecidePlan: decision => { actNote(decidePlan(detailCommand.commandId, decision), decision === 'approve' ? activeCopy().commandDetail.approvePlan : activeCopy().commandDetail.rejectPlan) },
      }) : null,
      settingsOpen ? createElement(SettingsDrawer, {
        key: 'settings',
        onClose: () => { setSettingsOpen(false) },
        hoverFamily: hoverFamilyOn,
        onToggleHoverFamily: v => { setHoverFamilyOn(v); localStorage.setItem('warroom-cfg-hover-family', v ? '1' : '0') },
        autoScroll: autoScrollOn,
        onToggleAutoScroll: v => { setAutoScrollOn(v); localStorage.setItem('warroom-cfg-auto-scroll', v ? '1' : '0') },
        connected: error === null,
        onRefresh: refresh,
      }) : null,
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
