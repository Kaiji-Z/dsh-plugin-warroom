import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { registerDashboard, type RouteRegistry } from '../src/dashboard.ts'
import { armPlanCard, runSpikeProbe, usableGoals, usablePlanMode, type GoalsFace, type PlanModeFace, type ProbeStep, type SpikeDeps } from '../src/v5spike.ts'
import type { SessionsApiFace } from '../src/relay.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-v5spike-'))
}

function fakeStore(active = false) {
  return { get: () => ({ version: 2 as const, active }), save: () => {} }
}

/** 可编程假 plan-mode 面：记录 set 序列，get 回放当前态。 */
function fakePlanMode(): PlanModeFace & { calls: Array<[boolean]> } {
  const state = { calls: [] as Array<[boolean]>, active: false }
  return {
    calls: state.calls,
    get: () => ({ planMode: state.active }),
    set: (_agent: unknown, active: boolean) => { state.calls.push([active]); state.active = active; return { planMode: active } },
  }
}

/** 可编程假 goal 面：默认无 goal；可预置活跃 goal 制造 create 被拒。 */
function fakeGoals(preset?: { ref: string }): GoalsFace & { log: string[]; activeRef?: string } {
  const state = { log: [] as string[], activeRef: preset?.ref }
  return {
    log: state.log,
    get activeRef() { return state.activeRef },
    get: () => (state.activeRef === undefined ? undefined : { ref: state.activeRef, phase: 'active' }),
    create: (_agent: unknown, request: { objective: string }) => {
      if (state.activeRef !== undefined) throw new Error('goal already active')
      state.activeRef = 'scratch-1'
      state.log.push(`create:${request.objective}`)
      return { ref: 'scratch-1', objective: request.objective, phase: 'active' }
    },
    complete: (_agent: unknown, ref: unknown) => { state.log.push(`complete:${String(ref)}`); return { ref, phase: 'complete' } },
    clear: (_agent: unknown, ref: unknown) => { state.log.push(`clear:${String(ref)}`); state.activeRef = undefined; return { ref } },
  }
}

/** 假 sessions 面：默认 create 成功，可编程成拒绝（验错误收纳）。 */
function fakeSessions(opts?: { rejectCode?: string }): SessionsApiFace & { created: unknown[]; renamed: string[]; prompted: string[] } {
  const state = { created: [] as unknown[], renamed: [] as string[], prompted: [] as string[] }
  return {
    created: state.created,
    get renamed() { return state.renamed },
    get prompted() { return state.prompted },
    create: async (request: { payload: unknown }) => {
      state.created.push(request.payload)
      if (opts?.rejectCode !== undefined) return { result: { ok: false, error: { code: opts.rejectCode, message: 'nope' } } }
      return { result: { ok: true, value: { sessionId: 'sess-probe-1' } } }
    },
    rename: async (request: { payload: { sessionId: string; title: string } }) => { state.renamed.push(request.payload.title); return { result: { ok: true, value: null } } },
    prompt: async (request: { payload: { sessionId: string; content: Array<{ text: string }> } }) => { state.prompted.push(request.payload.content[0]!.text); return { result: { ok: true, value: null } } },
  }
}

/** spikeDeps 装配：null = 该面缺席（验「不可达」分支），undefined = 用默认假面。 */
interface SpikeOpts {
  planModeFace?: PlanModeFace | null
  goalsFace?: GoalsFace | null
  sessionsFace?: SessionsApiFace | null
  agent?: unknown
}

function spikeDeps(opts: SpikeOpts = {}): SpikeDeps {
  const hasPm = 'planModeFace' in opts
  const hasGs = 'goalsFace' in opts
  const hasSs = 'sessionsFace' in opts
  const agent = 'agent' in opts ? opts.agent : { agentId: 'live-agent' }
  const defaultPm = fakePlanMode()
  const defaultGs = fakeGoals()
  const defaultSs = fakeSessions()
  return {
    availability: () => ({ planMode: typeof (hasPm ? opts.planModeFace : defaultPm), goals: typeof (hasGs ? opts.goalsFace : defaultGs) }),
    resolveAgent: (sessionId: string) => (sessionId === 'missing' ? { error: 'no live agent for session' } : { agent }),
    // null = 缺席（验「不可达」分支）；不传 = 用默认假面。
    planMode: () => (hasPm ? (opts.planModeFace ?? undefined) : defaultPm),
    goals: () => (hasGs ? (opts.goalsFace ?? undefined) : defaultGs),
    sessions: () => (hasSs ? (opts.sessionsFace ?? undefined) : defaultSs),
    warRoot: () => '/warroot',
  }
}

test('usablePlanMode / usableGoals: 形状判据（缺方法即不可用）', () => {
  assert.equal(usablePlanMode(fakePlanMode()), true)
  assert.equal(usablePlanMode({ get: () => {} }), false)
  assert.equal(usablePlanMode(undefined), false)
  assert.equal(usableGoals(fakeGoals()), true)
  assert.equal(usableGoals({ get: () => {}, create: () => {} }), false)
  assert.equal(usableGoals(undefined), false)
})

test('runSpikeProbe 全链：plan-mode 往返 + goal 草稿即清 + sessions 吃 toolFilter', async () => {
  const pm = fakePlanMode()
  const gs = fakeGoals()
  const ss = fakeSessions()
  const report = await runSpikeProbe(spikeDeps({ planModeFace: pm, goalsFace: gs, sessionsFace: ss }), 'sess-1')
  assert.equal(report.ok, true, JSON.stringify(report.steps))
  // plan-mode：set(true) → set(false) 复原。
  assert.deepEqual(pm.calls, [[true], [false]])
  // goal：探针草稿建后即 complete+clear，不留痕。
  assert.equal(gs.log.length, 3)
  assert.ok(gs.log[0]!.startsWith('create:'))
  assert.equal(gs.log[1], 'complete:scratch-1')
  assert.equal(gs.log[2], 'clear:scratch-1')
  assert.equal(gs.activeRef, undefined)
  // sessions：payload 携带 toolFilter 发出；探针会话被改名留痕。
  assert.equal(ss.created.length, 1)
  assert.ok(JSON.stringify(ss.created[0]).includes('toolFilter'))
  assert.equal(report.probeSessionId, 'sess-probe-1')
  assert.equal(ss.renamed.length, 1)
})

test('runSpikeProbe 容错：单步失败不传染，既有 goal 不被触碰', async () => {
  const gs = fakeGoals({ ref: 'existing-7' })
  const report = await runSpikeProbe(spikeDeps({ goalsFace: gs, sessionsFace: fakeSessions({ rejectCode: 'EVALIDATION' }) }), 'sess-1')
  const byName = Object.fromEntries(report.steps.map((s: ProbeStep) => [s.name, s]))
  // create 被拒是预期路径（活跃 goal 已存在）——既有 goal 无副作用。
  assert.equal(byName['goals.create(scratch)']!.ok, false)
  assert.match(byName['goals.create(scratch)']!.detail, /already active/)
  assert.equal(byName['goals.sideEffects']!.ok, true)
  assert.deepEqual(gs.log, [])
  // sessions 拒绝不炸整链，detail 带错误码。
  assert.equal(byName['sessions.create(toolFilter)']!.ok, false)
  assert.match(byName['sessions.create(toolFilter)']!.detail, /EVALIDATION/)
  assert.equal(report.probeSessionId, undefined)
})

test('runSpikeProbe 不可达面：ctx.planMode/goals 缺席时给定性 detail', async () => {
  const report = await runSpikeProbe(spikeDeps({ planModeFace: null, goalsFace: null, sessionsFace: null }), 'sess-1')
  const names = report.steps.map(s => s.name)
  assert.ok(names.includes('agent.resolve'))
  assert.ok(names.includes('planMode'))
  assert.ok(names.includes('goals'))
  assert.ok(names.includes('sessions'))
  assert.match(report.steps.find(s => s.name === 'planMode')!.detail, /unavailable/)
  assert.match(report.steps.find(s => s.name === 'goals')!.detail, /unavailable/)
  assert.match(report.steps.find(s => s.name === 'sessions')!.detail, /not bound/)
  assert.equal(report.ok, false)
})

test('runSpikeProbe：会话号无活体 agent → plan-mode/goals 步全降级', async () => {
  const report = await runSpikeProbe(spikeDeps({}), 'missing')
  const byName = Object.fromEntries(report.steps.map((s: ProbeStep) => [s.name, s]))
  assert.equal(byName['agent.resolve']!.ok, false)
  assert.match(byName['planMode']!.detail, /no live agent/)
  assert.match(byName['goals']!.detail, /no live agent/)
})

test('armPlanCard：set(true) + 投递呈报提示；无 plan-mode 面时定性失败', async () => {
  const pm = fakePlanMode()
  const ss = fakeSessions()
  const ok = await armPlanCard(spikeDeps({ planModeFace: pm, sessionsFace: ss }), 'sess-1', '请呈报微计划')
  assert.equal(ok.ok, true)
  assert.deepEqual(pm.calls, [[true]])
  assert.equal(ss.prompted.length, 1)
  assert.equal(ss.prompted[0], '请呈报微计划')
  const noFace = await armPlanCard(spikeDeps({ planModeFace: null }), 'sess-1')
  assert.equal(noFace.ok, false)
  assert.match(noFace.steps[0]!.detail, /unavailable/)
})

test('探针路由：旗关 404；旗开 GET 快照 / POST 探针 / 缺 sessionId 400', async () => {
  const dir = tmpStateDir()
  const cases: Array<{ spike?: SpikeDeps; label: string }> = [
    { label: 'off' },
    { label: 'on', spike: spikeDeps({}) },
  ]
  try {
    for (const c of cases) {
      let handler: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
      const registry: RouteRegistry = { register: route => { handler = route.handler; return () => {} } }
      const dispose = registerDashboard(registry, { store: fakeStore(true) as never, stateDir: dir, roster: () => ({ units: [], errors: [] }) as never, warRoot: '/w', ...(c.spike === undefined ? {} : { spike: c.spike }) })
      const ended: string[] = []
      const res = { setHeader: () => {}, write: () => true, end: (b?: string) => { ended.push(b ?? '') } }
      const post = (url: string, body: unknown) => {
        const text = JSON.stringify(body)
        return { method: 'POST', url, on(event: string, cb: (chunk?: unknown) => void) { if (event === 'data') queueMicrotask(() => cb(text)); if (event === 'end') queueMicrotask(() => cb()) } }
      }
      if (c.label === 'off') {
        await handler!({ method: 'GET', url: '/warroom/api/v5-spike' }, res)
        assert.match(ended[ended.length - 1]!, /no such route/)
        await handler!(post('/warroom/api/v5-spike', { sessionId: 's' }), res)
        assert.match(ended[ended.length - 1]!, /no such route/)
      } else {
        await handler!({ method: 'GET', url: '/warroom/api/v5-spike' }, res)
        const avail = JSON.parse(ended[ended.length - 1]!) as { ok: boolean; availability: Record<string, unknown> }
        assert.equal(avail.ok, true)
        assert.ok('planMode' in avail.availability)
        await handler!(post('/warroom/api/v5-spike', {}), res)
        assert.match(ended[ended.length - 1]!, /缺少 sessionId/)
        await handler!(post('/warroom/api/v5-spike', { sessionId: 'sess-1' }), res)
        const probed = JSON.parse(ended[ended.length - 1]!) as { ok: boolean; steps: ProbeStep[] }
        assert.ok(probed.steps.some(s => s.name === 'planMode.set(true)'))
        await handler!(post('/warroom/api/v5-spike', { sessionId: 'sess-1', action: 'planCard', text: '呈报微计划' }), res)
        const card = JSON.parse(ended[ended.length - 1]!) as { ok: boolean; steps: ProbeStep[] }
        assert.ok(card.steps.some(s => s.name === 'sessions.prompt(plan request)'))
      }
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
