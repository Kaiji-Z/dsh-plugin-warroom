/**
 * v5 R1 机制验证 spike（flag `v5-spike`）。
 *
 * 四个待验证机制（SPEC v5 §4 R1）：
 *  ① ctx.planMode / ctx.goals 在宿主面插件上下文是否可达（静态结论：
 *     goals 是宿主面命名服务；planMode 疑似 agent 预设 isolate realm 内
 *     挂载——需动态定案）；
 *  ② plan-mode 在参谋会话上的 set/get 往返（评审卡与现有决策卡的 UI
 *     共存另凭 planCard 动作 + 截图定案）；
 *  ③ sessions.create 是否吃 toolFilter（参谋物理收权的第一道闸）；
 *  ④ 宿主 provider 错误事件面（静态 grep 记录，无动态探针）。
 *
 * 本模块只做结构切片与探针编排，不 import 宿主类型；探针永不抛
 * （每步捕错成字符串），dashboard 路由原样回显。
 */
import type { SessionsApiFace } from './relay.ts'
import { usableGoals, type GoalsFace } from './goals.ts'

export type { GoalsFace } from './goals.ts'
export { usableGoals } from './goals.ts'

/** 宿主 plan-mode 控制器的结构切片（get/set 缺一即视为不可用）。 */
export interface PlanModeFace {
  get(agent: unknown): unknown
  set(agent: unknown, active: boolean, opts?: unknown): unknown
}

/** index.ts 在 v5-spike 旗开启时注入的运行面入口（缺省不注册路由）。 */
export interface SpikeDeps {
  /** 当前上下文可用性快照（typeof 检查，永不抛）。 */
  availability(): Record<string, unknown>
  /** 会话号 → 活体 agent（找不到给 error 字符串）。 */
  resolveAgent(sessionId: string): { agent?: unknown; error?: string }
  /** 惰性取面——宿主服务可能晚于插件挂载。 */
  planMode(): PlanModeFace | undefined
  goals(): GoalsFace | undefined
  sessions(): SessionsApiFace | undefined
  /** 参谋根目录——探针会话的 cwd（与真实参谋会话同层）。 */
  warRoot(): string
}

export interface ProbeStep {
  name: string
  ok: boolean
  detail: string
}

/** 单步执行器：任何异常都折叠成 ok:false 的记录，绝不打断后续探针。 */
async function step(name: string, fn: () => Promise<string> | string): Promise<ProbeStep> {
  try {
    return { name, ok: true, detail: await fn() }
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

/** 短描一个原始返回值（探针日志用，绝不因循环结构/错误对象抛错）。 */
function brief(value: unknown): string {
  let text: string
  try {
    text = value instanceof Error ? `${value.name}: ${value.message}` : (JSON.stringify(value) ?? String(value))
  } catch {
    text = String(value)
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

/** 是否「像一个可用的 plan-mode 面」（get/set 都是函数）。 */
export function usablePlanMode(face: unknown): face is PlanModeFace {
  const f = face as Partial<PlanModeFace> | undefined
  return typeof f?.get === 'function' && typeof f?.set === 'function'
}

/**
 * 全链探针：plan-mode 往返 + goal 草稿往返 + sessions.create(toolFilter)。
 * 每步独立捕错；goals.create 被拒（已有活跃 goal）不算事故——detail 会
 * 说明既有 goal 未被触碰。probeSessionId 是探针真建出的会话（改名留痕，
 * 无销毁通道——sessions 面只有 create/rename/prompt）。
 */
export async function runSpikeProbe(deps: SpikeDeps, sessionId: string): Promise<{ ok: boolean; steps: ProbeStep[]; probeSessionId?: string }> {
  const steps: ProbeStep[] = []
  let probeSessionId: string | undefined
  const resolved = deps.resolveAgent(sessionId)
  steps.push({
    name: 'agent.resolve',
    ok: resolved.agent !== undefined,
    detail: resolved.agent !== undefined ? `resolved ${typeof resolved.agent}` : (resolved.error ?? 'resolveAgent returned nothing'),
  })
  const agent = resolved.agent
  const pm = deps.planMode()
  if (agent !== undefined && usablePlanMode(pm)) {
    steps.push(await step('planMode.set(true)', () => brief(pm.set(agent, true))))
    steps.push(await step('planMode.get(active)', () => brief(pm.get(agent))))
    steps.push(await step('planMode.set(false)', () => brief(pm.set(agent, false))))
    steps.push(await step('planMode.get(restored)', () => brief(pm.get(agent))))
  } else {
    steps.push({ name: 'planMode', ok: false, detail: agent === undefined ? 'no live agent' : 'ctx.planMode unavailable or not a usable face (get/set)' })
  }
  const gs = deps.goals()
  if (agent !== undefined && usableGoals(gs)) {
    // 宿主动态定案（R1 实测）：GoalView 键是 id+revision；动词收的 ref 是
    // {id, revision} 复合 CAS fence（裸 id 会报 stale ref）。探针一律用
    // view 原样打包回传。
    const refOf = (view: unknown): { id?: unknown; revision?: unknown } | undefined => {
      const v = view as { id?: unknown; revision?: unknown } | null | undefined
      return v?.id === undefined ? undefined : { id: v.id, revision: v.revision }
    }
    const isOurs = (view: unknown): boolean => {
      const v = view as { objective?: unknown } | null | undefined
      return typeof v?.objective === 'string' && v.objective.startsWith('warroom-v5-spike')
    }
    const before = await (async () => { try { return { ok: true, value: gs.get(agent) } as const } catch (err) { return { ok: false, value: err } as const } })()
    steps.push({ name: 'goals.get(before)', ok: true, detail: brief(before.value) })
    const stale = before.ok ? refOf(before.value) : undefined
    if (before.ok && stale !== undefined && isOurs(before.value)) {
      // 上轮探针残留（armed goal 会驱动轮次）——先清场再继续。CAS 语义：
      // 每次动词返回新 view，下一个动词必须用返回 view 的 revision 重组 ref。
      steps.push(await step('goals.cleanup(stale scratch)', async () => {
        const done = await gs.complete(agent, stale)
        const doneRef = refOf(done) ?? stale
        return brief(await gs.clear(agent, doneRef))
      }))
    }
    const objective = `warroom-v5-spike 探针目标（${new Date().toISOString()}，验证后即清）`
    const created = await (async () => { try { return { ok: true, value: gs.create(agent, { objective, maxGoalRounds: 1 }) } as const } catch (err) { return { ok: false, value: err } as const } })()
    steps.push({ name: 'goals.create(scratch)', ok: created.ok, detail: brief(created.value) })
    if (created.ok) {
      // 草稿 goal 是探针自己建的——complete（revision 前进）后必须用
      // 返回 view 的新 revision 重组 ref 再 clear（CAS fence，R1 实测）。
      const ref = refOf(created.value)
      let afterComplete: { id?: unknown; revision?: unknown } | undefined
      steps.push(await step('goals.complete(scratch)', async () => {
        const done = await gs.complete(agent, ref)
        afterComplete = refOf(done) ?? ref
        return brief(done)
      }))
      steps.push(await step('goals.clear(scratch)', () => brief(afterComplete === undefined ? 'no id on view (skip clear)' : gs.clear(agent, afterComplete))))
    } else {
      steps.push({ name: 'goals.sideEffects', ok: true, detail: 'create refused — existing goal untouched (expected when one is active)' })
    }
  } else {
    steps.push({ name: 'goals', ok: false, detail: agent === undefined ? 'no live agent' : 'ctx.goals unavailable or not a usable face (get/create/complete/clear)' })
  }
  const sessions = deps.sessions()
  if (sessions !== undefined) {
    steps.push(await step('sessions.create(toolFilter)', async () => {
      // 结构面只声明了 workspaceId/cwd；toolFilter 是被探的未声明字段——
      // 发出去看宿主是吃下还是剥掉/拒绝（这正是 ③ 要的答案）。
      const payload = { cwd: deps.warRoot(), toolFilter: { mode: 'deny', names: ['war_publish'] } } as unknown as { workspaceId?: string; cwd?: string }
      const made = await sessions.create({ rpcId: 'warroom-v5-spike', payload })
      if (!made.result.ok) throw new Error(`rejected: ${made.result.error.code} ${made.result.error.message}`)
      probeSessionId = made.result.value.sessionId
      return `accepted; sessionId=${probeSessionId}（payload 吃下与否需看会话内工具清单——下一探针核实）`
    }))
    if (probeSessionId !== undefined) {
      steps.push(await step('probeSession.rename', async () => brief(await sessions.rename({ rpcId: 'warroom-v5-spike', payload: { sessionId: probeSessionId!, title: 'v5-spike 探针会话（可删）' } }))))
    }
  } else {
    steps.push({ name: 'sessions', ok: false, detail: 'apiProxy sessions face not bound yet' })
  }
  return { ok: steps.every(s => s.ok), steps, probeSessionId }
}

/**
 * ② 号辅助：把某会话切进 plan mode 并投一句「用 exit_plan_mode 呈报」
 * 的提示——供浏览器截图评审卡与现有决策卡的共存。
 */
export async function armPlanCard(deps: SpikeDeps, sessionId: string, text?: string): Promise<{ ok: boolean; steps: ProbeStep[] }> {
  const steps: ProbeStep[] = []
  const resolved = deps.resolveAgent(sessionId)
  if (resolved.agent === undefined) {
    return { ok: false, steps: [{ name: 'agent.resolve', ok: false, detail: resolved.error ?? 'no live agent' }] }
  }
  const pm = deps.planMode()
  if (!usablePlanMode(pm)) {
    return { ok: false, steps: [{ name: 'planMode', ok: false, detail: 'ctx.planMode unavailable or not a usable face (get/set)' }] }
  }
  steps.push(await step('planMode.set(true)', () => brief(pm.set(resolved.agent, true))))
  const sessions = deps.sessions()
  if (sessions === undefined) {
    steps.push({ name: 'sessions', ok: false, detail: 'apiProxy sessions face not bound yet' })
  } else {
    steps.push(await step('sessions.prompt(plan request)', async () => {
      const asked = await sessions.prompt({
        rpcId: 'warroom-v5-spike',
        payload: {
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: text ?? '[warroom v5 spike] 请就「整理 C 盘临时目录」给出 3 步以内的简要计划，并用 exit_plan_mode 工具呈报等待批准。' }],
        },
      })
      if (!asked.result.ok) throw new Error(`rejected: ${asked.result.error.code} ${asked.result.error.message}`)
      return 'queued'
    }))
  }
  return { ok: steps.every(s => s.ok), steps }
}
