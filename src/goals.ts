/**
 * The host goal service's structural slice + the CAS-chain helpers V5 eats
 * (R1 定案语义, 证据 `.goal/evidence/v5/r1-spike.md`):
 * - 动词 ref 是 `{id, revision}` 复合 CAS fence；每次动词成功后 revision
 *   前进，下一个动词必须用**返回 view** 重组 ref（旧 revision 报 stale ref）。
 * - `create` 默认 `activation:'armed'`——round driver 会驱动该会话自主跑轮；
 *   大副路径必须紧跟 disarm（红线：大副 goal 永远 disarm）。
 * - armed goal 残留必须自愈（K15）：凡可能留 armed goal 的路径都先清场。
 *
 * 宿主类型保持 opaque——缺席（inject 未满足 / 面形状不对）即诚实降级。
 * @module dsh-plugin-stardeck/goals
 */

/** 宿主 goal 服务的结构切片（V5-R3 定案消费面）。 */
export interface GoalsFace {
  get(agent: unknown): unknown
  create(agent: unknown, request: { objective: string; maxGoalRounds?: number }): unknown
  /** 幂等拆除武装（round driver 停驱——大副状态机专用）。 */
  disarm(agent: unknown, ref: unknown): unknown
  complete(agent: unknown, ref: unknown): unknown
  clear(agent: unknown, ref: unknown): unknown
}

/** GoalView 的 ref 提取（键是 id+revision，R1 实测——不是裸 ref 字符串）。 */
export interface GoalRef {
  id: unknown
  revision: unknown
}

export function goalRefOf(view: unknown): GoalRef | undefined {
  const v = view as { id?: unknown; revision?: unknown } | null | undefined
  return v?.id === undefined ? undefined : { id: v.id, revision: v.revision }
}

/** view 的 objective 字段（含 taskId 匹配用）。 */
export function goalObjectiveOf(view: unknown): string {
  const v = view as { objective?: unknown } | null | undefined
  return typeof v?.objective === 'string' ? v.objective : ''
}

/** 是否「像一个可用的 goal 面」（五个动词都是函数）。 */
export function usableGoals(face: unknown): face is GoalsFace {
  const f = face as Partial<GoalsFace> | undefined
  return typeof f?.get === 'function' && typeof f?.create === 'function' && typeof f?.disarm === 'function' && typeof f?.complete === 'function' && typeof f?.clear === 'function'
}

/**
 * CAS 链 complete：用给定 ref 调 complete，返回**新 view 的 ref**（下一个
 * 动词必须用它）。抛错原样上抛（调用方决定降级策略）。
 */
export async function casComplete(face: GoalsFace, agent: unknown, ref: GoalRef): Promise<GoalRef> {
  const done = await face.complete(agent, ref)
  return goalRefOf(done) ?? ref
}

/**
 * 结算该 agent 名下「属于某任务」的活跃 goal（收官/失败/交防路径）：
 * get → objective 含 taskId 且 phase 活跃 → CAS complete。返回结算的
 * goalId；没有匹配（或服务缺席）返回 undefined——绝不抛错阻塞结算主路径。
 */
export async function settleGoalMentioning(face: GoalsFace | undefined, agent: unknown, taskId: string): Promise<string | undefined> {
  try {
    if (face === undefined) return undefined
    const view = await face.get(agent)
    const ref = goalRefOf(view)
    if (ref === undefined) return undefined
    if (!goalObjectiveOf(view).includes(taskId)) return undefined
    const doneRef = await casComplete(face, agent, ref)
    return String(doneRef.id)
  } catch {
    // goal 结算是增强——主结算（事件/档案/接力征召）绝不被它拖垮。
    return undefined
  }
}

/**
 * 为外勤小队武装任务 goal（claim 时调）：若该 agent 名下已有同任务的残留
 * armed goal（重派/断线重来的常见形态）先自愈结算（K15），再 create armed。
 * 返回 {goalId, healed?}；服务缺席/异常返回 undefined（诚实降级）。
 */
export async function armGoalForTask(face: GoalsFace | undefined, agent: unknown, taskId: string, opts: { maxGoalRounds: number; title: string }): Promise<{ goalId: string; healed?: string } | undefined> {
  try {
    if (face === undefined) return undefined
    const healed = await settleGoalMentioning(face, agent, taskId)
    const view = await face.create(agent, { objective: `warroom 任务 ${taskId} 验收全过（${opts.title}）`, maxGoalRounds: opts.maxGoalRounds })
    const ref = goalRefOf(view)
    if (ref === undefined) return undefined
    return { goalId: String(ref.id), ...(healed !== undefined ? { healed } : {}) }
  } catch {
    return undefined
  }
}

/**
 * 大副状态机开箱（L2 澄清期）：create 后**立即 disarm**——round driver
 * 永不驱动大副（红线：大副醒着的每轮都是插件唤醒的）。同样带同
 * directive 残留自愈。返回 goalId；缺席/异常 undefined。
 */
export async function openDisarmedGoalForDirective(face: GoalsFace | undefined, agent: unknown, directiveId: string): Promise<string | undefined> {
  try {
    if (face === undefined) return undefined
    // 残留自愈：同 directive 的旧 goal 先结算。
    const existing = await face.get(agent)
    const existingRef = goalRefOf(existing)
    if (existingRef !== undefined && goalObjectiveOf(existing).includes(directiveId)) {
      await casComplete(face, agent, existingRef).catch(() => undefined)
    }
    const view = await face.create(agent, { objective: `warroom 命令 ${directiveId} 澄清收敛（大副状态机，disarm）`, maxGoalRounds: 1 })
    const ref = goalRefOf(view)
    if (ref === undefined) return undefined
    // create 默认 armed——大副路径必须紧跟 disarm（CAS：用 create 返回的 view）。
    await face.disarm(agent, ref)
    return String(ref.id)
  } catch {
    return undefined
  }
}
