/**
 * The board's copy lexicon — 皮肤主题系统的基础层（V6 前置）。
 *
 * 约定：
 * - 板面（views.tsx）的**所有**用户可见文案只从本模块取——不写内联字面量。
 * - `WarCopy` 是皮肤契约：换肤 = 构造一个满足该形状的新对象（可用展开做
 *   局部覆写），未来皮肤切换器只需要一个 state 持有当前皮肤并触发重渲染。
 *   例：`const plainSkin: WarCopy = { ...warCopy, outcome: { ...warCopy.outcome, succeeded: '已通过', reported: '待验收' } }`
 * - 默认皮肤 `warCopy` = 军事皮肤（当前线上文案，逐字保留——本次只建基础，
 *   不改文案值；戏剧感词汇成为可替换资产而非硬编码）。
 * - 模板类文案（带插值）建模为函数字段 `(x) => string`。
 * - 样式类名与文案解耦：列/分组用稳定 key（'commands'/'yesterday'…），
 *   皮肤改标题不会破坏 CSS 钩子与折叠状态。
 * @module dsh-plugin-warroom/client/copy
 */

import type { BoardCommand, BoardTask, BoardAttempt } from './data.ts'

export interface WarCopy {
  head: { title: string; subActive: string; subIdle: string }
  loading: { connecting: string; unreachable: (err: string) => string }
  zones: {
    hq: { title: string; note: string }
    field: { title: string; note: string }
  }
  columns: {
    commands: { title: string; empty: string }
    tasks: { title: string; empty: string }
    live: { title: string; empty: string }
    done: { title: string; empty: string }
    failed: { title: string; empty: string }
  }
  colActions: { attachLabel: string; attachTitle: string; newTitle: string }
  taskStatus: Record<BoardTask['status'], string>
  /** 分区信号灯（地图角标「！/？」与提示语）。 */
  statusMark: { published: { mark: string; title: string }; reported: { mark: string; title: string } }
  /** 日常悬赏徽章与提示。 */
  cron: { badge: (cron: string, when: string) => string; title: (nextRun: string | null) => string }
  wsChip: (path: string) => string
  depLock: { prefix: string; list: (ids: string[]) => string }
  qualityTitle: string
  commandStatus: Record<BoardCommand['status'], { label: string; hint?: string }>
  outcome: Record<'live' | NonNullable<BoardAttempt['outcome']>, { label: string }>
  days: { today: string; yesterday: string; earlier: string }
  taskCard: {
    highPriority: string
    attemptN: (n: number) => string
    attemptNTitle: string
    failReason: (e: string) => string
    failTitle: string
    lootPrefix: string
    handle: string
  }
  grade: Record<'L0' | 'L1' | 'L2', string>
  commandDetail: {
    gradeReasonPrefix: string
    regradesNote: (n: number) => string
    planTitle: Record<'pending' | 'approved' | 'rejected', string>
    approvePlan: string
    rejectPlan: string
    regradeHint: string
    regradeTo: (label: string) => string
    viewTask: (taskId: string) => string
    close: string
    cancelledReason: (r: string) => string
  }
  composer: { title: string; sub: string; placeholder: string; cancel: string; busy: string; submit: string }
  attach: {
    title: string
    sub: string
    sessionIdPlaceholder: string
    notePlaceholder: string
    cancel: string
    busy: string
    submit: string
    failFallback: string
    badge: string
    noNote: string
    detach: string
    detachTitle: string
    cardTitle: (sessionId: string) => string
  }
  session: {
    attemptN: (n: number) => string
    attemptNTitle: string
    failReason: (e: string) => string
    lootPrefix: string
    lootSummary: (loot: string, clipped: string, more: boolean) => string
    waitingReport: string
    cardTitle: (sessionId: string) => string
    goHandle: string
    enterReview: string
  }
  detail: {
    briefSection: string
    briefMissing: string
    acceptanceSection: string
    acceptanceMissing: string
    reportsSection: string
    commentsSection: string
    reportPrefixPlain: string
    reportPrefix: (ts: string) => string
    commentPrefix: (ts: string) => string
    verdictPrefix: string
    close: string
    cancel: string
  }
  dock: {
    label: string
    titleLine: (counts: { pending: number; waiting: number; active: number; failed: number }) => string
    segLine: (counts: { pending: number; waiting: number; active: number; failed: number }) => string
    unread: (n: number) => string
  }
}

/** 默认皮肤：军事风（当前文案，逐字保留）。 */
export const warCopy: WarCopy = {
  head: {
    title: '作战室 · 指挥中心',
    subActive: '命令 → 任务 → 作战 → 结果 · 左区指挥 · 右区战场',
    subIdle: '退役中（/war 启用）',
  },
  loading: {
    connecting: '连接任务栏…',
    unreachable: err => `任务栏不可达：${err}`,
  },
  zones: {
    hq: { title: '指挥中心', note: '元首的输入都在这里' },
    field: { title: '战场', note: '只读结果 · 点卡看详情 · 复盘跳 thread' },
  },
  columns: {
    commands: { title: '命令', empty: '点 + 下达第一道命令' },
    tasks: { title: '任务', empty: '等参谋发布第一张悬赏' },
    live: { title: '进行中', empty: '下达命令后，指挥官的作战会话会出现在这里' },
    done: { title: '已完成', empty: '还没有打赢的会话' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  colActions: { attachLabel: '⌁ 挂载', attachTitle: '挂载一个外部会话上战场', newTitle: '新建命令' },
  taskStatus: {
    published: '待领取',
    in_progress: '进行中',
    reported: '待翻阅',
    draft: '草稿',
    failed: '已失败',
    closed: '已收官',
  },
  statusMark: {
    published: { mark: '！', title: '新悬赏，等待指挥官领取' },
    reported: { mark: '？', title: '战报已呈递，等元首翻阅收菜' },
  },
  cron: {
    badge: (cron, when) => `⏳ 日常 ${cron}${when !== '' ? ` · 下次 ${when}` : ''}`,
    title: nextRun => `日常悬赏，错过不补跑${nextRun !== null ? `；下次 ${nextRun}` : ''}`,
  },
  wsChip: path => `工作区 ${path}`,
  depLock: { prefix: '🔒 前置未解锁：', list: ids => ids.join('、') },
  qualityTitle: '悬赏品质（复杂度分档）',
  commandStatus: {
    draft: { label: '已下达', hint: '参谋接收中（约 15 秒内）' },
    received: { label: '已接收 · 点击进入对话', hint: '参谋已接收，点击卡片进入对话回答提问' },
    talking: { label: '对话中' },
    approved: { label: '已批准', hint: '任务已发布，点击查看对应任务卡' },
    cancelled: { label: '已取消' },
  },
  outcome: {
    live: { label: '作战中' },
    reported: { label: '待元首翻阅' },
    succeeded: { label: '打赢了' },
    failed: { label: '失败' },
  },
  days: { today: '今天', yesterday: '昨天', earlier: '更早' },
  taskCard: {
    highPriority: '高优先',
    attemptN: n => `第 ${n} 次尝试`,
    attemptNTitle: '含自动重派的尝试次数',
    failReason: e => `败因：${e}`,
    failTitle: '重试已用尽，等元首让参谋重新立案',
    lootPrefix: '战利品：',
    handle: '去处理 · 参谋会话',
  },
  grade: { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' },
  commandDetail: {
    gradeReasonPrefix: '分诊理由：',
    regradesNote: n => `（元首改档 ${n} 次）`,
    planTitle: { pending: '待批', approved: '已批准', rejected: '已驳回' },
    approvePlan: '批准计划',
    rejectPlan: '驳回重呈',
    regradeHint: '升降档（元首覆写参谋分诊，改后需通知参谋按新档执行）：',
    regradeTo: label => `改为 ${label}`,
    viewTask: taskId => `查看任务 ${taskId}`,
    close: '关闭',
    cancelledReason: r => `取消原因：${r}`,
  },
  composer: {
    title: '下达命令',
    sub: '用一句大白话写下元首的意图——参谋会接收并向你澄清细节。',
    placeholder: '例：帮我做个记账的小工具，每天记一句，能翻回去看以前记的',
    cancel: '取消',
    busy: '下达中…',
    submit: '下达命令',
  },
  attach: {
    title: '挂载会话',
    sub: '把一个已存在的 thread 会话号挂上战场，作为「外部」卡管理（只读 + 跳转，不影响会话本身）。',
    sessionIdPlaceholder: '会话号（sessionId）',
    notePlaceholder: '备注（可选，一句话：这个 thread 在干什么）',
    cancel: '取消',
    busy: '挂载中…',
    submit: '挂载',
    failFallback: '挂载失败，请重试。',
    badge: '外部',
    noNote: '（未备注的外部会话）',
    detach: '摘除',
    detachTitle: '从战场摘除这张外部卡（不影响会话本身）',
    cardTitle: sessionId => `外部挂载的会话 ${sessionId}——点击进入该会话窗口`,
  },
  session: {
    attemptN: n => `第 ${n} 次`,
    attemptNTitle: '重试尝试',
    failReason: e => `败因：${e}`,
    lootPrefix: '战利品：',
    lootSummary: (loot, clipped, more) => `战利品：${clipped}${more ? '…' : ''}`,
    waitingReport: '证据已核验，等元首翻阅收官',
    cardTitle: sessionId => `指挥官会话 ${sessionId}——点击查看作战详情`,
    goHandle: '去处理 · 参谋会话',
    enterReview: '进入会话复盘',
  },
  detail: {
    briefSection: '任务书',
    briefMissing: '（参谋未附任务书正文）',
    acceptanceSection: '验收标准',
    acceptanceMissing: '（未声明）',
    reportsSection: '战报',
    commentsSection: '批注',
    reportPrefixPlain: '【汇报】',
    reportPrefix: ts => `【汇报 · ${ts}】`,
    commentPrefix: ts => `【批注 · ${ts}】`,
    verdictPrefix: '【判定】',
    close: '关闭',
    cancel: '取消',
  },
  dock: {
    label: '作战室',
    titleLine: c => `待接命令 ${c.pending} · 待领取 ${c.waiting} · 进行中 ${c.active}${c.failed > 0 ? ` · 已失败 ${c.failed}` : ''} —— 点击回到作战室`,
    segLine: c => `作战室${c.pending > 0 ? ` 命令${c.pending}` : ''} 待领${c.waiting} 进行${c.active}${c.failed > 0 ? ` 失败${c.failed}` : ''}`,
    unread: n => `${n} 新`,
  },
}
