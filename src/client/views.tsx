/**
 * The war map (三列局势墙 + 调度条) — the warroom's V9 operating surface.
 * Three monitor columns (任务 / 执行中+外部 / 任务回报) plus the bottom command
 * dispatch strip. V9.9 wiring discipline: clicking ANY card opens the source
 * command's focus page (聚焦页 — a lifecycle tour that pulls the main-UI
 * cards into one window); there are no per-task/per-session detail modals
 * anymore. Battlefield cards jump via sessions.open (live cards direct,
 * settled cards through the tour's report stage); reported/failed task cards
 * also carry a 「去验收/去下重试令」 shortcut to the owning command's staff conversation.
 * @module dsh-plugin-stardeck/client/views
 */

import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { archiveCommand, createCommand, decidePlan, detachThread, markTalking, regradeCommand, useWar, type BoardAttempt, type BoardCommand, type BoardQuality, type BoardTask, type BoardThread, type FrontChoice } from './data.ts'
import { activeCopy, setSkin, skinId, subscribeSkin, type SkinId } from './copy.ts'
import { agingLeader, collectInbox, formatWait, inboxGrowthAnnounce, type InboxItem, type InboxKind } from './inbox.ts'
import { visitDelta, type VisitDelta } from './visit.ts'
import { applyBattlefieldMarker, applyGradeMarker, displayTitleOf, stalledOnUserPlan, type ComposerGrade } from './preflight.ts'
import { galaxyLayout, garrisonOf, moonPos, StarfieldMap, workspaceCreationOrder } from './starfield.tsx'
import { Warzone } from './starfield3d.tsx'
import { attemptPhaseOf, warLogOf, type WzBridgePlanet, type WzBridgeSquad, type WzLogFeedItem, type WzFrontNode } from './warzone-scene.ts'
import { looksLikeFilePath, parseMd, splitInline } from './report-face.ts'
import { commandTasks, frontsOf, frontOfTaskMap, greedyRootHues, wsKeyOf, UNGROUPED_WS_KEY, type WarFront, type WzBridgeFrontLite } from './front.ts'
import { warLogKindColor } from './war-tokens.ts'
import { PipeOverlay, type PipeFamily, type PipeStop } from './pipe-overlay.tsx'
import { buildAlarmCron, nextRunOf, parseCron, type AlarmSpec } from '../schedule.ts'
import { waitKindOf } from './waithint.ts'
import { QUALITY_TIERS } from '../types.ts'

/** V17 三页签全局切片（进行中/已收官/已归档）：模块级 store——WarView 与
 * WarDockPill 两个挂载点共享同源状态（localStorage 持久化，缺省进行中）。 */
export type CmdTab = 'active' | 'settled' | 'archived'
const CMD_TAB_KEY = 'warroom-cmd-tab'
let cmdTabState: CmdTab = (() => {
  try { const v = localStorage.getItem(CMD_TAB_KEY); return v === 'settled' || v === 'archived' ? v : 'active' } catch { return 'active' }
})();
/** V18.2 星球悬停页签预览（舰长定案，临态）：悬停星球的战线档位只有低档
 * （已收官/已归档）时自动把页签带到该档，让星球相关卡片可见可高亮；混档
 * 只高亮最高档不动页签。预览不落 localStorage——悬停离开/手动切页签即还原，
 * 用户偏好永远不被悬停覆写。 */
let cmdTabPreview: CmdTab | null = null
/** 星球点击粘性预览的星球键（点击=明确要看这颗星；手动切页签即收回）。 */
let planetPreviewWs: string | null = null
const cmdTabSubs = new Set<() => void>()
export function subscribeCmdTab(fn: () => void): () => void {
  cmdTabSubs.add(fn)
  return () => { cmdTabSubs.delete(fn) }
}
/** 板面实际生效页签 = 悬停/点击预览 ?? 用户选定页签（所有消费方统一走这里）。 */
export function cmdTabShown(): CmdTab { return cmdTabPreview ?? cmdTabState }
export function setCmdTabPreview(t: CmdTab | null): void {
  if (t === cmdTabPreview) return
  cmdTabPreview = t
  for (const fn of cmdTabSubs) fn()
}
export function cmdTabId(): CmdTab { return cmdTabState }
export function setCmdTab(t: CmdTab): void {
  const changed = t !== cmdTabState
  // V18.2：手动切页签=收回预览权（预览与粘性星球同时清场）。
  const previewWas = cmdTabPreview !== null || planetPreviewWs !== null
  cmdTabPreview = null
  planetPreviewWs = null
  if (changed) {
    cmdTabState = t
    try { localStorage.setItem(CMD_TAB_KEY, t) } catch { /* 隐私模式 */ }
  }
  if (changed || previewWas) for (const fn of cmdTabSubs) fn()
}

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

/** 地图标记：「！」新任务令待领取，「？」任务回报可收获（分区时代的残留信号灯）。 */
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
  const tm = activeCopy().time
  if (diff < 60_000) return tm.justNow
  if (diff < 3_600_000) return tm.agoMins(Math.floor(diff / 60_000))
  if (diff < 86_400_000) return tm.agoHours(Math.floor(diff / 3_600_000))
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

/** 命令的任务域（V13 起迁 front.ts——战线跨代并集复用；语义见彼处注释）。 */

type LifeStage = 'command' | 'task' | 'battle' | 'report'

/** 任务回报已阅账本（localStorage，per 命令记「最近一次点开任务回报」时刻）：任务回报段
 * 由呼吸转绿的唯一依据——seen 必须晚于该命令最近一次定论（新任务回报会重新拉回
 * 呼吸态）。无 localStorage 环境（测试/隐身）静默降级为未读。 */
const REPORT_SEEN_KEY = 'warroom-report-seen'
function reportSeenAtOf(commandId: string): number | undefined {
  try {
    const m = JSON.parse(localStorage.getItem(REPORT_SEEN_KEY) ?? '{}') as Record<string, number>
    const v = m[commandId]
    return typeof v === 'number' ? v : undefined
  } catch {
    return undefined
  }
}
function markReportSeen(commandId: string): void {
  try {
    const m = JSON.parse(localStorage.getItem(REPORT_SEEN_KEY) ?? '{}') as Record<string, number>
    m[commandId] = Date.now()
    localStorage.setItem(REPORT_SEEN_KEY, JSON.stringify(m))
  } catch {
    // 静默降级：读投影不受影响，只是任务回报段不转绿。
  }
}

/** 链上最近一次「定论时刻」（任务回报/上报/失败尝试的末次时间）——任务回报已阅只在
 * 晚于它时才作数（驳回重跑出了新任务回报 → 呼吸态回归，等你再看）。 */
function latestSettleMs(chain: BoardTask[]): number {
  let latest = 0
  for (const t of chain) {
    for (const r of t.reports) {
      const ms = Date.parse(r.ts)
      if (Number.isFinite(ms) && ms > latest) latest = ms
    }
    for (const a of t.attemptLog ?? []) {
      if (a.endedAt !== null && a.outcome !== null) {
        const ms = Date.parse(a.endedAt)
        if (Number.isFinite(ms) && ms > latest) latest = ms
      }
    }
  }
  return latest
}

/** 阶段条状态机（V9.11 指示器跟卡走，舰长定案）：now 是当前关注位（呼吸条）。
 * 规则：卡进任务列（成形卡或任务书卡）前沿即到任务段——只有定时未出发/未被
 * 大副接手的命令停在命令段；执行段认 live 尝试；任务回报到场先呼吸（等你点开），
 * 看过之后（seen 晚于最近定论）整条转绿收官。 */
function lifecycleOf(cmd: BoardCommand, chain: BoardTask[], reportSeenAt?: number): { reached: Record<LifeStage, boolean>; now: LifeStage | null; status: string; tone: '' | 'warn' | 'err' } {
  const copy = activeCopy().lifecycle
  if (cmd.status === 'cancelled') {
    return { reached: { command: true, task: false, battle: false, report: false }, now: null, status: copy.cancelled, tone: 'err' }
  }
  const planPending = cmd.plan?.status === 'pending'
  if (chain.length === 0) {
    // V9.11：成形卡在场（接令起）＝卡片已进任务列 → 前沿到任务段；talking/
    // plan 待批是等你动作的位，状态行挂 warn。
    if (formingVariantOf(cmd, chain) !== null) {
      const status = cmd.status === 'talking' ? copy.waitingClarify
        : planPending ? copy.planPending
        : cmd.status === 'approved' ? copy.approvedAwaitingPublish
        : copy.waitingStaff
      const tone = cmd.status === 'talking' || planPending ? 'warn' : ''
      return { reached: { command: true, task: true, battle: false, report: false }, now: 'task', status, tone }
    }
    // 未被大副拿到 / 定时未出发：无任务卡可指，前沿停在命令段。
    // V16.4-R3：这里啥都还没发生——「起草中」是假动词，用 pendingRelay（待接令）。
    return { reached: { command: true, task: false, battle: false, report: false }, now: 'command', status: copy.pendingRelay, tone: 'warn' }
  }
  const closed = chain.filter(t => t.status === 'closed').length
  // V9.11：上报（reported）即进任务回报段——执行卡已平移到任务回报列，生命条不许停在
  // 执行段打架；状态标签优先级 定论(closed/failed) > 待验收(reported)。
  const reportDone = chain.some(t => t.status === 'closed' || t.status === 'failed' || t.status === 'reported')
  const chainPrefix = chain.length > 1 ? `${copy.chain(closed, chain.length)} · ` : ''
  if (reportDone) {
    const terminal = chain.find(t => t.status === 'closed') ?? chain.find(t => t.status === 'failed') ?? chain.find(t => t.status === 'reported')
    const label = terminal !== undefined ? activeCopy().taskStatus[terminal.status] : ''
    // V12.2 critique P2：败局状态行同染红（与生命条红终局同源）——灰字全绿条
    // 曾让挫败读起来像圆满。
    const failTone = terminal !== undefined && terminal.status === 'failed' ? 'err' as const : '' as const
    const seen = reportSeenAt !== undefined && reportSeenAt >= latestSettleMs(chain)
    return seen
      ? { reached: { command: true, task: true, battle: true, report: true }, now: null, status: `${chainPrefix}${label}`, tone: failTone }
      : { reached: { command: true, task: true, battle: true, report: false }, now: 'report', status: `${chainPrefix}${label}`, tone: failTone }
  }
  const battleLive = chain.some(t => t.status === 'in_progress' || t.attemptLog.length > 0)
  if (battleLive) {
    const current = chain.find(t => t.status === 'in_progress') ?? chain[chain.length - 1]!
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

/** 阶段条（4 段分段进度：done 绿 / now 蓝呼吸 / 其余灰；败局报告段红收尾）。 */
function LifeStrip(cmd: BoardCommand, chain: BoardTask[]): ReactNode {
  const copy = activeCopy().lifecycle
  const life = lifecycleOf(cmd, chain, reportSeenAtOf(cmd.commandId))
  // V12.2 critique P2：链终局=failed 时报告段红收尾——绿严格=圆满（图例契约），
  // 挫败不许再以全绿条示人（cancelled 的 err 终局此前比 failed 更红，倒挂）。
  const failTerminus = life.reached.report && chain.some(t => t.status === 'failed')
  // V18 critique A2：cancelled 的命令段不得染绿（绿=善终契约）——被否的命令
  // 唯一一眼元素走 err 中性化，与状态行红同源（V12.2 修了 failed 红尾，cancelled 漏网）。
  const cancelledHead = cmd.status === 'cancelled'
  const stages: Array<{ key: LifeStage; label: string }> = [
    { key: 'command', label: copy.stages.command },
    { key: 'task', label: copy.stages.task },
    { key: 'battle', label: copy.stages.battle },
    { key: 'report', label: copy.stages.report },
  ]
  return createElement('div', { className: 'war-life' },
    ...stages.map(s => createElement('div', { key: s.key, className: 'war-life-stage', 'aria-label': s.label },
      createElement('span', { className: `war-life-bar${failTerminus && s.key === 'report' ? ' err' : cancelledHead && s.key === 'command' ? ' err' : life.now === s.key ? ' now' : life.reached[s.key] ? ' done' : ''}` }),
      // V16.4 critique P3：段标签只在「当前段」出现（一屏 20 卡×4 标签=噪音）；
      // 其余段名进 title/aria——min-height 保行高，恒高卡不塌。
      createElement('span', { className: `war-life-label${life.now === s.key ? ' now' : life.reached[s.key] ? ' done' : ''}`, title: s.label }, life.now === s.key ? s.label : ''),
    )),
    createElement('span', { className: `war-life-status${life.tone !== '' ? ` ${life.tone}` : ''}`, style: { gridColumn: '1 / -1' } }, life.status),
  )
}

/** V5 档位徽章：L0 直发 / L1 呈批 / L2 澄清（未分诊不显示）。 */
function gradeChip(cmd: BoardCommand): ReactNode {
  if (cmd.grade === null) return null
  const label = activeCopy().grade[cmd.grade]
  const cd = activeCopy().commandDetail
  const title = `${cd.gradeTitlePrefix}${cmd.gradeReason !== null ? `：${cmd.gradeReason}` : ''}${cmd.regrades > 0 ? cd.regradesNote(cmd.regrades) : ''}`
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
  // V18 critique B2-P1：prev 必须在**渲染期**捕获——effect 里取时子件 autoFocus
  // 已把焦点移进弹窗，prev=弹窗内节点，归还聚焦到已卸载元素=焦点掉 body
  //（全部弹窗消费者的共性缺陷：起草器/聚焦页/HQ/设置抽屉）。
  const prevRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  useEffect(() => {
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
      prevRef.current?.focus()
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

/** V10 战线代际：罗马数字到 Ⅻ，溢出走「第N代」；初代返回空串（不给徽标）。 */
const GEN_ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']
function genLabel(generation: number): string {
  return generation < 2 ? '' : (GEN_ROMAN[generation] ?? activeCopy().commandCard.genOverflow(generation))
}
/** V14 战线渲染期查表：WarView 每次渲染同步刷新（先于子元素创建，读取一致）。
 *  模块级单例是刻意取舍——链色/本地计代消费点散落在模块级组件工厂
 *  （genBadge/pips/族谱条/续接 chip），props 打穿成本大于单板单例的可控性。 */
let boardFrontByCmd: Map<string, WarFront> | null = null
/** 链色=战线色（V14：不再绑血脉——兄弟段天然异色）。 */
function chainHueOf(c: BoardCommand): number {
  const f = boardFrontByCmd?.get(c.commandId)
  return f !== undefined ? f.hueSlot : c.chain.hueSlot
}
/** V14 战线内本地计代：锚=本地Ⅰ；脱离战线上下文（防御）退链代。 */
function localGenOf(c: BoardCommand): number {
  const f = boardFrontByCmd?.get(c.commandId)
  if (f === undefined) return c.chain.generation
  const i = f.generations.findIndex(g => g.commandId === c.commandId)
  return i >= 0 ? i + 1 : c.chain.generation
}

/** 世代徽标（战线本地代序着色；shoot 断言锚 data-war-gen）。 */
function genBadge(cmd: BoardCommand): ReactNode {
  const local = localGenOf(cmd)
  const label = genLabel(local)
  if (label === '') return null
  return createElement('span', {
    className: `war-gen-badge war-chain-hue-${chainHueOf(cmd)}`,
    'data-war-gen': String(local),
    title: activeCopy().chain.genBadgeTitle(cmd.chain.length),
  }, label)
}

/** V10.1 战线历代状态 pip（舰长复评定形=纯圆点）：一点一代，颜色=该代战线
 * 状态——蓝=机器在动/琥珀=等你/绿=圆满/红=败/灰=未战而终；最新代点放大描环
 * （卡面=此代）。代数罗马数字只在悬停 title/aria 里讲（圆点不背字）。 */
type PipStatus = 'run' | 'wait' | 'done' | 'fail' | 'idle'
function pipLabel(generation: number): string {
  return GEN_ROMAN[Math.max(1, generation)] ?? activeCopy().commandCard.genOverflow(generation)
}
function genPipStatus(cmd: BoardCommand, chain: BoardTask[]): PipStatus {
  if (cmd.status === 'cancelled') return 'idle'
  if (chain.some(t => t.status === 'failed')) return 'fail'
  if (chain.some(t => t.status === 'in_progress')) return 'run'
  if (chain.some(t => t.status === 'reported')) return 'wait'
  if (chain.length > 0 && chain.every(t => t.status === 'closed')) return 'done'
  if (cmd.status === 'closed') return 'done'
  return 'run'
}
function genPips(cards: BoardCommand[], tasksOf: (c: BoardCommand) => BoardTask[], latestId: string): ReactNode {
  const copy = activeCopy().commandCard
  // aria 讲全史；卡面只摆最新 4 代（>4 前置总代数 chip）——与展开面板 4 行同口径，
  // R1 徽章行恒宽不被超长战线撑爆（更老各代仍可进面板滚看）。
  const aria = cards.map(c => `${pipLabel(localGenOf(c))} ${copy.pipStatus[genPipStatus(c, tasksOf(c))]}`).join('、')
  const shown = cards.length > 4 ? cards.slice(cards.length - 4) : cards
  return createElement('span', {
    className: 'war-gen-pips', title: copy.pipsTitle(cards.length), role: 'img',
    'aria-label': `${copy.pipsTitle(cards.length)}：${aria}`,
  },
  cards.length > 4 ? createElement('span', { key: 'more', 'aria-hidden': 'true', className: 'war-gen-pip more' }, activeCopy().front.genN(cards.length)) : null,
  ...shown.map(c => createElement('span', {
    key: c.commandId, 'aria-hidden': 'true', title: `${pipLabel(localGenOf(c))} ${copy.pipStatus[genPipStatus(c, tasksOf(c))]}`,
    className: `war-gen-pip st-${genPipStatus(c, tasksOf(c))}${c.commandId === latestId ? ' now' : ''}`,
  })))
}

function CommandCard(cmd: BoardCommand, hqSessionId: string | null, services: ClientServicesFace, onDetail: (cmd: BoardCommand) => void, chain: BoardTask[], trace: CardTrace, onRegrade: (grade: 'L0' | 'L1' | 'L2') => void, tour = false, pips: ReactNode = null, history = false): ReactNode {
  const meta = commandStatus(cmd.status)
  const enterSession = (): void => {
    const target = cmd.staffSessionId ?? hqSessionId
    if (target === null || services.sessions === undefined) return
    void markTalking(cmd.commandId)
    services.sessions.open(target)
  }
  // V9.5（复评 P1-1）：命令卡点击语义统一——一律打开全生命周期详情（板是
  // 叙事中心，好奇不该瞬移出板）；对话入口改列快捷操作行。
  // V9.9 tour 变体（聚焦页内嵌）：点击=展开下达配置，◎/进入对话收起（底部
  // 「任务会话」跳钮覆盖对话入口，窗口内不需要二次聚焦）。
  const conversational = !tour && (cmd.status === 'received' || cmd.status === 'talking')
  // V10.1 五行卡规格（舰长定）：R1 徽章行 / R2 命令原文一行截断 / R3 生命条 /
  // R4 通知行（预检提示·取消原因，空则留位）/ R5 快捷操作行（进入对话·改直
  // 发·◎ 聚焦；全空给「无快捷操作」占位）——行高恒定，坞内所有命令卡同尺寸。
  const preflight = stalledOnUserPlan(cmd)
  // 审计轮·批次3 修复：三元错接归位——cancelledNote 持显示串（取消原因），
  // ghostSpeaks 归位为布尔（tour 内成形 ghost 在场即由它发言）。此前布尔化的
  // cancelledNote 恒挂 is-fail 且永不渲染，「取消原因」在卡面名存实亡。
  const cancelledNote = cmd.status === 'cancelled' && cmd.cancelledReason !== null
    ? activeCopy().commandDetail.cancelledReason(cmd.cancelledReason)
    : null
  const ghostSpeaks = tour && formingVariantOf(cmd, chain) !== null
  const activate = (): void => { onDetail(cmd) }
  return createElement('div', {
    key: cmd.commandId,
    className: `war-card war-command-card clickable${cmd.status === 'received' ? ' pulse' : ''}${relClass(trace)}`,
    'data-war-gen': String(cmd.chain.generation),
    'data-pipe-cmd': cmd.commandId,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${meta.label}：${displayTitleOf(cmd.text)}`,
    onClick: activate,
    onKeyDown: keyActivate(activate),
    ...traceMouse(trace),
  },
  // R1 徽章行（组面卡在此挂历代状态 pip；时间靠右）。
  createElement('div', { className: 'war-card-top' },
    createElement('span', { className: `war-dot ${meta.dot}` }),
    createElement('span', { className: `war-chip ${meta.cls}` }, meta.label),
    gradeChip(cmd),
    genBadge(cmd),
    pips,
    cmd.schedule !== null && cmd.schedule.dispatchedAt === null
      ? createElement('span', {
          className: 'war-chip sched',
          title: activeCopy().scheduleChip.cardTitle(fmtSchedule(cmd.schedule.nextRunAt)),
        }, activeCopy().scheduleChip.chip(fmtSchedule(cmd.schedule.nextRunAt)))
      : null,
    createElement('span', { className: 'war-time' }, relTime(cmd.createdAt)),
  ),
  // R2 命令原文：一行截断（悬停 title 看全文，聚焦页标题有原文）。
  // V12.2 critique 整改：聚焦页（tour）里标题已是命令原话——卡内不再复读全文，
  // 降为 ID 行（原话由页首大标题独占，叙事不重复）。
  tour
    ? createElement('div', { className: 'war-command-text', title: cmd.text },
        createElement('span', { className: 'war-taskid' }, cmd.commandId))
    : createElement('div', { className: `war-command-text${cmd.status === 'cancelled' ? ' struck' : ''}`, title: cmd.text }, displayTitleOf(cmd.text)),
  // R3 全生命周期阶段条：命令不因发布而死卡——任务/执行/任务回报进度常驻卡上。
  LifeStrip(cmd, chain),
  // R4 通知行：夜间预检后果提示 / 取消原因；空也保留行位（恒高）。
  // V16.4-R7 critique P2-1：tour 里成形 ghost 卡就是该状态的唯一发言人——R4 行
  // 退为占位（恒高保形，文字不三重复读「自动推进」）。
  createElement('div', {
    className: `war-card-note${preflight && !ghostSpeaks ? ' war-preflight is-wait' : cancelledNote !== null ? ' is-fail' : ''}`,
    ...(preflight && !ghostSpeaks ? { title: activeCopy().preflight.title } : {}),
  },
    preflight && !ghostSpeaks
      ? createElement('span', { className: 'war-preflight-text' }, activeCopy().preflight.hint)
      : ghostSpeaks ? null : cancelledNote,
  ),
  // R5 快捷操作行：进入对话 / 改直发（V7-④ 出口）/ ◎ 聚焦；tour 变体全空给占位；
  // history 变体（组展开面板里的历代卡）无此行——过去的命令不再需要操作，只可点看。
  history ? null : createElement('div', { className: 'war-card-actions' },
    conversational
      ? createElement('button', {
          className: 'war-btn war-enter-btn',
          type: 'button',
          title: meta.hint,
          onClick: e => { e.stopPropagation(); enterSession() },
        }, activeCopy().focusPage.talkingEnterBtn)
      : null,
    preflight
      ? createElement('button', { className: 'war-btn war-preflight-btn', onClick: e => { e.stopPropagation(); onRegrade('L0') } }, activeCopy().preflight.toDirect)
      : null,
    !tour
      ? createElement('button', {
          className: 'war-btn war-focus-btn',
          title: activeCopy().trace.focusBtnTitle,
          'aria-label': activeCopy().trace.focusBtnTitle,
          onClick: e => { e.stopPropagation(); trace.onFocus(cmd.commandId) },
        }, '◎')
      : null,
    tour && !conversational && !preflight
      ? createElement('span', { className: 'war-card-actions-empty' },
          // A3-P2：终局命令不走「自动推进」措辞（与安神带同源二态）。
          cmd.status === 'cancelled'
            ? activeCopy().commandCard.noQuickCancelled
            : chain.length > 0 && chain.every(t => t.status === 'closed' || t.status === 'failed')
              ? activeCopy().commandCard.noQuickSettled
              : activeCopy().commandCard.noQuickAction)
      : null,
  ),
  )
}

/** V10.1 卡牌组（舰长复评定形）：坞里只摆最新一代卡面，组性走「叠纸影 +
 * 历代状态圆点」；悬停 ~150ms 组面按 Mac 下载栈式向上展开——面板只摆【历代】
 * （最新一代=坞上卡面本体复用，不重复），最新前代贴卡面在上、更老依次向上，
 * 最高 4 行滚轮翻看，离开 ~200ms 收拢；聚焦组内任一卡同样展开——键鼠同权
 * （↑/↓ 选代、回车打开该代、Esc 收拢回卡面）。历史卡同形无 R5、无悬停。
 * 面板 position:fixed 从卡面实测坐标落位：轨道是横滚容器，绝对定位子元素会被
 * 竖向裁剪；宿主无 transform 祖先（modal/map-hint 两条 fixed 先例）。滚轮拦截
 * 用原生监听——轨道横移劫持同为原生监听，React 合成 stopPropagation 到不了它
 * （冒泡序 panel→track 先于 root 委托）。 */
function CommandGroupCard(props: { rootId: string; cards: BoardCommand[]; renderCard: (c: BoardCommand, pips?: ReactNode, history?: boolean) => ReactNode; tasksOf: (c: BoardCommand) => BoardTask[] }): ReactNode {
  const { rootId, cards, renderCard, tasksOf } = props
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const faceRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // 面板 portal 落点：Chromium 把 overflow 滚动容器（调度轨道）里的 fixed 后代
  // 当作滚动内容绘制——层叠被拽进坞域，高面板被三列卡片盖住（六代链 probe 实
  // 抓）。挂 .war-root 直下恢复真 fixed 层叠；React 合成事件沿 React 树冒泡，
  // 悬停/键盘/滚轮语义不变。
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null)
  useEffect(() => { setRootEl(document.querySelector('.war-root')) }, [])
  const latest = cards[cards.length - 1]!
  const clearTimers = (): void => {
    if (openTimer.current !== null) { window.clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  useEffect(() => clearTimers, [])
  const scheduleOpen = (): void => { clearTimers(); openTimer.current = window.setTimeout(() => { setOpen(true) }, 150) }
  const scheduleClose = (): void => { clearTimers(); closeTimer.current = window.setTimeout(() => { setOpen(false) }, 200) }
  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const el = faceRef.current
      if (el === null) return
      const r = el.getBoundingClientRect()
      setPos({ left: r.left, top: r.top - 6 })
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [open])
  // 舰长定：滚轮从底起步——展开即见贴卡面的最新前代，往上翻才见更老（Mac
  // 下载栈同款直觉；底部=newest 与视觉堆叠方向一致）。依赖含 pos：open 先翻
  // 时 pos 尚 null、面板未挂载，坐标落位后才是真挂载时机。
  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [open, pos])
  useEffect(() => {
    const el = panelRef.current
    if (el === null) return
    const stop = (e: WheelEvent): void => { e.stopPropagation() }
    el.addEventListener('wheel', stop, { passive: true })
    return () => { el.removeEventListener('wheel', stop) }
  }, [open])
  const panelKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const el = panelRef.current
    if (el === null) return
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); faceRef.current?.focus(); return }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const list = [...el.querySelectorAll<HTMLElement>('.war-command-card')]
    const idx = list.findIndex(c => c === document.activeElement)
    if (idx < 0) return
    e.preventDefault()
    // DOM 序=旧在顶新在底（贴卡面）：↑ 向旧代，↓ 向新代（贴近坞上卡面）。
    const next = e.key === 'ArrowUp' ? Math.max(idx - 1, 0) : Math.min(idx + 1, list.length - 1)
    list[next]!.focus()
  }
  return createElement('div', {
    className: `war-cmd-group${open ? ' open' : ''}`, 'data-war-group': rootId,
    onMouseEnter: scheduleOpen, onMouseLeave: scheduleClose,
    onFocusCapture: scheduleOpen,
    onBlurCapture: e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose() },
  },
    // 卡面=最新一代（R1 挂历代状态圆点）；点击/回车=打开该代聚焦页。
    createElement('div', { ref: faceRef, className: 'war-cmd-group-face' }, renderCard(latest, genPips(cards, tasksOf, latest.commandId))),
    open && pos !== null && rootEl !== null
      ? createPortal(createElement('div', {
          className: 'war-group-panel', ref: panelRef, role: 'group',
          'aria-label': activeCopy().commandCard.panelAria(cards.length - 1),
          style: { left: `${pos.left}px`, top: `${pos.top}px`, '--war-panel-rows': String(Math.min(cards.length - 1, 4)) } as CSSProperties,
          onKeyDown: panelKey,
        },
          // 只摆历代（最新代=坞上卡面，不重复）；旧在顶、最新前代在底贴卡面；
          // 包一层挂 --i 层叠入场序（最新前代先起=0，更老依次跟上——下载栈式）。
          ...cards.slice(0, -1).map((c, i) => createElement('div', {
            key: `h-${c.commandId}`,
            className: 'war-group-history',
            style: { '--i': String(cards.length - 2 - i) } as CSSProperties,
          }, renderCard(c, undefined, true))),
        ), rootEl)
      : null,
  )
}

/** 调度条 ✚ 的起草器（V9.2 重设计）：先一句话讲清「你能做什么」，再给两组
 * 选项卡——自主度（放权多少）与发布时机（立即 / cron 定时，到点 tick 自动
 * 下达、一次有效）。档位标记仍拼入命令文本（机制不变）；Ctrl+Enter 提交。
 * 真组件（createElement 挂载）：hooks 各归各实例（#310 教训）。 */
function CommandComposer(props: { onClose: () => void; refresh: () => void; /** V18.8 全板战线（星球→战线融合选择器选项）。 */ fronts?: FrontChoice[]; /** 预选接续（任务回报卡「下续战令」播种：命令 id + 所属星球键）。 */ initialContinueId?: string | null; initialBattlefield?: string | null; /** 星球清单（现存星球，创建序）。 */ battlefields?: Array<{ key: string; name: string }> }): ReactNode {
  const { onClose, refresh, fronts = [], initialContinueId = null, initialBattlefield = null } = props
  const layer = useModalLayer(onClose, activeCopy().composer.title)
  // V10.1 critique P1-3：焦点直落 textarea（此前停在弹窗容器 DIV，多按一次 Tab）。
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { taRef.current?.focus() }, [])
  // V9.5（复评 P2-1）：草稿落 localStorage——误点背板/顺手 Esc 不再焚稿，
  // 重开起草器自动续写；提交成功才清。
  const [text, setText] = useState(() => { try { return localStorage.getItem('warroom-draft') ?? '' } catch { return '' } })
  const [grade, setGrade] = useState<ComposerGrade>('auto')
  const [sched, setSched] = useState<'now' | 'cron'>('now')
  // V18.8 闹钟式定时（元首令：裸 cron 对人不友好）：模式+时刻为源，cron 由
  // buildAlarmCron 派生；「高级」面板直写表达式时打 override（用户明确知道 cron）。
  const [alarm, setAlarm] = useState<AlarmSpec>(() => {
    const t = new Date(Date.now() + 24 * 3600 * 1000)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return { mode: 'once', time: '09:00', date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, dows: [1] }
  })
  const [cronOverride, setCronOverride] = useState<string | null>(null)
  const alarmEdit = (patch: Partial<AlarmSpec>): void => { setAlarm(a => ({ ...a, ...patch })); setCronOverride(null) }
  const cronExpr = cronOverride ?? buildAlarmCron(alarm)
  // V18.8 星球→战线融合选择器（元首令：续接必随前战线的星球）——星球与战线
  // 一个控件：cont 非空时 bfPick 即战线所属星球，结构性排除「续接 A 却选星球 B」。
  const [bfPick, setBfPick] = useState<string | null>(initialBattlefield)
  const [cont, setCont] = useState<string | null>(initialContinueId)
  // V15 战线名（可选；不填=命令原文）。
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bfChoices = props.battlefields ?? []
  const planetFronts = fronts.filter(f => f.bf === bfPick)
  const pickPlanet = (key: string | null): void => { setBfPick(key); setCont(null) }
  const cronErr: string | null = useMemo(() => {
    if (sched !== 'cron' || cronExpr.trim() === '') return null
    try {
      parseCron(cronExpr)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }, [sched, cronExpr])
  // 单次时刻已过去（本地钟）：不拦会滚到明年同日——就地报错更诚实。
  const oncePast: boolean = useMemo(() => {
    if (sched !== 'cron' || cronOverride !== null || alarm.mode !== 'once') return false
    const t = new Date(`${alarm.date}T${alarm.time}:00`)
    return Number.isNaN(t.getTime()) || t.getTime() <= Date.now()
  }, [sched, cronOverride, alarm])
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
    if (busy || text.trim() === '' || cronErr !== null || oncePast) return
    if (sched === 'cron' && cronExpr.trim() === '') return
    setBusy(true)
    setError(null)
    void (async () => {
      const result = await createCommand(applyBattlefieldMarker(applyGradeMarker(text, grade), bfPick), sched === 'cron' ? cronExpr.trim() : undefined, cont ?? undefined, name)
      setBusy(false)
      if (result.ok) {
        try { localStorage.removeItem('warroom-draft') } catch { /* noop */ }
        setText('')
        refresh()
        onClose()
      } else {
        setError(result.error ?? activeCopy().composer.failFallback)
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
        rows: 3,
        autoFocus: true,
        ref: taRef,
        onChange: e => { setText((e.target as HTMLTextAreaElement).value) },
        onKeyDown: e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit() },
      }),
      // V18.8 常用命令模板：贴着输入框——点击即填，填完仍可改（比空着猜格式快）。
      createElement('div', { className: 'war-tpl-row', role: 'group', 'aria-label': copy.templatesLabel },
        createElement('span', { className: 'war-tpl-label' }, copy.templatesLabel),
        copy.templates.map(t => createElement('button', {
          key: t.label, type: 'button', className: 'war-tpl', title: t.text, 'data-war-tpl': t.label,
          onClick: () => { setText(t.text) },
        }, t.label)),
      ),
      // 星球→战线两级一体：先选星球（参谋定/现存星球），选中才展开战线行。
      createElement('div', { className: 'war-cp-section' }, copy.planetSection),
      createElement('div', { className: 'war-continue-row' },
        createElement('button', {
          key: 'planet-auto', type: 'button',
          className: `war-continue-chip${bfPick === null ? ' on' : ''}`,
          title: copy.planetAutoHint,
          'data-war-bf-auto': 'true',
          onClick: () => { pickPlanet(null) },
        }, copy.planetAuto),
        ...bfChoices.map(b => createElement('button', {
          key: b.key, type: 'button',
          className: `war-continue-chip${bfPick === b.key ? ' on' : ''}`,
          title: b.key,
          'data-war-bf': b.key,
          onClick: () => { pickPlanet(bfPick === b.key ? null : b.key) },
        }, b.name)),
      ),
      bfPick !== null
        ? createElement('div', { key: 'front-block' },
          createElement('div', { className: 'war-front-sub' }, copy.frontSub),
          createElement('div', { className: 'war-continue-row' },
            createElement('button', {
              key: 'front-new', type: 'button',
              className: `war-continue-chip${cont === null ? ' on' : ''}`,
              title: copy.frontNewHint,
              'data-war-front-new': 'true',
              onClick: () => { setCont(null) },
            }, copy.frontNew),
            ...planetFronts.map(f => createElement('button', {
              key: f.rootCommandId, type: 'button',
              className: `war-continue-chip war-chain-hue-${f.hueSlot}${cont !== null && f.members.includes(cont) ? ' on' : ''}${f.live ? ' war-front-live' : ''}`,
              title: `${f.label} · ${activeCopy().front.genN(f.gens)}${f.live ? `（${activeCopy().dispatch.segActive}）` : `（${activeCopy().dispatch.segSettled}）`}`,
              'data-war-front-pick': f.contId,
              onClick: () => { setBfPick(f.bf); setCont(f.contId) },
            }, `${f.label.slice(0, 12)}${f.label.length > 12 ? '…' : ''}${f.gens > 1 ? ` ${activeCopy().front.genN(f.gens)}` : ''}${f.live ? copy.frontLiveSuffix : ''}`)),
          ),
          planetFronts.length === 0 ? createElement('div', { className: 'war-cp-note' }, copy.frontEmpty) : null,
        )
        : null,
      createElement('div', { className: 'war-cp-section' }, copy.nameSection),
      createElement('input', {
        className: 'war-name-input', type: 'text', value: name, maxLength: 24,
        placeholder: copy.namePlaceholder, 'aria-label': copy.nameSection,
        onChange: e => { setName((e.target as HTMLInputElement).value) },
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
        ? createElement('div', { className: 'war-alarm-block' },
          createElement('div', { className: 'war-alarm-row' },
            copy.alarmModes.map(m => createElement('button', {
              key: m.id, type: 'button',
              className: `war-continue-chip war-alarm-mode${alarm.mode === m.id && cronOverride === null ? ' on' : ''}`,
              title: m.hint,
              'data-war-alarm': m.id,
              onClick: () => { alarmEdit({ mode: m.id }) },
            }, m.name)),
          ),
          createElement('div', { className: 'war-alarm-row' },
            ...(alarm.mode === 'once' ? [createElement('input', {
              key: 'd', className: 'war-alarm-date', type: 'date', value: alarm.date,
              'aria-label': copy.alarmDateLabel,
              onChange: e => { alarmEdit({ date: (e.target as HTMLInputElement).value }) },
            })] : []),
            createElement('input', {
              key: 't', className: 'war-alarm-time', type: 'time', value: alarm.time,
              'aria-label': copy.alarmTimeLabel,
              onChange: e => { alarmEdit({ time: (e.target as HTMLInputElement).value }) },
            }),
            ...(alarm.mode === 'weekly' ? [createElement('div', { key: 'dows', className: 'war-dow-row', role: 'group', 'aria-label': copy.alarmTimeLabel },
              copy.dowNames.map((n, i) => createElement('button', {
                key: n, type: 'button',
                className: `war-continue-chip war-dow${alarm.dows.includes(i + 1) ? ' on' : ''}`,
                'aria-pressed': alarm.dows.includes(i + 1),
                onClick: () => { alarmEdit({ dows: alarm.dows.includes(i + 1) ? alarm.dows.filter(d => d !== i + 1) : [...alarm.dows, i + 1] }) },
              }, n)),
            )] : []),
          ),
          oncePast ? createElement('div', { className: 'war-err' }, copy.pastTime) : null,
          cronErr !== null ? createElement('div', { className: 'war-err' }, copy.cronError(cronErr)) : null,
          nextPreview !== null ? createElement('div', { className: 'war-cron-next' }, copy.nextRun(nextPreview)) : null,
          createElement('details', { className: 'war-cron-adv' },
            createElement('summary', null, copy.alarmAdvanced),
            createElement('input', {
              className: 'war-cron-input',
              type: 'text',
              value: cronExpr,
              placeholder: copy.cronPlaceholder,
              'aria-label': copy.cronLabel,
              onChange: e => { setCronOverride((e.target as HTMLInputElement).value) },
            }),
          ),
        )
        : null,
      error !== null ? createElement('div', { className: 'war-err' }, error) : null,
      createElement('div', { className: 'war-modal-actions' },
        createElement('button', { className: 'war-btn', onClick: onClose }, copy.cancel),
        createElement('button', {
          className: 'war-btn primary',
          disabled: busy || text.trim() === '' || cronErr !== null || oncePast || (sched === 'cron' && cronExpr.trim() === ''),
          onClick: submit,
        }, busy ? copy.busy : sched === 'cron' ? copy.submitScheduled : copy.submit),
      ),
      createElement('div', { className: 'war-cp-kbd' }, copy.kbdHint),
    ),
  )
}

/** V17 归档行：终局闸 + 原地二次确认（不可逆警示前置）——无新弹窗层。 */
function ArchiveRow(props: { chain: BoardTask[]; cmd: BoardCommand; onArchive: () => void }): ReactNode {
  const { chain, cmd, onArchive } = props
  const ac = activeCopy().archive
  // 链全终局闸：cancelled 直接过；否则链非空且每环 closed/failed。
  // approved 未发布（链空）不算——任务还没落地，不存在「归档历史」。
  const terminal = cmd.status === 'cancelled' || (chain.length > 0 && chain.every(t => t.status === 'closed' || t.status === 'failed'))
  const [confirming, setConfirming] = useState(false)
  if (cmd.archived !== undefined && cmd.archived !== null) {
    return createElement('div', { className: 'war-archive-row' },
      createElement('span', { className: 'war-chip st-closed' }, ac.badge),
      createElement('span', { className: 'war-archive-when', title: cmd.archived.sessions.join('、') }, `${activeCopy().front.stateSettled} · ${relTime(cmd.archived.at)}`),
    )
  }
  if (!terminal) {
    // V18 critique：gate 理由从 title 提升为可见副行（键盘/SR 用户拿不到 title）。
    return createElement('div', { className: 'war-archive-row' },
      createElement('button', {
        className: 'war-btn war-archive-btn', type: 'button', disabled: true,
        title: ac.gate,
      }, ac.button),
      createElement('span', { className: 'war-archive-gate' }, ac.gate),
    )
  }
  if (!confirming) {
    return createElement('div', { className: 'war-archive-row' },
      createElement('button', {
        className: 'war-btn war-archive-btn', type: 'button',
        title: ac.irreversible,
        onClick: () => { setConfirming(true) },
      }, ac.button),
    )
  }
  return createElement('div', { className: 'war-archive-confirm' },
    createElement('span', { className: 'war-archive-warn' }, `${ac.confirmTitle} ${ac.irreversible}`),
    createElement('span', { className: 'war-cd-band-actions' },
      // V18 critique：不可逆动作的确认键走红语义（--war-fail=终局既成语言），
      // 不再穿 primary 蓝「常规操作」的视觉语法。
      createElement('button', { className: 'war-btn war-btn-danger', onClick: () => { setConfirming(false); onArchive() } }, ac.confirmOk),
      createElement('button', { className: 'war-btn', onClick: () => { setConfirming(false) } }, ac.cancel),
    ),
  )
}

/** V19 战报可读性回流（stardeck 铺面轮）：md-lite 渲染薄壳——标题/列点/代码/
 *  引用结构化，路径 token 链化到板内预览（命令级面无任务工作区——onOpenFile
 *  缺席时路径只给代码样式不链化）。解析本体在 report-face.ts（纯函数）。 */
function reportBody(text: string, onOpenFile?: (name: string) => void): ReactNode {
  const pathNode = (v: string, key: string): ReactNode =>
    onOpenFile !== undefined
      ? createElement('button', { key, className: 'war-md-path', type: 'button', title: activeCopy().focusPage.lootFileTitle, onClick: () => { onOpenFile(v) } }, v)
      : createElement('code', { key }, v)
  const inline = (s: string, keyBase: string): ReactNode[] => splitInline(s).map((t, i) => {
    const key = `${keyBase}-${i}`
    if (t.t === 'code') return looksLikeFilePath(t.v) ? pathNode(t.v, key) : createElement('code', { key }, t.v)
    if (t.t === 'bold') return createElement('strong', { key }, t.v)
    if (t.t === 'path') return pathNode(t.v, key)
    return t.v
  })
  return createElement('div', { className: 'war-md' },
    ...parseMd(text).map((b, i) => {
      const key = `b-${i}`
      switch (b.kind) {
        case 'h': return createElement('div', { key, className: `war-md-h war-md-h${b.level}` }, ...inline(b.text, key))
        case 'p': return createElement('p', { key, className: 'war-md-p' }, ...inline(b.text, key))
        case 'ul': return createElement('ul', { key, className: 'war-md-ul' }, ...b.items.map((it, j) => createElement('li', { key: `${key}-${j}` }, ...inline(it, `${key}-${j}`))))
        case 'ol': return createElement('ol', { key, className: 'war-md-ol' }, ...b.items.map((it, j) => createElement('li', { key: `${key}-${j}` }, ...inline(it, `${key}-${j}`))))
        case 'code': return createElement('pre', { key, className: 'war-md-code' }, b.text)
        case 'quote': return createElement('blockquote', { key, className: 'war-md-quote' }, ...inline(b.text, key))
      }
    }),
  )
}

/** V19 腿2 产物板内预览弹窗：只读调 workspace/file 端点（war_root 限界在服务侧），
 *  md 产物走 reportBody 渲染、其余文本 pre 直出、二进制给指路文案；
 *  「打开所在文件夹」走 reveal 端点（本机资源管理器，账本零改动）。 */
function ArtifactPreviewModal(props: { ws: string; name: string; onClose: () => void }): ReactNode {
  const { ws, name, onClose } = props
  const fp = activeCopy().focusPage
  const title = fp.previewTitle(name)
  const layer = useModalLayer(onClose, title)
  const [state, setState] = useState<{ phase: 'busy' } | { phase: 'err'; msg: string } | { phase: 'binary' } | { phase: 'empty' } | { phase: 'ok'; content: string }>({ phase: 'busy' })
  const [revealNote, setRevealNote] = useState('')
  useEffect(() => {
    setState({ phase: 'busy' })
    fetch(`/warroom/api/workspace/file?ws=${encodeURIComponent(ws)}&name=${encodeURIComponent(name)}`)
      .then(async r => (await r.json()) as { ok?: boolean; error?: string; binary?: boolean; content?: string })
      .then(out => {
        if (out.ok !== true) setState({ phase: 'err', msg: out.error ?? 'unknown' })
        else if (out.binary === true) setState({ phase: 'binary' })
        else if ((out.content ?? '') === '') setState({ phase: 'empty' })
        else setState({ phase: 'ok', content: out.content! })
      })
      .catch(() => setState({ phase: 'err', msg: 'fetch failed' }))
  }, [ws, name])
  const reveal = (): void => {
    fetch('/warroom/api/workspace/reveal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ws, name }) })
      .then(async r => (await r.json()) as { ok?: boolean })
      .then(out => { setRevealNote(out.ok === true ? fp.previewOpenDone : fp.previewOpenFail) })
      .catch(() => { setRevealNote(fp.previewOpenFail) })
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal war-preview-modal', role: 'dialog', 'aria-label': title, onClick: e => e.stopPropagation(), ref: layer.ref, ...layer.props },
      createElement('div', { className: 'war-preview-head' },
        createElement('div', { className: 'war-modal-title' }, title),
        createElement('button', { type: 'button', className: 'war-btn', onClick: reveal }, fp.previewOpen),
        createElement('button', { type: 'button', className: 'war-hq-picker-x', 'aria-label': activeCopy().settings.close, autoFocus: true, onClick: onClose }, '✕'),
      ),
      revealNote !== '' ? createElement('p', { className: 'war-hq-picker-hint', role: 'status' }, revealNote) : null,
      createElement('div', { className: 'war-preview-body', 'data-war-preview': name },
        state.phase === 'busy' ? createElement('p', { className: 'war-hq-picker-hint' }, '…')
        : state.phase === 'err' ? createElement('p', { className: 'war-hq-picker-err' }, `${fp.previewFail}${state.msg}`)
        : state.phase === 'binary' ? createElement('p', { className: 'war-hq-picker-hint' }, fp.previewBinary)
        : state.phase === 'empty' ? createElement('p', { className: 'war-hq-picker-hint' }, fp.previewEmpty)
        : /\.(md|markdown)$/i.test(name) ? reportBody(state.content)
        : createElement('pre', { className: 'war-md-code' }, state.content),
      ),
    ),
  )
}

/** V9.9 聚焦页（舰长定案）：主界面是所有卡片的全生命周期监控版；这里是一条
 * 命令的全生命周期聚焦导览——把主界面的卡片拉进这个窗口。四段各放真实在场
 * 的卡（①命令卡 / ②任务卡按链全列 / ③执行卡=仅进行中的会话 / ④任务回报卡），
 * 点卡在卡下原地展开子详情（命令→下达配置；任务→最终计划原文，计划中给进
 * 任务会话钮；任务回报→收官结论原文），执行卡点击直接跳原生会话窗口。底部两颗
 * 会话跳钮（任务会话=大副计划会话 / 执行会话=外勤小队实施会话）代替旧 footer
 * 全部按钮，未形成给禁用占位。顶部标题与「等你定夺」决策带沿用 V9.8；阶段
 * 导航只反映真实在场的卡片——没卡的阶段给灰提示行，不预告未发生的事。 */
function FocusPage(props: { cmd: BoardCommand; chain: BoardTask[]; statuses: Map<string, BoardTask['status']>; hqSessionId: string | null; services: ClientServicesFace; focusSegment: 'plan' | 'chain' | 'report' | null; onClose: () => void; onRegrade: (grade: 'L0' | 'L1' | 'L2') => void; onDecidePlan: (decision: 'approve' | 'reject') => void; onReportSeen: () => void; onJumpMiss: () => void; /** V10 战线族谱：同根全体按代序；多代才显形。 */ chainMembers: BoardCommand[]; /** 族谱跨代跳转（父层换 detailCommandId）。 */ onOpenCommand?: (commandId: string) => void; /** V10 续接入口：报告段「下续战令」——父层开起草器并预选本命令。 */ onContinue?: () => void; /** V14 溯源：本战线续接自源战线的哪条战线（锚链代>1 才有）。 */ origin?: WarFront['origin']; /** V17 归档：账面痕迹由 cmd 携带；动作（父层管扇出/刷新/切页签）。 */ onArchive?: () => void }): ReactNode {
  const { cmd, chain, statuses, hqSessionId, services, focusSegment, onClose, onRegrade, onDecidePlan, onReportSeen, onJumpMiss, chainMembers, onOpenCommand, onContinue, origin, onArchive } = props
  const layer = useModalLayer(onClose, activeCopy().focusPage.layerAria(`${displayTitleOf(cmd.text).slice(0, 24)}${cmd.text.length > 24 ? '…' : ''}`))
  // 卡下原地展开的子详情（同卡再点收起；换卡即切换）：命令配置 / 某任务卡下的
  // 计划+任务书（空链 ghost 卡用 '' 占位 taskId）/ 任务回报结论。
  const [open, setOpen] = useState<{ kind: 'config' } | { kind: 'plan'; taskId: string } | { kind: 'report' } | null>(null)
  // V19 腿2：产物板内预览（ws+相对路径 → ArtifactPreviewModal）。
  const [preview, setPreview] = useState<{ ws: string; name: string } | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // 分段直达：打开即滚到需要舰长定夺的环节（plan/chain→任务段，report→任务回报段）。
  useEffect(() => {
    if (focusSegment === null) return
    const stage = focusSegment === 'report' ? 'report' : 'task'
    document.querySelector(`.war-modal .war-cd-stage[data-stage='${stage}']`)?.scrollIntoView({ block: 'center' })
  }, [focusSegment])
  // V9.11 任务回报已阅（舰长定）→ V9.12 收紧为三条正经通道：①分段直达任务回报段＝看过
  // ②任务回报卡点开展开详情＝看过 ③自行滚到任务回报段 ≥60% 可见且停留 ≥800ms＝看过
  // ——生命条任务回报段由呼吸转绿。标记走 localStorage（seen 晚于最近定论才作数），
  // onReportSeen 让调度条立即重渲染。
  useEffect(() => {
    if (focusSegment === 'report') {
      markReportSeen(cmd.commandId)
      onReportSeen()
    }
  }, [focusSegment, cmd.commandId])
  useEffect(() => {
    const stage = document.querySelector(`.war-modal .war-cd-stage[data-stage='report']`)
    if (stage === null || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    const io = new IntersectionObserver(entries => {
      const visible = entries.some(en => en.isIntersecting && en.intersectionRatio >= 0.6)
      if (visible) {
        if (timer === null) {
          timer = setTimeout(() => {
            markReportSeen(cmd.commandId)
            onReportSeen()
            io.disconnect()
          }, 800)
        }
      } else if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }, { threshold: [0, 0.6, 1] })
    io.observe(stage)
    return () => {
      if (timer !== null) clearTimeout(timer)
      io.disconnect()
    }
  }, [cmd.commandId])
  // 滚动高亮随 V9.10 导航钮一起休眠：四段本身不长，滚动即读，无需段落指示。
  const GRADE_LABEL = activeCopy().grade
  const copy = activeCopy().commandDetail
  const fp = activeCopy().focusPage
  const detailCopy = activeCopy().detail
  const band = activeCopy().commandBand
  const life = lifecycleOf(cmd, chain)
  const closed = chain.filter(t => t.status === 'closed').length
  // 最新任务回报：链上任一环的最新一条汇报（各环取末条，再按时间取最新）。
  const lastReport = chain
    .flatMap(t => (t.reports.length > 0 ? [{ r: t.reports[t.reports.length - 1]!, t }] : []))
    .sort((a, b) => (a.r.ts < b.r.ts ? 1 : -1))[0]
  const verdictTask = chain.find(t => t.closedVerdict !== null)
  const execSessions = chain
    .flatMap(t => (t.attemptLog ?? []).map(a => ({ t, a })))
    .sort((x, y) => (x.a.startedAt < y.a.startedAt ? 1 : -1))
  // 执行段只认「正在进行」的尝试（outcome===null）；任务回报卡的宿主=最新任务回报所在
  // 环（无任务回报退到有收官判定的一环），取其末次尝试还原成主界面会话卡。
  const liveAttempts = execSessions.filter(({ a }) => a.outcome === null)
  const reportHost = lastReport?.t ?? verdictTask
  const reportEntry = reportHost !== undefined && (reportHost.attemptLog ?? []).length > 0
    ? { t: reportHost, a: reportHost.attemptLog[reportHost.attemptLog.length - 1]! }
    : null
  // 底部两颗会话跳钮的目标：任务会话=大副计划会话（无则 hq 兜底）；执行会话=
  // 进行中的那次尝试，无进行中退到最近一次尝试。
  const staffTarget = cmd.staffSessionId ?? hqSessionId
  // 跳原生会话 = 离开聚焦页：宿主切走会话，弹窗同时收起（不留在头顶挡路）。
  const jumpSession = (sessionId: string | null): void => {
    if (sessionId === null) return
    // V9.12 ⑥ 跳转无操作反馈：宿主目录只收「成为过当前」的会话——冷/道具会话
    // open 后 current 不切（静默落空）。300ms 后 current 未变且不是目标 → 冒泡
    // 警示（onJumpMiss 走 WarView 的 actionError 通道——本页 onClose 即卸载，
    // 提示必须活在板级）。
    const before = services.sessions?.list?.getSnapshot().current
    try {
      services.sessions?.open(sessionId)
    } catch {
      // V15.1：目录外会话（宿主 summaries 没有它）select 直接抛 unknown——
      // 不接住就是控制台一声闷响 + UI 无动作；接住走与落空同一警示通道。
      onJumpMiss()
      return
    }
    onClose()
    if (services.sessions?.list !== undefined) {
      setTimeout(() => {
        const cur = services.sessions?.list?.getSnapshot().current
        if (cur !== sessionId && cur === before) onJumpMiss()
      }, 300)
    }
  }
  const execTarget = liveAttempts[0]?.a.sessionId ?? execSessions[0]?.a.sessionId ?? null
  const failedChain = chain.some(t => t.status === 'failed')
  const scheduled = cmd.schedule !== null && cmd.schedule.dispatchedAt === null
  // V9.10 任务段状态机（空链时的卡片/提示分岔，舰长定案）——变体判定与主界面
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
  // V9.10 段头去编号（①②③④随导航钮休眠）：静态「阶段名+结论」，不跳转。
  const stageHead = (key: 'command' | 'task' | 'battle' | 'report', conclusion: string): ReactNode =>
    createElement('div', { className: 'war-cd-stage-head' },
      createElement('span', { className: 'war-cd-stage-name' }, stages[key]),
      createElement('span', { className: 'war-cd-stage-conc' }, conclusion),
    )
  // 子详情行（配置/计划/任务回报共用的「标签: 值」行，值可长文换行）。
  const subRow = (label: string, value: ReactNode): ReactNode =>
    createElement('div', { className: 'war-sub-row' },
      createElement('span', { className: 'war-sub-label' }, label),
      createElement('div', { className: 'war-sub-value' }, value),
    )
  const subActions = (children: ReactNode[]): ReactNode =>
    createElement('div', { className: 'war-modal-actions' }, ...children)
  // 空链 ghost 卡的展开（V9.10 按命令状态分岔）：计划（待批=原文+顺手批驳+进
  // 任务会话）/ 等你答问（进入对话回答=markTalking+跳）/ 已接令（分诊结果+进
  // 任务会话）——任务成形的车间就是大副会话，操作落在读到的位置。
  const ghostPanel = (key?: string): ReactNode => {
    if (ghostVariant === 'plan') {
      const pending = cmd.plan?.status === 'pending'
      return createElement('div', { key, className: 'war-subdetail' },
        createElement('div', { className: 'war-subdetail-title' }, `${fp.planTitle}（${copy.planTitle[(cmd.plan as { status: 'pending' | 'approved' | 'rejected' }).status]}）`),
        pending ? createElement('div', { className: 'war-sub-value' }, fp.planPending) : null,
        createElement('div', { className: 'war-sub-value war-plan-body' }, reportBody((cmd.plan as { text: string }).text)),
        pending
          ? subActions([
            createElement('button', { key: 'ap', className: 'war-btn primary', title: copy.planIrreversible, onClick: () => { onDecidePlan('approve') } }, copy.approvePlan),
            createElement('button', { key: 'rj', className: 'war-btn', onClick: () => { onDecidePlan('reject') } }, copy.rejectPlan),
            staffTarget !== null
              ? createElement('button', { key: 'in', className: 'war-btn', onClick: () => { jumpSession(staffTarget) } }, fp.planEnterSession)
              : null,
          ])
          : null,
        pending ? createElement('div', { className: 'war-cp-note' }, copy.planIrreversible) : null,
      )
    }
    if (ghostVariant === 'talking') {
      return createElement('div', { key, className: 'war-subdetail' },
        createElement('div', { className: 'war-subdetail-title' }, fp.talkingGhostTitle),
        createElement('div', { className: 'war-sub-value' }, fp.talkingGhostNote),
        staffTarget !== null
          ? subActions([createElement('button', {
              className: 'war-btn primary war-btn-warn',
              onClick: () => { void markTalking(cmd.commandId); jumpSession(staffTarget) },
            }, fp.talkingEnterBtn)])
          : null,
      )
    }
    return createElement('div', { key, className: 'war-subdetail' },
      createElement('div', { className: 'war-subdetail-title' }, fp.draftingGhostTitle),
      subRow(fp.triageLabel, cmd.grade !== null
        ? `${GRADE_LABEL[cmd.grade]}${GRADE_MARKER[cmd.grade]}${cmd.gradeConfidence !== null ? activeCopy().commandDetail.confidenceSuffix(Math.round(cmd.gradeConfidence * 100)) : ''}`
        : fp.triagePending),
      cmd.gradeReason !== null ? subRow(copy.gradeReasonPrefix, cmd.gradeReason) : null,
      staffTarget !== null
        ? subActions([createElement('button', { className: 'war-btn primary', onClick: () => { jumpSession(staffTarget) } }, fp.planEnterSession)])
        : null,
    )
  }
  // 链上任务卡的展开（V9.10 补全）：命令级最终计划（若有）+ 该环任务书 + 验收
  // 标准；reported/failed 环给「去验收/去下重试令」直达大副会话（与主界面任务卡同动作）。
  const taskPanel = (t: BoardTask, key?: string): ReactNode => {
    // V19 铺面回流：任务级两位点（计划/任务书）路径链化到该任务工作区的板内预览。
    const taskFileLink = t.workspacePath !== null && t.workspacePath !== ''
      ? (n: string): void => { setPreview({ ws: t.workspacePath!, name: n }) }
      : undefined
    return createElement('div', { key, className: 'war-subdetail' },
    cmd.plan !== null
      ? createElement('div', { className: 'war-subdetail-title' }, `${fp.planTitle}（${copy.planTitle[cmd.plan.status]}）`)
      : null,
    cmd.plan !== null
      ? createElement('div', { className: 'war-sub-value war-plan-body' }, reportBody(cmd.plan.text, taskFileLink))
      : null,
    subRow(fp.taskBrief, t.brief !== '' ? reportBody(t.brief, taskFileLink) : fp.briefMissing),
    subRow(fp.taskAcceptance, t.acceptance !== '' ? t.acceptance : fp.acceptanceMissing),
    (t.status === 'reported' || t.status === 'failed') && staffTarget !== null
      ? subActions([createElement('button', {
          className: 'war-btn primary',
          title: t.status === 'failed' ? activeCopy().taskCard.handleRetryTitle : activeCopy().taskCard.handleReviewTitle,
          onClick: () => { jumpSession(staffTarget) },
        }, t.status === 'failed' ? activeCopy().taskCard.handleRetry : activeCopy().taskCard.handleReview)])
      : null,
    )
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal wide war-cd-modal', onClick: e => e.stopPropagation(), ref: layer.ref, ...layer.props },
      // V9.9：footer 收编为两颗会话跳钮，窗口关闭走右上 ✕（+Esc+点背板）。
      createElement('button', { className: 'war-cd-x', type: 'button', 'aria-label': copy.close, title: copy.close, onClick: onClose }, '✕'),
      createElement('div', { className: 'war-modal-title war-cd-title', title: cmd.text }, `「${displayTitleOf(cmd.text).slice(0, 42)}${displayTitleOf(cmd.text).length > 42 ? '…' : ''}」`),
      createElement('div', { className: 'war-modal-sub' }, `${relTime(cmd.createdAt)} · ${cmd.commandId} · ${commandStatus(cmd.status).label}${cmd.grade !== null ? ` · ${GRADE_LABEL[cmd.grade]}${cmd.regrades > 0 ? copy.regradesNote(cmd.regrades) : ''}` : ''}${cmd.continuation !== null ? ` · ${activeCopy().chain.tags[cmd.continuation.mode]}` : ''}`),
      // V14 战线族谱（本地计代）：本战线 Ⅰ→…→本代逐级可跳；跨星球溯源收缩为
      // 一枚「续接自」chip（链的痕迹不占概念，点它回源战线）。
      chainMembers.length > 1 || origin !== undefined && origin !== null
        ? createElement('div', { className: 'war-cd-chain', role: 'list', 'aria-label': activeCopy().chain.breadcrumbAria, 'data-war-chain-length': String(chainMembers.length) },
          origin !== undefined && origin !== null
            ? createElement('button', {
              key: 'origin', type: 'button', className: 'war-cd-origin', title: origin.title,
              onClick: () => onOpenCommand?.(origin.commandId),
            }, activeCopy().front.originChip(origin.battlefield === null ? null : bfNameOf(origin.battlefield), displayTitleOf(origin.title).slice(0, 14)))
            : null,
          ...chainMembers.map((m, mi) =>
            createElement('button', {
              key: m.commandId,
              type: 'button',
              role: 'listitem',
              className: `war-cd-chain-item war-chain-hue-${chainHueOf(m)}${m.commandId === cmd.commandId ? ' now' : ''}`,
              title: m.text,
              onClick: () => { if (m.commandId !== cmd.commandId) onOpenCommand?.(m.commandId) },
            }, `${GEN_ROMAN[mi + 1] ?? `第${mi + 1}代`} ${displayTitleOf(m.text).slice(0, 14)}${displayTitleOf(m.text).length > 14 ? '…' : ''}`)))
        : null,
      cmd.cancelledReason !== null ? createElement('div', { className: 'war-fail' }, copy.cancelledReason(cmd.cancelledReason)) : null,
      // V17 归档行：链全终局才可点；点击原地展开确认条（不可逆警示前置）。
      cmd.archived !== undefined && cmd.archived !== null
        ? createElement('div', { className: 'war-archive-row' },
            createElement('span', { className: 'war-chip st-closed' }, activeCopy().archive.badge),
            createElement('span', { className: 'war-archive-when', title: cmd.archived.sessions.join('、') }, `${activeCopy().front.stateSettled} · ${relTime(cmd.archived.at)}`),
          )
        : null,
      // V18 critique P3：归档行（不可逆件）从决策带上方移到带下方——起草中的
      // 命令标题下第一个交互件不该是 disabled 的「归档此命令」。
      // 决策带（置顶常驻）：有事给动作，无事给安神行。
      createElement('div', { className: `war-cd-band${actionKind === null ? ' quiet' : ''}`, role: actionKind === null ? undefined : 'region', 'aria-label': actionKind === null ? undefined : band.title },
        actionKind === 'plan'
          ? createElement('div', { className: 'war-cd-band-in' },
            createElement('span', { className: 'war-cd-band-tag' }, `⚠ ${band.title}`),
            createElement('span', { className: 'war-cd-band-hint' }, band.planHint),
            // V19 铺面回流：批计划的依据就地可读——计划原文随决策带常驻（限高
            // 可展开；命令级面无任务工作区——路径不链化）。
            cmd.plan !== null ? createElement('details', { className: 'war-cd-band-plan' },
              createElement('summary', null, band.planPeek),
              createElement('div', { className: 'war-plan-body' }, reportBody((cmd.plan as { text: string }).text)),
            ) : null,
            createElement('span', { className: 'war-cd-band-actions' },
              createElement('button', { className: 'war-btn primary', title: copy.planIrreversible, onClick: () => onDecidePlan('approve') }, copy.approvePlan),
              createElement('button', { className: 'war-btn', onClick: () => onDecidePlan('reject') }, copy.rejectPlan),
            ),
          )
          : actionKind === 'clarify'
            ? createElement('div', { className: 'war-cd-band-in' },
              createElement('span', { className: 'war-cd-band-tag' }, `⚠ ${band.title}`),
              createElement('span', { className: 'war-cd-band-hint' }, band.clarifyHint),
              createElement('span', { className: 'war-cd-band-actions' },
                createElement('button', { className: 'war-btn primary', onClick: () => { void markTalking(cmd.commandId); jumpSession(cmd.staffSessionId) } }, band.clarifyBtn),
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
                  : (() => {
                    // V18 critique A2-P1：终局命令的安神带不得说「自动推进中」——
                    // 读投影零歧义：cancelled=已取消终局，settled=已收官；quiet 只留
                    // 给真正在途的命令。
                    const settledChain = chain.length > 0 && chain.every(t => t.status === 'closed' || t.status === 'failed')
                    if (cmd.status === 'cancelled') {
                      return createElement('div', { className: 'war-cd-band-in' },
                        createElement('span', { className: 'war-cd-band-tag war-cd-band-err' }, '✕'),
                        createElement('span', { className: 'war-cd-band-hint war-fail' }, band.terminalCancelled),
                      )
                    }
                    if (settledChain) {
                      return createElement('div', { className: 'war-cd-band-in' },
                        createElement('span', { className: 'war-cd-band-tag war-cd-band-done' }, '✓'),
                        createElement('span', { className: 'war-cd-band-hint' }, band.terminalSettled),
                      )
                    }
                    return createElement('div', { className: 'war-cd-band-in' },
                      createElement('span', { className: 'war-cd-band-tag' }, '✓'),
                      createElement('span', { className: 'war-cd-band-hint' }, band.quiet),
                    )
                  })(),
      ),
      cmd.archived === undefined || cmd.archived === null
        ? (chain.length > 0 || cmd.status === 'cancelled'
          ? createElement(ArchiveRow, { chain, cmd, onArchive: () => { onArchive?.() } })
          : null)  // A2：起草中（链空）与归档无关——不渲染永久灰闸
        : null,
      createElement('div', { className: 'war-detail-body war-cd-body', ref: bodyRef },
        // ① 命令 · 你说了什么：主界面命令卡原样拉进来，点卡展开「下达配置」
        // （V9.10 配置即改档之家——看当时怎么配的，顺手改档）。
        createElement('section', { className: 'war-cd-stage', 'data-stage': 'command' },
          stageHead('command', cmd.grade !== null ? GRADE_LABEL[cmd.grade] : band.noGrade),
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
        // 「最终计划+该环任务书+验收标准」（reported/failed 环带处理动作）；空链
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
              ...liveAttempts.map(({ t, a }) => SessionCard(t, a, (_t, a2) => { jumpSession(a2.sessionId) }, NO_TRACE)))
            : createElement('div', { className: 'war-tour-hint' }, execSessions.length > 0 ? fp.battleDone : fp.battleNone),
        ),
        // ④ 任务回报 · 结果如何：任务回报卡（最新任务回报宿主环的末次会话卡）点开看收官
        // 结论原文 + 最新任务回报 + 证据折叠；无任务回报只给提示行（段头不重复）。
        createElement('section', { className: 'war-cd-stage war-cd-report', 'data-stage': 'report' },
          reportEntry !== null
            ? stageHead('report', verdictTask !== undefined && verdictTask.closedVerdict !== null
              ? `${verdictTask.closedVerdict.slice(0, 24)}${verdictTask.closedVerdict.length > 24 ? '…' : ''}`
              : lastReport !== undefined ? relTime(lastReport.r.ts) : '')
            : stageHead('report', ''),
          reportEntry !== null
            ? createElement('div', { className: 'war-tour-cards' },
              SessionCard(reportEntry.t, reportEntry.a, () => {
                // 点开展开＝正经看过任务回报（V9.12 seen 三通道之二）；再点收起不清标记。
                if (open === null || open.kind !== 'report') {
                  markReportSeen(cmd.commandId)
                  onReportSeen()
                }
                setOpen(o => o !== null && o.kind === 'report' ? null : { kind: 'report' })
              }, NO_TRACE),
              open !== null && open.kind === 'report'
                ? createElement('div', { className: 'war-subdetail' },
                  verdictTask !== undefined && verdictTask.closedVerdict !== null ? subRow(fp.reportVerdict, verdictTask.closedVerdict) : null,
                  lastReport !== undefined ? subRow(fp.reportLatest, createElement('span', null,
                    createElement('span', { className: 'war-report-time' }, detailCopy.reportPrefix(relTime(lastReport.r.ts))),
                    reportBody(lastReport.r.text, reportHost !== undefined && reportHost.workspacePath ? ((n) => { setPreview({ ws: reportHost.workspacePath!, name: n }) }) : undefined),
                  )) : null,
                  evSummary !== null && lastReport?.r.evidence !== null && lastReport?.r.evidence !== undefined ? Fold(evSummary, [EvidenceBlock(lastReport.r.evidence!)]) : null,
                  // V9.10 收获三件：任务产出/交付物 + 历次执行会话（逐次可跳）+ 待定夺动作
                  // （V9.12 正名：reported 链→去验收 / 败链→去下重试令，都落大副会话）。
                  reportHost !== undefined && reportHost.deliverables.length > 0
                    ? subRow(fp.lootLabel, createElement('span', { className: 'war-loot' },
                      reportHost.deliverables.flatMap((d, i) => {
                        const chips: ReactNode[] = [createElement('span', { key: `${d.ts}-${i}`, className: `war-loot-item ${d.kind}`, title: d.detail ?? '' }, d.summary)]
                        // V19 腿2：files 交付物逐文件=可点 chip→板内预览（summary 留标签）。
                        if (d.kind === 'files' && (d.detail ?? '') !== '' && reportHost.workspacePath) {
                          for (const p of d.detail!.split(/,\s*/).filter(x => x.trim() !== '')) {
                            chips.push(createElement('button', {
                              key: `${d.ts}-${i}-${p}`, type: 'button', className: `war-loot-item ${d.kind} war-loot-file`,
                              title: fp.lootFileTitle, onClick: () => { setPreview({ ws: reportHost.workspacePath!, name: p }) },
                            }, p))
                          }
                        }
                        return chips
                      })))
                    : null,
                  execSessions.length > 0
                    ? subRow(fp.attemptsSection, createElement('span', { className: 'war-sub-attempts' },
                      execSessions.map(({ t, a }) => createElement('button', {
                        key: a.id, className: 'war-cd-session', type: 'button', title: a.sessionId,
                        onClick: () => { jumpSession(a.sessionId) },
                      },
                      createElement('span', { className: `war-chip ${(a.outcome ?? 'live') === 'live' ? 'st-in_progress' : a.outcome === 'failed' ? 'oc-fail' : a.outcome === 'reported' ? 'oc-reported' : 'oc-done'}` }, outcomeLabel(a.outcome ?? 'live').label),
                      createElement('span', { className: 'war-taskid' }, `⌁ ${a.sessionId.slice(0, 10)}… · ${t.taskId}`),
                      createElement('span', { className: 'war-time' }, relTime(a.startedAt)),
                      ))))
                    : null,
                  (lastReport !== undefined && chain.some(t => t.status === 'reported') || failedChain) && staffTarget !== null
                    ? subActions([createElement('button', {
                        className: 'war-btn primary',
                        title: failedChain ? activeCopy().taskCard.handleRetryTitle : activeCopy().taskCard.handleReviewTitle,
                        onClick: () => { jumpSession(staffTarget) },
                      }, failedChain ? activeCopy().taskCard.handleRetry : activeCopy().taskCard.handleReview)])
                    : null,
                  // V10 续接入口：任务回报读完即续——关展开、开起草器并预选本命令为母本。
                  onContinue !== undefined
                    ? subActions([createElement('button', {
                        className: 'war-btn',
                        'data-war-continue': cmd.commandId,
                        title: activeCopy().chain.continueBtnTitle,
                        onClick: () => { setOpen(null); onContinue() },
                      }, activeCopy().chain.continueBtn)])
                    : null,
                )
                : null)
            : createElement('div', { className: 'war-tour-hint' },
              liveAttempts.length > 0
                ? (() => { const la = liveAttempts[0]!.a; return fp.reportLive(la.activity?.label ?? activeCopy().starfield.orbIdle, la.n, relTime(la.startedAt)) })()
                : chain.some(t => t.status === 'published') ? fp.reportQueued
                : execSessions.length > 0 ? fp.reportSettledSoon
                : fp.reportNone),
        ),
      ),
      // 底部两颗会话跳钮（V9.9 舰长定案，代替旧 footer 全部按钮）：直跳原生会话
      // 窗口；未形成给同名禁用占位（title 说明何时会出现）。
      createElement('div', { className: 'war-tour-jumps' },
        createElement('button', {
          className: 'war-btn war-jump-btn', type: 'button',
          disabled: staffTarget === null,
          title: staffTarget !== null ? staffTarget : fp.taskSessionHint,
          onClick: () => { jumpSession(staffTarget) },
        }, `⌁ ${fp.taskSessionBtn}`),
        createElement('button', {
          className: 'war-btn war-jump-btn', type: 'button',
          disabled: execTarget === null,
          title: execTarget !== null ? execTarget : fp.execSessionHint,
          onClick: () => { jumpSession(execTarget) },
        }, `⌁ ${fp.execSessionBtn}`),
      ),
      preview !== null ? createElement(ArtifactPreviewModal, { ws: preview.ws, name: preview.name, onClose: () => { setPreview(null) } }) : null,
    ),
  )
}

// --- 任务区 ------------------------------------------------------------------

// --- 成形卡（V9.11 任务列=大副侧台账：任务书挂出前的占位形态，变体同聚焦页 ghost）---

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
    'data-pipe-forming': cmd.commandId,
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

function TaskCard(task: BoardTask, statuses: Map<string, BoardTask['status']>, onOpen: (taskId: string) => void, onHandle: (() => void) | null, lineageCmd: BoardCommand | null, onOpenCommand: (commandId: string) => void, trace: CardTrace, /** V14.1 单代战线星球身份（任务列传参；其他调用点不传不渲染）。 */ bf?: string | null): ReactNode {
  // V9.11 台账终局态：closed/failed 任务书卡常驻任务列但调暗；reported 是待验收
  // 动作态（收件箱有待办），保持全亮不许被埋。
  const settled = task.status === 'closed' || task.status === 'failed'
  return createElement('div', {
    key: task.taskId,
    className: `war-card clickable${settled ? ' settled' : ''}${relClass(trace)}`,
    'data-pipe-task': task.taskId,
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
            // critique P2：让出 Tab 序（三列 40+ 停靠的隧道主源）——卡本身可点开同一聚焦页。
            role: 'button',
            tabIndex: -1,
            title: activeCopy().detail.lineageJumpTitle(lineageCmd.commandId),
            onClick: e => { e.stopPropagation(); onOpenCommand(lineageCmd.commandId) },
          }, `↩ ${lineageCmd.commandId}`)
        : null,
      bf ? createElement('span', { className: 'war-chip war-bf-chip', title: bf }, bf) : null,
      createElement('span', { className: 'war-title' }, task.title),
    ),
    createElement('div', { className: 'war-card-top', title: `${activeCopy().taskCard.taskIdTitle} ${task.taskId}` },
      task.attempts > 1 ? createElement('span', { className: 'war-chip', title: activeCopy().taskCard.attemptNTitle }, activeCopy().taskCard.attemptN(task.attempts)) : null,
      relTime(task.startedAt) !== '' ? createElement('span', { className: 'war-time' }, relTime(task.startedAt)) : null,
    ),
    // V8 卡片保守瘦身：品质/高优先/依赖锁/cron/工作区/任务书/任务产出挪进详情浮层；
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
        createElement('button', {
          className: 'war-btn primary',
          title: task.status === 'failed' ? activeCopy().taskCard.handleRetryTitle : activeCopy().taskCard.handleReviewTitle,
          onClick: e => { e.stopPropagation(); onHandle() },
        }, task.status === 'failed' ? activeCopy().taskCard.handleRetry : activeCopy().taskCard.handleReview),
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
    rows.push(createElement('span', { key: 't', className: evidence.tests.exitCode === 0 ? 'ok' : 'bad' }, activeCopy().focusPage.evidenceTests(evidence.tests.command, evidence.tests.exitCode, evidence.tests.passed, evidence.tests.failed)))
  }
  if (evidence.diffstat !== undefined) {
    rows.push(createElement('span', { key: 'd' }, `Δ ${evidence.diffstat}`))
  }
  return createElement('div', { className: 'war-evi' }, rows)
}

// --- 会话卡（星球：进行中/已完成/已失败，详情优先）---------------------------

function SessionCard(task: BoardTask, attempt: BoardAttempt, onDetail: (task: BoardTask, attempt: BoardAttempt) => void, trace: CardTrace): ReactNode {
  const key = `${attempt.sessionId}:${attempt.startedAt}`
  const outcomeKey = attempt.outcome ?? 'live'
  const meta = outcomeLabel(outcomeKey)
  return createElement('div', {
    key,
    className: `war-card war-session-card clickable${relClass(trace)}`,
    'data-pipe-sess': attempt.sessionId,
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
  // V8 卡片保守瘦身：品质/工作区/任务产出摘要挪进会话详情；卡上留状态+尝试+时间。
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

// --- 挂载 thread（v3：外部会话上星球）-----------------------------------------

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
      // V18.9.5 修（评审 A P2）：归档页签传空串安神=「调度条横幅已说过一次」——
      // 空串不再渲染空虚线框（418×26 的假盒子）。
      count === 0 && empty !== '' ? createElement('div', { className: 'war-empty' }, empty) : children,
    ),
  )
}

/** V7-① 等你定夺收件箱：四类需要舰长的动作（答澄清/批计划/翻任务回报/决重试）
 * 聚合成一条队列，带等待时长与 aging 警示；点击直达动作发生地（进会话/开
 * 决策卡/开任务详情）——板子只导航，不长任务写操作（红线）。 */
/** V13 战线头（任务列分组）：围合容器内的标题行——链色圆点+根命令原文+代数/任务
 * 数+星球名 chip+聚合态。星球名是拆段身份的关键（同血脉跨星球的兄弟段靠它分辨）。 */
function bfNameOf(bf: string | null): string {
  if (bf === null) return ''
  if (bf === UNGROUPED_WS_KEY) return activeCopy().starfield.ungrouped
  const parts = bf.split(/[\\/]+/).filter(p => p.length > 0)
  return parts.length > 0 ? parts[parts.length - 1]! : bf
}
function FrontHead(f: WarFront): ReactNode {
  const fcopy = activeCopy().front
  const state = f.agg.waiting ? fcopy.stateWaiting : f.agg.failed ? fcopy.stateFailed : f.agg.settled ? fcopy.stateSettled : fcopy.stateLive
  const bf = bfNameOf(f.battlefield)
  return createElement('div', { className: `war-front-head war-chain-hue-${f.hueSlot}`, title: `${f.title}\n${activeCopy().starfield.frontBfLabel}${bf}` },
    createElement('span', { className: 'war-front-dot', 'aria-hidden': 'true' }),
    createElement('span', { className: 'war-front-title' }, displayTitleOf(f.title)),
    createElement('span', { className: 'war-chip war-front-gen' }, `${fcopy.genN(f.generations.length)} · ${fcopy.taskN(f.tasks.length)}`),
    bf !== '' ? createElement('span', { className: 'war-front-bf' }, bf) : null,
    createElement('span', { className: `war-front-state${f.agg.waiting ? ' warn' : f.agg.failed ? ' err' : f.agg.settled ? ' done' : ''}` }, state),
  )
}

function InboxStrip(items: InboxItem[], onAct: (item: InboxItem) => void, frontOf?: (it: InboxItem) => { key: string; label: string; hueSlot: number } | null): ReactNode {
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
        items.flatMap(it => {
          const key = `${it.kind}:${it.refId}`
          // V13：多代战线的收件项挂战线头（链色 chip）——动作仍命令/任务粒。
          const g = frontOf?.(it) ?? null
          const header = g !== null
            ? [createElement('div', { key: `gf-${g.key}`, className: `war-inbox-front war-chain-hue-${g.hueSlot}` },
                createElement('span', { className: 'war-front-dot', 'aria-hidden': 'true' }),
                createElement('span', { className: 'war-inbox-front-text' }, g.label))]
            : []
          return [...header, createElement('div', {
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
          )]
        }),
      ),
  )
}

/** V7-② 到访摘要横幅：自上次看过以来——收官/挫败/新命令/等你定夺，点段跳
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
 * 设置（下达 ✚ 在调度条左端常驻，挂载入口休眠）；聚焦不再撑开岛——只在
 * 胶囊中间显示「聚焦中」chip（点击即退出），看板本体始终可见（审查 P1-3
 * 修复：hover 面板不得在到访第一屏挡住列区/吸附点击）。操作钮冒泡阻断。 */
function WarIsland(props: {
  active: boolean
  /** V10.1 审查：SSE/首灌水合标志——水合期的计数跳变不进播报（那是到访
   * 摘要横幅的本职），只在板开着时新到的收件项才值得出声。 */
  hydrated: boolean
  counts: { pending: number; waiting: number; active: number; failed: number }
  inbox: InboxItem[]
  visit: VisitDelta
  lastSeen: number
  now: number
  focusText: string | null
  onExitFocus: () => void
  onSettings: () => void
  onInboxAct: (it: InboxItem) => void
  /** V13：收件项→多代战线归属（分组头展示；动作粒度不变）。 */
  inboxFrontOf?: (it: InboxItem) => { key: string; label: string; hueSlot: number } | null
}): ReactNode {
  const { active, hydrated, counts, inbox, visit, lastSeen, now, focusText, onExitFocus, onSettings, onInboxAct, inboxFrontOf } = props
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const copy = activeCopy().island
  // V10.1 审查（通知可达性）：收件箱净增时经视觉隐藏 live 区礼貌播报——
  // 「新增 N 件等你定夺」是该打断舰长的级别；减少/持平不播（防噪音）。
  const [announce, setAnnounce] = useState<string | null>(null)
  const prevInbox = useRef<number | null>(null)
  useEffect(() => {
    // 判定语义（水合静默/基线/净增）在 inboxGrowthAnnounce 纯函数，单测钉死。
    const grow = inboxGrowthAnnounce(prevInbox.current, inbox.length, hydrated)
    if (grow !== null) setAnnounce(copy.announceInbox(grow))
    if (hydrated) prevInbox.current = inbox.length
  }, [inbox.length, hydrated])
  // V10.1 审查（读屏）：aria-label 覆盖内容会使计数/徽章对读屏不可见——
  // 标签名动态拼入大盘计数与收件箱数。
  const countsText = copy.counts(counts)
  const pillAria = `${activeCopy().head.title}${countsText !== '' ? `——${countsText}` : ''}${inbox.length > 0 ? `——${activeCopy().inbox.title} ${inbox.length}` : ''}——${copy.expandTitle}`
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
    'aria-label': pillAria,
    title: pinned ? copy.unpin : copy.pin,
    onClick: () => { setPinned(!pinned) },
    onKeyDown: keyActivate(() => { setPinned(!pinned) }),
  },
    createElement('span', { className: `war-head-dot${active ? ' on' : ''}` }),
    createElement('span', { className: 'war-island-title' }, activeCopy().head.title),
    // V12.2 critique P3 整改：计数数字上权重（13px/600）——岛计数是全板第一眼
    // 信息，此前 12px/400 比任何卡标题都弱（层级倒挂）。数字 <b> 化，标签保持弱灰；
    // V16.4-R3 critique P1-2：岛计数可点——每段路由到它的列（等大副→钉开岛面板、
    // 等外勤小队→任务列待领卡、执行→执行列首卡、挫败→回报列败卡，1.6s 闪显描边）；
    // 分段词走 countSegs 词典（函数返回值过词表，trek 同步派生）。
    // 段分隔必须切带空格的 ' · '——词内的 等·大副 之 · 无空格，不能当分隔符吃掉。
    // aria-live=polite：SSE 计数跃迁对读屏可闻（收件箱增量播报之外的轻量覆盖）。
    createElement('span', { className: 'war-island-counts', 'aria-label': countsText, 'aria-live': 'polite', title: copy.countsScope },
      ...copy.countSegs(counts).flatMap((seg, pi): ReactNode[] => {
        const flash = (el: Element | null): void => {
          if (el === null) return
          if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
          el.classList.add('war-flash')
          window.setTimeout(() => { el.classList.remove('war-flash') }, 1600)
        }
        const go = (): void => {
          // V16.4-R7 critique A6：统一手势——四段全部 flash 列内目标卡（等·大副的
          // 卡=任务列成形卡），钉岛留给 ✉ 徽标，同一动作不再两种结果。
          if (seg.kind === 'awaiting') {
            // A3-P3：首击时面板尚未挂载——flash 推迟一拍，等 pinned 重渲染后再描边。
            setPinned(true)
            window.setTimeout(() => { flash(document.querySelector('.war-inbox .war-inbox-row') ?? document.querySelector('.war-inbox')) }, 60)
            return
          }
          if (seg.kind === 'pending') { flash(document.querySelector('.war-zone.war-tasks .war-forming')); return }
          if (seg.kind === 'waiting') { flash(document.querySelector('.war-zone.war-tasks .war-chip.st-published')?.closest('.war-card') ?? null); return }
          if (seg.kind === 'active') { flash(document.querySelector('.war-zone.war-field .war-card')); return }
          flash(document.querySelector('.war-zone.war-report .war-chip.oc-fail')?.closest('.war-card') ?? null)
        }
        const inner: ReactNode[] = [...seg.label.split(/(\d+)/)].map((t, i) => /^\d+$/.test(t)
          ? createElement('b', { key: `n${pi}-${i}`, className: 'war-island-num' }, t)
          : t)
        return (pi > 0 ? [' · '] : []).concat([createElement('button', {
          key: `seg-${pi}`, type: 'button', className: 'war-island-seg', title: seg.label,
          onClick: e => { e.stopPropagation(); go() },
        }, ...inner)])
      })),
    inbox.length > 0
      ? createElement('button', {
          type: 'button',
          className: `war-island-badge${inbox.some(i => i.tone === 'err') ? ' hot' : ' wait'}`,
          title: activeCopy().inbox.title,
          onClick: e => { e.stopPropagation(); setPinned(true) },
        }, copy.inboxBadge(inbox.length))
      : null,
    visit.any
      ? createElement('span', {
          className: 'war-island-visitmini',
          title: lastSeen > 0 ? activeCopy().visit.since(relTime(new Date(lastSeen).toISOString(), now)) : activeCopy().visit.firstSeen,
        }, copy.visitMini(visit.closed, visit.failed, visit.commands).split(' · ').map((seg, i) =>
          // V16.4-R7 critique P2-2：delta 按四档语义染色（收官绿/挫败红/新令蓝）——
          // 「什么变了」从 hover 二阶信息升为首屏可扫的一阶信号。
          createElement('span', { key: `vm-${i}`, className: `war-vm-seg${seg.startsWith('✕') ? ' fail' : seg.startsWith('✓') ? ' done' : seg.startsWith('＋') || seg.startsWith('✚') ? ' run' : ''}` }, seg)))
      : null,
    focusText !== null
      ? createElement('button', {
          className: 'war-island-focus',
          type: 'button',
          title: `${activeCopy().trace.focusing}${focusText}——${activeCopy().trace.exitFocus}`,
          onClick: e => { e.stopPropagation(); onExitFocus() },
        }, `◎ ${displayTitleOf(focusText).slice(0, 18)}${focusText.length > 18 ? '…' : ''}`)
      : null,
    createElement('span', { className: 'war-island-spacer' }),
    pinned ? createElement('span', { className: 'war-island-pinned', title: copy.unpin }, '◉') : null,
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
      InboxStrip(inbox, onInboxAct, inboxFrontOf),
    )
    : null,
  announce !== null
    ? createElement('span', { key: 'announce', className: 'war-sr-only', role: 'status' }, announce)
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

/** V9.4 底部命令调度坞（容器化，舰长定案）：整坞一个大容器（与三区同语言
 * 的圆角容器、物种差保留——主色淡染凹槽）；左端 ＝ ＋ 下达瓦片（容器的
 * 一部分，幽灵虚线态）；命令卡全部进 .war-dispatch-track 轨道横滚（滚轮
 * 横移；右缘渐隐只在还能向右滚时出现——动态 can-scroll）。铭牌「命令调度」
 * 休眠（舰长：不需要文字）。wheel 必须 passive:false 原生监听（React 合成
 * wheel 是 passive 的）。 */
/** V18 HQ 工作区注册弹窗（舰长令：星球=宿主真实工作区）：列出宿主侧已建立
 * 的工作区，选取注册为星球；注册闸在服务端（真实目录 + registry 收编）。 */
function HqWorkspacePicker(props: { registered: ReadonlyArray<{ path: string; title: string | null }>; onClose: () => void; onRegistered: () => void }): ReactNode {
  const { registered, onClose, onRegistered } = props
  const layer = useModalLayer(onClose, activeCopy().starfield.hqPickerTitle)
  const [rows, setRows] = useState<Array<{ workspaceId: string; path: string; title: string; sessionCount: number }> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const regSet = new Set(registered.map(p => p.path))
  useEffect(() => {
    let alive = true
    fetch('/warroom/api/host-workspaces').then(r => r.json()).then((j: { ok: boolean; workspaces?: typeof rows; error?: string }) => {
      if (!alive) return
      if (j.ok && j.workspaces !== undefined) setRows(j.workspaces)
      else setErr(j.error ?? activeCopy().starfield.hqPickerLoadError)
    }).catch(e => { if (alive) setErr(String(e)) })
    return () => { alive = false }
  }, [])
  const register = (path: string, title: string): void => {
    setBusy(path)
    fetch('/warroom/api/planets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, title }) })
      .then(r => r.json())
      .then((j: { ok: boolean; error?: string }) => {
        setBusy(null)
        if (j.ok) onRegistered()
        else setErr(j.error ?? activeCopy().starfield.hqPickerRegFail)
      })
      .catch(e => { setBusy(null); setErr(String(e)) })
  }
  // V18.9.2 修（元首实抓：HQ 弹窗「不是项目里的弹窗」）——此前裸渲染 war-modal
  // div，缺 war-modal-backdrop 包装。V18.9.4 布局重排（元首令「很乱」）：可注册/
  // 已在星域 两组分区（列头带计数），行卡两行式（名称+按钮在上、路径整行在下），
  // 已注册行 done 令牌绿染——对齐起草器/卡片的设计语言。
  const regRows = (rows ?? []).filter(w => !regSet.has(w.path))
  const doneRows = (rows ?? []).filter(w => regSet.has(w.path))
  const group = (label: string, list: Array<{ workspaceId: string; path: string; title: string }>, isReg: boolean): ReactNode => {
    if (list.length === 0) return null
    return createElement('div', { key: label },
      createElement('div', { className: 'war-hq-picker-group' }, label),
      ...list.map(w => createElement('div', { key: w.workspaceId, className: `war-hq-row${isReg ? ' is-reg' : ''}` },
        createElement('div', { className: 'war-hq-row-main' },
          createElement('span', { className: 'war-hq-row-name', title: w.title }, w.title),
          isReg
            ? createElement('span', { className: 'war-hq-row-done' }, `✓ ${activeCopy().starfield.hqPickerRegistered}`)
            : createElement('button', { type: 'button', className: 'war-btn war-hq-row-btn', disabled: busy === w.path, onClick: () => { register(w.path, w.title) } }, busy === w.path ? '…' : activeCopy().starfield.hqPickerRegister),
        ),
        createElement('div', { className: 'war-hq-row-path', title: w.path }, w.path),
      )),
    )
  }
  return createElement('div', { className: 'war-modal-backdrop', onClick: onClose },
    createElement('div', { className: 'war-modal', role: 'dialog', 'aria-label': activeCopy().starfield.hqPickerTitle, onClick: e => e.stopPropagation(), ref: layer.ref, ...layer.props },
      createElement('div', { className: 'war-hq-picker' },
        createElement('div', { className: 'war-hq-picker-head' },
          createElement('div', { className: 'war-modal-title' }, activeCopy().starfield.hqPickerTitle),
          createElement('button', { type: 'button', className: 'war-hq-picker-x', 'aria-label': activeCopy().settings.close, autoFocus: true, onClick: onClose }, '✕')),
        createElement('p', { className: 'war-hq-picker-hint' }, activeCopy().starfield.hqPickerHint),
        err !== null ? createElement('p', { className: 'war-hq-picker-err' }, err) : null,
        rows === null && err === null ? createElement('p', { className: 'war-hq-picker-hint' }, '…') : null,
        rows !== null && rows.length === 0 ? createElement('p', { className: 'war-hq-picker-hint' }, activeCopy().starfield.hqPickerEmpty) : null,
        // V18.9.7（元首实抓）：滚此前在整个弹窗上——标题跟着清单跑。头/提示定死，
        // 只有清单体滚；节头在体内 sticky，滚到哪都能看见自己身处哪组。
        createElement('div', { className: 'war-hq-picker-body' },
          group(activeCopy().starfield.hqPickerRegGroup(regRows.length), regRows, false),
          group(activeCopy().starfield.hqPickerDoneGroup(doneRows.length), doneRows, true),
        ),
      )))
}

// V17.6 页签图标（皮肤中性——词表随皮肤变，图标不变；全名在 title/aria）。
const CMD_TAB_ICONS: Record<CmdTab, string> = { active: '▶', settled: '✓', archived: '▦' }

function DispatchStrip(props: { onCompose: () => void; tab: CmdTab; onTab: (t: CmdTab) => void; tabCounts: Record<CmdTab, number>; children: ReactNode[] }): ReactNode {
  const { onCompose, tab, onTab, tabCounts, children } = props
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
  // V10.1 critique P1-3：roving tabindex——Tab 一次进坞第一张卡，左右键在卡间移动
  // （此前 14 张卡各占一个 Tab 位，命令卡全板键盘可达性最差）。
  // V10.1 卡牌组：面板内历代卡不进左右轮转（那是「组间」移动）——组内 ↑/↓
  // 由 CommandGroupCard 自管（键鼠同权：↑ 向新代、↓ 向旧代）。
  const faceCardsOf = (el: HTMLElement): HTMLElement[] =>
    [...el.querySelectorAll<HTMLElement>('.war-command-card')].filter(c => c.closest('.war-group-panel') === null)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    faceCardsOf(el).forEach((c, i) => { c.tabIndex = i === 0 ? 0 : -1 })
  }, [children.length])
  const onTrackKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const el = ref.current
    if (el === null) return
    const cards = faceCardsOf(el)
    const idx = cards.findIndex(c => c === document.activeElement)
    if (idx < 0) return
    e.preventDefault()
    const next = e.key === 'ArrowRight' ? Math.min(idx + 1, cards.length - 1) : Math.max(idx - 1, 0)
    cards.forEach((c, i) => { c.tabIndex = i === next ? 0 : -1 })
    cards[next]!.focus()
  }
  return createElement('div', { className: 'war-dispatch', role: 'region', 'aria-label': activeCopy().dispatch.label },
    createElement('button', {
      className: 'war-dispatch-add',
      type: 'button',
      title: activeCopy().dispatch.addTitle,
      'aria-label': activeCopy().dispatch.addTitle,
      onClick: onCompose,
    }, '＋'),
    // V17 三页签全局切片：＋旁**图标页签组**（V17.8 舰长令：不显计数，全名
    // +计数走 title 悬停提示），切换整个板（三列+调度条+星域）的命令集合。
    createElement('div', { className: 'war-cmdtabs', role: 'tablist', 'aria-label': activeCopy().cmdTabs.aria },
      ...(['active', 'settled', 'archived'] as const).map(t => createElement('button', {
        key: t, type: 'button', role: 'tab',
        'aria-selected': tab === t,
        'aria-label': activeCopy().cmdTabs[t],
        className: `war-cmdtab${tab === t ? ' on' : ''}`,
        title: activeCopy().cmdTabs.countTitle(activeCopy().cmdTabs[t], tabCounts[t]),
        onClick: () => { onTab(t) },
      },
        createElement('span', { className: 'war-cmdtab-ico', 'aria-hidden': 'true' }, CMD_TAB_ICONS[t]),
      ))),
    createElement('div', { className: 'war-dispatch-track', ref, onKeyDown: onTrackKey }, ...children),
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
  /** V10.1 星球视图开关（从调度坞休眠迁此——坞只管卡，设置管模式）。 */
  viewMap: boolean
  onToggleViewMap: (v: boolean) => void
  /** 偏好为地图但窗口过窄被强制回列表——开关旁给诚实说明（critique P2-5）。 */
  narrowActive: boolean
}): ReactNode {
  const { onClose, hoverFamily, onToggleHoverFamily, autoScroll, onToggleAutoScroll, connected, onRefresh, viewMap, onToggleViewMap, narrowActive } = props
  const copy = activeCopy().settings
  const [skin, setSkinState] = useState(skinId())
  const layer = useModalLayer(onClose, copy.title)
  const skinBtn = (id: SkinId, label: string): ReactNode =>
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
          skinBtn('trek', copy.skinTrek),
          skinBtn('war', copy.skinWar),
          skinBtn('plain', copy.skinPlain)),
        createElement('div', { className: 'war-settings-note' }, copy.skinHint),
        createElement('div', { className: 'war-settings-section' }, copy.legendSection),
        createElement('div', { className: 'war-legend-rows' },
          activeCopy().legend.rows.flatMap(row => {
            const [sym, text] = row
            const cls = row.length > 2 ? row[2]! : ''
            return [
              createElement('span', { key: `${sym}-sym`, className: cls !== '' ? `war-legend-sym war-legend-dot ${cls}` : 'war-legend-sym' }, sym),
              createElement('span', { key: `${sym}-text`, className: 'war-legend-text' }, text),
            ]
          })),
        createElement('div', { className: 'war-settings-section' }, copy.viewSection),
        toggle(copy.viewMap, copy.viewMapHint, viewMap, onToggleViewMap),
        narrowActive ? createElement('div', { className: 'war-settings-note' }, copy.narrowNote) : null,
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
    const [hqPickerOpen, setHqPickerOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    // V16.4 critique P2（Alex 画像）：聚焦页状态进 URL hash（#war-cmd-<id>）——
    // 刷新不丢、可贴进笔记发给别人；replaceState 不推历史栈。R2 勘误：hash 归
    // detailCommandId（聚焦页本体），V16.4-R1 曾误接 focusCommandId（族系高亮）。
    const [detailCommandId, setDetailCommandId] = useState<string | null>(() => {
      try { return location.hash.match(/^#war-cmd-([\w-]+)$/)?.[1] ?? null } catch { return null }
    })
    useEffect(() => {
      try {
        const next = detailCommandId !== null ? `#war-cmd-${detailCommandId}` : ''
        if (location.hash !== next) history.replaceState(null, '', next || location.pathname + location.search)
      } catch { /* 隐私模式 */ }
    }, [detailCommandId])
    // V10 续接播种：任务回报卡「下续战令」→ 预填起草器接续目标。
    const [continueSeed, setContinueSeed] = useState<string | null>(null)
    // V10-R3a 星域/列表视图偏好（窄屏强制列表——中庭放不下恒星系）。
    const [viewPref, setViewPref] = useState<'list' | 'map'>(() => {
      try { return localStorage.getItem('warroom-cfg-view') === 'map' ? 'map' : 'list' } catch { return 'list' }
    })
    // V10.1 对抗审查 P1：窗口跨 900px 界限即时回退/恢复地图（此前只在渲染时判一次）。
    const [winW, setWinW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1720))
    // V11 P2：WebGL 不可用即回落 2D 星域（功能不缺角，红线③）。
    const [no3d, setNo3d] = useState(false)
    // critique P1：三列 roving——每列单停位，方向键在列内移卡。
    const opsRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
      const ops = opsRef.current
      if (ops === null) return
      for (const body of ops.querySelectorAll<HTMLElement>('.war-col-body')) {
        ;[...body.querySelectorAll<HTMLElement>('.war-card')].forEach((c, i) => { c.tabIndex = i === 0 ? 0 : -1 })
      }
    })
    useEffect(() => {
      const on = (): void => { setWinW(window.innerWidth) }
      window.addEventListener('resize', on)
      return () => window.removeEventListener('resize', on)
    }, [])
    // V9 分段直达：打开聚焦页时滚到需要定夺的环节（计划/任务链/任务回报）。
    const [detailSegment, setDetailSegment] = useState<'plan' | 'chain' | 'report' | null>(null)
    // V7-② 到访摘要：挂载时读一次 last-seen 快照（关板时写入）——到访期间不跳动。
    const [lastSeenSnapshot] = useState<number>(() => {
      try { return Date.parse(localStorage.getItem('warroom-last-seen') ?? '') || 0 } catch { return 0 }
    })
    // V7-③ 族系追踪：悬停即时预览（hover 优先），聚焦常驻（Esc/退出钮解除）。
    const [hoverFamily, setHoverFamily] = useState<string | null>(null)
    const [focusCommandId, setFocusCommandId] = useState<string | null>(null)
    // V18.2：聚焦态镜像——onPlanetClick 等星域 handler 被 starfield3d 的 mount-only
    // effect 捕获（首帧闭包），直读 focusCommandId 永远是 null（shoot ⑩ 实抓：
    // 再点同星球取消不了聚焦）。ref 在每次渲染刷新，handler 调用时读到现值。
    const focusRef = useRef<string | null>(null)
    focusRef.current = focusCommandId
    // V7.1 审查整改：决策写操作失败的就地反馈（6 秒自清）。
    const [actionError, setActionError] = useState<string | null>(null)
    // V9.2 设置抽屉的看板行为开关（纯展示层偏好，localStorage 持久化）。
    const [hoverFamilyOn, setHoverFamilyOn] = useState(() => localStorage.getItem('warroom-cfg-hover-family') !== '0')
    const [autoScrollOn, setAutoScrollOn] = useState(() => localStorage.getItem('warroom-cfg-auto-scroll') !== '0')
    // V9.11 任务回报已阅：聚焦页任务回报段进视野时 bump——调度条生命条（任务回报呼吸→绿）
    // 读 localStorage 渲染，靠这次重渲染立即生效。
    const [, setReportSeenRev] = useState(0)
    useEscOnlyLayer(focusCommandId !== null, () => { setFocusCommandId(null) })
    // V9.5（复评 P2-2）：全板快捷键 n = 新建命令（无弹窗层且不在输入框时）——
    // 主写操作不再藏在 20 个 Tab 之后的坞左端。
    // V12.2 critique P3：m = 列表/星域切换——主视图切换从「hover 岛→⚙→抽屉」
    // 三步降为一步（Alex 画像主诉）。
    useEffect(() => {
      const onKey = (e: KeyboardEvent): void => {
        if ((e.key !== 'n' && e.key !== 'm') || e.ctrlKey || e.metaKey || e.altKey) return
        if (escLayers.length > 0) return
        const el = e.target instanceof Element ? e.target : null
        if (el !== null && el.closest('input, textarea, select, [contenteditable], .war-modal-backdrop, .war-settings-backdrop') !== null) return
        if (e.key === 'n') { setComposerOpen(true); return }
        const next = viewPref === 'map' ? 'list' : 'map'
        setViewPref(next)
        try {
          localStorage.setItem('warroom-cfg-view', next)
          if (next === 'map') localStorage.setItem('warroom-map-hint-seen', String(Date.now())) // V16.4：用过星域就不再指路
        } catch { /* 隐私模式 */ }
      }
      document.addEventListener('keydown', onKey)
      return () => { document.removeEventListener('keydown', onKey) }
    }, [viewPref])
    // V9.2 聚焦点空白即退（舰长指令）：点到非卡片/非岛/非弹窗/非控件处退出聚焦。
    useEffect(() => {
      if (focusCommandId === null) return
      const onClick = (e: MouseEvent): void => {
        const el = e.target instanceof Element ? e.target : null
        if (el === null) return
        // V17.4：星域豁免——星球点击走 onPlanetClick 粘性聚焦/星域空处 onVoidClick
        // 显式清除，document 空白退聚焦不得抢跑（否则同一次 click 先设后清）。
        if (el.closest('.war-card, .war-island, .war-modal-backdrop, .war-dispatch, .war-onboard, .war-starfield, button, a, input, textarea, [role=\"switch\"]') !== null) return
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
    // 不在视口内的卡片滚到眼前。调度条（单行横滚，族系内至多一张卡）用
    // nearest 即可；上方三列按**列聚合**一次滚——同列多张同族卡（V6 链）逐卡
    // nearest 会互相挤出（最后一张赢、前面被顶出视口，V9.11 多任务链实测），
    // 聚合后整段放得下就对齐链头，放不下也保链头。reduced-motion 用瞬移。
    // 悬停离开（null）不滚——不抢用户的滚动权。
    useEffect(() => {
      if (hoverFamily === null || !autoScrollOn) return
      const timer = setTimeout(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const behavior = reduced ? 'auto' as const : 'smooth' as const
        document.querySelectorAll<HTMLElement>('.war-dispatch .war-rel-same').forEach(el => {
          el.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' })
        })
        document.querySelectorAll<HTMLElement>('.war-col-body').forEach(col => {
          const same = [...col.querySelectorAll<HTMLElement>('.war-rel-same')]
          if (same.length === 0) return
          const cr = col.getBoundingClientRect()
          const topR = same[0]!.getBoundingClientRect()
          const botR = same[same.length - 1]!.getBoundingClientRect()
          const above = topR.top < cr.top - 1
          const below = botR.bottom > cr.bottom + 1
          if (!above && !below) return
          const span = botR.bottom - topR.top
          const delta = span <= cr.height || above ? topR.top - cr.top : botR.bottom - cr.bottom
          col.scrollBy({ top: delta, behavior })
        })
      }, 300)
      return () => { clearTimeout(timer) }
    }, [hoverFamily, autoScrollOn])
    // 皮肤切换 → 整板重渲染拉新文案（词典经 activeCopy() 渲染期取值）。
    useSyncExternalStore(subscribeSkin, skinId)
    // V17 三页签：与 WarDockPill 同源；页签是客户端过滤器（板照旧全量投影）。
    // V18.2：板面吃「生效页签」=悬停/点击预览 ?? 用户选定——星球悬停切档时
    // 三列+调度条+星域切片整体跟随，离开星球自动还原用户原页签。
    const cmdTab = useSyncExternalStore(subscribeCmdTab, cmdTabShown)
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
    // V17 三页签全局切片：archived 优先，其余按「链未全终局=进行中」二分。
    // 页签过滤任务/命令派生列——lineageMap/statuses/inbox/聚焦页仍吃全量。
    const tabOf = (c: BoardCommand): CmdTab => {
      if (c.archived !== null) return 'archived'
      const ch = commandTasks(c, tasks)
      return c.status !== 'cancelled' && !(ch.length > 0 && ch.every(t => t.status === 'closed' || t.status === 'failed')) ? 'active' : 'settled'
    }
    const tabCmds = commands.filter(c => tabOf(c) === cmdTab)
    const tabCmdIds = new Set(tabCmds.map(c => c.commandId))
    const tabTasks = tasks.filter(t => tabCmdIds.has(lineageOf(t.taskId)?.commandId ?? ''))
    // V18 星域与页签解耦（舰长令）：星球=**注册的真实工作区**（HQ 弹窗注册/
    // 发布侧自动注册），不随页签过滤——进行中/已收官星球同场，发光色区分态；
    // 星域聚合吃「非归档」任务（归档命令整体退出星域）。
    const registeredPlanets = data?.planets ?? []
    const fieldCmdIds = new Set(commands.filter(c => tabOf(c) !== 'archived').map(c => c.commandId))
    const fieldTasks = tasks.filter(t => fieldCmdIds.has(lineageOf(t.taskId)?.commandId ?? ''))
    const wzWsOrder = registeredPlanets.map(p => p.path)
    const planetTitleOf = new Map(registeredPlanets.map(p => [p.path, p.title ?? null] as const))
    const planetStateOf = (key: string): 'active' | 'settled' | 'failed' | 'idle' => {
      let active = false, closed = false, failed = false
      for (const t of fieldTasks) {
        if (wsKeyOf(t.workspacePath) !== key) continue
        if (t.status !== 'closed' && t.status !== 'failed') active = true
        if (t.status === 'closed') closed = true
        if (t.status === 'failed') failed = true
      }
      if (active) return 'active'
      if (failed) return 'failed'
      if (closed) return 'settled'
      return 'idle'
    }

    // V13 战线一等公民（纯派生零后端）：按 chain.rootId 聚合命令世代链——跨代任务
    // 并集（pivot 共享任务去重）、星球键序列（合成沙盒归未分组）、聚合态、排序键。
    const fronts = frontsOf(commands, tasks, tid => lineageMap.get(tid)?.commandId ?? null)
    const taskFront = frontOfTaskMap(fronts)
    // V14 战线=命令聚合绑定星球（血脉除名）：索引一律按 commandId——链色/本地计代/
    // 溯源消费统一走这张表（模块级单例 boardFrontByCmd 供组件工厂读取）。
    const cmdFront = new Map<string, WarFront>()
    for (const f of fronts) for (const c of f.generations) cmdFront.set(c.commandId, f)
    boardFrontByCmd = cmdFront
    // V9.9 打开聚焦页（唯一详情叙事面）；segment=需要定夺的环节（收件箱/上方卡直达）。
    const openCommand = (commandId: string, segment: 'plan' | 'chain' | 'report' | null = null): void => {
      setDetailSegment(segment)
      setDetailCommandId(commandId)
    }
    const openStaff = (taskId: string): void => {
      const target = staffFor(taskId)
      if (target !== null) services.sessions?.open(target)
    }
    // V9.9 点击接线梳理（舰长定案）：详情面只剩聚焦页——任务卡有溯源开聚焦页，
    // 孤儿任务（真实流程不会出现）直跳其末次会话，不再进旧任务详情。
    // （V13 上移：taskCardOf 在战线分组装配期即被调用，TDZ 不许声明滞后。）
    const openTaskVia = (taskId: string): void => {
      const lc = lineageOf(taskId)
      if (lc !== null) { openCommand(lc.commandId); return }
      const t = tasks.find(x => x.taskId === taskId)
      const last = t !== undefined ? (t.attemptLog ?? []).at(-1) : undefined
      if (last !== undefined) services.sessions?.open(last.sessionId)
    }
    // 会话卡：执行中→聚焦页执行段，任务回报列→聚焦页任务回报段；孤儿直跳原生会话。
    const openSessionVia = (t: BoardTask, a: BoardAttempt, segment: 'battle' | 'report'): void => {
      const lc = lineageOf(t.taskId)
      if (lc !== null) openCommand(lc.commandId, segment)
      else services.sessions?.open(a.sessionId)
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
    // V17 页签过滤：回报列/调度条只吃当前页签的命令集；执行中列=常驻（live 列声明口径，V18 critique 定案）。
    const live = fieldTasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === null).map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const done = tabTasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === 'succeeded' || a.outcome === 'reported').map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const failed = tabTasks.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === 'failed').map(a => ({ t, a }))).sort((x, y) => byStart(x.a, y.a))
    const commandsNewest = [...commands].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const tabCommandsNewest = [...tabCmds].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const now = Date.now()
    // V9 任务回报列：成功+失败合并、纯时间倒序（无按天分组——组头是单组时的噪音）。
    const report = [...done, ...failed].sort((x, y) => byStart(x.a, y.a))
    // V9 底部调度条：全部命令，活跃优先（未取消且链未全终局）+ 新→旧——Dispatch 调度中心的一排英雄位。
    const cmdActive = (c: BoardCommand): boolean => {
      const ch = chainOf(c)
      return c.status !== 'cancelled' && !(ch.length > 0 && ch.every(t => t.status === 'closed' || t.status === 'failed'))
    }
    // V10.1 critique P2-1：主打视图藏在 ⚙ 里——≥3 星域时一次性指路 toast（点击即开）。
    const [mapHint, setMapHint] = useState(false)
    // V16.4-R2：指路 toast 15s 自动退场（不打断也得走）。
    useEffect(() => {
      if (!mapHint) return
      const t = window.setTimeout(() => { setMapHint(false) }, 15000)
      return () => { window.clearTimeout(t) }
    }, [mapHint])
    useEffect(() => {
      try {
        const last = Number(localStorage.getItem('warroom-map-hint-seen') ?? '0')
        if (last > 0 && Date.now() - last < 7 * 24 * 3600 * 1000) return // critique P2：7 天冷却（一次性=错过即永久隐身）
        if (new Set(tasks.filter(t => t.workspacePath !== null).map(t => t.workspacePath)).size >= 3) {
          setMapHint(true)
          localStorage.setItem('warroom-map-hint-seen', String(Date.now()))
        }
      } catch { /* 隐私模式 */ }
    }, [tasks.length])
    const dispatchCommands = [...tabCommandsNewest].sort((a, b) => (cmdActive(b) ? 1 : 0) - (cmdActive(a) ? 1 : 0))
    // V10.1 卡牌组：同链命令按链根聚拢成叠（调度坞上的「一副手牌」）。
    // V13 调度组按战线分段（血脉∩星球）：跨星球续代不再同叠一组——老段照常入收官
    // 区，新段另起组面；全血脉族谱仍在聚焦页。组键=血脉/段头，对子代 command 唯一。
    const dispatchGroups: Array<{ rootId: string; cards: BoardCommand[] }> = []
    for (const c of dispatchCommands) {
      const f = cmdFront.get(c.commandId)
      const gk = f === undefined ? c.chain.rootId : `${f.rootId}/${f.rootCommandId}`
      let g = dispatchGroups.find(x => x.rootId === gk)
      if (g === undefined) { g = { rootId: gk, cards: [] }; dispatchGroups.push(g) }
      g.cards.push(c)
    }
    for (const g of dispatchGroups) g.cards.sort((a, b) => a.chain.generation - b.chain.generation)
    // V18.8 起草器融合选择器：星球→战线两级一体。contId=段内最新令（continuesFrom
    // 落点，与旧 continueCandidates 同语义：commandsNewest 首个命中即段内最新）；
    // members=段内全部命令 id——下续战令播种可能指到段中代，选中高亮要认得出。
    const frontCont = new Map<string, string>()
    for (const c of commandsNewest) {
      const f = cmdFront.get(c.commandId)
      if (f !== undefined && f.battlefield !== null && !frontCont.has(f.rootCommandId)) frontCont.set(f.rootCommandId, c.commandId)
    }
    const frontChoices: FrontChoice[] = fronts
      .filter(f => f.battlefield !== null)
      .map(f => ({
        rootCommandId: f.rootCommandId,
        contId: frontCont.get(f.rootCommandId) ?? f.generations[f.generations.length - 1]!.commandId,
        bf: f.battlefield as string,
        label: displayTitleOf(f.title),
        live: f.generations.some(cmdActive),
        gens: f.generations.length,
        hueSlot: f.hueSlot,
        members: f.generations.map(g => g.commandId),
      }))
    // V10-R3a 星域投影（纯）：workspace 创建序→同心椭圆；活体 attempt 上近地轨道。
    // 坐标全确定性推导——SSE revision 翻新零抖动。
    // V13 星球键映射：bound 项目原样成行星；合成沙盒（warRoot tasks/instances）
    // 聚合为一颗「未分组」行星（首个合成任务的出现位）。warRoot 被 config 改名时
    // 启发式失效=当项目行星，无害（挂账：投影 workspaceKind 字段）。
    const wsOrder = [...new Set(workspaceCreationOrder(tasks)
      .map(ws => wsKeyOf(ws))
      .filter((k): k is string => k !== null))]
    // V14 composer 星球选择器选项（现存星球，创建序；名称=目录名/未分组）。
    const bfChoices = wsOrder.map(k => ({ key: k, name: bfNameOf(k) }))
    // critique P0 根修：禁区百分比以【板宽】为分母（winW 是窗口宽——宿主侧栏吃掉
    // ~280px，1720 窗口板宽仅 1440，按窗口算低估舱占位 3%，行星照样被盖）。
    // 板宽/坞高改实测（resize 随动），星域布局随真实禁区落位。
    const [boardBox, setBoardBox] = useState({ w: 1100, h: 880, dockH: 230 })
    useEffect(() => {
      // V16.4-R3 critique B：坞高默认 230 会一直错下去——挂载时 .war-dispatch
      // 尚未渲染（板随数据到），旧版 RO 观察 null 直接罢工。改为：bd/dk 齐 了
      // 才建 RO；未齐每秒重试（空板引导→种子到达的窗口期也在覆盖内）。
      let ro: ResizeObserver | null = null
      const measure = (): void => {
        const bd = document.querySelector('.war-board')
        const dk = document.querySelector('.war-dispatch')
        if (bd === null) return
        const next = { w: bd.clientWidth, h: bd.clientHeight, dockH: dk?.clientHeight ?? 230 }
        setBoardBox(prev => (prev.w === next.w && prev.h === next.h && prev.dockH === next.dockH ? prev : next))
        if (dk !== null && ro === null) {
          ro = new ResizeObserver(measure)
          ro.observe(bd)
          ro.observe(dk)
        }
      }
      measure()
      const retry = window.setInterval(() => { if (ro !== null) { window.clearInterval(retry); return } measure() }, 1000)
      return () => { window.clearInterval(retry); ro?.disconnect() }
    }, [])
    const sidePct = (330 / Math.max(boardBox.w, 1)) * 100
    const dockPct = (boardBox.dockH / Math.max(boardBox.h, 1)) * 100
    const planetSpecs = galaxyLayout(wzWsOrder, { xLo: sidePct, xHi: 100 - sidePct, yLo: 13, yHi: Math.max(30, 100 - dockPct - 7) })
    // V13：garrison 按星球键聚合——未分组行星吃全部合成沙盒任务的切片。
    const garrisonOfKey = (key: string): { orbs: ReadonlyArray<{ sessionId: string; verbLabel: string | null; paused: boolean }>; triumphs: number; awaiting: number; failing: number } => {
      let triumphs = 0, awaiting = 0, failing = 0
      const orbs: Array<{ sessionId: string; verbLabel: string | null; paused: boolean }> = []
      for (const t of fieldTasks) {
        if (wsKeyOf(t.workspacePath) !== key) continue
        if (t.status === 'closed') triumphs += 1
        if (t.status === 'published') awaiting += 1
        if (t.status === 'failed') failing += 1
        for (const a of t.attemptLog) {
          if (a.outcome === null && a.endedAt === null) orbs.push({ sessionId: a.sessionId, verbLabel: a.activity?.label ?? null, paused: t.quotaPaused === true })
        }
      }
      return { orbs, triumphs, awaiting, failing }
    }
    const starPlanets = planetSpecs.map(spec => ({ spec, garrison: garrisonOfKey(spec.wsPath) }))
    const commandTextOf = new Map(commands.map(c => [c.commandId, displayTitleOf(c.text).slice(0, 14)] as const))
    const moonSlot = new Map<string, number>()
    const starTroops = live.flatMap(({ t, a }) => {
      const idx = wzWsOrder.indexOf(wsKeyOf(t.workspacePath) ?? '')
      if (idx < 0) return []
      const spec = planetSpecs[idx]!
      // V10.1 对抗审查 P1：同星多活体确定性避让——按序偏移 π/3（hash 相位撞车无防线）。
      const k = moonSlot.get(spec.wsPath) ?? 0
      moonSlot.set(spec.wsPath, k + 1)
      const pos = moonPos(spec, a.sessionId, k * Math.PI / 3)
      const src = lineageOf(t.taskId)?.commandId ?? null
      // critique：兜底不再露会话号片段（「可追查不装」在细节碎玻璃）——词典化「未溯源」。
      const sourceLabel = src !== null ? commandTextOf.get(src) ?? null : null
      return [{
        sessionId: a.sessionId,
        planet: spec,
        xPct: pos.xPct,
        yPct: pos.yPct,
        verbLabel: a.activity?.label ?? activeCopy().starfield.orbIdle,
        paused: t.quotaPaused === true,
        sourceCommandId: src,
        sourceLabel,
        untraced: src === null,
      }]
    })
    const mapView = viewPref === 'map' && winW >= 900
    // V18 critique：管线发现路径——默认全隐（V17.8 舰长令不虚显）后，给一次性
    // 指路 toast（列表态、有命令即示，关闭即永久 stamp）。
    const [pipeHint, setPipeHint] = useState(false)
    useEffect(() => {
      if (mapView) return
      try {
        if (localStorage.getItem('warroom-pipe-hint-seen') !== null) return
        if (commands.length > 0) setPipeHint(true)
      } catch { /* 隐私模式 */ }
    }, [mapView, commands.length >= 1])
    useEffect(() => {
      if (!pipeHint) return
      const t = window.setTimeout(() => { setPipeHint(false); try { localStorage.setItem('warroom-pipe-hint-seen', String(Date.now())) } catch { /* noop */ } }, 12000)
      return () => { window.clearTimeout(t) }
    }, [pipeHint])
    // V10.1 对抗审查 P0-2：hover/聚焦某战线时，其已结算 attempts 在星域显「昔日阵地」
    // ghost（舰长 V10 定案「达成印记 hover 显形」本体——平时不留常驻位，追问才显形）。
    // V10.1 舰长定：聚焦态下悬停族系高亮让位——聚焦是主导航态，悬停不该抢戏；
    // 悬停只在无聚焦时工作（原 hoverFamily ?? focusCommandId 优先级翻转）。
    const ghostFamily = focusCommandId ?? hoverFamily
    // 族系解析升根级（与坞卡高亮同语义）：ghost 也按战线根聚合——hover 组面时
    // Ⅰ 代的昔日阵地照样显形（exact-id 会落空，同 shoot P2 抓的卡面问题）。
    const familyRoot = ghostFamily !== null ? commandsNewest.find(c => c.commandId === ghostFamily)?.chain.rootId : undefined
    const familyCmdIds = new Set(familyRoot !== undefined ? commandsNewest.filter(c => c.chain.rootId === familyRoot).map(c => c.commandId) : [])
    const starGhosts = ghostFamily !== null
      ? tasks.flatMap(t => {
          if (!familyCmdIds.has(lineageOf(t.taskId)?.commandId ?? '')) return []
          const idx = wzWsOrder.indexOf(wsKeyOf(t.workspacePath) ?? '')
          if (idx < 0) return []
          const spec = planetSpecs[idx]!
          return t.attemptLog
            .filter(a => a.outcome !== null)
            .map(a => {
              const pos = moonPos(spec, a.sessionId)
              return { sessionId: a.sessionId, xPct: pos.xPct, yPct: pos.yPct, outcome: a.outcome! }
            })
        })
      : []
    // V11.5 连线：warzone 桥数据（宇宙=舰长+workspace；编队=agent 会话；雷达值班）。
    const wzPlanets: WzBridgePlanet[] = wzWsOrder.map(ws => {
      const g = garrisonOfKey(ws)
      return {
        wsPath: ws,
        activity: fieldTasks.filter(t => wsKeyOf(t.workspacePath) === ws).length,
        status: g.orbs.length > 0 ? 'battle' : g.triumphs > 0 ? 'held' : 'wait',
        state: planetStateOf(ws),
        title: planetTitleOf.get(ws) ?? null,
        garrison: g.triumphs,
        failing: g.failing,
        inbound: g.awaiting,
      }
    })
    // V13 战线世代环桥数据：已锚定星球的战线才上星域；上限 12 条防杂。
    const wzPlanetSet = new Set(wzWsOrder)
    const wzFronts: WzBridgeFrontLite[] = fronts
      .filter(f => f.battlefield !== null && wzPlanetSet.has(f.battlefield))  // V18：战线环只挂注册星球
      .filter(f => f.generations.some(g => fieldCmdIds.has(g.commandId)))  // V18：非归档命令（页签解耦）
      .slice(0, 12)
      .map(f => ({
        rootId: f.rootId, rootCommandId: f.rootCommandId, label: `${bfNameOf(f.battlefield)}·${f.title.slice(0, 8)}`,
        battlefield: f.battlefield!, gens: f.generations.length, live: f.agg.live, hueSlot: f.hueSlot,
      }))
    // 2D 回退同源（点由 StarfieldMap 按自己的 spec 坐标解析）。
    const starFronts2d = wzFronts
    const wzSquads: WzBridgeSquad[] = []
    for (const { t, a } of live) {
      const verb = a.activity?.label ?? null
      const src = lineageOf(t.taskId)?.commandId ?? null
      wzSquads.push({
        sessionId: a.sessionId,
        wsPath: wsKeyOf(t.workspacePath) ?? '',
        phase: attemptPhaseOf(verb, t.quotaPaused === true),
        verb,
        paused: t.quotaPaused === true,
        sourceCommandId: src,
        sourceLabel: src !== null ? commandTextOf.get(src) ?? null : null,
        live: true,
      })
    }
    for (const t of tabTasks.filter(tk => tk.status === 'reported')) {
      const last = [...(t.attemptLog ?? [])].reverse().find(a => a.outcome === 'reported')
      if (last === undefined) continue
      const src = lineageOf(t.taskId)?.commandId ?? null
      wzSquads.push({ sessionId: last.sessionId, wsPath: wsKeyOf(t.workspacePath) ?? '', phase: 'deployed', verb: null, paused: false, sourceCommandId: src, sourceLabel: src !== null ? commandTextOf.get(src) ?? null : null, live: false })
    }
    // V12.2：速报色 kind 化——值由 --war-log-* 令牌解析（浅压深/深原亮），不再散写 hex。
    const logOrder = warLogKindColor('order'), logTriumph = warLogKindColor('triumph'), logRetreat = warLogKindColor('retreat'), logReview = warLogKindColor('review')
    // V16.4-R5 critique P1：速报动词并词典（下令/达成/败退/待验收——trek 败退→挫败）。
    const wzv = activeCopy().starfield
    const wzLogFeed: WzLogFeedItem[] = tabCmds.map(c => ({ ts: c.createdAt, color: logOrder, text: `${wzv.logOrder} · ${displayTitleOf(c.text).slice(0, 18)}` }))
    for (const t of tabTasks) {
      const src = commandTextOf.get(lineageOf(t.taskId)?.commandId ?? '') ?? t.title.slice(0, 12)
      for (const a of t.attemptLog ?? []) {
        if (a.outcome === null || a.endedAt === null) continue
        if (a.outcome === 'succeeded') wzLogFeed.push({ ts: a.endedAt, color: logTriumph, text: `${wzv.logTriumph} · ${src}` })
        else if (a.outcome === 'failed') wzLogFeed.push({ ts: a.endedAt, color: logRetreat, text: `${wzv.logRetreat} · ${src}` })
        else wzLogFeed.push({ ts: a.endedAt, color: logReview, text: `${wzv.logReview} · ${src}` })
      }
    }
    const wzLog = warLogOf(wzLogFeed)
    // V18.3 聚焦态总控（舰长令）：粘性聚焦星球的 wsKey——星域悬停卡在聚焦态钉住
    // 该星球并内嵌战线清单（bfpanel 退役）。wsKey=聚焦命令链首任务的工作区键。
    const focusWs = focusCommandId !== null
      ? (() => { const fc = commands.find(c => c.commandId === focusCommandId); const ch = fc !== undefined ? chainOf(fc) : []; return ch.length > 0 ? wsKeyOf(ch[0]!.workspacePath) : null })()
      : null
    // V11.5f 高亮联动：悬停/聚焦战线的全部星域（去重）→ 对应星球亮起+名签+HQ 轨迹线。
    const highlightWs = familyCmdIds.size > 0
      ? [...new Set(tabTasks
          .filter(t => familyCmdIds.has(lineageOf(t.taskId)?.commandId ?? ''))
          .map(t => wsKeyOf(t.workspacePath))
          .filter((k): k is string => k !== null))]
      : []
    // V17.4（舰长令）：星球悬停/点击 → 卡片族高亮/粘性聚焦（与卡片悬停同路）。
    const cmdIdForWs = (ws: string): string | null => commandsNewest.find(cc => chainOf(cc).some(t => wsKeyOf(t.workspacePath) === ws))?.commandId ?? null
    // V18.2 星球战线档位（舰长定案）：live > settled > archived 取最高档所在页签。
    // 档位已在生效页签 → 只高亮不切（混档「只高亮进行中」即此案的常态）；只有
    // 低档战线 → 页签临态切过去，星球相关卡片才可见、族高亮才有落点。
    const wsTierTab = (ws: string): CmdTab | null => {
      let tier: CmdTab | null = null
      for (const c of commands) {
        if (!chainOf(c).some(t => wsKeyOf(t.workspacePath) === ws)) continue
        const tb = tabOf(c)
        if (tb === 'active') return 'active'
        if (tier === null || (tb === 'settled' && tier === 'archived')) tier = tb
      }
      return tier
    }
    const applyTabPreview = (ws: string | null): void => {
      if (ws === null) { setCmdTabPreview(null); return }
      const tier = wsTierTab(ws)
      setCmdTabPreview(tier !== null && tier !== cmdTabShown() ? tier : null)
    }
    // V19.5 回流·聚焦滚动：星球点击聚焦后，族卡（坞命令卡/任务卡/回报卡）滚入视界。
    // 页签 commit 切换后卡常在折叠线下——管线锚点解析有 ±60px 视界带（pipe-overlay
    // edgePort），卡不在场=端口 null=管线消失；滚动同时修复锚与「高亮卡在哪」。
    // 双 rAF 等页签切片的重渲染落 DOM；组面板内的同名卡不滚（与管线锚同过滤）。
    const scrollFamilyIntoView = (commandId: string): void => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const c = commands.find(cc => cc.commandId === commandId)
        if (c === undefined) return
        const chain = chainOf(c)
        const inPanel = (el: Element): boolean => el.closest('.war-group-panel') !== null
        const scroll = (sel: string): void => {
          const el = Array.from(document.querySelectorAll(sel)).find(e => !inPanel(e))
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
        scroll(`[data-pipe-cmd="${CSS.escape(commandId)}"]`)
        const head = chain[0]
        if (head !== undefined) scroll(`[data-pipe-task="${CSS.escape(head.taskId)}"]`)
        const settledA = chain.flatMap(t => (t.attemptLog ?? []).filter(x => x.outcome !== null && x.endedAt !== null).map(x => x.sessionId)).slice(-1)[0]
        if (settledA !== undefined) scroll(`[data-pipe-sess="${CSS.escape(settledA)}"]`)
      }))
    }
    // V17 族系管网：每条在档战线一根管——锚=命令卡(坞)/任务卡/执行卡/回报卡；
    // stage=生命条 now 段（流动只跑到当前战况位）。activeRoot=hover/聚焦族的根。
    const stageIndexOf = (c: BoardCommand): number => {
      const now = lifecycleOf(c, chainOf(c), reportSeenAtOf(c.commandId)).now
      return now === 'command' ? 0 : now === 'task' ? 1 : now === 'battle' ? 2 : 3
    }
    // V18.9.5 修（评审 A/B 双实锤 P1）：同根多命令只出**一根**管（组=视觉单位，
    // 锚与 stage 取最新代）——旧版每命令一管，组面板一开同根多管齐亮齐穿卡。
    const pipeFamilies: PipeFamily[] = []
    const pipeRootSeen = new Set<string>()
    for (const c of tabCmds) {
      if (pipeRootSeen.has(c.chain.rootId)) continue
      pipeRootSeen.add(c.chain.rootId)
      const ch = chainOf(c)
      const stops: PipeStop[] = [{ kind: 'cmd', id: c.commandId }]
      const head = ch[0]
      if (head !== undefined) stops.push({ kind: 'task', id: head.taskId })
      else stops.push({ kind: 'task', id: c.commandId, forming: true })
      const liveA = ch.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome === null).map(a => a.sessionId))[0]
      if (liveA !== undefined) stops.push({ kind: 'exec', id: liveA })
      const settledA = ch.flatMap(t => (t.attemptLog ?? []).filter(a => a.outcome !== null && a.endedAt !== null).map(a => a.sessionId)).slice(-1)[0]
      if (settledA !== undefined) stops.push({ kind: 'report', id: settledA })
      // map 态弦锚：战线绑定的星球（首代任务的工作区）——overlay 经 __wz 投影取屏幕位。
      pipeFamilies.push({ rootId: c.chain.rootId, hueSlot: c.chain.hueSlot, stops, stage: stageIndexOf(c), wsKey: head !== undefined ? wsKeyOf(head.workspacePath) : null })
    }
    // V7-③ trace 注入器：命令卡 family=自身；任务/会话卡 family=源命令；外部挂载 null（只压暗）。
    const traceActive = focusCommandId ?? hoverFamily
    const activeCmd = traceActive !== null ? commands.find(c => c.commandId === traceActive) ?? null : null
    const activePipeRoot = activeCmd !== null ? activeCmd.chain.rootId : null
    // V10.1 舰长定：◎ 再点同卡=退出聚焦（toggle）；点他卡=换聚焦。
    const traceFor = (familyId: string | null): CardTrace => ({ familyId, active: hoverFamilyOn ? traceActive : null, onHover: hoverFamilyOn ? setHoverFamily : () => {}, onFocus: id => { setFocusCommandId(cur => cur === id ? null : id) } })
    // V10.1 对抗审查 P0-1：外部挂载卡随 field 隐退会人间蒸发——地图态改驻任务舱尾（台账语义）。
    const threadCards = threads.map(th => ExternalThreadCard(th, services, sessionId => { void detachThread(sessionId).then(refresh) }, traceFor(null)))
    // V9.11 任务列=大副侧台账 + V13 Phase B 战线分组：多代战线一组（链色头+代数+
    // 聚合态，成形卡归组首），单代/孤儿保持原排序心智；组与扁平项按最近活动交错。
    const taskCardOf = (t: BoardTask): ReactNode => TaskCard(t, statuses, openTaskVia,
      (t.status === 'reported' || t.status === 'failed') && staffFor(t.taskId) !== null
        ? () => { openStaff(t.taskId) }
        : null,
      lineageOf(t.taskId), openCommand, traceFor(lineageOf(t.taskId)?.commandId ?? null),
      (() => { const f = taskFront.get(t.taskId); return f !== undefined ? bfNameOf(f.battlefield) : null })())
    const tasksSorted = [...tabTasks].sort((a, b) => {
      const la = lineageOf(a.taskId), lb = lineageOf(b.taskId)
      if (la === null && lb === null) return 0
      if (la === null) return 1
      if (lb === null) return -1
      return la.createdAt < lb.createdAt ? 1 : la.createdAt === lb.createdAt ? 0 : -1
    })
    const multiFronts = fronts.filter(f => f.generations.length > 1)
    // 组键=血脉/段头：同血脉拆出的多段各自成组，不能按 rootId 吞并。
    const frontKeyOf = (f: WarFront): string => `${f.rootId}/${f.rootCommandId}`
    const multiKeys = new Set(multiFronts.map(frontKeyOf))
    const frontTaskNodes = new Map<string, ReactNode[]>()
    const flatEntries: Array<{ key: string; sortKey: string; node: ReactNode }> = []
    for (const t of tasksSorted) {
      const f = taskFront.get(t.taskId)
      if (f !== undefined && multiKeys.has(frontKeyOf(f))) {
        const fk = frontKeyOf(f)
        let arr = frontTaskNodes.get(fk)
        if (arr === undefined) { arr = []; frontTaskNodes.set(fk, arr) }
        arr.push(taskCardOf(t))
      } else {
        flatEntries.push({ key: t.taskId, sortKey: lineageOf(t.taskId)?.createdAt ?? '', node: taskCardOf(t) })
      }
    }
    // 成形卡：归所属多代战线（深化中的新代置组首），无多代归属维持置顶台账。
    const flatForming: ReactNode[] = []
    const formingByFront = new Map<string, ReactNode>()
    for (const c of tabCommandsNewest) {
      const v = formingVariantOf(c, chainOf(c))
      if (v === null) continue
      const node = FormingCard(c, v, () => { openCommand(c.commandId, 'plan') }, traceFor(c.commandId))
      const f = cmdFront.get(c.commandId)
      if (f !== undefined && multiKeys.has(frontKeyOf(f))) formingByFront.set(frontKeyOf(f), node)
      else flatForming.push(node)
    }
    const formingTotal = flatForming.length + formingByFront.size
    type ColEntry = { key: string; sortKey: string; node: ReactNode }
    const entries: ColEntry[] = [
      ...flatForming.map((node, i) => ({ key: `ff-${i}`, sortKey: '9999', node })),
      ...flatEntries,
    ]
    for (const f of multiFronts) {
      const fk = frontKeyOf(f)
      const nodes = [...(formingByFront.has(fk) ? [formingByFront.get(fk)!] : []), ...(frontTaskNodes.get(fk) ?? [])]
      if (nodes.length === 0) continue
      entries.push({
        key: `front-${fk}`, sortKey: f.lastActivity,
        node: createElement('div', { key: `fg-${fk}`, className: `war-front-group war-chain-hue-${f.hueSlot}${f.agg.settled ? ' settled' : ''}` },
          FrontHead(f),
          ...nodes),
      })
    }
    entries.sort((a, b) => a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0)
    const taskColumnChildren = entries.map(e => e.node)
    const focusCmd = focusCommandId !== null ? commands.find(c => c.commandId === focusCommandId) : undefined
    // V7-① 收件箱：聚合 + 点击导航（clarify 进大副会话，plan 开决策卡，review/retry 开任务详情）。
    const inbox = collectInbox(commands, tasks, now)
    // V7-② 摘要：以挂载快照算增量（pending 用当前收件箱长度）。
    const visit = visitDelta(commands, tasks, inbox.length, lastSeenSnapshot, now)
    // V8 大盘计数（灵动岛收起态仪表）：与 dock 徽章同源。
    const counts = {
      awaiting: inbox.length,  // V18 critique A2：等你段居首（与收件箱四类同源聚合）
      pending: commands.filter(c => c.status === 'received' || c.status === 'talking').length,
      waiting: tasks.filter(t => t.status === 'published').length,
      active: tasks.filter(t => t.status === 'in_progress').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    }
    // V9.9 收件箱路由：批计划→任务段；翻任务回报→任务回报段；决重试→任务链段；答澄清
    // 仍是进会话对话。孤儿任务（无源命令，防御分支）退到大副会话/末次会话直跳。
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
    // V12.2 皮肤钩子：data-war-skin 随文案皮肤落属性——当前军事/平话只换措辞，
    // 未来视觉皮肤在 CSS [data-war-skin] 选择器内重映射 --war-* 令牌层即可。
    return createElement('div', { className: 'war-root', 'data-war-skin': skinId() },
      // V8 hero 灵动岛：替代标题栏——操作件与大盘状态全收进顶部胶囊（展开浮层
      // 盖列区，不推挤；聚焦模式 = 岛的常驻形态）。
      createElement(WarIsland, {
        key: 'island',
        active: data?.active === true,
        hydrated: data !== null && data !== undefined,
        counts,
        inbox,
        visit,
        lastSeen: lastSeenSnapshot,
        now,
        focusText: focusCommandId !== null && focusCmd !== undefined ? focusCmd.text : null,
        onExitFocus: () => { setFocusCommandId(null) },
        onSettings: () => { setSettingsOpen(true) },
        onInboxAct: inboxAct,
        inboxFrontOf: it => {
          const f = it.kind === 'clarify' || it.kind === 'plan'
            ? cmdFront.get(it.refId)
            : taskFront.get(it.refId)
          if (f === undefined || f.generations.length < 2) return null
          return { key: `${f.rootId}/${f.rootCommandId}`, label: `${bfNameOf(f.battlefield)}·${f.title.slice(0, 8)}`, hueSlot: f.hueSlot }
        },
      }),
      actionError !== null ? createElement('div', { className: 'war-actionerr', role: 'alert' }, actionError) : null,
      data === null
        ? createElement('div', { className: 'war-body' },
          error !== null ? createElement('span', { className: 'war-err' }, activeCopy().loading.unreachable(error)) : createElement('span', { className: 'war-empty' }, activeCopy().loading.connecting),
        )
        : commands.length === 0 && tasks.length === 0
          ? OnboardPanel(() => { setComposerOpen(true) })
          : createElement('div', { className: `war-board${mapView ? ' war-mapmode' : ''}`, style: { '--war-dock-h': `${boardBox.dockH}px` } as React.CSSProperties },
          // V17 族系管网 overlay：map 态=坞→任务→战报直连（不进星域，V17.5）；
          // 列表态=正交管件路由。流动只跑到生命条 now 段。
          createElement(PipeOverlay, { key: 'pipes', families: pipeFamilies, activeRootId: activePipeRoot, mapMode: mapView }),
          // V10.1 TITP 化（舰长示意图定案）：星域=界面本体，board 级铺满为底；
          // 任务/任务回报列转贴边浮舱压图；命令坞满宽压底。列表态=原三列不动。
          ...(mapView ? [no3d
            ? createElement(StarfieldMap, {
                key: 'starfield',
                active: data.active,
                planets: starPlanets,
                troops: starTroops,
                ariaLabel: activeCopy().starfield.aria,
                hqTitleLit: activeCopy().starfield.hqOn,
                hqTitleDark: activeCopy().starfield.hqOff,
                onOpenCommand: id => { openCommand(id) },
                onOrbHover: id => {
                  if (id !== null) { if (hoverFamilyOn) setHoverFamily(id) } else setHoverFamily(null)
                },
                ghosts: starGhosts,
                orbIdleLabel: activeCopy().starfield.orbIdle,
                mapLegend: activeCopy().starfield.mapLegend,
                untracedLabel: activeCopy().starfield.untraced,
                onPlanetOpen: (wsPath: string) => {
                  // critique P1-1：行星可达后的落点——该星球最新有仗的源命令聚焦页。
                  // V13 未分组行星：按星球键匹配（合成沙盒任务都归这颗星）。
                  const c = commandsNewest.find(cc => chainOf(cc).some(t => wsKeyOf(t.workspacePath) === wsPath))
                  if (c !== undefined) openCommand(c.commandId)
                },
                ungroupedLabel: activeCopy().starfield.ungrouped,
                fronts: starFronts2d,
              })
            : createElement(Warzone, {
                key: 'starfield3d',
                ariaLabel: activeCopy().starfield.aria,
                active: data.active,
                planets: wzPlanets,
                squads: wzSquads,
                log: wzLog,
                fronts: wzFronts,
                highlightWs,
                onOpenCommand: id => { openCommand(id) },
                onPlanetHover: ws => {
                  if (!hoverFamilyOn) { setCmdTabPreview(null); return }
                  setHoverFamily(ws === null ? null : cmdIdForWs(ws))
                  // V18.2：悬停优先带页签；离开星球回落到点击粘性星球的档位（若有）。
                  applyTabPreview(ws ?? planetPreviewWs)
                },
                onPlanetClick: ws => {
                  const c = cmdIdForWs(ws)
                  if (c === null) return
                  // V10.1 舰长定：再点同星球=退出粘性聚焦。toggle 经 focusRef 读
                  // 现值——本 handler 是首帧闭包（见 focusRef 注）。
                  // V19.5 回流：点击聚焦=**真切换页签**（commit，非 hover 瞬时预览）
                  // ——首版只 applyTabPreview：悬停已把 shown 切到档位，点击落定时
                  // tier===shown → 预览自清 → 板面弹回原页签 → 高亮卡不在场、
                  // 管线锚出视界带整族消失。commit 后重粘 planetPreviewWs
                  // （setCmdTab 会清场，顺序故意在其后）。
                  const next = focusRef.current === c ? null : c
                  focusRef.current = next
                  setFocusCommandId(next)
                  if (next === null) {
                    planetPreviewWs = null
                    applyTabPreview(null)
                  } else {
                    const tier = wsTierTab(ws)
                    if (tier !== null && tier !== cmdTabShown()) setCmdTab(tier)
                    planetPreviewWs = ws
                    scrollFamilyIntoView(next)
                  }
                },
                onVoidClick: () => { setFocusCommandId(null); planetPreviewWs = null; setCmdTabPreview(null) },
                onHqClick: () => {
                  // V18 critique：触发件是 canvas（无可还焦点）——打开前把星域
                  // 容器设为焦点锚，关闭时 useModalLayer 归还到此而非 body。
                  const el = document.querySelector('.war-starfield') ?? document.querySelector('.war-wz-tac')
                  if (el !== null) { el.setAttribute('tabindex', '-1'); (el as HTMLElement).focus() }
                  setHqPickerOpen(true)
                },
                orbIdleLabel: activeCopy().starfield.orbIdle,
                onUnavailable: () => { setNo3d(true) },
                focusWs,
              })] : []),
          // V9 板体 = 纵向 flex：上三列局势墙（.war-ops 网格）+ 下全宽命令调度条。
          // 调度条必须是 .war-ops 的兄弟而非网格第 4 项——塞进三列网格会被放到
          // 第 2 行第 1 列，宽度只剩一列（2026-08-25 舰长抓到的真 bug）。
          // V10-R3a 星域底版：中列「星球」换恒星系画布——任务列左、星域中、
          // 任务回报列右天然成型（终态三浮舱在 R3b 收）；列表视图原样。
          // V10-R3b 星域态=悬浮舱：左右两列收窄半透明浮于星域之上，中列让位恒星系。
          createElement('div', {
            className: `war-ops${mapView ? ' war-mapmode' : ''}`,
            // critique P1：三列键盘隧道（45 停靠）——列内 roving，上下键移卡、Tab 跳列。
            ref: opsRef,
            onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
              const ops = opsRef.current
              if (ops === null) return
              const zones = [...ops.querySelectorAll<HTMLElement>('.war-col-body')]
              const zone = zones.find(z => z.contains(document.activeElement))
              if (zone === undefined) return
              const cards = [...zone.querySelectorAll<HTMLElement>('.war-card')]
              const idx = cards.findIndex(c => c === document.activeElement)
              if (idx < 0) return
              e.preventDefault()
              const next = e.key === 'ArrowDown' ? Math.min(idx + 1, cards.length - 1) : Math.max(idx - 1, 0)
              cards.forEach((c, i) => { c.tabIndex = i === next ? 0 : -1 })
              cards[next]!.focus()
            },
          },
            createElement('div', { className: 'war-zone war-tasks' },
              // V18 critique P1：列头计数必须与切片内容同口径（曾用全局 tasks.length
              // ——已归档页签「任务 8」配 0 卡的撒谎账本）；空态文案随页签语境。
              Zone('tasks', activeCopy().columns.tasks.title, taskColumnChildren.length + (mapView ? threadCards.length : 0),
                cmdTab === 'archived' ? '' : activeCopy().columns.tasks.empty, // 归档空态只留调度条横幅一次（A2：三遍同句=噪音）
                [...taskColumnChildren,
                ...(mapView ? threadCards : [])],
              ),
            ),
            createElement('div', { className: 'war-zone war-field' },
              // V18 critique：执行中列=常驻（与星域同哲学：现在时不随页签切片），
              // 列头 title 声明常驻口径（见 copy.columns.live.resident）。
              Zone('live', activeCopy().columns.live.title + activeCopy().columns.live.resident, live.length + threads.length, activeCopy().columns.live.empty,
                [...live.map(({ t, a }) => SessionCard(t, a, (t2, a2) => { openSessionVia(t2, a2, 'battle') }, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
                  ...(mapView ? [] : threadCards)],
              ),
            ),
            createElement('div', { className: 'war-zone war-report' },
              Zone('report', activeCopy().zones.report.title, report.length,
                cmdTab === 'archived' ? '' : activeCopy().columns.done.empty,
                report.map(({ t, a }) => SessionCard(t, a, (t2, a2) => { openSessionVia(t2, a2, 'report') }, traceFor(lineageOf(t.taskId)?.commandId ?? null))),
              ),
            ),
          ),
          // V9 底部命令调度条：所有命令卡横向一排（活跃优先 + 新→旧），每张带
          // 四段生命条显示所处阶段——命令是唯一可点入口，点开=全生命周期详情。
          // V10.1 卡牌组：同链多代只摆最新代卡面（CommandGroupCard 管组性——
          // 叠纸影 + 历代状态 pip + 悬停/聚焦向上展开）。
          // V16.4-R3 critique B：hint 必须挂在 .war-board 子树内——--war-dock-h
          // 内联在 board 上（自定义属性不跨兄弟继承），挂 war-root 下永远走 0px
          // 回退，「抬到调度条上方」形同虚设（probe-b3 实测 rect 与坞相交）。
          mapHint && !mapView && winW >= 900
            ? createElement('div', {
                key: 'map-hint', className: 'war-map-hint', 'data-war-map-hint': '1', role: 'status',
              },
                createElement('button', {
                  type: 'button', className: 'war-map-hint-main',
                  onClick: () => { setMapHint(false); setViewPref('map'); try { localStorage.setItem('warroom-cfg-view', 'map'); localStorage.setItem('warroom-map-hint-seen', String(Date.now())) } catch { /* noop */ } },
                }, activeCopy().starfield.mapHintToast),
                createElement('button', {
                  type: 'button', className: 'war-map-hint-x', title: activeCopy().starfield.mapHintDismiss,
                  onClick: () => { setMapHint(false) },  // 只关本次；冷却自出现时起算（stamp 在出现处写）
                }, activeCopy().starfield.mapHintDismiss),
              )
            : null,
          pipeHint && !mapView && winW >= 900
            ? createElement('div', { key: 'pipe-hint', className: 'war-map-hint war-pipe-hint', role: 'status' },
                createElement('button', {
                  type: 'button', className: 'war-map-hint-main',
                  onClick: () => { setPipeHint(false); try { localStorage.setItem('warroom-pipe-hint-seen', String(Date.now())) } catch { /* noop */ } },
                }, activeCopy().pipeHint),
                createElement('button', {
                  type: 'button', className: 'war-map-hint-x', title: activeCopy().starfield.mapHintDismiss,
                  onClick: () => { setPipeHint(false); try { localStorage.setItem('warroom-pipe-hint-seen', String(Date.now())) } catch { /* noop */ } },
                }, activeCopy().starfield.mapHintDismiss),
              )
            : null,
          createElement(DispatchStrip, {
            key: 'dispatch',
            onCompose: () => { setComposerOpen(true) },
            tab: cmdTab,
            onTab: setCmdTab,
            tabCounts: {
              active: commands.filter(c => tabOf(c) === 'active').length,
              settled: commands.filter(c => tabOf(c) === 'settled').length,
              archived: commands.filter(c => tabOf(c) === 'archived').length,
            },
          },
            // 调度轨道：活跃优先+新→旧原样排序；铭牌路标已退役（V17.6 舰长令）。
            (() => {
              const groupNode = (g: { rootId: string; cards: BoardCommand[] }): ReactNode => {
              const renderDockCard = (c: BoardCommand, pips?: ReactNode, history = false): ReactNode => {
                // V10.1 卡组：族系高亮解析升到战线根——hover/聚焦命中链上任一代
                // （星域光点常溯源到 Ⅰ 代旧令），坞里代表这条战线的卡要点亮：
                // 坞只摆最新代，exact-id 匹配会让旧代溯源高亮落空（shoot P2 实抓）。
                // 单命令的 root=自身，行为不变。历史卡（面板内历代）无悬停无聚焦
                // ——生命周期已从主界面退场，点开详情弹窗是唯一交互（舰长定）。
                const trace = history ? NO_TRACE
                  : (() => {
                      const base = traceFor(c.commandId)
                      if (base.active === null || base.active === c.commandId) return base
                      const activeFront = cmdFront.get(base.active)
                      return activeFront !== undefined && activeFront === cmdFront.get(c.commandId)
                        ? { ...base, active: c.commandId }
                        : base
                    })()
                return CommandCard(c, hqSessionId, services, cmd => openCommand(cmd.commandId), chainOf(c), trace, grade => {
                  actNote(regradeCommand(c.commandId, grade), activeCopy().commandDetail.regradeTo(activeCopy().grade[grade]))
                }, false, pips, history)
              }
              return g.cards.length === 1
                ? renderDockCard(g.cards[0]!)
                : createElement(CommandGroupCard, {
                    key: `grp-${g.rootId}`, rootId: g.rootId, cards: g.cards,
                    renderCard: renderDockCard,
                    tasksOf: c => tasks.filter(t => lineageOf(t.taskId)?.commandId === c.commandId),
                  })
              }
              // V13 段内任一命令活跃即活跃组（原 cards[0]=最老代，分段后老段会
              // 拖着新段的活任务误入收官区）。
              const faceActive = (g: { rootId: string; cards: BoardCommand[] }): boolean => g.cards.some(cmdActive)
              const activeGroups = dispatchGroups.filter(faceActive)
              const settledGroups = dispatchGroups.filter(g => !faceActive(g))
              // V17.6 舰长令：分段铭牌（竖排虚线「已收官」路标）退役——与页签语义
              // 重复且被误读为幽灵标签；分段只保留排序（活跃优先），不再挂牌。
            // V18 critique P1：归档空页签给安神行（曾有「三处空+调度条全白」的坟场屏）。
            return [
              ...(dispatchGroups.length === 0 && cmdTab === 'archived'
                ? [createElement('div', { key: 'arch-empty', className: 'war-dispatch-empty' }, activeCopy().cmdTabsArchivedEmpty)]
                : []),
              ...activeGroups.map(groupNode),
              ...settledGroups.map(groupNode),
            ]
          })(),
          ),
        ),
      hqPickerOpen ? createElement(HqWorkspacePicker, { key: 'hqpicker', registered: registeredPlanets, onClose: () => { setHqPickerOpen(false) }, onRegistered: refresh }) : null,
      detailCommand !== undefined ? createElement(FocusPage, {
        key: `cmd-${detailCommand.commandId}`,
        cmd: detailCommand,
        chain: chainOf(detailCommand),
        // V10 战线族谱：同根全体按 createdAt 升序（Ⅰ→…）；跨代点击换窗。
        chainMembers: cmdFront.get(detailCommand.commandId)?.generations ?? [detailCommand],
        origin: cmdFront.get(detailCommand.commandId)?.origin ?? null,
        onOpenCommand: id => { setDetailCommandId(id) },
        onArchive: () => {
          void archiveCommand(detailCommand.commandId).then(r => {
            if (r.ok) {
              setActionError(null)
              setCmdTab('archived')
              setDetailCommandId(null)
              refresh()
            } else {
              setActionError(r.error ?? activeCopy().actions.failToast('归档'))
            }
          })
        },
        onContinue: () => { setContinueSeed(detailCommand.commandId); setComposerOpen(true) },
        statuses,
        hqSessionId,
        services,
        focusSegment: detailSegment,
        onClose: () => { setDetailCommandId(null) },
        onRegrade: grade => { actNote(regradeCommand(detailCommand.commandId, grade), activeCopy().commandDetail.regradeTo(activeCopy().grade[grade])) },
        onDecidePlan: decision => { actNote(decidePlan(detailCommand.commandId, decision), decision === 'approve' ? activeCopy().commandDetail.approvePlan : activeCopy().commandDetail.rejectPlan) },
        onReportSeen: () => { setReportSeenRev(x => x + 1) },
        onJumpMiss: () => { setActionError(activeCopy().actions.jumpMissHint) },
      }) : null,
      // critique 回流实抓（下续战令被聚焦页遮住）：composer 必须渲染在 FocusPage
      // 之后——两弹窗同用 .war-modal-backdrop（z-index 9000），同 z 时 DOM 靠后
      // 者在上；「下续战令」正是聚焦页里开 composer 的路径。
      composerOpen ? createElement(CommandComposer, { key: 'composer', fronts: frontChoices, initialContinueId: continueSeed, initialBattlefield: continueSeed !== null ? cmdFront.get(continueSeed)?.battlefield ?? null : null, battlefields: bfChoices, onClose: () => { setComposerOpen(false); setContinueSeed(null) }, refresh }) : null,
      settingsOpen ? createElement(SettingsDrawer, {
        key: 'settings',
        onClose: () => { setSettingsOpen(false) },
        hoverFamily: hoverFamilyOn,
        onToggleHoverFamily: v => { setHoverFamilyOn(v); localStorage.setItem('warroom-cfg-hover-family', v ? '1' : '0') },
        autoScroll: autoScrollOn,
        onToggleAutoScroll: v => { setAutoScrollOn(v); localStorage.setItem('warroom-cfg-auto-scroll', v ? '1' : '0') },
        connected: error === null,
        onRefresh: refresh,
        viewMap: viewPref === 'map',
        narrowActive: viewPref === 'map' && !mapView,
        onToggleViewMap: v => {
          const next = v ? 'map' : 'list'
          setViewPref(next)
          try {
            localStorage.setItem('warroom-cfg-view', next)
            if (next === 'map') localStorage.setItem('warroom-map-hint-seen', String(Date.now()))
          } catch { /* 隐私模式 */ }
        },
      }) : null,
    )
  }
}

/** The composer dock status pill — v3: also the warroom HOME button (click
 * reopens the board via the shell entry) with an unread-since-last-seen badge. */
export function WarDockPill(): ReactNode {
  const { data } = useWar()
  useSyncExternalStore(subscribeSkin, skinId)
  // V17：岛计数随页签（所见即所数）；✉ 徽标与到访摘要保持全局。
  const tab = useSyncExternalStore(subscribeCmdTab, cmdTabShown)
  if (data === null || !data.active) return null
  const tasksAll = data.tasks
  const tabOfPill = (c: BoardCommand): CmdTab => {
    if (c.archived !== null) return 'archived'
    const ch = commandTasks(c, tasksAll)
    return c.status !== 'cancelled' && !(ch.length > 0 && ch.every(t => t.status === 'closed' || t.status === 'failed')) ? 'active' : 'settled'
  }
  const pillCmdIds = new Set(data.commands.filter(c => tabOfPill(c) === tab).map(c => c.commandId))
  const lineageCmdOf = (taskId: string): string => {
    for (const c of data.commands) if (commandTasks(c, tasksAll).some(t => t.taskId === taskId)) return c.commandId
    return ''
  }
  const pending = data.commands.filter(c => (c.status === 'received' || c.status === 'talking') && pillCmdIds.has(c.commandId)).length
  const active = data.tasks.filter(t => t.status === 'in_progress' && pillCmdIds.has(lineageCmdOf(t.taskId))).length
  const waiting = data.tasks.filter(t => t.status === 'published' && pillCmdIds.has(lineageCmdOf(t.taskId))).length
  const failed = data.tasks.filter(t => t.status === 'failed' && pillCmdIds.has(lineageCmdOf(t.taskId))).length
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
