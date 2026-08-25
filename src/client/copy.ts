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
    field: { title: string; note: string }
    report: { title: string; note: string }
  }
  /** 底部命令调度条（V9.1：滚轮横移的「英雄位」坞，视觉与三列拉开）。 */
  dispatch: { tag: string; label: string }
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
    waitingClarify: string
    planPending: string
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
  actions: { failToast: (what: string) => string }
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
    chainSection: string
    chainDone: (done: number, total: number) => string
    noTasks: string
    latestReport: string
    /** 「查看任务」指向的任务已不在板上时的禁用说明（V7.1 死链降级）。 */
    taskGone: string
  }
  composer: { title: string; sub: string; placeholder: string; cancel: string; busy: string; submit: string; gradeAuto: string; gradeL0: string; gradeL2: string; gradeTitle: string; recentLabel: string }
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
    lineageLabel: string
    sessionsSection: string
    staffSession: string
    close: string
    cancel: string
  }
  /** V8 hero 灵动岛：标题栏的替代——大盘计数、收件箱、到访摘要与全部操作件
   * 收进顶部一颗胶囊（hover 展开 + 点击钉住；聚焦模式即岛的常驻形态）。 */
  island: {
    counts: (c: { pending: number; waiting: number; active: number; failed: number }) => string
    inboxBadge: (n: number) => string
    visitMini: (closed: number, failed: number, commands: number) => string
    compose: string
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
    title: '作战室 · 指挥中心',
    subActive: '命令 → 任务 → 作战 → 结果 · 左区指挥 · 右区战场',
    subIdle: '退役中（/war 启用）',
  },
  loading: {
    connecting: '连接任务栏…',
    unreachable: err => `任务栏不可达：${err}`,
  },
  zones: {
    tasks: { title: '任务', note: '待领 · 进行 · 待翻阅——未终局任务' },
    field: { title: '战场', note: '正在执行的会话 · 只读' },
    report: { title: '战报', note: '收官与折戟 · 点卡回源命令' },
  },
  dispatch: { tag: '命令调度', label: '命令调度条（滚轮横移）' },
  columns: {
    commands: { title: '命令', empty: '点 + 下达第一道命令' },
    tasks: { title: '任务', empty: '等参谋发布第一张悬赏' },
    live: { title: '进行中', empty: '下达命令后，指挥官的作战会话会出现在这里' },
    done: { title: '已完成', empty: '还没有打赢的会话' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  lifecycle: {
    stages: { command: '命令', task: '任务', battle: '执行', report: '战报' },
    waitingStaff: '参谋接收中',
    waitingClarify: '等你答问（点卡进对话）',
    planPending: '计划待你批',
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
  actions: { failToast: what => `${what}没生效——服务端没接住（可能状态已变或旗关），稍候刷新再试` },
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
    chainSection: '任务链进展',
    chainDone: (done, total) => `${done}/${total} 已收官`,
    noTasks: '（尚未发布任务）',
    latestReport: '最新战报',
    taskGone: '该任务已不在板上（可能已被清理），看板上无法打开',
  },
  composer: {
    title: '下达命令',
    sub: '用一句大白话写下元首的意图——参谋会接收并向你澄清细节。',
    placeholder: '例：帮我做个记账的小工具，每天记一句，能翻回去看以前记的',
    cancel: '取消',
    busy: '下达中…',
    submit: '下达命令',
    gradeAuto: '自动分诊',
    gradeL0: '!! 直接做',
    gradeL2: '?? 先看方案',
    gradeTitle: '自主度：默认交给参谋分诊；也可直接指定（拼入命令标记，机制不变）',
    recentLabel: '最近命令（点击重发）',
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
    lineageLabel: '源自命令',
    sessionsSection: '相关会话',
    staffSession: '参谋 · 讨论与计划',
    close: '关闭',
    cancel: '取消',
  },
  island: {
    counts: c => `待接 ${c.pending} · 待领 ${c.waiting} · 作战中 ${c.active}${c.failed > 0 ? ` · 折戟 ${c.failed}` : ''}`,
    inboxBadge: n => `✉ ${n}`,
    visitMini: (closed, failed, commands) =>
      [closed > 0 ? `▲收官 ${closed}` : '', failed > 0 ? `✕折戟 ${failed}` : '', commands > 0 ? `✚新令 ${commands}` : '']
        .filter(s => s !== '').join(' · '),
    compose: '＋ 下达',
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
    field: { title: '执行区', note: '正在运行的会话 · 只读' },
    report: { title: '结果', note: '完成与失败 · 点卡回源命令' },
  },
  dispatch: { tag: '命令台', label: '命令调度条（滚轮横移）' },
  columns: {
    commands: { title: '命令', empty: '点 + 下达第一条命令' },
    tasks: { title: '任务', empty: '等参谋发布第一个任务' },
    live: { title: '执行中', empty: '下达命令后，执行会话会出现在这里' },
    done: { title: '已完成', empty: '还没有完成的会话' },
    failed: { title: '已失败', empty: '暂无失败会话' },
  },
  lifecycle: {
    stages: { command: '下达', task: '任务', battle: '执行', report: '结果' },
    waitingClarify: '等你回答（点卡进对话）',
    waitingStaff: '参谋接收中',
    planPending: '方案待你批',
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
  actions: { failToast: what => `${what}没有生效——服务器拒绝了（可能状态已变），稍后刷新重试` },
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
    received: { label: '已接收 · 点击进入对话', hint: '参谋已接收，点击卡片进入对话回答提问' },
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
    lootPrefix: '交付：',
    handle: '去处理 · 参谋会话',
  },
  grade: { L0: 'L0 直发', L1: 'L1 呈批', L2: 'L2 澄清' },
  commandDetail: {
    gradeReasonPrefix: '分诊理由：',
    regradesNote: n => `（改档 ${n} 次）`,
    planTitle: { pending: '待批', approved: '已批准', rejected: '已驳回' },
    approvePlan: '批准计划',
    rejectPlan: '驳回重呈',
    regradeHint: '升降档（覆写参谋分诊，改后需通知参谋按新档执行）：',
    regradeTo: label => `改为 ${label}`,
    viewTask: taskId => `查看任务 ${taskId}`,
    close: '关闭',
    cancelledReason: r => `取消原因：${r}`,
    chainSection: '任务组进展',
    chainDone: (done, total) => `${done}/${total} 已完成`,
    noTasks: '（尚未发布任务）',
    latestReport: '最新战报',
    taskGone: '该任务已不在看板上（可能已被清理），无法打开',
  },
  composer: {
    title: '下达命令',
    sub: '用一句大白话写下你的意图——参谋会接收并向你澄清细节。',
    placeholder: '例：帮我做个记账的小工具，每天记一句，能翻回去看以前记的',
    cancel: '取消',
    busy: '下达中…',
    submit: '下达命令',
    gradeAuto: '自动分诊',
    gradeL0: '!! 直接执行',
    gradeL2: '?? 先看方案',
    gradeTitle: '自主度：默认交给参谋分诊；也可直接指定（拼入命令标记，机制不变）',
    recentLabel: '最近命令（点击重发）',
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
    lootPrefix: '交付：',
    lootSummary: (loot, clipped, more) => `交付：${clipped}${more ? '…' : ''}`,
    waitingReport: '证据已核验，等你验收',
    cardTitle: sessionId => `执行会话 ${sessionId}——点击查看详情`,
    goHandle: '去处理 · 参谋会话',
    enterReview: '查看会话',
  },
  detail: {
    briefSection: '任务说明',
    briefMissing: '（参谋未附任务说明）',
    acceptanceSection: '验收标准',
    acceptanceMissing: '（未声明）',
    reportsSection: '汇报',
    commentsSection: '批注',
    reportPrefixPlain: '【汇报】',
    reportPrefix: ts => `【汇报 · ${ts}】`,
    commentPrefix: ts => `【批注 · ${ts}】`,
    verdictPrefix: '【判定】',
    lineageLabel: '源自命令',
    sessionsSection: '相关会话',
    staffSession: '参谋 · 讨论与计划',
    close: '关闭',
    cancel: '取消',
  },
  island: {
    counts: c => `待接 ${c.pending} · 待领 ${c.waiting} · 执行中 ${c.active}${c.failed > 0 ? ` · 失败 ${c.failed}` : ''}`,
    inboxBadge: n => `✉ ${n}`,
    visitMini: (closed, failed, commands) =>
      [closed > 0 ? `▲完成 ${closed}` : '', failed > 0 ? `✕失败 ${failed}` : '', commands > 0 ? `＋新命令 ${commands}` : '']
        .filter(s => s !== '').join(' · '),
    compose: '＋ 下达',
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
