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
    tasks: { title: string; note: string }
    report: { title: string; note: string }
  }
  /** 底部命令调度条（V9.1：滚轮横移的「英雄位」坞，视觉与三列拉开）。 */
  dispatch: { label: string; addTitle: string }
  /** V9.2 设置抽屉（岛 ⚙）：皮肤 / 图例 / 看板行为开关 / 连接状态。 */
  settings: {
    title: string
    skinSection: string
    skinWar: string
    skinPlain: string
    skinHint: string
    legendSection: string
    behaviorSection: string
    hoverFamily: string
    hoverFamilyHint: string
    autoScroll: string
    autoScrollHint: string
    connSection: string
    connOk: string
    connDown: string
    refresh: string
    close: string
  }
  /** V9.8 命令详情决策带（置顶常驻）：有事给动作，无事给安神行。 */
  commandBand: {
    title: string
    quiet: string
    planHint: string
    clarifyHint: string
    clarifyBtn: string
    reviewHint: string
    reviewBtn: string
    retryHint: string
    retryBtn: string
    scheduledHint: (time: string) => string
    noGrade: string
    noBattle: string
    battleLine: (n: number) => string
    noReport: string
    evChecks: string
    evTests: (passed: number, failed: number) => string
  }
  /** V9.2 定时命令卡角标（调度条里的 ⏰ 待发卡）。 */
  scheduleChip: { chip: (time: string) => string; cardTitle: (time: string) => string }
  columns: {
    commands: { title: string; empty: string }
    tasks: { title: string; empty: string }
    live: { title: string; empty: string }
    done: { title: string; empty: string }
    failed: { title: string; empty: string }
  }
  /** 命令全生命周期（阶段条 + 现势行——命令卡是追踪主角）。 */
  lifecycle: {
    stages: { command: string; task: string; battle: string; report: string }
    waitingStaff: string
    approvedAwaitingPublish: string
    waitingClarify: string
    planPending: string
    /** V9.11 成形卡 drafting 变体的 chip（talking/plan 复用 waitingClarify/planPending）。 */
    formingDrafting: string
    waitingClaim: string
    attemptN: (n: number) => string
    chain: (done: number, total: number) => string
    cancelled: string
    taskLabel: (id: string) => string
  }
  /** V7-① 等你发落收件箱（四类动作聚合 + 等待时长 aging）。 */
  inbox: {
    title: string
    empty: string
    clarify: string
    plan: string
    review: string
    retry: string
    waited: (d: string) => string
    warnTitle: string
    errTitle: string
    /** err 档内最老一条的加粗徽标（V7.1 老化通胀整改：红里也要有先后）。 */
    oldest: string
  }
  /** V7-② 到访摘要（自上次看过以来的增量横幅）。 */
  visit: {
    since: (d: string) => string
    firstSeen: string
    closed: (n: number) => string
    failed: (n: number) => string
    commands: (n: number) => string
    pending: (n: number) => string
  }
  /** V7-③ 族系追踪（悬停高亮 + 聚焦压暗）。 */
  trace: {
    focus: string
    focusing: string
    exitFocus: string
    focusBtnTitle: string
  }
  /** V7-④ 夜间预检（将停在计划待批的命令警告 + 改直发出口）。 */
  preflight: {
    hint: string
    toDirect: string
    title: string
  }
  /** V7-⑥ 空板首用引导（无命令无任务时的第一屏）。 */
  onboard: {
    title: string
    lead: string
    steps: [string, string, string]
    cta: string
  }
  /** V7-⑤「为什么还没动」等待解释。 */
  waitHint: {
    queued: (n: number) => string
    awaitingClaim: string
    quotaPaused: string
  }
  /** V7.1 审查整改：决策写操作失败的就地反馈（静默失败击穿信任）。 */
  actions: { failToast: (what: string) => string; jumpMissHint: string }
  /** V7.1 审查整改：板面图例——符号文法不再靠悬停自学（双皮肤各说各话）。 */
  legend: { btn: string; title: string; rows: Array<[string, string]> }
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
    handle: string
  }
  grade: Record<'L0' | 'L1' | 'L2', string>
  commandDetail: {
    gradeReasonPrefix: string
    regradesNote: (n: number) => string
    planTitle: Record<'pending' | 'approved' | 'rejected', string>
    approvePlan: string
    rejectPlan: string
    regradeTo: (label: string) => string
    close: string
    cancelledReason: (r: string) => string
    chainDone: (done: number, total: number) => string
  }
  /** V9.9 聚焦页：一条命令的全生命周期导览——四段卡片的提示语、卡下原地展开
   *  的子详情（命令下达配置/最终计划/战报结论）文案、底部两颗会话跳钮。 */
  focusPage: {
    configTitle: string
    configTiming: string
    configTimingNow: (t: string) => string
    configTimingNext: (cron: string, next: string) => string
    configTimingFired: (cron: string, at: string) => string
    configAutonomy: string
    configAutonomyAuto: string
    configText: string
    planTitle: string
    planPending: string
    planEnterSession: string
    taskGhostPlanning: string
    taskGhostApproved: string
    taskAwaitingPublish: string
    /** V9.10 任务段状态机分岔：定时待发/转达中/已取消的非交互灰提示。 */
    taskScheduledHint: (time: string) => string
    taskRelaying: string
    taskCancelled: string
    /** V9.10 ghost 卡提前：已接令=起草中（分诊结果+进会话）、等你答问=进对话。 */
    draftingGhostTitle: string
    draftingGhostCard: string
    triageLabel: string
    triagePending: string
    talkingGhostTitle: string
    talkingGhostCard: string
    talkingGhostNote: string
    talkingEnterBtn: string
    /** V9.10 任务卡展开补全：该环任务书+验收标准。 */
    taskBrief: string
    taskAcceptance: string
    briefMissing: string
    acceptanceMissing: string
    /** V9.10 战报展开收菜三件：战利品+历次作战+待发落动作（V9.12 正名复用 taskCard.handleReview/handleRetry）。 */
    lootLabel: string
    attemptsSection: string
    /** V9.10 配置展开的改档出口标签。 */
    configRegrade: string
    battleLive: (n: number) => string
    battleDone: string
    battleNone: string
    reportVerdict: string
    reportLatest: string
    reportNone: string
    taskSessionBtn: string
    execSessionBtn: string
    taskSessionHint: string
    execSessionHint: string
  }
  /** V9.2 重设计起草器：一句话能做什么（lead）+ 档位三卡 + 定时两卡（cron）。
   *  档位词条由「标签」升级为「名 + 一句语义」——选项要明确，语义要清晰。 */
  composer: {
    title: string
    lead: string
    placeholder: string
    cancel: string
    busy: string
    submit: string
    submitScheduled: string
    gradeSection: string
    gradeAuto: { name: string; hint: string }
    gradeL0: { name: string; hint: string }
    gradeL2: { name: string; hint: string }
    scheduleSection: string
    schedNow: { name: string; hint: string }
    schedCron: { name: string; hint: string }
    cronLabel: string
    cronPlaceholder: string
    cronError: (err: string) => string
    nextRun: (t: string) => string
    cronPresets: ReadonlyArray<{ label: string; cron: string }>
    recentLabel: string
    kbdHint: string
  }
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
    attemptFailedNeutral: string
    waitingReport: string
    cardTitle: (sessionId: string) => string
  }
  /** V9.9 瘦身：任务/会话详情模态已裁撤（详情面只剩聚焦页），detail 词典只剩
   *  会话卡与聚焦页战报面板仍在用的两个词条。 */
  detail: {
    reportPrefix: (ts: string) => string
    lineageLabel: string
  }
  /** V8 hero 灵动岛：标题栏的替代——大盘计数、收件箱、到访摘要与全部操作件
   * 收进顶部一颗胶囊（hover 展开 + 点击钉住；聚焦模式即岛的常驻形态）。 */
  island: {
    counts: (c: { pending: number; waiting: number; active: number; failed: number }) => string
    inboxBadge: (n: number) => string
    visitMini: (closed: number, failed: number, commands: number) => string
    pin: string
    unpin: string
    expandTitle: string
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
    title: '作战室',
    subActive: '命令 → 任务 → 作战 → 结果 · 左区指挥 · 右区战场',
    subIdle: '退役中（/war 启用）',
  },
  loading: {
    connecting: '连接任务栏…',
    unreachable: err => `任务栏不可达：${err}`,
  },
  zones: {
    tasks: { title: '任务', note: '待领 · 进行 · 待翻阅——未终局任务' },
    report: { title: '战报', note: '收官与折戟 · 点卡回源命令' },
  },
  dispatch: { label: '命令调度条（滚轮横移）', addTitle: '下达新命令（定时可选）' },
  commandBand: {
    title: '等你发落',
    quiet: '无需发落——此命令在自动推进中',
    planHint: '参谋呈了计划，批准即放权（夜间无人值守照常执行）',
    clarifyHint: '参谋在等你的回答',
    clarifyBtn: '进入参谋对话',
    reviewHint: '战报已核验，等你翻阅收官',
    reviewBtn: '去看战报',
    retryHint: '有折戟，等你定夺',
    retryBtn: '去看败因',
    scheduledHint: time => `定时下达 · ${time} 到点自动出发（此前不转达参谋）`,
    noGrade: '尚未分诊',
    noBattle: '等执行者领取',
    battleLine: n => `${n} 次作战`,
    noReport: '尚无战报',
    evChecks: '项验收通过',
    evTests: (passed, failed) => `测试 ${passed} 过/${failed} 败`,
  },

  settings: {
    title: '设置',
    skinSection: '皮肤（措辞词典）',
    skinWar: '军事',
    skinPlain: '平话',
    skinHint: '只换措辞，不改机制。更多皮肤在未来的迭代里来。',
    legendSection: '图例（符号对照）',
    behaviorSection: '看板行为',
    hoverFamily: '悬停族系高亮',
    hoverFamilyHint: '悬停任一张卡，同命令的卡高亮、其余压暗',
    autoScroll: '悬停自动滚动',
    autoScrollHint: '高亮的卡不在视野内时，自动滚到眼前',
    connSection: '连接',
    connOk: '实时通道在线',
    connDown: '实时通道断开（降级轮询）',
    refresh: '立即刷新',
    close: '关闭',
  },
  scheduleChip: {
    chip: time => `⏰ ${time}`,
    cardTitle: time => `定时命令：${time} 到点自动下达（在此之前不会转达参谋）`,
  },
  columns: {
    commands: { title: '命令', empty: '点 + 下达第一道命令' },
    tasks: { title: '任务', empty: '等参谋发布第一张悬赏' },
    live: { title: '作战中', empty: '下达命令后，指挥官的作战会话会出现在这里' },
    done: { title: '已完成', empty: '还没有打赢的会话' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  lifecycle: {
    stages: { command: '命令', task: '任务', battle: '执行', report: '战报' },
    waitingStaff: '参谋接收中',
    approvedAwaitingPublish: '任务待发布',
    waitingClarify: '等你答问',
    planPending: '计划待你批',
    formingDrafting: '成形中',
    waitingClaim: '待指挥官领取',
    attemptN: n => `第 ${n} 次尝试`,
    chain: (done, total) => `任务链 ${done}/${total}`,
    cancelled: '已取消',
    taskLabel: id => `任务 ${id}`,
  },
  inbox: {
    title: '等你发落',
    empty: '无事等你——各条战线都在自动转',
    clarify: '答澄清',
    plan: '批计划',
    review: '翻战报',
    retry: '决重试',
    waited: d => `等 ${d}`,
    warnTitle: '已等你超过半小时',
    errTitle: '已等你超过两小时——夜间命令会整晚停在这里',
    oldest: '等最久',
  },
  /** V7-② 到访摘要（自上次看过以来的增量横幅）。 */
  visit: {
    since: (d: string) => `自上次看过（${d}）以来`,
    firstSeen: '首次到访——板上就是全部现状',
    closed: (n: number) => `收官 ${n}`,
    failed: (n: number) => `折戟 ${n}`,
    commands: (n: number) => `新命令 ${n}`,
    pending: (n: number) => `等你发落 ${n}`,
  },
  trace: {
    focus: '聚焦',
    focusing: '聚焦中：',
    exitFocus: '退出聚焦',
    focusBtnTitle: '只亮这条命令的族系（它的任务与作战会话），其余压暗；Esc 退出',
  },
  preflight: {
    hint: '将停在计划待批——夜间无人值守会停整晚',
    toDirect: '改直发',
    title: '升档 L1/L2 的命令要等你批准计划才会继续，夜里没人批就一直停着。可改为 L0 直发（参谋直接发布执行），或保持等你批。',
  },
  onboard: {
    title: '作战室 · 把意图说成一句话',
    lead: '你用大白话下命令，参谋接令分诊并写任务书，指挥官在隔离工作区替你干活，带着证据与结果回来。',
    steps: [
      '① 下达命令：一句大白话写清你想要什么',
      '② 自动运转：简单的直接执行；复杂的先呈计划等你批',
      '③ 收菜：完成的进战报区，点卡看证据、验收、收产出',
    ],
    cta: '＋ 下达第一道命令',
  },
  waitHint: {
    queued: n => `排队中——同一工作区前方还有 ${n} 个（互斥不并行）`,
    awaitingClaim: '征召令可发，等待指挥官领取',
    quotaPaused: '配额恢复中——已暂停，恢复后原会话续作（不重派）',
  },
  actions: { failToast: what => `${what}没生效——服务端没接住（可能状态已变或旗关），稍候刷新再试`, jumpMissHint: '会话未跳转——该会话不在宿主目录里，请到工作区会话列表打开一次后再跳' },
  legend: {
    btn: 'ⓘ 图例',
    title: '板面图例——符号与标记',
    rows: [
      ['！', '新悬赏挂出，等待指挥官领取'],
      ['？', '战报已呈递，等你翻阅收菜'],
      ['◎', '聚焦：只亮这条命令的族系（任务+会话），Esc 退出'],
      ['↩', '溯源 chip：点它跳回源命令的全生命周期详情'],
      ['⌁', '会话号前缀（指挥官/外部挂载的会话）'],
      ['呼吸描边', 'received 命令正被参谋接收（约 15 秒），无需操作'],
      ['!! / ??', '命令前缀标记：!!直接做（L0）· ??先看方案（L2）'],
      ['L0/L1/L2', '自主度档位：直发 / 呈批 / 澄清'],
      ['四段条', '命令→任务→执行→战报 的生命周期进度'],
      ['品质五档', '悬赏复杂度分档（chip 颜色随档位）'],
      ['黄/红等待', '收件箱等待超 30 分钟转黄、超 2 小时转红，「等最久」加粗'],
    ],
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
    received: { label: '已接收', hint: '参谋在等回答：点击进入对话回答提问（点卡片本身看全生命周期）' },
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
    handleReview: '去验收 · 参谋会话',
    handleReviewTitle: '翻阅战报在本页；验收通过或驳回，结论到参谋会话说',
    handleRetry: '去下重试令 · 参谋会话',
    handleRetryTitle: '重试授权在参谋会话说——板是读投影，发令走参谋',
  },
  grade: { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' },
  commandDetail: {
    gradeReasonPrefix: '分诊理由：',
    regradesNote: n => `（元首改档 ${n} 次）`,
    planTitle: { pending: '待批', approved: '已批准', rejected: '已驳回' },
    approvePlan: '批准计划',
    rejectPlan: '驳回重呈',
    regradeTo: label => `改为 ${label}`,
    close: '关闭',
    cancelledReason: r => `取消原因：${r}`,
    chainDone: (done, total) => `${done}/${total} 已收官`,
  },
  focusPage: {
    configTitle: '命令下达配置',
    configTiming: '发布时机',
    configTimingNow: t => `立即下达 · ${t}`,
    configTimingNext: (cron, next) => `定时 · cron「${cron}」· 下次 ${next}（到点自动出发，一次有效）`,
    configTimingFired: (cron, at) => `定时 · cron「${cron}」· 已于 ${at} 自动下达`,
    configAutonomy: '自主度',
    configAutonomyAuto: '参谋分诊（未覆写）',
    configText: '命令原文',
    configRegrade: '改档',
    planTitle: '最终计划',
    planPending: '正在计划中——参谋还在写这份计划，进任务会话可以追问或补充。',
    planEnterSession: '进入任务会话',
    taskGhostPlanning: '正在计划中——点开看呈批中的计划原文',
    taskGhostApproved: '计划已批准，任务即将发布——点开看计划原文',
    taskAwaitingPublish: '任务待发布——已批准，等参谋挂出任务卡',
    taskScheduledHint: time => `⏰ 定时待发——${time} 出发后才转达参谋`,
    taskRelaying: '转达参谋中——接令后这里变成起草卡',
    taskCancelled: '命令已取消——无后续',
    draftingGhostTitle: '参谋正在起草任务书',
    draftingGhostCard: '参谋正在起草任务书——点开看分诊结果',
    triageLabel: '分诊',
    triagePending: '参谋尚未分诊',
    talkingGhostTitle: '参谋在等你回答',
    talkingGhostCard: '参谋在等你回答——点开进对话',
    talkingGhostNote: '任务卡在等你的回答成形——进对话答一句，参谋就能继续。',
    talkingEnterBtn: '进入对话回答',
    taskBrief: '任务书',
    taskAcceptance: '验收标准',
    briefMissing: '（参谋未附任务书正文）',
    acceptanceMissing: '（未声明）',
    lootLabel: '战利品',
    attemptsSection: '历次作战',
    battleLive: n => `${n} 场作战进行中`,
    battleDone: '已执行完成——没有正在进行的会话',
    battleNone: '尚未开始执行——等指挥官领取任务',
    reportVerdict: '收官结论',
    reportLatest: '最新战报',
    reportNone: '尚无战报——收官后这里给结论原文',
    taskSessionBtn: '任务会话',
    execSessionBtn: '执行会话',
    taskSessionHint: '参谋会话未形成——命令转达参谋后出现',
    execSessionHint: '执行会话未形成——指挥官领取任务后出现',
  },
  composer: {
    title: '下达命令',
    lead: '一句话写下意图，参谋会分诊并安排执行。下面两个选择，定「放权多少」与「何时出发」。',
    placeholder: '例：帮我把 projA 的依赖全部升到最新，测试全绿再收',
    cancel: '取消',
    busy: '下达中…',
    submit: '立即下达',
    submitScheduled: '定时下达',
    gradeSection: '自主度（放权多少）',
    gradeAuto: { name: '参谋分诊', hint: '默认。参谋掂量轻重：小改直做，大改呈方案' },
    gradeL0: { name: '!! 直接做', hint: '不等确认一路到底，适合有把握的小改动' },
    gradeL2: { name: '?? 先看方案', hint: '先呈计划待批，点头后才动工，适合大动作' },
    scheduleSection: '发布时机（何时出发）',
    schedNow: { name: '立即', hint: '下达即转达参谋' },
    schedCron: { name: '定时', hint: '按 cron 到点自动下达（一次有效）' },
    cronLabel: '触发时刻（cron：分 时 日 月 周）',
    cronPlaceholder: '例：0 9 * * * = 每天 9 点',
    cronError: err => err,
    nextRun: t => `下次触发：${t}（到点自动下达，仅一次）`,
    cronPresets: [
      { label: '每天 9 点', cron: '0 9 * * *' },
      { label: '工作日 9 点', cron: '0 9 * * 1-5' },
      { label: '每周一 9 点', cron: '0 9 * * 1' },
    ],
    recentLabel: '最近命令（点击填入草稿）',
    kbdHint: 'n 新建命令 · Ctrl+Enter 提交 · Esc 关闭（草稿自动保留）',
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
    attemptFailedNeutral: '该次尝试失败——进复盘看全程',
    waitingReport: '证据已核验，等元首翻阅收官',
    cardTitle: sessionId => `指挥官会话 ${sessionId}——点击查看作战详情`,
  },
  detail: {
    reportPrefix: ts => `【汇报 · ${ts}】`,
    lineageLabel: '源自命令',
  },
  island: {
    counts: c => `待接 ${c.pending} · 待领 ${c.waiting} · 作战中 ${c.active}${c.failed > 0 ? ` · 折戟 ${c.failed}` : ''}`,
    inboxBadge: n => `✉ ${n}`,
    visitMini: (closed, failed, commands) =>
      [closed > 0 ? `▲收官 ${closed}` : '', failed > 0 ? `✕折戟 ${failed}` : '', commands > 0 ? `✚新令 ${commands}` : '']
        .filter(s => s !== '').join(' · '),
    pin: '钉住展开（再点收起）',
    unpin: '取消钉住',
    expandTitle: '悬停展开 · 点击钉住',
  },
  dock: {
    label: '作战室',
    titleLine: c => `待接命令 ${c.pending} · 待领取 ${c.waiting} · 进行中 ${c.active}${c.failed > 0 ? ` · 已失败 ${c.failed}` : ''} —— 点击回到作战室`,
    segLine: c => `作战室${c.pending > 0 ? ` 命令${c.pending}` : ''} 待领${c.waiting} 进行${c.active}${c.failed > 0 ? ` 失败${c.failed}` : ''}`,
    unread: n => `${n} 新`,
  },
}

/**
 * 平话皮肤：同一套角色与机制，工程平话文案（角色扮演顾虑的正式出口——
 * 机制词换日常语，「打赢了→已完成」）。品牌词「作战室」保留。
 */
export const plainCopy: WarCopy = {
  head: {
    title: '作战室',
    subActive: '命令 → 任务 → 执行 → 结果 · 左区下达 · 右区看结果',
    subIdle: '未启用（/war 启用）',
  },
  loading: {
    connecting: '连接看板…',
    unreachable: err => `看板不可达：${err}`,
  },
  zones: {
    tasks: { title: '任务', note: '未完成的任务' },
    report: { title: '结果', note: '完成与失败 · 点卡回源命令' },
  },
  dispatch: { label: '命令调度条（滚轮横移）', addTitle: '下新命令（可定时）' },
  commandBand: {
    title: '等你处理',
    quiet: '不用管——这条命令在自己推进',
    planHint: '参谋给了方案，点头就照做（夜里也不停）',
    clarifyHint: '参谋在等你回话',
    clarifyBtn: '去对话',
    reviewHint: '结果已核好，等你过目',
    reviewBtn: '去看结果',
    retryHint: '有失败的，等你定',
    retryBtn: '去看失败',
    scheduledHint: time => `定时 · ${time} 自动开始（到点前不转给参谋）`,
    noGrade: '还没分诊',
    noBattle: '等人接手',
    battleLine: n => `执行 ${n} 次`,
    noReport: '还没有结果',
    evChecks: '项验收通过',
    evTests: (passed, failed) => `测试 ${passed} 过/${failed} 败`,
  },

  settings: {
    title: '设置',
    skinSection: '皮肤（用词风格）',
    skinWar: '军事',
    skinPlain: '平话',
    skinHint: '只换说法，不改功能。更多皮肤以后加。',
    legendSection: '图例（符号对照）',
    behaviorSection: '看板行为',
    hoverFamily: '悬停看同源',
    hoverFamilyHint: '悬停卡片时，同一命令的卡片亮、其他变暗',
    autoScroll: '自动滚到眼前',
    autoScrollHint: '高亮的卡片不在画面里时，自动滚动过去',
    connSection: '连接',
    connOk: '实时连接正常',
    connDown: '实时连接断了（改为轮询）',
    refresh: '立即刷新',
    close: '关闭',
  },
  scheduleChip: {
    chip: time => `⏰ ${time}`,
    cardTitle: time => `定时命令：${time} 自动下达（到点前不转给参谋）`,
  },
  columns: {
    commands: { title: '命令', empty: '点 + 下达第一条命令' },
    tasks: { title: '任务', empty: '等参谋发布第一个任务' },
    live: { title: '执行中', empty: '下达命令后，执行会话会出现在这里' },
    done: { title: '已完成', empty: '还没有完成的会话' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  lifecycle: {
    stages: { command: '下达', task: '任务', battle: '执行', report: '结果' },
    waitingClarify: '等你回答',
    waitingStaff: '参谋接收中',
    approvedAwaitingPublish: '任务待发布',
    planPending: '方案待你批',
    formingDrafting: '成形中',
    waitingClaim: '等执行者领取',
    attemptN: n => `第 ${n} 次尝试`,
    chain: (done, total) => `任务组 ${done}/${total}`,
    cancelled: '已取消',
    taskLabel: id => `任务 ${id}`,
  },
  inbox: {
    title: '待你处理',
    empty: '暂无待办——各条任务线都在自动跑',
    clarify: '回答提问',
    plan: '审批方案',
    review: '查看结果',
    retry: '处理失败',
    waited: d => `已等 ${d}`,
    warnTitle: '已等待超过半小时',
    errTitle: '已等待超过两小时——夜里没人处理会一直停着',
    oldest: '等最久',
  },
  visit: {
    since: (d: string) => `自上次查看（${d}）以来`,
    firstSeen: '首次到访——板上就是全部现状',
    closed: (n: number) => `完成 ${n}`,
    failed: (n: number) => `失败 ${n}`,
    commands: (n: number) => `新命令 ${n}`,
    pending: (n: number) => `待处理 ${n}`,
  },
  trace: {
    focus: '只看这条',
    focusing: '单看：',
    exitFocus: '退出',
    focusBtnTitle: '只显示这条命令相关的任务与会话，其余变淡；Esc 退出',
  },
  preflight: {
    hint: '需要你批准方案后才会继续——夜里没人处理会一直停着',
    toDirect: '改为直接执行',
    title: '标记为 L1/L2 的任务要等你批准方案才会继续，夜里没人处理就一直停着。可改为直接执行（参谋直接发布），或保持等你批。',
  },
  onboard: {
    title: '作战室 · 把意图说成一句话',
    lead: '你用大白话下命令，系统接令、拆解成任务并在隔离工作区执行，完成后带着证据与结果回来。',
    steps: [
      '① 下达命令：一句大白话写清你想要什么',
      '② 自动运转：简单的直接执行；复杂的先出方案等你批',
      '③ 收结果：完成的进结果区，点卡看证据、验收与产出',
    ],
    cta: '＋ 下达第一条命令',
  },
  waitHint: {
    queued: n => `排队中——同一工作区前方还有 ${n} 个（不能同时执行）`,
    awaitingClaim: '等待执行者领取',
    quotaPaused: '额度恢复中——已暂停，恢复后原任务继续（不重新开始）',
  },
  actions: { failToast: what => `${what}没有生效——服务器拒绝了（可能状态已变），稍后刷新重试`, jumpMissHint: '会话未跳转——该会话不在宿主目录里，请到工作区会话列表打开一次后再跳' },
  legend: {
    btn: 'ⓘ 图例',
    title: '看板图例——符号与标记',
    rows: [
      ['！', '新任务，等待执行者领取'],
      ['？', '结果已提交，等待你验收'],
      ['◎', '只看这条：高亮相关任务与会话，其余变淡，Esc 退出'],
      ['↩', '来源 chip：点它跳回源命令的详情'],
      ['⌁', '会话号前缀（执行/外部挂载的会话）'],
      ['呼吸描边', '新命令正被参谋接收（约 15 秒），不用操作'],
      ['!! / ??', '命令前缀标记：!!直接做（L0）· ??先看方案（L2）'],
      ['L0/L1/L2', '自主度档位：直接执行 / 先审方案 / 先问清楚'],
      ['四段条', '下达→任务→执行→结果 的进度'],
      ['品质五档', '任务复杂度分档（chip 颜色随档位）'],
      ['黄/红等待', '待办等待超 30 分钟转黄、超 2 小时转红，「等最久」加粗'],
    ],
  },
  colActions: { attachLabel: '⌁ 挂载', attachTitle: '把一个外部会话挂上看板', newTitle: '新建命令' },
  taskStatus: {
    published: '待领取',
    in_progress: '执行中',
    reported: '待验收',
    draft: '草稿',
    failed: '已失败',
    closed: '已完成',
  },
  statusMark: {
    published: { mark: '！', title: '新任务，等待领取' },
    reported: { mark: '？', title: '汇报已提交，等待验收' },
  },
  cron: {
    badge: (cron, when) => `⏳ 周期 ${cron}${when !== '' ? ` · 下次 ${when}` : ''}`,
    title: nextRun => `周期任务，错过不补跑${nextRun !== null ? `；下次 ${nextRun}` : ''}`,
  },
  wsChip: path => `目录 ${path}`,
  depLock: { prefix: '⏳ 前置未完成：', list: ids => ids.join('、') },
  qualityTitle: '复杂度分级',
  commandStatus: {
    draft: { label: '已下达', hint: '参谋接收中（约 15 秒内）' },
    received: { label: '已接收', hint: '参谋在等回答：点击进入对话回答提问（点卡片本身看全生命周期）' },
    talking: { label: '对话中' },
    approved: { label: '已发布', hint: '任务已发布，点击查看对应任务卡' },
    cancelled: { label: '已取消' },
  },
  outcome: {
    live: { label: '执行中' },
    reported: { label: '待验收' },
    succeeded: { label: '已完成' },
    failed: { label: '失败' },
  },
  days: { today: '今天', yesterday: '昨天', earlier: '更早' },
  taskCard: {
    highPriority: '高优先',
    attemptN: n => `第 ${n} 次尝试`,
    attemptNTitle: '含自动重派的尝试次数',
    failReason: e => `失败原因：${e}`,
    failTitle: '重试已用尽，等参谋重新立案',
    handleReview: '去验收 · 参谋会话',
    handleReviewTitle: '翻阅战报在本页；验收通过或驳回，结论到参谋会话说',
    handleRetry: '去下重试令 · 参谋会话',
    handleRetryTitle: '重试授权在参谋会话说——板是只读的，发令走参谋',
  },
  grade: { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' },
  commandDetail: {
    gradeReasonPrefix: '分诊理由：',
    regradesNote: n => `（改档 ${n} 次）`,
    planTitle: { pending: '待批', approved: '已批准', rejected: '已驳回' },
    approvePlan: '批准计划',
    rejectPlan: '驳回重呈',
    regradeTo: label => `改为 ${label}`,
    close: '关闭',
    cancelledReason: r => `取消原因：${r}`,
    chainDone: (done, total) => `${done}/${total} 已完成`,
  },
  focusPage: {
    configTitle: '命令下达配置',
    configTiming: '开始时间',
    configTimingNow: t => `立即下达 · ${t}`,
    configTimingNext: (cron, next) => `定时 · cron「${cron}」· 下次 ${next}（到点自动开始，一次有效）`,
    configTimingFired: (cron, at) => `定时 · cron「${cron}」· 已于 ${at} 自动下达`,
    configAutonomy: '自主度',
    configAutonomyAuto: '让参谋定（未覆写）',
    configText: '命令原文',
    configRegrade: '改档',
    planTitle: '最终计划',
    planPending: '正在计划中——参谋还在写这份计划，进任务会话可以追问或补充。',
    planEnterSession: '进入任务会话',
    taskGhostPlanning: '正在计划中——点开看待批的计划原文',
    taskGhostApproved: '计划已批准，任务马上发布——点开看计划原文',
    taskAwaitingPublish: '任务待发布——已批准，等参谋挂出任务卡',
    taskScheduledHint: time => `⏰ 定时待发——${time} 出发后才转给参谋`,
    taskRelaying: '转给参谋中——接令后这里变成起草卡',
    taskCancelled: '命令已取消——没有后续',
    draftingGhostTitle: '参谋正在写任务说明',
    draftingGhostCard: '参谋正在写任务说明——点开看分诊结果',
    triageLabel: '分诊',
    triagePending: '参谋还没分诊',
    talkingGhostTitle: '参谋在等你回答',
    talkingGhostCard: '参谋在等你回答——点开进对话',
    talkingGhostNote: '任务卡要等你的回答才能成形——进对话说一句，参谋就能继续。',
    talkingEnterBtn: '进入对话回答',
    taskBrief: '任务说明',
    taskAcceptance: '验收标准',
    briefMissing: '（参谋没附任务说明）',
    acceptanceMissing: '（未声明）',
    lootLabel: '交付',
    attemptsSection: '历次执行',
    battleLive: n => `${n} 个执行进行中`,
    battleDone: '已执行完成——没有正在进行的会话',
    battleNone: '还没开始执行——等指挥官领取任务',
    reportVerdict: '收官结论',
    reportLatest: '最新汇报',
    reportNone: '还没有汇报——收官后这里给结论原文',
    taskSessionBtn: '任务会话',
    execSessionBtn: '执行会话',
    taskSessionHint: '参谋会话还没建立——命令转给参谋后出现',
    execSessionHint: '执行会话还没建立——指挥官领取任务后出现',
  },
  composer: {
    title: '下命令',
    lead: '一句话写下你要的结果，参谋会接手安排。下面选好放权多少、什么时候开始。',
    placeholder: '例：帮我做个记账小工具，每天记一句，能翻回看',
    cancel: '取消',
    busy: '下达中…',
    submit: '立即下达',
    submitScheduled: '定时下达',
    gradeSection: '自主度',
    gradeAuto: { name: '让参谋定', hint: '默认。小改动直接做，大改动先给方案' },
    gradeL0: { name: '!! 直接做', hint: '不等确认一路做完，适合有把握的小事' },
    gradeL2: { name: '?? 先看方案', hint: '先给方案等你点头，适合大动作' },
    scheduleSection: '开始时间',
    schedNow: { name: '马上', hint: '下达就转给参谋' },
    schedCron: { name: '定时', hint: '到点自动下达（一次有效）' },
    cronLabel: '触发时间（cron：分 时 日 月 周）',
    cronPlaceholder: '例：0 9 * * * = 每天 9 点',
    cronError: err => err,
    nextRun: t => `下次触发：${t}（到点自动下达，只一次）`,
    cronPresets: [
      { label: '每天 9 点', cron: '0 9 * * *' },
      { label: '工作日 9 点', cron: '0 9 * * 1-5' },
      { label: '每周一 9 点', cron: '0 9 * * 1' },
    ],
    recentLabel: '最近命令（点击填入）',
    kbdHint: 'n 新建命令 · Ctrl+Enter 提交 · Esc 关闭（草稿自动保留）',
  },
  attach: {
    title: '挂载会话',
    sub: '把一个已存在的会话号挂上看板，作为「外部」卡管理（只读 + 跳转，不影响会话本身）。',
    sessionIdPlaceholder: '会话号（sessionId）',
    notePlaceholder: '备注（可选，一句话：这个会话在干什么）',
    cancel: '取消',
    busy: '挂载中…',
    submit: '挂载',
    failFallback: '挂载失败，请重试。',
    badge: '外部',
    noNote: '（未备注的外部会话）',
    detach: '摘除',
    detachTitle: '从看板摘除这张外部卡（不影响会话本身）',
    cardTitle: sessionId => `外部挂载的会话 ${sessionId}——点击进入该会话窗口`,
  },
  session: {
    attemptN: n => `第 ${n} 次`,
    attemptNTitle: '重试尝试',
    failReason: e => `失败原因：${e}`,
    attemptFailedNeutral: '该次没成——进复盘看全程',
    waitingReport: '证据已核验，等你验收',
    cardTitle: sessionId => `执行会话 ${sessionId}——点击查看详情`,
  },
  detail: {
    reportPrefix: ts => `【汇报 · ${ts}】`,
    lineageLabel: '源自命令',
  },
  island: {
    counts: c => `待接 ${c.pending} · 待领 ${c.waiting} · 执行中 ${c.active}${c.failed > 0 ? ` · 失败 ${c.failed}` : ''}`,
    inboxBadge: n => `✉ ${n}`,
    visitMini: (closed, failed, commands) =>
      [closed > 0 ? `▲完成 ${closed}` : '', failed > 0 ? `✕失败 ${failed}` : '', commands > 0 ? `＋新命令 ${commands}` : '']
        .filter(s => s !== '').join(' · '),
    pin: '钉住展开（再点收起）',
    unpin: '取消钉住',
    expandTitle: '悬停展开 · 点击钉住',
  },
  dock: {
    label: '作战室',
    titleLine: c => `待接命令 ${c.pending} · 待领取 ${c.waiting} · 执行中 ${c.active}${c.failed > 0 ? ` · 已失败 ${c.failed}` : ''} —— 点击回到作战室`,
    segLine: c => `作战室${c.pending > 0 ? ` 命令${c.pending}` : ''} 待领${c.waiting} 执行${c.active}${c.failed > 0 ? ` 失败${c.failed}` : ''}`,
    unread: n => `${n} 新`,
  },
}

// --- 皮肤 store（纯函数层，不引 react——node 测试可安全 import）-----------

export type SkinId = 'war' | 'plain'

const SKIN_STORAGE_KEY = 'warroom-skin'
const skins: Record<SkinId, WarCopy> = { war: warCopy, plain: plainCopy }

function storedSkin(): SkinId {
  try {
    if (typeof localStorage === 'undefined') return 'war'
    return localStorage.getItem(SKIN_STORAGE_KEY) === 'plain' ? 'plain' : 'war'
  } catch {
    return 'war'
  }
}

let currentId: SkinId = storedSkin()
const listeners = new Set<() => void>()

export function skinId(): SkinId {
  return currentId
}

/** 当前皮肤的词典（渲染期调用——皮肤切换后由订阅者重渲染拉新值）。 */
export function activeCopy(): WarCopy {
  return skins[currentId]
}

export function setSkin(id: SkinId): void {
  if (id === currentId) return
  currentId = id
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SKIN_STORAGE_KEY, id)
  } catch {
    // 持久化失败不影响会话内切换。
  }
  for (const l of listeners) l()
}

export function toggleSkin(): void {
  setSkin(currentId === 'war' ? 'plain' : 'war')
}

/** 皮肤切换订阅（views 经 useSyncExternalStore 接入触发重渲染）。 */
export function subscribeSkin(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
