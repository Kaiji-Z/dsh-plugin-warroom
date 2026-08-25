import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, foldDirectives, overrideMarkerOf, loadDirectives, type DirectiveEvent } from '../src/directives.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { relayPromptFor } from '../src/relay.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { RouteRegistry } from '../src/dashboard.ts'
import type { Roster } from '../src/units.ts'
import type { SubmissionEvidence } from '../src/types.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_TRIAGE: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-triage' })
const FLAG_AUTOCLOSE: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-auto-close' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-staff-triage-'))
}

function makeDeps(dir: string, flags: FeatureFlags): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  return {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: {} as SubagentsServiceFace,
    commander: {},
    workspace: {},
    warRoot: 'C:/reg',
    flags,
  }
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId = 'sec-1'): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

function seedCommand(dir: string, id: string, text: string, received = true): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: id, text })
  if (received) appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: id, staffSessionId: 'sec-1' })
}

test('overrideMarkerOf：!!直接做→L0、??先看方案→L2、无标记→undefined', () => {
  assert.deepEqual(overrideMarkerOf('帮我清下日志 !!直接做'), { grade: 'L0', marker: '!!' })
  assert.deepEqual(overrideMarkerOf('重构配置层 ??先看方案'), { grade: 'L2', marker: '??' })
  assert.equal(overrideMarkerOf('普通命令'), undefined)
})

test('fold：directive_triaged/regraded 入账，终态守卫仍有效', () => {
  const events: DirectiveEvent[] = [
    { type: 'directive_created', ts: 't0', directiveId: 'c1', text: 'x' },
    { type: 'directive_triaged', ts: 't1', directiveId: 'c1', grade: 'L0', reason: '一句话小事', confidence: 0.9 },
    { type: 'directive_regraded', ts: 't2', directiveId: 'c1', grade: 'L1', reason: '元首要方案' },
    { type: 'directive_approved', ts: 't3', directiveId: 'c1', taskId: 't-1' },
    // 终态后的一切档位事件都被忽略。
    { type: 'directive_regraded', ts: 't4', directiveId: 'c1', grade: 'L0', reason: 'late' },
  ]
  const [d] = foldDirectives(events)
  assert.equal(d!.grade, 'L1')
  assert.equal(d!.gradeReason, '元首要方案')
  assert.equal(d!.gradeConfidence, 0.9)
  assert.equal(d!.regrades, 1)
})

test('war_triage：正常入账；重复分诊被拒；旗关不注册', async () => {
  const dir = tmpDir()
  try {
    seedCommand(dir, 'cmd-a', '帮我记一笔账')
    const deps = makeDeps(dir, FLAG_TRIAGE)
    const out = await execTool(deps, 'war_triage', { command_id: 'cmd-a', grade: 'L0', reason: '一句话小事', confidence: 0.9 }) as { commandId: string; grade: string }
    assert.equal(out.grade, 'L0')
    assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-a')!.grade, 'L0')
    // 重复分诊 → 拒。
    await assert.rejects(execTool(deps, 'war_triage', { command_id: 'cmd-a', grade: 'L1', reason: '再想想' }), /已分诊/)
    // 旗关 → 工具不在面。
    assert.equal(warTools(makeDeps(dir, FLAG_OFF)).some(t => t.name === 'war_triage'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('war_triage：元首标记强制改档（建议入 suggested，生效走 override）', async () => {
  const dir = tmpDir()
  try {
    seedCommand(dir, 'cmd-b', '把依赖全升到最新 !!直接做')
    const out = await execTool(makeDeps(dir, FLAG_TRIAGE), 'war_triage', { command_id: 'cmd-b', grade: 'L1', reason: '涉及面广' }) as { grade: string; suggested: string; override?: string }
    assert.equal(out.grade, 'L0')
    assert.equal(out.suggested, 'L1')
    assert.equal(out.override, '!!')
    const folded = loadDirectives(dir).find(d => d.id === 'cmd-b')!
    assert.equal(folded.grade, 'L0')
    assert.equal(folded.gradeReason, '涉及面广')
    // 事件里 suggested/override 留痕（审计可回放「参谋原建议 vs 元首强制」）。
    const triaged = loadDirectivesEvents(dir).find(e => e.type === 'directive_triaged') as Extract<DirectiveEvent, { type: 'directive_triaged' }>
    assert.equal(triaged.suggested, 'L1')
    assert.equal(triaged.override, '!!')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** 直接读原始事件（不经 fold）用于审计断言。 */
function loadDirectivesEvents(dir: string): DirectiveEvent[] {
  const file = join(dir, 'directives.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(l => l.trim() !== '').map(l => JSON.parse(l) as DirectiveEvent)
}

test('relayPromptFor：旗关字节等价（无分诊段）；旗开含 war_triage 纪律与覆写标记', () => {
  const directive = foldDirectives([{ type: 'directive_created', ts: 't0', directiveId: 'cmd-x', text: '做个小工具' }])[0]!
  const off = relayPromptFor(directive)
  const offExplicit = relayPromptFor(directive, FLAG_OFF)
  const on = relayPromptFor(directive, FLAG_TRIAGE)
  assert.equal(off, offExplicit)
  assert.ok(!off.includes('war_triage'))
  assert.ok(on.includes('war_triage'))
  assert.ok(on.includes('!!直接做'))
  assert.ok(on.includes('??先看方案'))
  assert.ok(on.includes('commandId=cmd-x') || on.includes('command_id=cmd-x'))
})

test('regrade 路由：旗关 404；旗开改档入账；未分诊/终态/坏档/未知命令被拒', async () => {
  const dir = tmpDir()
  const { registerDashboard } = await import('../src/dashboard.ts')
  const registry = (): { h: ((req: unknown, res: unknown) => void | Promise<void>) | undefined; dispose: () => void } => {
    let h: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
    const reg: RouteRegistry = { register: route => { h = route.handler; return () => {} } }
    const dispose = registerDashboard(reg, { store: fakeStore() as never, stateDir: dir, roster: () => ({ units: [], errors: [] }) as never, warRoot: '/w', flags: FLAG_TRIAGE } as never)
    return { get h() { return h }, dispose }
  }
  const fakeStore = (): object => ({ get: () => ({ version: 2 as const, active: true }), save: () => {} })
  const off = (() => {
    let h: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
    const reg: RouteRegistry = { register: route => { h = route.handler; return () => {} } }
    const dispose = registerDashboard(reg, { store: fakeStore() as never, stateDir: dir, roster: () => ({ units: [], errors: [] }) as never, warRoot: '/w', flags: FLAG_OFF } as never)
    return { get h() { return h }, dispose }
  })()
  const on = registry()
  const post = (url: string, body: unknown) => {
    const text = JSON.stringify(body)
    return { method: 'POST', url, on(event: string, cb: (chunk?: unknown) => void) { if (event === 'data') queueMicrotask(() => cb(text)); if (event === 'end') queueMicrotask(() => cb()) } }
  }
  try {
    const ended: string[] = []
    const res = { setHeader: () => {}, write: () => true, end: (b?: string) => { ended.push(b ?? '') } }
    seedCommand(dir, 'cmd-r', '待改档的命令')
    // 旗关 → 404（与改前等价）。
    await off.h!(post('/warroom/api/commands/regrade', { commandId: 'cmd-r', grade: 'L1' }), res)
    assert.match(ended[ended.length - 1]!, /no such route/)
    // 旗开但未分诊 → 400。
    await on.h!(post('/warroom/api/commands/regrade', { commandId: 'cmd-r', grade: 'L1' }), res)
    assert.match(ended[ended.length - 1]!, /尚未分诊/)
    // 分诊后改档 → ok，regrades 计数。
    appendDirectiveEvent(dir, { type: 'directive_triaged', ts: 't2', directiveId: 'cmd-r', grade: 'L1', reason: 'r' })
    await on.h!(post('/warroom/api/commands/regrade', { commandId: 'cmd-r', grade: 'L2' }), res)
    const ok1 = JSON.parse(ended[ended.length - 1]!) as { ok: boolean; grade: string }
    assert.equal(ok1.ok, true)
    assert.equal(ok1.grade, 'L2')
    assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-r')!.regrades, 1)
    // 坏档 → 400；未知命令 → 404。
    await on.h!(post('/warroom/api/commands/regrade', { commandId: 'cmd-r', grade: 'L9' }), res)
    assert.match(ended[ended.length - 1]!, /L0 \/ L1 \/ L2/)
    await on.h!(post('/warroom/api/commands/regrade', { commandId: 'cmd-nope', grade: 'L0' }), res)
    assert.match(ended[ended.length - 1]!, /不存在/)
  } finally {
    off.dispose()
    on.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

// --- staff-auto-close ---------------------------------------------------------

const WS = 'C:/reg/ws-1'

function greenEvidence(over: Partial<SubmissionEvidence> = {}): SubmissionEvidence {
  return {
    checks: [{ item: '功能可用', passed: true }, { item: '测试过', passed: true }],
    tests: { command: 'npm test', exitCode: 0, passed: 8, failed: 0 },
    diffstat: '1 file changed',
    files: [`${WS}/a.js`],
    ...over,
  }
}

/** war_submit 的 evidence 参数是 JSON 文本且 tests 键为 snake_case（exit_code）。 */
function evidenceText(e: SubmissionEvidence): string {
  const { tests, ...rest } = e
  return JSON.stringify({ ...rest, ...(tests !== undefined ? { tests: { command: tests.command, exit_code: tests.exitCode, passed: tests.passed, failed: tests.failed } } : {}) })
}

test('killCreditAllGreen：全绿 / 有败项 / 无测试 / 越界一票否决 / 相对路径锚定工作区', async () => {
  const { killCreditAllGreen } = await import('../src/tools.ts')
  assert.equal(killCreditAllGreen(greenEvidence(), WS).green, true)
  assert.equal(killCreditAllGreen(greenEvidence({ checks: [{ item: 'x', passed: false }] }), WS).green, false)
  const noTests = greenEvidence()
  delete (noTests as { tests?: unknown }).tests
  assert.equal(killCreditAllGreen(noTests, WS).green, false)
  assert.match(killCreditAllGreen(greenEvidence(), WS).why, /无越界/)
  const escaped = killCreditAllGreen(greenEvidence({ files: [`${WS}/a.js`, 'C:/elsewhere/b.js'] }), WS)
  assert.equal(escaped.green, false)
  assert.match(escaped.why, /越界/)
  // R5 考题抓到的判据 bug：相对路径是工作区内报法——锚定后应全绿。
  const relFiles = killCreditAllGreen(greenEvidence({ files: ['hello.txt', 'src/a.js'] }), WS)
  assert.equal(relFiles.green, true, relFiles.why)
  // 相对路径逃逸（..）仍应否决。
  const relEscape = killCreditAllGreen(greenEvidence({ files: ['../outside.js'] }), WS)
  assert.equal(relEscape.green, false)
})

test('war_submit 自动收官：旗开+全绿 → 落 task_closed（verdict 记机械全绿）；不全绿 → 维持 reported', async () => {
  const dir = tmpDir()
  try {
    const { appendEvent, loadCampaign } = await import('../src/events.ts')
    const seed = (id: string): void => {
      appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: id, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
      appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: id, workspacePath: WS })
      appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: id, claimedBy: 'cmd-9', attemptId: 'tok-1', attempt: 1 })
    }
    seed('c-green')
    seed('c-doubt')
    
    // 旗开 + 全绿 → 自动收官。
    const depsOn = makeDeps(dir, FLAG_AUTOCLOSE)
    const closed = await execTool(depsOn, 'war_submit', { task_id: 'c-green', attempt_id: 'tok-1', report: '完成', evidence: evidenceText(greenEvidence()) }, 'cmd-9') as { status: string }
    assert.equal(closed.status, 'closed')
    const task = loadCampaign(dir, 'c-green')
    assert.equal(task.status, 'closed')
    assert.match(task.closedVerdict ?? '', /自动收官/)
    // 旗开 + 证据过 parse 但机械复核不绿（越界文件）→ 维持 reported 待翻阅，绝不硬闯。
    // （checks 有败项在 parseEvidence 入口就被拒——分层防御：parse 管「不许带病提交」，
    //  killCreditAllGreen 管「收官机械复核」，越界是后者的独有否决项。）
    const escaped = greenEvidence({ files: [`${WS}/a.js`, 'C:/elsewhere/b.js'] })
    const reported = await execTool(depsOn, 'war_submit', { task_id: 'c-doubt', attempt_id: 'tok-1', report: '改了点东西', evidence: evidenceText(escaped) }, 'cmd-9') as { status: string }
    assert.equal(reported.status, 'reported')
    assert.equal(loadCampaign(dir, 'c-doubt').status, 'reported')
    // 旗关 + 全绿 → 现行为：submitted 后待翻阅，不自动收官。
    const dirOff = tmpDir()
    try {
      appendEvent(dirOff, { type: 'task_created', ts: 't0', campaignId: 'c-off', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
      appendEvent(dirOff, { type: 'task_published', ts: 't1', campaignId: 'c-off', workspacePath: WS })
      appendEvent(dirOff, { type: 'task_claimed', ts: 't2', campaignId: 'c-off', claimedBy: 'cmd-9', attemptId: 'tok-1', attempt: 1 })
      const legacy = await execTool(makeDeps(dirOff, FLAG_OFF), 'war_submit', { task_id: 'c-off', attempt_id: 'tok-1', report: '完成', evidence: evidenceText(greenEvidence()) }, 'cmd-9') as { status: string }
      assert.equal(legacy.status, 'reported')
      assert.equal((await import('../src/events.ts')).loadCampaign(dirOff, 'c-off').status, 'reported')
    } finally {
      rmSync(dirOff, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
