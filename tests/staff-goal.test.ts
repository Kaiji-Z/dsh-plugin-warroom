import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent } from '../src/directives.ts'
import { readEvents as readEventLog, appendEvent, loadCampaign } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { armGoalForTask, openDisarmedGoalForDirective, settleGoalMentioning, usableGoals, type GoalsFace } from '../src/goals.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_GOAL: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-goal' })
const FLAG_TRIAGE_GOAL: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-triage,staff-goal' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-staff-goal-'))
}

/** 真 CAS 语义假 goal 面：revision 每动词 +1，旧 revision ref 报 stale。 */
function fakeGoals(): GoalsFace & { log: string[]; views: Map<string, { id: string; revision: number; objective: string; phase: string }> } {
  let seq = 0
  const views = new Map<string, { id: string; revision: number; objective: string; phase: string }>()
  const state = { activeId: undefined as string | undefined }
  const log: string[] = []
  const active = (): { id: string; revision: number; objective: string; phase: string } | undefined => (state.activeId === undefined ? undefined : views.get(state.activeId))
  const bump = (v: { id: string; revision: number; objective: string; phase: string }, phase: string): { id: string; revision: number; objective: string; phase: string } => {
    const next = { ...v, revision: v.revision + 1, phase }
    views.set(v.id, next)
    return next
  }
  return {
    log,
    views,
    get: () => active() === undefined ? undefined : { ...active() },
    create: (_agent, request) => {
      if (state.activeId !== undefined) throw new Error('goal already active')
      seq += 1
      const v = { id: `goal-${seq}`, revision: 1, objective: request.objective, phase: 'active' }
      views.set(v.id, v)
      state.activeId = v.id
      log.push(`create:${v.id}:${request.objective}`)
      return { ...v }
    },
    disarm: (_agent, ref) => {
      const v = active()
      if (v === undefined) throw new Error('no active goal')
      if ((ref as { revision?: number })?.revision !== v.revision) throw new Error(`stale ref revision ${String((ref as { revision?: number })?.revision)}; current ${v.revision}`)
      log.push(`disarm:${v.id}@${v.revision}`)
      return { ...v, activation: 'disarmed' }
    },
    complete: (_agent, ref) => {
      const v = active()
      if (v === undefined) throw new Error('no active goal')
      if ((ref as { revision?: number })?.revision !== v.revision) throw new Error(`stale ref revision ${String((ref as { revision?: number })?.revision)}; current ${v.revision}`)
      const done = bump(v, 'complete')
      state.activeId = undefined
      log.push(`complete:${done.id}@${done.revision}`)
      return { ...done }
    },
    clear: (_agent, ref) => {
      log.push(`clear:${String((ref as { id?: unknown })?.id)}`)
      return { id: (ref as { id?: unknown })?.id }
    },
  }
}

function makeDeps(dir: string, flags: FeatureFlags, over: { goals?: GoalsFace; resolveAgent?: (id: string) => unknown } = {}): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  const deps = {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: {} as SubagentsServiceFace,
    commander: { conscript: async () => ({ spawned: false }) },
    workspace: { materialize: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }), materializeInstance: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }) },
    warRoot: 'C:/reg',
    flags,
    ...(over.goals !== undefined ? { goals: () => over.goals } : {}),
    ...(over.resolveAgent !== undefined ? { resolveAgent: over.resolveAgent } : {}),
  }
  if (over.goals === undefined) delete (deps as { goals?: unknown }).goals
  if (over.resolveAgent === undefined) delete (deps as { resolveAgent?: unknown }).resolveAgent
  return deps as Parameters<typeof warTools>[0]
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId = 'sec-1'): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

function seedTask(dir: string, id: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: id, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: id, workspacePath: 'C:/reg/ws' })
}

test('goals 辅助：CAS 结算/武装/参谋 disarm 状态机（含残留自愈）', async () => {
  const gs = fakeGoals()
  assert.equal(usableGoals(gs), true)
  const agent = { id: 'cmd-9' }
  // 武装。
  const armed = await armGoalForTask(gs, agent, 'c-77', { maxGoalRounds: 30, title: '修锁' })
  assert.ok(armed!.goalId.startsWith('goal-'))
  // 结算（fresh CAS ref）。
  const settledId = await settleGoalMentioning(gs, agent, 'c-77')
  assert.equal(settledId, armed!.goalId)
  // 已无活跃 goal → 再结算 no-op。
  assert.equal(await settleGoalMentioning(gs, agent, 'c-77'), undefined)
  // 残留自愈：武装同名任务先清旧再建新（healed 带旧 id）。
  await armGoalForTask(gs, agent, 'c-77', { maxGoalRounds: 30, title: '修锁' })
  const re = await armGoalForTask(gs, agent, 'c-77', { maxGoalRounds: 30, title: '修锁' })
  assert.equal(re!.healed !== undefined, true)
  // 清掉 c-77 活跃 goal（真服务按 agent 隔离；本假面是全局单活——先结算再演参谋线）。
  await settleGoalMentioning(gs, agent, 'c-77')
  // 参谋 disarm 状态机：create 后立即 disarm；同 directive 残留先结算。
  await openDisarmedGoalForDirective(gs, agent, 'cmd-l2')
  const staffGoal = await openDisarmedGoalForDirective(gs, agent, 'cmd-l2')
  assert.ok(staffGoal !== undefined)
  const disarms = gs.log.filter(l => l.startsWith('disarm:'))
  assert.equal(disarms.length, 2)
  // 服务缺席 → 全部诚实降级（undefined，不抛）。
  assert.equal(await armGoalForTask(undefined, agent, 'c', { maxGoalRounds: 1, title: 't' }), undefined)
  assert.equal(await settleGoalMentioning(undefined, agent, 'c'), undefined)
  assert.equal(await openDisarmedGoalForDirective(undefined, agent, 'd'), undefined)
})

test('war_claim 武装指挥官 goal + 收官/失败结算入账（commander_goal_* 事件）', async () => {
  const dir = tmpDir()
  try {
    seedTask(dir, 'c-1')
    const gs = fakeGoals()
    const deps = makeDeps(dir, FLAG_GOAL, { goals: gs })
    await execTool(deps, 'war_claim', { task_id: 'c-1' }, 'cmd-9')
    // claim → 武装 + 账本。
    const armedEv = readEventLog(dir, 'c-1').find(e => e.type === 'commander_goal_armed') as { type: 'commander_goal_armed'; goalId: string; sessionId: string }
    assert.ok(armedEv !== undefined)
    assert.equal(armedEv.sessionId, 'cmd-9')
    assert.ok(gs.log.some(l => l.startsWith('create:goal-') && l.includes('c-1')))
    // 收官 → 结算 + 账本。
    const deps2 = makeDeps(dir, FLAG_GOAL, { goals: gs, resolveAgent: () => ({ id: 'cmd-9' }) })
    await execTool(deps2, 'war_close_task', { task_id: 'c-1', verdict: '通过收官' }, 'sec-1')
    const settledEv = readEventLog(dir, 'c-1').find(e => e.type === 'commander_goal_settled') as { type: 'commander_goal_settled'; goalId: string; outcome: string }
    assert.equal(settledEv.goalId, armedEv.goalId)
    assert.equal(settledEv.outcome, 'closed')
    assert.ok(gs.log.some(l => l.startsWith('complete:')))
    // 旗关 → claim 不武装（行为等价）。
    const dirOff = tmpDir()
    try {
      seedTask(dirOff, 'c-off')
      const gsOff = fakeGoals()
      await execTool(makeDeps(dirOff, FLAG_OFF, { goals: gsOff }), 'war_claim', { task_id: 'c-off' }, 'cmd-9')
      assert.equal(gsOff.log.length, 0)
      assert.equal(readEventLog(dirOff, 'c-off').some(e => e.type === 'commander_goal_armed'), false)
    } finally {
      rmSync(dirOff, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('war_fail 重试用尽结算 goal（failed）', async () => {
  const dir = tmpDir()
  try {
    seedTask(dir, 'c-f')
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c-f', claimedBy: 'cmd-9', attemptId: 'tok', attempt: 1 })
    const gs = fakeGoals()
    // 手工武装（模拟 claim 时）。
    await armGoalForTask(gs, { id: 'cmd-9' }, 'c-f', { maxGoalRounds: 30, title: 'x' })
    const deps = makeDeps(dir, FLAG_GOAL, { goals: gs, resolveAgent: () => ({ id: 'cmd-9' }) })
    // maxAttempts=1：第一次 war_fail 即用尽 → task_failed → goal 结算。
    const depsOnce = { ...deps, maxAttempts: 1 } as Parameters<typeof warTools>[0]
    const out = await execTool(depsOnce, 'war_fail', { task_id: 'c-f', attempt_id: 'tok', reason: '修不动' }, 'cmd-9') as { status: string }
    assert.equal(out.status, 'failed')
    const settled = readEventLog(dir, 'c-f').find(e => e.type === 'commander_goal_settled') as { outcome: string }
    assert.equal(settled.outcome, 'failed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('war_triage L2 开参谋 disarm goal（入账 disarmed:true）；发布点接力结算', async () => {
  const dir = tmpDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-l2', text: '做个我不确定的东西' })
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: 'cmd-l2', staffSessionId: 'sec-1' })
    const gs = fakeGoals()
    const deps = makeDeps(dir, FLAG_TRIAGE_GOAL, { goals: gs })
    await execTool(deps, 'war_triage', { command_id: 'cmd-l2', grade: 'L2', reason: '意图不明' }, 'sec-1')
    const raw = (await import('node:fs')).readFileSync(join(dir, 'directives.jsonl'), 'utf8')
    assert.match(raw, /directive_goal_opened/)
    assert.match(raw, /"disarmed":true/)
    assert.ok(gs.log.some(l => l.startsWith('disarm:')))
    // 发布点接力：参谋 goal 随 war_publish(commandId) 结算。
    const depsPub = makeDeps(dir, FLAG_TRIAGE_GOAL, { goals: gs, resolveAgent: () => ({ id: 'sec-1' }) })
    await execTool(depsPub, 'war_publish', { title: '澄清后成案', brief: '背景与指引齐备的一句任务书', acceptance: 'npm test 退出码 0；功能可演示', commandId: 'cmd-l2' }, 'sec-1')
    assert.match(raw + (await import('node:fs')).readFileSync(join(dir, 'directives.jsonl'), 'utf8'), /directive_goal_settled/)
    assert.ok(gs.log.filter(l => l.startsWith('complete:')).length >= 1)
    // L0 分诊不开参谋 goal。
    const dir0 = tmpDir()
    try {
      appendDirectiveEvent(dir0, { type: 'directive_created', ts: 't0', directiveId: 'cmd-l0', text: '小事' })
      appendDirectiveEvent(dir0, { type: 'directive_received', ts: 't1', directiveId: 'cmd-l0', staffSessionId: 'sec-1' })
      const gs0 = fakeGoals()
      await execTool(makeDeps(dir0, FLAG_TRIAGE_GOAL, { goals: gs0 }), 'war_triage', { command_id: 'cmd-l0', grade: 'L0', reason: '简单' }, 'sec-1')
      assert.equal(gs0.log.length, 0)
    } finally {
      rmSync(dir0, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('war_set_goal：只许 in_progress + 在役指挥官；objective 绑定任务 id；面缺席诚实报错', async () => {
  const dir = tmpDir()
  try {
    seedTask(dir, 'c-sg')
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c-sg', claimedBy: 'cmd-9', attemptId: 'tok', attempt: 1 })
    const gs = fakeGoals()
    const deps = makeDeps(dir, FLAG_GOAL, { goals: gs, resolveAgent: () => ({ id: 'cmd-9' }) })
    const out = await execTool(deps, 'war_set_goal', { task_id: 'c-sg', objective_extra: '优先修登录' }, 'sec-1') as { goalId: string }
    assert.ok(out.goalId.startsWith('goal-'))
    assert.ok(gs.log.some(l => l.includes('c-sg') && l.includes('优先修登录')))
    // published 任务 → 拒。
    seedTask(dir, 'c-pub')
    await assert.rejects(execTool(deps, 'war_set_goal', { task_id: 'c-pub' }, 'sec-1'), /进行中/)
    // 面缺席 → 明确报错（不静默）。
    await assert.rejects(execTool(makeDeps(dir, FLAG_GOAL), 'war_set_goal', { task_id: 'c-sg' }, 'sec-1'), /goal 服务不可用/)
    // 旗关 → 工具不在面。
    assert.equal(warTools(makeDeps(dir, FLAG_OFF)).some(t => t.name === 'war_set_goal'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('armMissingCommanderGoals：领取未武装的缺口由扫描补武装（swept 入账）；已武装/旗关/面缺席幂等 no-op；重派形态只补新领取', async () => {
  const dir = tmpDir()
  try {
    // 缺口形态：claim 时 goal 面打嗝 → 无 commander_goal_armed。
    seedTask(dir, 'c-gap')
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c-gap', claimedBy: 'cmd-9', attemptId: 'tok-1', attempt: 1 })
    const gs = fakeGoals()
    const deps = makeDeps(dir, FLAG_GOAL, { goals: gs, resolveAgent: () => ({ id: 'cmd-9' }) })
    const { armMissingCommanderGoals } = await import('../src/tools.ts')
    const armed = await armMissingCommanderGoals(deps, 'c-gap')
    assert.deepEqual(armed, ['c-gap'])
    // 补武装入账带 swept:true 痕迹。
    const gapEvents = readEventLog(dir, 'c-gap')
    const sweptEvent = gapEvents.find(e => e.type === 'commander_goal_armed') as { swept?: boolean; sessionId?: string }
    assert.equal(sweptEvent.swept, true)
    assert.equal(sweptEvent.sessionId, 'cmd-9')
    // 幂等：再扫 no-op。
    assert.deepEqual(await armMissingCommanderGoals(deps, 'c-gap'), [])
    // 已武装（领取时成功）→ 扫描不动。
    seedTask(dir, 'c-ok')
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c-ok', claimedBy: 'cmd-9', attemptId: 'tok-2', attempt: 1 })
    appendEvent(dir, { type: 'commander_goal_armed', ts: 't3', campaignId: 'c-ok', goalId: 'goal-x', sessionId: 'cmd-9' })
    assert.deepEqual(await armMissingCommanderGoals(deps, 'c-ok'), [])
    // 旗关 → 永远 no-op（off == 改前）。
    assert.deepEqual(await armMissingCommanderGoals(makeDeps(dir, FLAG_OFF, { goals: gs, resolveAgent: () => ({ id: 'cmd-9' }) }), 'c-gap'), [])
    // 面缺席 → no-op（诚实降级）。
    assert.deepEqual(await armMissingCommanderGoals(makeDeps(dir, FLAG_GOAL, { resolveAgent: () => ({ id: 'cmd-9' }) }), 'c-gap'), [])
    // 重派形态：旧领取武装过 + requeue + 新领取未武装 → 只补新领取（K15 残留先结算）。
    seedTask(dir, 'c-re')
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c-re', claimedBy: 'cmd-a', attemptId: 'tok-3', attempt: 1 })
    appendEvent(dir, { type: 'commander_goal_armed', ts: 't3', campaignId: 'c-re', goalId: 'goal-old', sessionId: 'cmd-a' })
    appendEvent(dir, { type: 'task_requeued', ts: 't4', campaignId: 'c-re', reason: '修不动' })
    appendEvent(dir, { type: 'task_claimed', ts: 't5', campaignId: 'c-re', claimedBy: 'cmd-b', attemptId: 'tok-4', attempt: 2 })
    // goal-old 仍是活跃残留（模拟旧 armed 没结算）→ 补武装应先自愈再建新。
    const gsRe = fakeGoals()
    gsRe.create({ id: 'cmd-a' }, { objective: 'warroom 任务 c-re 验收全过（x）', maxGoalRounds: 1 })
    const depsRe = makeDeps(dir, FLAG_GOAL, { goals: gsRe, resolveAgent: () => ({ id: 'cmd-b' }) })
    assert.deepEqual(await armMissingCommanderGoals(depsRe, 'c-re'), ['c-re'])
    const reEvents = readEventLog(dir, 'c-re')
    const reArmed = reEvents.filter(e => e.type === 'commander_goal_armed').at(-1) as { sessionId?: string; healedGoalId?: string }
    assert.equal(reArmed.sessionId, 'cmd-b')
    assert.equal(reArmed.healedGoalId, 'goal-1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
