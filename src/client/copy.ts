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
  /** V10 星域战场。 */
  starfield: { aria: string; hqOn: string; hqOff: string; orbIdle: string; mapLegend: string; mapHintToast: string; mapHintDismiss: string; untraced: string; controls: string; ungrouped: string
    /** V16.4-R5 critique P1：星域层文案并词典（此前 starfield3d/wzLog/2D 标题 ~20 条
     *  硬编码绕过 activeCopy——V16「改一处词典三皮肤同步」的结构性保证在地图半边失效）。 */
    hqName: string
    hqTag: string
    wzStWait: string
    wzStBattle: string
    wzStHeld: string
    legendWait: string
    legendBattle: string
    legendHeld: string
    legendHl: string
    legendFront: string
    hintCmd: string
    hint3d: string
    toggle3d: string
    toggle2d: string
    toggleAria: string
    hqPickerTitle: string
    hqPickerHint: string
    hqPickerRegister: string
    hqPickerRegistered: string
    hqPickerEmpty: string
    /** V18.9.4 分组列头（带计数）。 */
    hqPickerRegGroup: (n: number) => string
    hqPickerDoneGroup: (n: number) => string
    xcardPrefix: string
    footStat: (squads: number, planets: number, fronts: number) => string
    kbGroupAria: string
    logOrder: string
    logTriumph: string
    logRetreat: string
    logReview: string
    garrisonTitle: (active: number, awaiting: number, triumphs: number, failing: number) => string
    garrisonAria: (label: string, active: number, awaiting: number, triumphs: number, failing: number) => string
    /** V18.2 悬停卡瘦身（舰长令：名字/路径/状态给最精简读数）+ 全词面入典：
     * 星球态/编队相位/战线/HQ 行——军事源串为单一源，trek 词表运行时派生。 */
    stPlanetActive: string
    stPlanetSettled: string
    stPlanetFailed: string
    stPlanetIdle: string
    failSuffix: (n: number) => string
    tacGarrison: (n: number) => string
    sqTag: string
    targetLabel: string
    phaseLabel: string
    returnHq: string
    phOutbound: (pct: number) => string
    phBattle: (verb: string) => string
    phDeployed: string
    phPaused: string
    phHolding: string
    phReturn: (pct: number) => string
    frontN: (n: number) => string
    viewFront: string
    hqRow: (planets: number, squads: number, triumphs: number) => string
  }
  /** V13 战线头（任务列分组/航迹语义）：代数与聚合态措辞。 */
  front: { genN: (n: number) => string; taskN: (n: number) => string; stateLive: string; stateWaiting: string; stateFailed: string; stateSettled: string; originChip: (bf: string | null, title: string) => string }
  dispatch: { label: string; addTitle: string; viewMapHint: string; viewBackHint: string; segActive: string; segSettled: string }
  /** V9.2 设置抽屉（岛 ⚙）：皮肤 / 图例 / 看板行为开关 / 连接状态。 */
  settings: {
    title: string
    skinSection: string
    skinTrek: string
    skinWar: string
    skinPlain: string
    skinHint: string
    legendSection: string
    behaviorSection: string
    hoverFamily: string
    hoverFamilyHint: string
    /** V10.1 战场视图开关（星域地图 ⇄ 三列局势墙）。 */
    viewMap: string
    viewMapHint: string
    /** V10.1 critique：视图独立分组 + 窄屏降级的诚实说明。 */
    viewSection: string
    narrowNote: string
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
    /** V18 critique A2：终局命令的安神带（quiet 的「推进中」对终局是假话）。 */
    terminalCancelled: string
    terminalSettled: string
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
    live: { title: string; empty: string; resident: string }
    done: { title: string; empty: string }
    failed: { title: string; empty: string }
  }
  /** 命令全生命周期（阶段条 + 现势行——命令卡是追踪主角）。 */
  lifecycle: {
    stages: { command: string; task: string; battle: string; report: string }
    waitingStaff: string
    /** V16.4-R3：未接令（含定时未出发）专用——「起草中」只留给真在起草的，假动词不说谎。 */
    pendingRelay: string
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
  legend: { btn: string; title: string; rows: Array<[string, string] | [string, string, string]> }
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
    taskIdTitle: string
    failReason: (e: string) => string
    failTitle: string
    handle: string
  }
  grade: Record<'L0' | 'L1' | 'L2', string>
  /** V10 战线链身份：世代徽标悬停语 / 族谱面包屑 aria / 续接模式正名。 */
  chain: {
    genBadgeTitle: (generations: number) => string
    breadcrumbAria: string
    tags: Record<'deepen' | 'retry' | 'pivot', string>
    continueBtn: string
    continueBtnTitle: string
  }
  /** V10.1 卡规格统一：R5 空占位 / 战线历代状态 pip（罗马数字=代数）/ 组展开面板。 */
  commandCard: {
    noQuickAction: string
    /** A3-P2：终局命令的快捷操作占位（「推进中」对终局是假话）。 */
    noQuickCancelled: string
    noQuickSettled: string
    pipsTitle: (generations: number) => string
    pipStatus: Record<'run' | 'wait' | 'done' | 'fail' | 'idle', string>
    panelAria: (generations: number) => string
  }
  commandDetail: {
    gradeReasonPrefix: string
    regradesNote: (n: number) => string
    planTitle: Record<'pending' | 'approved' | 'rejected', string>
    approvePlan: string
    rejectPlan: string
    planIrreversible: string
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
    /** V10.1 critique P1-1：战报段在途回退——不再是死区灰条。 */
    reportLive: (verb: string, n: number, when: string) => string
    reportQueued: string
    reportSettledSoon: string
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
    /** V18.8 常用命令模板（点击填入草稿，可再改）。 */
    templates: ReadonlyArray<{ label: string; text: string }>
    templatesLabel: string
    /** V18.8 星球→战线融合选择器（舰长令：先选星球，再选续接哪条战线或新开；
     *  续接必随该星球——星球与战线一个控件，不再可能选冲突）。 */
    planetSection: string
    planetAuto: string
    planetAutoHint: string
    frontSub: string
    frontNew: string
    frontNewHint: string
    frontEmpty: string
    frontLiveSuffix: string
    /** V18.8 闹钟式定时：重复模式四选 + 时刻/日期/周几，cron 内部生成。 */
    alarmModes: ReadonlyArray<{ id: 'once' | 'daily' | 'weekday' | 'weekly'; name: string; hint: string }>
    alarmDateLabel: string
    alarmTimeLabel: string
    dowNames: ReadonlyArray<string>
    alarmAdvanced: string
    pastTime: string
    /** V15 战线命名（可选输入）。 */
    nameSection: string
    namePlaceholder: string
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
    counts: (c: { awaiting: number; pending: number; waiting: number; active: number; failed: number }) => string
    /** V16.4-R3：分段结构化（岛计数可点路由）——label 过词表（函数返回值派生）。 */
    countSegs: (c: { awaiting: number; pending: number; waiting: number; active: number; failed: number }) => ReadonlyArray<{ kind: 'awaiting' | 'pending' | 'waiting' | 'active' | 'failed'; label: string }>
    /** V18 critique：岛计数=全页签口径（切片只作用于三列）。 */
    countsScope: string
    inboxBadge: (n: number) => string
    visitMini: (closed: number, failed: number, commands: number) => string
    pin: string
    unpin: string
    expandTitle: string
    /** V10.1 审查：收件箱新增的礼貌播报（视觉隐藏 live 区）。 */
    announceInbox: (n: number) => string
  }
  /** V17 三页签全局切片 + 归档。 */
  /** V18 critique：管线发现路径（列表态一次性指路）。 */
  pipeHint: string
  /** V18 critique：归档空页签安神行。 */
  cmdTabsArchivedEmpty: string
  cmdTabs: { active: string; settled: string; archived: string; aria: string; countTitle: (label: string, n: number) => string }
  archive: {
    button: string
    gate: string
    confirmTitle: string
    irreversible: string
    confirmOk: string
    cancel: string
    done: (n: number) => string
    badge: string
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
    tasks: { title: '任务', note: '等·指挥官 · 进行 · 待翻阅——未终局任务' },
    report: { title: '战报', note: '收官与折戟 · 点卡回源命令' },
  },
  dispatch: { label: '命令调度条（滚轮横移）', addTitle: '下达新命令（定时可选）· 快捷键 n', viewMapHint: '切到战区——每片战场一颗星，战线环串起世代', viewBackHint: '回列表视图（三列局势墙）', segActive: '进行中', segSettled: '已收官' },
  pipeHint: '悬停命令卡可显示族系管线——链色即战线色',
  cmdTabsArchivedEmpty: '归档后命令落在这里。归档入口在命令聚焦页——全线终局后可归档',
  commandBand: {
    title: '等你发落',
    quiet: '无需发落——此命令在自动推进中',
    terminalCancelled: '已取消——此命令已终局，不再推进',
    terminalSettled: '已收官——全线终局，无需你动作',
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
    evTests: (passed, failed) => `测试 ${passed} 过/${failed} 折戟`,
  },

  settings: {
    title: '设置',
    skinSection: '皮肤（措辞词典）',
    skinTrek: '星际迷航',
    skinWar: '军事',
    skinPlain: '平话',
    skinHint: '只换措辞，不改机制。更多皮肤在未来的迭代里来。',
    legendSection: '图例（符号对照）',
    behaviorSection: '看板行为',
    hoverFamily: '悬停族系高亮',
    hoverFamilyHint: '悬停任一张卡，同命令的卡高亮、其余压暗',
    viewMap: '战区视图',
    viewMapHint: '开=战区为底、任务/战报浮舱压图；关=三列局势墙（窄于 900px 自动回列表）',
    viewSection: '视图',
    narrowNote: '窗口窄于 900px，战区暂回列表——放宽窗口自动恢复',
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
    live: { title: '作战中', empty: '下达命令后，指挥官的作战会话会出现在这里', resident: ' · 常驻' },
    done: { title: '已完成', empty: '战报栏还空着——收官与折戟都会落在这里' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  lifecycle: {
    stages: { command: '命令', task: '任务', battle: '执行', report: '战报' },
    waitingStaff: '参谋起草中',
    pendingRelay: '待参谋接令',  /* V16.4-R3 P1-1：chip 说账本事实（已接收），状态行说正在发生的动词（起草中）——等价类收敛 */
    approvedAwaitingPublish: '任务待发布',
    waitingClarify: '等你答问',
    planPending: '计划待你批',
    formingDrafting: '起草中',  /* V16.4-R3 P1-1：与解释行「正在起草任务书」同一动词 */
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
    commands: (n: number) => `新令 ${n}`,
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
      ['●', '状态四档：蓝 = 机器在动', 'dot-run'],
      ['●', '琥珀 = 等你发落', 'dot-wait'],
      ['●', '绿 = 善终（收官/已阅）', 'dot-done'],
      ['●', '红 = 折戟（终局/熔断）', 'dot-fail'],
      ['◌', '战线环：一星球一环，分段数 = 该星球挂载的战线数（跨战场续接自成新战线）'],
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
    published: '等·指挥官领取',
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
    taskIdTitle: '任务单 ID（溯源用）',
    failReason: e => `败因：${e}`,
    failTitle: '重试已用尽，等元首让参谋重新立案',
    handleReview: '去验收 · 参谋会话',
    handleReviewTitle: '翻阅战报在本页；验收通过或驳回，结论到参谋会话说',
    handleRetry: '去下重试令 · 参谋会话',
    handleRetryTitle: '重试授权在参谋会话说——板是读投影，发令走参谋',
  },
  grade: { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' },
  chain: {
    genBadgeTitle: n => `本命令是这条战线的第 ${n} 代续作`,
    breadcrumbAria: '战线族谱：历代替续，逐级可跳',
    tags: { deepen: '续战令·深化', retry: '续战令·再战', pivot: '续战令·转向' },
    continueBtn: '下续战令',
    continueBtnTitle: '以这条命令为母本下达续作——新令接过战线继续打',
  },
  commandCard: {
    noQuickAction: '无需操作——命令在自动推进',
    noQuickCancelled: '已取消——此命令已终局',
    noQuickSettled: '已收官——全线终局',
    pipsTitle: n => `这条战线共 ${n} 代——每个圆点是一代，颜色即该代当前状态`,
    pipStatus: { run: '推进中', wait: '等你发落', done: '善终', fail: '败退', idle: '未战而终' },
    panelAria: n => `战线前史共 ${n} 代（最新一代就在坞上）：上/下键选代，回车打开详情`,
  },
  starfield: {
    aria: '战区：每片战场一颗星，战线环串起同战场的世代，执行部队绕星而行',
    hqOn: '司令部在线——战时状态，全局开关亮着',
    hqOff: '停战状态——司令部熄灯',
    orbIdle: '执行中',
    mapLegend: '蓝动·琥珀等·绿善终·红败 ｜ 行星=战场（内环=最老）· 环=战线（分段=战线数）· ✓凯旋 · 呼吸光点=执行中',
    mapHintToast: '🪐 战场不止一个——试试战区视图（点此开启，⚙ 设置里随时可关）',
    mapHintDismiss: '忽略',
    controls: '左键拖拽平移 · 中键旋转 · 滚轮缩放 · 双击或 R 复位 · 悬停光点点亮战线',
    untraced: '未溯源执行',
    ungrouped: '未分组',
    hqName: 'HEADQUARTERS',
    hqTag: '元首 · 指挥中枢',
    wzStWait: '待进攻',
    wzStBattle: '执行中',
    wzStHeld: '已占领',
    legendWait: '待进攻',
    legendBattle: '执行中',
    legendHeld: '已占领',
    legendHl: '聚焦轨迹',
    legendFront: '战线环（分段=战线数）',
    hintCmd: '点击战场 看战线 · 拖卡 摆位 · V 切换视图 · M 回列表',
    hint3d: '左键 平移 · 中键 旋转 · 滚轮 缩放 · 双击/R 复位 · V 切换视图 · M 回列表',
    toggle3d: '3D 视图',
    toggle2d: '2D 视图',
    toggleAria: '视图切换',
    hqPickerTitle: '注册工作区为星球',
    hqPickerHint: '选取宿主侧已建立的工作区——注册后作为星球进入星域',
    hqPickerRegister: '注册为星球',
    hqPickerRegistered: '已注册',
    hqPickerEmpty: '宿主侧暂无工作区（或清单未就绪）',
    hqPickerRegGroup: n => `可注册（${n}）`,
    hqPickerDoneGroup: n => `已在星域（${n}）`,
    xcardPrefix: '作战中：',
    footStat: (sq, pl, fr) => `${sq} 队在外 · ${pl} 战场 · ${fr} 战线`,
    kbGroupAria: '战场清单（键盘直达战线面板）',
    logOrder: '下令',
    logTriumph: '达成',
    logRetreat: '败退',
    logReview: '任务回报待验收',
    garrisonTitle: (ac, aw, tr, fa) => `活跃 ${ac} · 待发 ${aw} · 达成 ${tr} · 折戟 ${fa}`,
    garrisonAria: (lb, ac, aw, tr, fa) => `战场 ${lb}：活跃 ${ac}、待发 ${aw}、达成 ${tr}、折戟 ${fa}——跳最近的源命令`,
    stPlanetActive: '作战中',
    stPlanetSettled: '已收官',
    stPlanetFailed: '有折戟',
    stPlanetIdle: '未开战',
    failSuffix: n => ` ·${n}折戟`,
    tacGarrison: n => `达成 ${n}`,
    sqTag: '执行编队',
    targetLabel: '目标战场',
    phaseLabel: '行动',
    returnHq: '返航 → 母舰',
    phOutbound: pct => `出击 · 进度 ${pct}%`,
    phBattle: verb => `作战中 · ${verb}`,
    phDeployed: '待验收 · 驻泊巡护',
    phPaused: '配额暂停 · 待命',
    phHolding: '集结 · 待起跑',
    phReturn: pct => `返航 · 进度 ${pct}%`,
    frontN: n => `战线 · ${n} 代`,
    viewFront: '点击查看这条战线',
    hqRow: (pl, sq, tr) => `辖 ${pl} 战场 · ${sq} 支编队在外 · 累计达成 ${tr} 仗`,
  },
  front: { genN: n => `${n} 代`, taskN: n => `${n} 任务`, originChip: (bf, title) => `续接自 ${bf === null ? '别的战场' : bf}·${title}`, stateLive: '推进中', stateWaiting: '等你发落', stateFailed: '有折戟', stateSettled: '已收官' },
  commandDetail: {
    gradeReasonPrefix: '分诊理由：',
    regradesNote: n => `（元首改档 ${n} 次）`,
    planTitle: { pending: '待批', approved: '已批准', rejected: '已驳回' },
    approvePlan: '批准计划',
    rejectPlan: '驳回重呈',
    planIrreversible: '批准即发布，下发后不可撤回；驳回则退回参谋重拟',
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
    reportLive: (verb, n, when) => `作战进行中 · ${verb} · 第 ${n} 次作战 · 始于${when}`,
    reportQueued: '部队待领令——领令开战后这里实时播报',
    reportSettledSoon: '上一仗已收束，战报由参谋呈递后在此',
    taskSessionBtn: '任务会话',
    execSessionBtn: '执行会话',
    taskSessionHint: '参谋会话未形成——命令转达参谋后出现',
    execSessionHint: '执行会话未形成——指挥官领取任务后出现',
  },
  composer: {
    title: '下达命令',
    lead: '一句话写下意图，参谋会分诊并安排执行。下面两个选择，定「放权多少」与「何时出发」。',
    placeholder: '例：帮我把 projA 的依赖全部升到最新，测试全绿再收官',
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
    schedCron: { name: '定时', hint: '到点自动下达（一次有效）' },
    cronLabel: '触发时刻（cron：分 时 日 月 周）',
    cronPlaceholder: '例：0 9 * * * = 每天 9 点',
    cronError: err => err,
    nextRun: t => `下次触发：${t}（到点自动下达，仅一次）`,
    templatesLabel: '常用命令（点击填入，可再改）',
    templates: [
      { label: '每周总结', text: '总结本周战况：列出本周完成的任务与产出、失败的任务与原因、遗留问题，形成一份周报。' },
      { label: '依赖巡检', text: '巡检本项目的依赖：列出可升级项与已知风险，给出建议；小版本直接升级并跑测试验证，大版本只报告不动。' },
      { label: '测试巡检', text: '跑一遍本项目的全部测试，汇总失败项与原因；有把握的小问题直接修复并复跑验证，其余报告。' },
      { label: '文档同步', text: '对照最近的代码变更，找出 README/DESIGN 等文档里已过时的描述并更新；只改确凿过时的部分，拿不准的列出来。' },
      { label: '代码审查', text: '审查本仓库最近的改动：找出潜在 bug、边界遗漏与明显坏味道，逐条给出文件位置、问题与修复建议；不做任何修改。' },
    ],
    planetSection: '星球与战线（可选）：这道令落在哪颗星球、接续哪条战线？',
    planetAuto: '参谋定',
    planetAutoHint: '不指定——参谋按任务性质选择或新建星球',
    frontSub: '这颗星球的战线：',
    frontNew: '新战线',
    frontNewHint: '在这颗星球上新开一条战线',
    frontEmpty: '这颗星球还没有战线——将新开一条。',
    frontLiveSuffix: ' ⚡',
    alarmModes: [
      { id: 'once', name: '单次', hint: '在指定日期时刻下达一次' },
      { id: 'daily', name: '每天', hint: '每天同一时刻下达' },
      { id: 'weekday', name: '工作日', hint: '周一到五，每天这个时刻下达' },
      { id: 'weekly', name: '每周…', hint: '自选周几，到点下达' },
    ],
    alarmDateLabel: '日期',
    alarmTimeLabel: '时刻',
    dowNames: ['一', '二', '三', '四', '五', '六', '日'],
    alarmAdvanced: '高级：直接写 cron 表达式',
    pastTime: '所选时刻已过去——请改到未来的时间。',
    nameSection: '战线名（可选）',
    namePlaceholder: '不填则用命令原文当代线名（≤24 字）',
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
    // V10.1 审查：零段折叠（三个 0 是胶囊噪音）。V12.2 元首令「让图例失业」：
    // 等待对象后缀化（等·参谋/等·指挥官）——词本身自消歧，图例 待×3 行删除。
    // V18 critique A2：等你段居首（舰长待办先于机器忙闲）。
    counts: c =>
      [c.awaiting > 0 ? `等你 ${c.awaiting}` : '', c.pending > 0 ? `等·参谋 ${c.pending}` : '', c.waiting > 0 ? `等·指挥官 ${c.waiting}` : '', c.active > 0 ? `执行中 ${c.active}` : '', c.failed > 0 ? `折戟 ${c.failed}` : '']
        .filter(x => x !== '').join(' · '),
    // V16.4-R3 critique P1-2：岛计数可点——分段结构化（kind 路由到列），词仍过词表。
    countSegs: c =>
      [
        c.awaiting > 0 ? { kind: 'awaiting' as const, label: `等你 ${c.awaiting}` } : null,
        c.pending > 0 ? { kind: 'pending' as const, label: `等·参谋 ${c.pending}` } : null,
        c.waiting > 0 ? { kind: 'waiting' as const, label: `等·指挥官 ${c.waiting}` } : null,
        c.active > 0 ? { kind: 'active' as const, label: `执行中 ${c.active}` } : null,
        c.failed > 0 ? { kind: 'failed' as const, label: `折戟 ${c.failed}` } : null,
      ].filter(x => x !== null),
    countsScope: '计数为全页签口径（页签只切三列）',
    inboxBadge: n => `✉ ${n}`,
    // V10.1 审查：▲收官→✓收官（善终语义，与凯旋印记同符）。
    visitMini: (closed, failed, commands) =>
      [closed > 0 ? `✓收官 ${closed}` : '', failed > 0 ? `✕折戟 ${failed}` : '', commands > 0 ? `✚新令 ${commands}` : '']
        .filter(s => s !== '').join(' · '),
    pin: '钉住展开（再点收起）',
    unpin: '取消钉住',
    expandTitle: '悬停展开 · 点击钉住',
    announceInbox: n => `作战室新增 ${n} 件等你发落`,
  },
  cmdTabs: { active: '进行中', settled: '已收官', archived: '已归档', aria: '战况切片', countTitle: (label, n) => `${label} · ${n} 条命令` },
  archive: {
    button: '归档此命令',
    gate: '战线全终局（收官/挫败/取消）后才可归档',
    confirmTitle: '归档这条命令？',
    irreversible: '不可逆：相关会话将从侧栏隐藏（日志保留），板面移入已归档。',
    confirmOk: '确认归档',
    cancel: '取消',
    done: n => `已归档（${n} 个会话入档）`,
    badge: '已归档',
  },
  dock: {
    label: '作战室',
    titleLine: c => `等·参谋 ${c.pending} · 等·指挥官 ${c.waiting} · 进行中 ${c.active}${c.failed > 0 ? ` · 已失败 ${c.failed}` : ''} —— 点击回到作战室`,
    segLine: c => `作战室${c.pending > 0 ? ` 等·参谋${c.pending}` : ''} 等·指挥官${c.waiting} 进行${c.active}${c.failed > 0 ? ` 失败${c.failed}` : ''}`,
    unread: n => `${n} 新`,
  },
}

/**
 * 平话皮肤：同一套角色与机制，工程平话文案（角色扮演顾虑的正式出口——
 * 机制词换日常语，「打赢了→已完成」）。品牌词「作战室」保留。
 */
export const plainCopy: WarCopy = {
  head: {
    title: '工作台',
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
  dispatch: { label: '命令调度条（滚轮横移）', addTitle: '下新命令（可定时）· 快捷键 n', viewMapHint: '切到项目全景图', viewBackHint: '回列表视图', segActive: '进行中', segSettled: '已完成' },
  pipeHint: '悬停事项卡可显示同线连线——颜色即同一条线',
  cmdTabsArchivedEmpty: '归档后的事项落在这里。归档入口在事项聚焦页——全部结束后可归档',
  commandBand: {
    title: '等你处理',
    quiet: '不用管——这条命令在自己推进',
    terminalCancelled: '已取消——这条命令结束了，不再推进',
    terminalSettled: '已完成——全部结束，不用你管',
    planHint: '规划 Agent 给了方案，点头就照做（夜里也不停）',
    clarifyHint: '规划 Agent 在等你回话',
    clarifyBtn: '去对话',
    reviewHint: '结果已核好，等你过目',
    reviewBtn: '去看结果',
    retryHint: '有失败的，等你定',
    retryBtn: '去看失败',
    scheduledHint: time => `定时 · ${time} 自动开始（到点前不转给规划 Agent）`,
    noGrade: '还没分诊',
    noBattle: '等人接手',
    battleLine: n => `执行 ${n} 次`,
    noReport: '还没有结果',
    evChecks: '项验收通过',
    evTests: (passed, failed) => `测试 ${passed} 过/${failed} 失败`,
  },

  settings: {
    title: '设置',
    skinSection: '皮肤（用词风格）',
    skinTrek: '星际迷航',
    skinWar: '军事',
    skinPlain: '平话',
    skinHint: '只换说法，不改功能。更多皮肤以后加。',
    legendSection: '图例（符号对照）',
    behaviorSection: '看板行为',
    hoverFamily: '悬停看同源',
    hoverFamilyHint: '悬停卡片时，同一命令的卡片亮、其他变暗',
    viewMap: '项目全景图',
    viewMapHint: '开=星球地图为底；关=三列列表（窗口太窄自动回列表）',
    viewSection: '视图',
    narrowNote: '窗口太小，全景图暂回列表；窗口放大后自动恢复',
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
    cardTitle: time => `定时命令：${time} 自动下达（到点前不转给规划 Agent）`,
  },
  columns: {
    commands: { title: '命令', empty: '点 + 下达第一条命令' },
    tasks: { title: '任务', empty: '等规划 Agent 发布第一个任务' },
    live: { title: '执行中', empty: '下达命令后，执行会话会出现在这里', resident: ' · 常驻' },
    done: { title: '已完成', empty: '这里还空着——完成和失败都会落在这里' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  lifecycle: {
    stages: { command: '下达', task: '任务', battle: '执行', report: '结果' },
    waitingClarify: '等你回答',
    waitingStaff: '规划 Agent 起草中',
    pendingRelay: '待规划 Agent 接令',
    approvedAwaitingPublish: '任务待发布',
    planPending: '方案待你批',
    formingDrafting: '起草中',
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
    title: '标记为 L1/L2 的任务要等你批准方案才会继续，夜里没人处理就一直停着。可改为直接执行（规划 Agent 直接发布），或保持等你批。',
  },
  onboard: {
    title: '工作台 · 把意图说成一句话',
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
      ['●', '状态四档：蓝 = 机器在动', 'dot-run'],
      ['●', '琥珀 = 等你处理', 'dot-wait'],
      ['●', '绿 = 完成（收官/已阅）', 'dot-done'],
      ['●', '红 = 失败（终败/熔断）', 'dot-fail'],
      ['◌', '圆环：同一个项目的多轮任务（点=第几轮）；一色=一条线，换个项目续接会另起一条新线'],
      ['！', '新任务，等待执行者领取'],
      ['？', '结果已提交，等待你验收'],
      ['◎', '只看这条：高亮相关任务与会话，其余变淡，Esc 退出'],
      ['↩', '来源 chip：点它跳回源命令的详情'],
      ['⌁', '会话号前缀（执行/外部挂载的会话）'],
      ['呼吸描边', '新命令正被规划 Agent 接收（约 15 秒），不用操作'],
      ['!! / ??', '命令前缀标记：!!直接做（L0）· ??先看方案（L2）'],
      ['L0/L1/L2', '自主度档位：直接执行 / 先审方案 / 先问清楚'],
      ['四段条', '下达→任务→执行→结果 的进度'],
      ['品质五档', '任务复杂度分档（chip 颜色随档位）'],
      ['黄/红等待', '待办等待超 30 分钟转黄、超 2 小时转红，「等最久」加粗'],
    ],
  },
  colActions: { attachLabel: '⌁ 挂载', attachTitle: '把一个外部会话挂上看板', newTitle: '新建命令' },
  taskStatus: {
    published: '等·执行 Agent 领取',
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
    draft: { label: '已下达', hint: '规划 Agent 接收中（约 15 秒内）' },
    received: { label: '已接收', hint: '规划 Agent 在等回答：点击进入对话回答提问（点卡片本身看全生命周期）' },
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
    taskIdTitle: '任务编号（溯源用）',
    failReason: e => `失败原因：${e}`,
    failTitle: '重试已用尽，等规划 Agent 重新立案',
    handleReview: '去验收 · 规划 Agent 会话',
    handleReviewTitle: '翻阅汇报在本页；验收通过或驳回，结论到规划 Agent 会话说',
    handleRetry: '去下重试令 · 规划 Agent 会话',
    handleRetryTitle: '重试授权在规划 Agent 会话说——板是只读的，发令走规划 Agent',
  },
  grade: { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' },
  chain: {
    genBadgeTitle: n => `这条命令是同一件事的第 ${n} 次跟进`,
    breadcrumbAria: '跟进链路：历史各步，逐级可看',
    tags: { deepen: '跟进·接着做', retry: '跟进·重试', pivot: '跟进·改方向' },
    continueBtn: '继续这件事',
    continueBtnTitle: '以这条命令为基础下发跟进——新的跟进接在原事后面',
  },
  commandCard: {
    noQuickAction: '无需操作——流程自动推进',
    noQuickCancelled: '已取消——这条命令结束了',
    noQuickSettled: '已完成——全部结束',
    pipsTitle: n => `这条跟进线共 ${n} 步——每个圆点是一步，颜色是每步状态`,
    pipStatus: { run: '进行中', wait: '待你处理', done: '已完成', fail: '失败', idle: '已取消' },
    panelAria: n => `此前跟进共 ${n} 步（最新一步就在下方）：上/下键选择，回车查看`,
  },
  starfield: {
    aria: '项目全景：每个项目一颗星球，正在干活的任务绕圈转',
    hqOn: '干活状态中——总部亮着',
    hqOff: '当前没有激活的战线',
    orbIdle: '进行中',
    mapLegend: '蓝=干活·琥珀=等你·绿=完成·红=失败 ｜ 星球=项目（内环=最早）· 环=同一条线（点=第几轮）· ✓完成数 · 亮点=进行中',
    mapHintToast: '🪐 项目不止一个——试试全景图视图（点这里打开，⚙ 设置里可以关掉）',
    mapHintDismiss: '忽略',
    controls: '左键拖动平移 · 中键转视角 · 滚轮缩放 · 双击或 R 回正 · 悬停亮点查看关联',
    untraced: '还没关联命令',
    ungrouped: '杂项',
    hqName: 'HEADQUARTERS',
    hqTag: '我 · 指挥中枢',
    wzStWait: '待执行',
    wzStBattle: '进行中',
    wzStHeld: '已完成',
    legendWait: '待执行',
    legendBattle: '进行中',
    legendHeld: '已完成',
    legendHl: '聚焦轨迹',
    legendFront: '战线环（分段=战线数）',
    hintCmd: '点项目 看详情 · 拖卡 摆位 · V 切换视图 · M 回列表',
    hint3d: '左键 平移 · 中键 旋转 · 滚轮 缩放 · 双击/R 复位 · V 切换视图 · M 回列表',
    toggle3d: '3D 视图',
    toggle2d: '2D 视图',
    toggleAria: '视图切换',
    hqPickerTitle: '添加工作区',
    hqPickerHint: '选取已有工作区——添加后进入看板地图',
    hqPickerRegister: '添加',
    hqPickerRegistered: '已添加',
    hqPickerEmpty: '暂无工作区（或清单未就绪）',
    hqPickerRegGroup: n => `可登记（${n}）`,
    hqPickerDoneGroup: n => `已在看板（${n}）`,
    xcardPrefix: '进行中：',
    footStat: (sq, pl, fr) => `${sq} 个进行中 · ${pl} 个项目 · ${fr} 条线`,
    kbGroupAria: '项目清单（键盘直达战线面板）',
    logOrder: '新建',
    logTriumph: '完成',
    logRetreat: '失败',
    logReview: '待验收',
    garrisonTitle: (ac, aw, tr, fa) => `进行中 ${ac} · 待执行 ${aw} · 完成 ${tr} · 失败 ${fa}`,
    garrisonAria: (lb, ac, aw, tr, fa) => `项目 ${lb}：进行中 ${ac}、待执行 ${aw}、完成 ${tr}、失败 ${fa}——跳最近的源命令`,
    stPlanetActive: '进行中',
    stPlanetSettled: '已完成',
    stPlanetFailed: '有失败',
    stPlanetIdle: '空闲',
    failSuffix: n => ` ·${n}失败`,
    tacGarrison: n => `完成 ${n}`,
    sqTag: '干员',
    targetLabel: '目标项目',
    phaseLabel: '近况',
    returnHq: '返回 → 总部',
    phOutbound: pct => `出发 · 进度 ${pct}%`,
    phBattle: verb => `进行中 · ${verb}`,
    phDeployed: '干完了 · 等确认',
    phPaused: '额度暂停 · 暂缓',
    phHolding: '排队 · 待开始',
    phReturn: pct => `返回 · 进度 ${pct}%`,
    frontN: n => `同一条线 · ${n} 轮`,
    viewFront: '点开看这条线',
    hqRow: (pl, sq, tr) => `管 ${pl} 个项目 · ${sq} 名干员在外 · 累计完成 ${tr} 件`,
  },
  front: { genN: n => `${n} 代`, taskN: n => `${n} 件事`, originChip: (bf, title) => `来自 ${bf === null ? '别的项目' : bf}·${title}`, stateLive: '进行中', stateWaiting: '待你处理', stateFailed: '有失败', stateSettled: '已完成' },
  commandDetail: {
    gradeReasonPrefix: '分诊理由：',
    regradesNote: n => `（改档 ${n} 次）`,
    planTitle: { pending: '待批', approved: '已批准', rejected: '已驳回' },
    approvePlan: '批准计划',
    rejectPlan: '驳回重呈',
    planIrreversible: '同意即发布，发出后不能撤回；不同意则退回规划 Agent 重拟',
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
    configAutonomyAuto: '让规划 Agent 定（未覆写）',
    configText: '命令原文',
    configRegrade: '改档',
    planTitle: '最终计划',
    planPending: '正在计划中——规划 Agent 还在写这份计划，进任务会话可以追问或补充。',
    planEnterSession: '进入任务会话',
    taskGhostPlanning: '正在计划中——点开看待批的计划原文',
    taskGhostApproved: '计划已批准，任务马上发布——点开看计划原文',
    taskAwaitingPublish: '任务待发布——已批准，等规划 Agent 挂出任务卡',
    taskScheduledHint: time => `⏰ 定时待发——${time} 出发后才转给规划 Agent`,
    taskRelaying: '转给规划 Agent 中——接令后这里变成起草卡',
    taskCancelled: '命令已取消——没有后续',
    draftingGhostTitle: '规划 Agent 正在写任务说明',
    draftingGhostCard: '规划 Agent 正在写任务说明——点开看分诊结果',
    triageLabel: '分诊',
    triagePending: '规划 Agent 还没分诊',
    talkingGhostTitle: '规划 Agent 在等你回答',
    talkingGhostCard: '规划 Agent 在等你回答——点开进对话',
    talkingGhostNote: '任务卡要等你的回答才能成形——进对话说一句，规划 Agent 就能继续。',
    talkingEnterBtn: '进入对话回答',
    taskBrief: '任务说明',
    taskAcceptance: '验收标准',
    briefMissing: '（规划 Agent 没附任务说明）',
    acceptanceMissing: '（未声明）',
    lootLabel: '交付',
    attemptsSection: '历次执行',
    battleLive: n => `${n} 个执行进行中`,
    battleDone: '已执行完成——没有正在进行的会话',
    battleNone: '还没开始执行——等执行 Agent 领取任务',
    reportVerdict: '收官结论',
    reportLatest: '最新汇报',
    reportNone: '还没有汇报——收官后这里给结论原文',
    reportLive: (verb, n, when) => `进行中 · ${verb} · 第 ${n} 次 · 从${when}开始`,
    reportQueued: '等执行者接手，接手后这里播报进展',
    reportSettledSoon: '上一轮已结束，结果整理后会放在这里',
    taskSessionBtn: '任务会话',
    execSessionBtn: '执行会话',
    taskSessionHint: '规划 Agent 会话还没建立——命令转给规划 Agent 后出现',
    execSessionHint: '执行会话还没建立——执行 Agent 领取任务后出现',
  },
  composer: {
    title: '下命令',
    lead: '一句话写下你要的结果，规划 Agent 会接手安排。下面选好放权多少、什么时候开始。',
    placeholder: '例：帮我做个记账小工具，每天记一句，能翻回看',
    cancel: '取消',
    busy: '下达中…',
    submit: '立即下达',
    submitScheduled: '定时下达',
    gradeSection: '自主度',
    gradeAuto: { name: '让规划 Agent 定', hint: '默认。小改动直接做，大改动先给方案' },
    gradeL0: { name: '!! 直接做', hint: '不等确认一路做完，适合有把握的小事' },
    gradeL2: { name: '?? 先看方案', hint: '先给方案等你点头，适合大动作' },
    scheduleSection: '开始时间',
    schedNow: { name: '马上', hint: '下达就转给规划 Agent' },
    schedCron: { name: '定时', hint: '到点自动下达（一次有效）' },
    cronLabel: '触发时间（cron：分 时 日 月 周）',
    cronPlaceholder: '例：0 9 * * * = 每天 9 点',
    cronError: err => err,
    nextRun: t => `下次触发：${t}（到点自动下达，只一次）`,
    templatesLabel: '常用命令（点击填入，可再改）',
    templates: [
      { label: '每周总结', text: '总结本周进展：列出本周完成的事项与产出、没做成的事项与原因、遗留问题，形成一份周报。' },
      { label: '依赖巡检', text: '检查本项目的依赖：列出可升级项与已知风险，给出建议；小版本直接升级并跑测试验证，大版本只报告不动。' },
      { label: '测试巡检', text: '跑一遍本项目的全部测试，汇总失败项与原因；有把握的小问题直接修复并复跑验证，其余报告。' },
      { label: '文档同步', text: '对照最近的代码变更，找出 README/DESIGN 等文档里已过时的描述并更新；只改确凿过时的部分，拿不准的列出来。' },
      { label: '代码审查', text: '检查本仓库最近的改动：找出潜在 bug、边界遗漏与明显坏味道，逐条给出文件位置、问题与修复建议；不做任何修改。' },
    ],
    planetSection: '项目与事项线（可选）：这件事在哪个项目里做、接在哪条线后面？',
    planetAuto: '自动',
    planetAutoHint: '不指定——规划 Agent 按任务性质选择或新建项目',
    frontSub: '这个项目的事项线：',
    frontNew: '新事项线',
    frontNewHint: '在这个项目里另起一条线',
    frontEmpty: '这个项目还没有事项线——将新起一条。',
    frontLiveSuffix: ' ⚡',
    alarmModes: [
      { id: 'once', name: '一次', hint: '在指定日期时间下达一次' },
      { id: 'daily', name: '每天', hint: '每天同一时间下达' },
      { id: 'weekday', name: '工作日', hint: '周一到五，每天这个时间下达' },
      { id: 'weekly', name: '每周…', hint: '自选周几，到点下达' },
    ],
    alarmDateLabel: '日期',
    alarmTimeLabel: '时间',
    dowNames: ['一', '二', '三', '四', '五', '六', '日'],
    alarmAdvanced: '高级：直接写 cron 表达式',
    pastTime: '所选时间已过去——请改到未来的时间。',
    nameSection: '事项线名（可选）',
    namePlaceholder: '不填则用命令原文当代线名（≤24 字）',
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
    counts: c =>
      [c.awaiting > 0 ? `等你 ${c.awaiting}` : '', c.pending > 0 ? `等·规划 Agent ${c.pending}` : '', c.waiting > 0 ? `等·执行 Agent ${c.waiting}` : '', c.active > 0 ? `执行中 ${c.active}` : '', c.failed > 0 ? `失败 ${c.failed}` : '']
        .filter(x => x !== '').join(' · '),
    countSegs: c =>
      [
        c.awaiting > 0 ? { kind: 'awaiting' as const, label: `等你 ${c.awaiting}` } : null,
        c.pending > 0 ? { kind: 'pending' as const, label: `等·规划 Agent ${c.pending}` } : null,
        c.waiting > 0 ? { kind: 'waiting' as const, label: `等·执行 Agent ${c.waiting}` } : null,
        c.active > 0 ? { kind: 'active' as const, label: `执行中 ${c.active}` } : null,
        c.failed > 0 ? { kind: 'failed' as const, label: `失败 ${c.failed}` } : null,
      ].filter(x => x !== null),
    countsScope: '计数为全看板口径（页签只切三列）',
    inboxBadge: n => `✉ ${n}`,
    visitMini: (closed, failed, commands) =>
      [closed > 0 ? `✓完成 ${closed}` : '', failed > 0 ? `✕失败 ${failed}` : '', commands > 0 ? `＋新命令 ${commands}` : '']
        .filter(s => s !== '').join(' · '),
    pin: '钉住展开（再点收起）',
    unpin: '取消钉住',
    expandTitle: '悬停展开 · 点击钉住',
    announceInbox: n => `工作台新增 ${n} 件待处理`,
  },
  cmdTabs: { active: '进行中', settled: '已收官', archived: '已归档', aria: '看板切片', countTitle: (label, n) => `${label} · ${n} 条` },
  archive: {
    button: '归档这条事项',
    gate: '全部结束（完成/失败/取消）后才可归档',
    confirmTitle: '归档这条事项？',
    irreversible: '不可恢复：相关会话将从列表隐藏（记录保留），看板移入已归档。',
    confirmOk: '确认归档',
    cancel: '取消',
    done: n => `已归档（${n} 个会话入档）`,
    badge: '已归档',
  },
  dock: {
    label: '工作台',
    titleLine: c => `等·规划 Agent ${c.pending} · 等·执行 Agent ${c.waiting} · 执行中 ${c.active}${c.failed > 0 ? ` · 已失败 ${c.failed}` : ''} —— 点击回到工作台`,
    segLine: c => `工作台${c.pending > 0 ? ` 等·规划 Agent${c.pending}` : ''} 等·执行 Agent${c.waiting} 执行${c.active}${c.failed > 0 ? ` 失败${c.failed}` : ''}`,
    unread: n => `${n} 新`,
  },
}

// --- 皮肤 store（纯函数层，不引 react——node 测试可安全 import）-----------

/**
 * V16 星际迷航词表（元首定案）：军事词 → 星际迷航词，最长/最具体优先。
 * 星际迷航皮肤 = 军事词典整体过词表变换——词典单一源（warCopy），术语随皮肤
 * 派生：改一处词典，军事/星际迷航两皮肤同步生效（平话词典独立成篇）。
 * 词序即匹配序：征召令先于其余、部队→外勤组员先于兵种→组员（无交叉子串）。
 */
const TREK_LEXICON: ReadonlyArray<readonly [string, string]> = [
  ['征召令', '外勤任务简报'],
  ['指挥官', '外勤小队'],
  ['战利品', '任务产出'],
  ['悬赏', '任务令'],
  ['战报', '任务回报'],
  ['母舰', '星舰'],
  ['作战室', '舰桥'],
  ['作战', '执行'],
  ['战区', '星域'],
  ['折戟', '挫败'],
  ['收菜', '收获'],
  ['善终', '圆满'],
  ['发落', '定夺'],
  ['退役', '休眠'],
  ['战场', '星球'],
  ['元首', '舰长'],
  ['参谋', '大副'],
  ['分兵', '加派组员'],
  ['派兵', '加派组员'],
  ['部队', '外勤组员'],
  ['兵种', '组员'],
  ['战时', '出航'],
  ['停战', '入坞'],
  ['未开战', '休眠'],
  ['凯旋', '达成'],
  ['败退', '挫败'],
  ['打赢了', '圆满'],
  ['已失败', '挫败'],
  ['失败', '挫败'],
]

/** 词表换不掉的语境修正（作用于变换后的文本）：源串里「战场」与「星/行星」
 * 邻接的表述，直译会得到「每片星球一颗星/行星=星球」这类赘语——按项目语义改写。 */
const TREK_FIXUPS: ReadonlyArray<readonly [string, string]> = [
  ['每片星球一颗星', '每个项目一颗星'],
  ['行星=星球', '行星=项目'],
]

function trekifyText(value: string): string {
  let out = value
  for (const [from, to] of TREK_LEXICON) out = out.split(from).join(to)
  for (const [from, to] of TREK_FIXUPS) out = out.split(from).join(to)
  return out
}

/** 深走词典对象，字符串值全过词表（数组/嵌套对象递归；非字符串原样）。 */
function trekifyCopy(source: WarCopy): WarCopy {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return trekifyText(v)
    // 函数字段（genN/originChip/failed 计数等模板串）：包一层让**返回值**也过
    // 词表——v7 实锤：`折戟 ${n}` 藏在函数体里，纯字符串遍历漏派生。
    if (typeof v === 'function') {
      const fn = v as (...args: unknown[]) => unknown
      return (...args: unknown[]) => walk(fn(...args))
    }
    if (Array.isArray(v)) return v.map(walk)
    if (typeof v === 'object' && v !== null) {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v)) out[k] = walk(val)
      return out
    }
    return v
  }
  return walk(source) as WarCopy
}

/** 星际迷航皮肤（默认）：军事词典的词表派生。 */
export const trekCopy: WarCopy = trekifyCopy(warCopy)

export type SkinId = 'trek' | 'war' | 'plain'

const SKIN_STORAGE_KEY = 'warroom-skin'
const skins: Record<SkinId, WarCopy> = { trek: trekCopy, war: warCopy, plain: plainCopy }

function storedSkin(): SkinId {
  try {
    if (typeof localStorage === 'undefined') return 'trek'
    const v = localStorage.getItem(SKIN_STORAGE_KEY)
    return v === 'war' || v === 'plain' ? v : 'trek'
  } catch {
    return 'trek'
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
  setSkin(currentId === 'trek' ? 'war' : currentId === 'war' ? 'plain' : 'trek')
}

/** 皮肤切换订阅（views 经 useSyncExternalStore 接入触发重渲染）。 */
export function subscribeSkin(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
