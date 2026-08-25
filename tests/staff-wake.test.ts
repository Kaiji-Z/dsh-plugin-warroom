import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent } from '../src/directives.ts'
import { appendEvent, loadCampaign, readEvents } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { boardDigest, createWakeEngine, wakeMessageFor } from '../src/wake.ts'
import type { SessionsApiFace } from '../src/relay.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_WAKE: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-wake' })
const FLAG_WAKE_AUTOCLOSE: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-wake,staff-auto-close' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-staff-wake-'))
}

/** 假 sessions：记录 prompt 目标与文本。 */
function fakeSessions(): SessionsApiFace & { prompted: Array<{ sessionId: string; text: string }>; failNext: boolean } {
  const state = { prompted: [] as Array<{ sessionId: string; text: string }>, failNext: false }
  return {
    get prompted() { return state.prompted },
    get failNext() { return state.failNext },
    set failNext(v: boolean) { state.failNext = v },
    create: async () => ({ result: { ok: true, value: { sessionId: 'sess-x' } } }),
    rename: async () => ({ result: { ok: true, value: null } }),
    prompt: async (request: { payload: { sessionId: string; content: Array<{ text: string }> } }) => {
      state.prompted.push({ sessionId: request.payload.sessionId, text: request.payload.content[0]!.text })
      if (state.failNext) return { result: { ok: false, error: { code: 'EBUSY', message: 'busy' } } }
      return { result: { ok: true, value: null } }
    },
  } as never
}

function makeDeps(dir: string, flags: FeatureFlags, wake?: (taskId: string, kind: 'reported' | 'failed', detail: string) => void): Parameters<typeof warTools>[0] {
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
    ...(wake !== undefined ? { wakeStaff: wake } : {}),
  }
  if (wake === undefined) delete (deps as { wakeStaff?: unknown }).wakeStaff
  return deps as Parameters<typeof warTools>[0]
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId = 'cmd-9'): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

function seedReportable(dir: string, id: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: id, title: '修锁', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: id, workspacePath: 'C:/reg/ws' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: id, claimedBy: 'cmd-9', attemptId: 'tok', attempt: 1 })
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-w', text: 'x' })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: 'cmd-w', staffSessionId: 'sec-staff' })
  appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't2', directiveId: 'cmd-w', taskId: id })
}

test('boardDigest / wakeMessageFor：纯函数形态（在役+结局、战报头+纪律尾）', () => {
  const dir = tmpDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: '修锁', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: 'C:/reg/ws' })
    const digest = boardDigest(dir)
    assert.match(digest, /【板摘要】/)
    assert.match(digest, /c1「修锁」待领取/)
    const msg = wakeMessageFor({ taskId: 'c1', title: '修锁', kind: 'reported', detail: '验收 2 项全过' }, digest)
    assert.match(msg, /【战报】任务 c1「修锁」已提交汇报/)
    assert.match(msg, /系统唤醒/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('唤醒引擎：reported 投递到命令卡参谋会话 + staff_woken 入账；去抖窗口内合并', async () => {
  const dir = tmpDir()
  const sessions = fakeSessions()
  let now = 1_000_000
  const engine = createWakeEngine({ stateDir: dir, sessions: () => sessions, hqSessionId: () => undefined, now: () => now })
  try {
    seedReportable(dir, 'c-wake')
    engine.wake('c-wake', 'reported', '验收全过')
    await new Promise(r => setTimeout(r, 20))
    assert.equal(sessions.prompted.length, 1)
    assert.equal(sessions.prompted[0]!.sessionId, 'sec-staff')
    assert.ok(readEvents(dir, 'c-wake').some(e => e.type === 'staff_woken' && e.sessionId === 'sec-staff'))
    // 去抖：窗口内同任务同类别 → 合并（无第二次投递）。
    now += 5_000
    engine.wake('c-wake', 'reported', '重放战报')
    await new Promise(r => setTimeout(r, 20))
    assert.equal(sessions.prompted.length, 1)
    // 窗口外 → 再投（并再次入账）。
    now += 60_000
    engine.wake('c-wake', 'reported', '新战报')
    await new Promise(r => setTimeout(r, 20))
    assert.equal(sessions.prompted.length, 2)
    // 不同类别不受彼此去抖影响。
    engine.wake('c-wake', 'failed', '失败了')
    await new Promise(r => setTimeout(r, 20))
    assert.equal(sessions.prompted.length, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('唤醒引擎 sweep：reported 未醒补推（崩溃恢复）；已醒跳过', async () => {
  const dir = tmpDir()
  const sessions = fakeSessions()
  const engine = createWakeEngine({ stateDir: dir, sessions: () => sessions, hqSessionId: () => undefined, now: () => Date.now() })
  try {
    seedReportable(dir, 'c-sweep')
    appendEvent(dir, { type: 'task_submitted', ts: 't3', campaignId: 'c-sweep', report: '完成汇报正文', from: 'cmd-9', evidence: { checks: [{ item: 'x', passed: true }] } })
    engine.sweep()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(sessions.prompted.length, 1)
    assert.match(sessions.prompted[0]!.text, /完成汇报正文/)
    // 再 sweep：已醒 → 跳过。
    engine.sweep()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(sessions.prompted.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools 钩子分级：reported 唤醒；全绿自动收官不唤醒；failed 唤醒；旗关无钩子', async () => {
  const evidenceGreen = JSON.stringify({ checks: [{ item: 'a', passed: true }], tests: { command: 'npm test', exit_code: 0, passed: 1, failed: 0 }, files: ['C:/reg/ws/a.js'] })
  const dir = tmpDir()
  try {
    seedReportable(dir, 'c-hook')
    const wakes: Array<[string, string]> = []
    const deps = makeDeps(dir, FLAG_WAKE, (taskId, kind) => { wakes.push([taskId, kind]) })
    await execTool(deps, 'war_submit', { task_id: 'c-hook', attempt_id: 'tok', report: '汇报', evidence: evidenceGreen })
    // 待翻阅（无 auto-close 旗）→ 唤醒参谋（分级推：reported 推）。
    assert.deepEqual(wakes, [['c-hook', 'reported']])
    assert.equal(loadCampaign(dir, 'c-hook').status, 'reported')
    // 失败（用尽）→ 唤醒 failed。
    const depsOnce = { ...deps, maxAttempts: 1 } as Parameters<typeof warTools>[0]
    seedReportable(dir, 'c-fail')
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c-fail', claimedBy: 'cmd-9', attemptId: 'tok', attempt: 1 })
    await execTool(depsOnce, 'war_fail', { task_id: 'c-fail', attempt_id: 'tok', reason: '修不动' })
    assert.deepEqual(wakes.at(-1), ['c-fail', 'failed'])
    // 自动收官（全绿）→ 不唤醒。
    const dir2 = tmpDir()
    try {
      seedReportable(dir2, 'c-auto')
      const wakes2: Array<[string, string]> = []
      const depsAuto = makeDeps(dir2, FLAG_WAKE_AUTOCLOSE, (taskId, kind) => { wakes2.push([taskId, kind]) })
      await execTool(depsAuto, 'war_submit', { task_id: 'c-auto', attempt_id: 'tok', report: '汇报', evidence: evidenceGreen })
      assert.equal(loadCampaign(dir2, 'c-auto').status, 'closed')
      assert.deepEqual(wakes2, [])
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
    // 旗关 → 无钩子调用（行为等价）。
    const dir3 = tmpDir()
    try {
      seedReportable(dir3, 'c-off')
      const wakes3: Array<[string, string]> = []
      const depsOff = makeDeps(dir3, FLAG_OFF, (taskId, kind) => { wakes3.push([taskId, kind]) })
      await execTool(depsOff, 'war_submit', { task_id: 'c-off', attempt_id: 'tok', report: '汇报', evidence: evidenceGreen })
      assert.deepEqual(wakes3, [])
    } finally {
      rmSync(dir3, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
