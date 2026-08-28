import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, foldCampaign, loadCampaign } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, kickIdleTroops, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'
import type { DescendantFace } from '../src/types.ts'

const OFF: FeatureFlags = readFeatureFlags({})
const SCHED: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'troop-scheduler' })
const PARK: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'troop-scheduler,troop-park' })

function recruit(dir: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'park 考题', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: 'C:/reg/w' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd-1', attemptId: 'tok-1', attempt: 1 })
  appendEvent(dir, { type: 'unit_deployed', ts: 't3', campaignId: 'c1', childId: 'child-a', unitName: 'recon', label: '侦察兵', mission: 'm', front: 'src', writes: true })
  appendEvent(dir, { type: 'unit_deployed', ts: 't4', campaignId: 'c1', childId: 'child-b', unitName: 'scribe', label: '文书兵', mission: 'm', front: 'docs', writes: true })
}

function claimedSubtask(dir: string): string {
  appendEvent(dir, { type: 'subtask_created', ts: 't5', campaignId: 'c1', subtaskId: 'st-x', title: '甲', deps: [] })
  appendEvent(dir, { type: 'subtask_claimed', ts: 't6', campaignId: 'c1', subtaskId: 'st-x', claimedBy: 'child-a', attemptId: 'st-tok-1', attempt: 1 })
  return 'st-x'
}

type Fake = { face: SubagentsServiceFace; followups: Array<{ childId: string }>; idle: string[] }

function fakeSubagents(opts: { idle?: string[] } = {}): Fake {
  const followups: Array<{ childId: string }> = []
  const idle = opts.idle ?? ['child-b']
  return {
    followups,
    idle,
    face: {
      async startContinuable() { return { childId: 'child-x', messageId: 'm' } },
      async followup(_p, childId) { followups.push({ childId }) ; return {} },
      interrupt() {},
      async listDescendants(): Promise<DescendantFace[]> {
        return idle.map(id => ({ kind: 'subagent', id, activity: 'inactive' as const, mode: 'continuable' as const }))
      },
    },
  }
}

function makeDeps(dir: string, sub: SubagentsServiceFace, flags: FeatureFlags, resolveAgent?: (id: string) => unknown): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  return {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: sub,
    commander: {},
    workspace: {},
    warRoot: 'C:/reg',
    flags,
    ...(resolveAgent !== undefined ? { resolveAgent } : {}),
  } as Parameters<typeof warTools>[0]
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId: string): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

test('V4-R4 fold：park 保留尝试与令牌，有效更新解除 park', () => {
  const state = foldCampaign('c1', [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'subtask_created', ts: 't1', campaignId: 'c1', subtaskId: 's', title: '甲', deps: [] },
    { type: 'subtask_claimed', ts: 't2', campaignId: 'c1', subtaskId: 's', claimedBy: 'child-a', attemptId: 'k1', attempt: 1 },
    { type: 'subtask_parked', ts: 't3', campaignId: 'c1', subtaskId: 's', reason: '撤退打断' },
    { type: 'subtask_updated', ts: 't4', campaignId: 'c1', subtaskId: 's', attemptId: 'k1', status: 'completed' },
  ])
  assert.equal(state.subtasks.get('s')!.parked, undefined, '有效更新清 park')
  assert.equal(state.subtasks.get('s')!.status, 'completed')
  const parked = foldCampaign('c1', [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'subtask_created', ts: 't1', campaignId: 'c1', subtaskId: 's', title: '甲', deps: [] },
    { type: 'subtask_claimed', ts: 't2', campaignId: 'c1', subtaskId: 's', claimedBy: 'child-a', attemptId: 'k1', attempt: 1 },
    { type: 'subtask_parked', ts: 't3', campaignId: 'c1', subtaskId: 's', reason: '撤退打断' },
  ])
  const s = parked.subtasks.get('s')!
  assert.equal(s.parked, true, 'park 后仍持有令牌与尝试')
  assert.equal(s.attempt!.id, 'k1')
})

test('V4-R4 war_recall 撤退即 park 在役子任务（flag on）且令牌保留', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-park-'))
  try {
    recruit(dir)
    claimedSubtask(dir)
    const fake = fakeSubagents()
    const deps = makeDeps(dir, fake.face, PARK, () => ({ id: 'cmd-1' }))
    await execTool(deps, 'war_recall', { task_id: 'c1', child_id: 'child-a', reason: '暂停' }, 'cmd-1')
    const s = loadCampaign(dir, 'c1').subtasks.get('st-x')!
    assert.equal(s.parked, true)
    assert.equal(s.attempt!.id, 'st-tok-1', 'park 不换令牌——同外勤组员可凭原令牌续作')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R4 flag off：war_recall 账本零 park 事件（字节等价路径）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-park-'))
  try {
    recruit(dir)
    claimedSubtask(dir)
    const deps = makeDeps(dir, fakeSubagents().face, OFF)
    await execTool(deps, 'war_recall', { task_id: 'c1', child_id: 'child-a', reason: '暂停' }, 'cmd-1')
    const s = loadCampaign(dir, 'c1').subtasks.get('st-x')!
    assert.equal(s.parked, undefined, 'off 时不得写 park 事件')
    assert.equal(s.status, 'in_progress')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R4 war_troop_reassign：外勤小队显式换手——旧令牌吊销回池，kick 排除原主', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-park-'))
  try {
    recruit(dir)
    claimedSubtask(dir)
    const fake = fakeSubagents({ idle: ['child-a', 'child-b'] })
    const deps = makeDeps(dir, fake.face, PARK, () => ({ id: 'cmd-1' }))
    const out = await execTool(deps, 'war_troop_reassign', { task_id: 'c1', subtask_id: 'st-x' }, 'cmd-1') as { dispatched: number }
    assert.ok(out.dispatched >= 1, '换手后立即转派')
    const s = loadCampaign(dir, 'c1').subtasks.get('st-x')!
    assert.equal(s.status, 'in_progress')
    assert.equal(s.claimedBy, 'child-b', '转派给另一闲置外勤组员，原主被排除')
    // 旧令牌已被吊销：child-a 持旧令牌更新 → 陈旧拒绝。
    await assert.rejects(execTool(deps, 'war_troop_update', { task_id: 'c1', subtask_id: 'st-x', attempt_id: 'st-tok-1', status: 'completed' }, 'child-a'), /令牌/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R4 冷恢复：撤编外勤组员的在役子任务被熔断回池转派', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-park-'))
  try {
    recruit(dir)
    claimedSubtask(dir)
    appendEvent(dir, { type: 'unit_recalled', ts: 't7', campaignId: 'c1', childId: 'child-a', reason: '崩溃' })
    const fake = fakeSubagents({ idle: ['child-b'] })
    const deps = makeDeps(dir, fake.face, PARK, () => ({ id: 'cmd-1' }))
    const n = await kickIdleTroops(deps, 'c1')
    assert.equal(n, 1)
    const s = loadCampaign(dir, 'c1').subtasks.get('st-x')!
    assert.equal(s.claimedBy, 'child-b')
    assert.equal(fake.followups[0]!.childId, 'child-b')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R4 冷恢复不打扰现役：owner 未撤编时子任务原样保留', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-park-'))
  try {
    recruit(dir)
    claimedSubtask(dir)
    const fake = fakeSubagents({ idle: ['child-a', 'child-b'] })
    const deps = makeDeps(dir, fake.face, PARK, () => ({ id: 'cmd-1' }))
    await kickIdleTroops(deps, 'c1')
    const s = loadCampaign(dir, 'c1').subtasks.get('st-x')!
    assert.equal(s.claimedBy, 'child-a', 'owner 在册在役——不冷恢复')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R4 注册面：war_troop_reassign 只在 troop-park ON 出现', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-park-'))
  try {
    recruit(dir)
    const names = (f: FeatureFlags): string[] => warTools(makeDeps(dir, fakeSubagents().face, f)).map(t => t.name)
    assert.equal(names(SCHED).includes('war_troop_reassign'), false, '仅 scheduler 不含 reassign')
    assert.equal(names(PARK).includes('war_troop_reassign'), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
