/**
 * V13 战线一等公民（纯函数模块）：战线 = 命令的世代链（chain.rootId 聚合），
 * 非 session 组合——sessions 挂在每条命令之下（1 参谋 + 每尝试 1 执行）。
 * 本模块零 React/零宿主 API：分组、跨代任务并集、战场序列、聚合态全部纯派生，
 * 数据全部来自板投影现成字段（foldChains 已投影 rootId/generation/hueSlot）。
 *
 * 战场语义（V13 与宿主对齐的物理模型）：宿主 workspace = 真实项目文件夹
 * （bound 路径）= 战场行星；warRoot 下合成沙盒（tasks/<id>、instances/<id>）
 * 不是项目文件夹——聚合为一颗「未分组」行星。判别是路径启发式（.warroom +
 * tasks/instances 段对）：warRoot 被 config 覆盖改名时判不准（误当项目行星，
 * 视觉无害）；投影加 workspaceKind 字段挂账未来（见 DESIGN.md V13 挂账③）。
 * @module dsh-plugin-warroom/client/front
 */
import type { BoardCommand, BoardTask } from './data.ts'

/** 星域里合成沙盒聚合后的伪 workspace 键（行星/编队/航迹统一用它对齐）。 */
export const UNGROUPED_WS_KEY = '__war_ungrouped__'

/** 合成沙盒判定：路径含 .warroom 段且其后有 tasks/ 或 instances/ 段
 *  （默认 warRoot=<server cwd>/.warroom；config 改名时失效=降级为项目，无害）。 */
export function isSyntheticWs(wsPath: string): boolean {
  const segs = wsPath.split(/[\\/]+/).filter(p => p.length > 0)
  const dotWarroom = segs.indexOf('.warroom')
  if (dotWarroom < 0) return false
  return segs.slice(dotWarroom + 1).some(s => s === 'tasks' || s === 'instances')
}

/** workspace → 星域键：合成沙盒归未分组，bound 项目原样。
 *  V15 kind 感知：投影带 workspaceKind 时按真值分（instance/auto-*=未分组，
 *  bound*=路径键）——治 auto worktree-of-P 被路径启发式误判成项目行星；
 *  kind 缺失（旧账本任务）回落路径启发式（append-only 无回填）。 */
export function wsKeyOf(wsPath: string | null, workspaceKind?: string | null): string | null {
  if (wsPath === null || wsPath === '') return null
  if (workspaceKind !== undefined && workspaceKind !== null && workspaceKind !== '') {
    return workspaceKind === 'bound' || workspaceKind === 'bound-worktree' ? wsPath : UNGROUPED_WS_KEY
  }
  return isSyntheticWs(wsPath) ? UNGROUPED_WS_KEY : wsPath
}

/** 命令的任务域（全生命周期追踪的核心）：头任务 + 全部传递依赖它的任务
 *  （V6 链的后继经 deps 闭包归队）。命令卡/命令详情据此聚合进度。
 *  V9.11：返回按**依赖序**排列（前驱永远在后继前面）——投影数组按状态排序，
 *  直通 filter 会把 published 的后继排到 reported 的前驱前面，读链就倒了。
 *  V13 起从 views.tsx 迁入本模块（战线跨代并集复用；views 改为导入）。 */
export function commandTasks(cmd: BoardCommand, tasks: BoardTask[]): BoardTask[] {
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
  const byId = new Map(tasks.map(t => [t.taskId, t]))
  const ordered: BoardTask[] = []
  const emitted = new Set<string>()
  let pending = tasks.filter(t => members.has(t.taskId))
  while (pending.length > 0) {
    const ready = pending.filter(t => t.deps.every(d => !members.has(d) || emitted.has(d)))
    if (ready.length === 0) break // 环防御：残量按投影原序跟上，不死循环
    for (const t of ready) {
      ordered.push(t)
      emitted.add(t.taskId)
    }
    pending = pending.filter(t => !emitted.has(t.taskId))
  }
  return [...ordered, ...pending.filter(t => byId.has(t.taskId))]
}

/** 战线聚合态（扫视层一句话的来源；与岛计数四桶语义对齐不混用）。 */
export interface FrontAgg {
  /** 有任何未终局的代（成形中/等领/作战/待验收）——调度条活跃段同语义。 */
  readonly live: boolean
  /** 有等你发落的代（talking/plan 待批/published 任务）。 */
  readonly waiting: boolean
  /** 任一代任务终败。 */
  readonly failed: boolean
  /** 全部代要么取消、要么任务全终局（closed/failed）。 */
  readonly settled: boolean
}

export interface WarFront {
  readonly rootId: string
  /** 本战线的锚命令（本地Ⅰ代）commandId——航迹点击/聚焦的落点。跨战场拆分时=该段首代。 */
  readonly rootCommandId: string
  readonly hueSlot: number
  /** 锚命令原文（战线名，纯派生不改名——账本化挂账未来）。 */
  readonly title: string
  /** 世代升序（本地Ⅰ→…）。 */
  readonly generations: BoardCommand[]
  /** 跨代任务并集（按 taskId 去重——pivot 与父代共享同一任务），依赖序。 */
  readonly tasks: BoardTask[]
  /** 战线绑定的唯一战场键（V14 定案：战线绑定一个战场；无任务=未锚定 null）。 */
  readonly battlefield: string | null
  readonly agg: FrontAgg
  /** 最近活动时刻（ISO 字符串，命令 createdAt 与尝试结算的最大值）——排序键。 */
  readonly lastActivity: string
  /** V14 溯源：锚的链代 >1（续接代自立战线）时指向源战线——「续接自 源战场·源战线」，
   *  commandId=源战线锚（chip 点击跳源战线聚焦页）。 */
  readonly origin: { readonly battlefield: string | null; readonly title: string; readonly fromGen: number; readonly commandId: string } | null
}

/**
 * 战线全量派生（纯）：**V14 战线范式收口（元首定案）——战线=命令的聚合，绑定一个
 * 战场（workspace）**；层级 战场 ⊃ 战线 ⊃ 命令。continuesFrom 链不再是独立概念
 * （「血脉」除名）：跨战场的续接代自立新战线，链的痕迹收缩为战线的 `origin` 溯源
 * （「续接自某战场·某战线」一枚可点的事实）+ 战线内本地计代（锚=本地Ⅰ）。
 * 拆分规则：按 chain.rootId 分组后**相对父代**做战场键拆分——某代任务落在与父代
 * 不同的战场（含未分组），该代即新战线的Ⅰ。无任务的成形代继承父代所在战线。
 * @param commands 板投影命令全量（含 cancelled）
 * @param tasks 板投影任务全量
 * @param commandIdOf 任务→源命令解析（views 的 lineageMap 同源；孤儿任务 null）
 */
export function frontsOf(commands: readonly BoardCommand[], tasks: readonly BoardTask[], commandIdOf: (taskId: string) => string | null): WarFront[] {
  const groups = new Map<string, BoardCommand[]>()
  for (const c of commands) {
    let g = groups.get(c.chain.rootId)
    if (g === undefined) { g = []; groups.set(c.chain.rootId, g) }
    g.push(c)
  }
  // 命令任务域按 commandId 记忆化（同代内多处消费）
  const taskClosure = new Map<string, BoardTask[]>()
  const closureOf = (c: BoardCommand): BoardTask[] => {
    let ts = taskClosure.get(c.commandId)
    if (ts === undefined) { ts = commandTasks(c, tasks); taskClosure.set(c.commandId, ts) }
    return ts
  }
  /** 代的战场键=其任务域（依赖序）首个 workspace 的映射键；无任务=null（成形代）。
   *  V15：优先吃投影 workspaceKind 真值（旧任务回落路径启发式）。 */
  const battlefieldOfGen = (c: BoardCommand): string | null => {
    for (const t of closureOf(c)) {
      const key = wsKeyOf(t.workspacePath, t.workspaceKind)
      if (key !== null) return key
    }
    return null
  }
  const fronts: WarFront[] = []
  for (const [rootId, gens] of groups) {
    gens.sort((a, b) => a.chain.generation - b.chain.generation)
    // 按相对父代的战场键切成连续段；每段=一条战线（锚=段首代）。
    type Run = { head: BoardCommand; gens: BoardCommand[]; bf: string | null }
    const runs: Run[] = []
    for (const g of gens) {
      const bf = battlefieldOfGen(g)
      const cur = runs[runs.length - 1]
      // 段未锚定（前代皆成形）→ 锚定；已锚定且本代有任务且键不同 → 相对父代跨界，开新段。
      if (cur === undefined || (cur.bf !== null && bf !== null && bf !== cur.bf)) {
        runs.push({ head: g, gens: [g], bf })
      } else {
        cur.gens.push(g)
        if (cur.bf === null && bf !== null) cur.bf = bf
      }
    }
    for (const run of runs) {
      const seenTasks = new Set<string>()
      const union: BoardTask[] = []
      let lastActivity = ''
      for (const g of run.gens) {
        for (const t of closureOf(g)) {
          if (!seenTasks.has(t.taskId)) { seenTasks.add(t.taskId); union.push(t) }
        }
        if (g.createdAt > lastActivity) lastActivity = g.createdAt
      }
      for (const t of union) {
        for (const a of t.attemptLog) {
          const stamp = a.endedAt ?? a.startedAt
          if (stamp !== null && stamp > lastActivity) lastActivity = stamp
        }
      }
      const forming = run.gens.some(c => c.status === 'received' || c.status === 'talking' || (c.plan !== null && c.plan.status === 'pending'))
      const anyOpenTask = union.some(t => t.status !== 'closed' && t.status !== 'failed')
      const failed = union.some(t => t.status === 'failed')
      const waiting = union.some(t => t.status === 'published') || run.gens.some(c => c.status === 'talking' || (c.plan !== null && c.plan.status === 'pending'))
      const settled = !forming && !anyOpenTask
      fronts.push({
        rootId,
        rootCommandId: run.head.commandId,
        hueSlot: run.head.chain.hueSlot % 8, // 占位——下方按战线贪心重排
        title: run.head.name ?? run.head.text, // V15 战线命名：元首给名用名，否则命令原文
        generations: run.gens,
        tasks: union,
        battlefield: run.bf,
        agg: { live: !settled, waiting, failed, settled },
        lastActivity,
        origin: null,
      } as WarFront)
    }
  }
  // V14 溯源：战线锚的链代 >1 时，找到前一代命令所属战线——「续接自 那个战场·那条战线」。
  const frontOfCmd = new Map<string, WarFront>()
  for (const f of fronts) for (const c of f.generations) frontOfCmd.set(c.commandId, f)
  const genIndex = new Map<string, BoardCommand>()
  for (const c of commands) {
    const k = `${c.chain.rootId}#${c.chain.generation}`
    const cur = genIndex.get(k)
    if (cur === undefined || c.createdAt > cur.createdAt) genIndex.set(k, c)
  }
  for (const f of fronts) {
    const headGen = f.generations[0]!.chain.generation
    if (headGen <= 1) continue
    const prev = genIndex.get(`${f.rootId}#${headGen - 1}`)
    const pf = prev !== undefined ? frontOfCmd.get(prev.commandId) : undefined
    if (pf !== undefined && pf !== f) {
      ;(f as { origin: WarFront['origin'] }).origin = { battlefield: pf.battlefield, title: pf.title, fromGen: prev.chain.generation, commandId: pf.rootCommandId }
    }
  }
  // V14 链色绑战线（不再绑血脉）：按战线最近活动降序贪心分配——兄弟段（同链跨
  // 战场拆出的多条战线）天然异色，同一条战线恒一色。平手优先锚命令哈希槽。
  const order = [...fronts].sort((a, b) => a.lastActivity < b.lastActivity ? 1 : a.lastActivity > b.lastActivity ? -1 : a.rootId < b.rootId ? -1 : 1)
  const use = new Array<number>(8).fill(0)
  for (const f of order) {
    let min = 0
    for (let s = 1; s < 8; s++) if (use[s] < use[min]) min = s
    const hash = f.generations[0]!.chain.hueSlot % 8
    const pick = use[hash] <= use[min] ? hash : min
    ;(f as { hueSlot: number }).hueSlot = pick
    use[pick]++
  }
  fronts.sort((a, b) => a.lastActivity < b.lastActivity ? 1 : a.lastActivity > b.lastActivity ? -1 : a.rootId < b.rootId ? -1 : 1)
  return fronts
}

/** 战线在星域的桥数据（3D/2D 同构消费；hue 由调用方经 war-tokens 从 CSS 解析）。 */
export interface WzBridgeFrontLite {
  readonly rootId: string
  readonly rootCommandId: string
  readonly label: string
  /** 战线绑定的唯一战场键（含 UNGROUPED_WS_KEY）。 */
  readonly battlefield: string
  readonly gens: number
  readonly live: boolean
  readonly hueSlot: number
}

/** 任务→战线归属映射（任务列/收件箱分组消费；孤儿任务不在表内）。 */
export function frontOfTaskMap(fronts: readonly WarFront[]): Map<string, WarFront> {
  const m = new Map<string, WarFront>()
  for (const f of fronts) for (const t of f.tasks) m.set(t.taskId, f)
  return m
}
