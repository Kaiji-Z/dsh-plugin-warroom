import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, foldCampaign, loadCampaign, type CampaignState } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'
import type { DescendantFace } from '../src/types.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_ON: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'troop-scheduler' })

function recruit(dir: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: '调度考题', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: 'C:/reg/w' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd-1', attemptId: 'tok-1', attempt: 1 })
  appendEvent(dir, { type: 'unit_deployed', ts: 't3', campaignId: 'c1', childId: 'child-a', unitName: 'recon', label: '侦察兵', mission: 'm', front: 'src', writes: true })
  appendEvent(dir, { type: 'unit_deployed', ts: 't4', campaignId: 'c1', childId: 'child-b', unitName: 'scribe', label: '文书兵', mission: 'm', front: 'docs', writes: true })
}

type Fake = { face: SubagentsServiceFace; followups: Array<{ childId: string; text: string }>; idle: string[] }

function fakeSubagents(opts: { idle?: string[] } = {}): Fake {
  const followups: Array<{ childId: string; text: string }> = []
  const idle = opts.idle ?? ['child-a', 'child-b']
  return {
    followups,
    idle,
    face: {
      async startContinuable() { return { childId: 'child-x', messageId: 'm' } },
      async followup(_p, childId, content) { followups.push({ childId, text: content.map(c => c.text).join(' ') }) ; return {} },
      interrupt() {},
      async listDescendants(): Promise<DescendantFace[]> {
        return [...idle.map(id => ({ kind: 'subagent', id, activity: 'inactive' as const, mode: 'continuable' as const }))]
      },
    },
  }
}

function makeDeps(dir: string, sub: SubagentsServiceFace, flags: FeatureFlags, resolveAgent?: (id: string) => unknown): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  const deps = {
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
  return deps
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId: string): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

const RESOLVE_CMD = (): unknown => ({ id: 'cmd-1' })

test('V4-R3 fold：子任务创建/认领/更新全链 + 令牌校验在 fold 层生效', () => {
  const events = [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' as const },
    { type: 'subtask_created', ts: 't1', campaignId: 'c1', subtaskId: 's1', title: '侦察', deps: [] },
    { type: 'subtask_created', ts: 't2', campaignId: 'c1', subtaskId: 's2', title: '汇总', deps: ['s1'] },
    { type: 'subtask_claimed', ts: 't3', campaignId: 'c1', subtaskId: 's1', claimedBy: 'child-a', attemptId: 'st-a1', attempt: 1 },
    { type: 'subtask_updated', ts: 't4', campaignId: 'c1', subtaskId: 's1', attemptId: 'st-STALE', status: 'completed' as const },
    { type: 'subtask_updated', ts: 't5', campaignId: 'c1', subtaskId: 's1', attemptId: 'st-a1', status: 'completed' as const },
    { type: 'subtask_updated', ts: 't6', campaignId: 'c1', subtaskId: 's1', attemptId: 'st-a1', status: 'completed' as const },
  ]
  const state = foldCampaign('c1', events)
  const s1 = state.subtasks.get('s1')!
  assert.equal(s1.status, 'completed')
  assert.equal(s1.attempts, 1)
  assert.equal(s1.claimedBy, 'child-a')
  assert.equal(state.subtasks.get('s2')!.status, 'open')
})

test('V4-R3 flag 门：三个队内工具只在 troop-scheduler ON 注册', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-sched-'))
  try {
    recruit(dir)
    const off = warTools(makeDeps(dir, fakeSubagents().face, FLAG_OFF)).map(t => t.name)
    assert.equal(off.some(n => n.startsWith('war_troop_')), false)
    const on = warTools(makeDeps(dir, fakeSubagents().face, FLAG_ON)).map(t => t.name)
    for (const n of ['war_troop_task', 'war_troop_claim', 'war_troop_update']) assert.ok(on.includes(n), n)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R3 司令建子任务即触发调度：闲置部队被认领并唤起（followup 即达）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-sched-'))
  try {
    recruit(dir)
    const fake = fakeSubagents()
    const deps = makeDeps(dir, fake.face, FLAG_ON, RESOLVE_CMD)
    const out = await execTool(deps, 'war_troop_task', { task_id: 'c1', title: '侦察依赖现状', detail: '列出用到的外部包' }, 'cmd-1') as { subtaskId: string; dispatched: number }
    assert.ok(out.subtaskId.startsWith('st-'))
    assert.equal(out.dispatched, 1, '一支部队闲置即被自动认领唤起')
    assert.equal(fake.followups.length, 1)
    assert.ok(fake.followups[0]!.text.includes('【队内调度】'))
    const task = loadCampaign(dir, 'c1')
    const s = task.subtasks.get(out.subtaskId)!
    assert.equal(s.status, 'in_progress')
    assert.ok(s.claimedBy !== undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R3 依赖门禁：前置未完成的子任务不被调度认领', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-sched-'))
  try {
    recruit(dir)
    const fake = fakeSubagents()
    const deps = makeDeps(dir, fake.face, FLAG_ON, RESOLVE_CMD)
    const first = await execTool(deps, 'war_troop_task', { task_id: 'c1', title: '第一步' }, 'cmd-1') as { subtaskId: string }
    // 第二步依赖第一步——第一步在役中，第二步不得被派发。
    const second = await execTool(deps, 'war_troop_task', { task_id: 'c1', title: '第二步', deps: [first.subtaskId] }, 'cmd-1') as { subtaskId: string; dispatched: number }
    assert.equal(second.dispatched, 0, '两支部队一闲一被占，依赖未完成故零派发')
    assert.equal(loadCampaign(dir, 'c1').subtasks.get(second.subtaskId)!.status, 'open')
    // 第一步完成后，kick 应把第二步派给空出来的部队。
    const s1 = loadCampaign(dir, 'c1').subtasks.get(first.subtaskId)!
    const done = await execTool(deps, 'war_troop_update', { task_id: 'c1', subtask_id: first.subtaskId, attempt_id: s1.attempt!.id, status: 'completed' }, s1.claimedBy!) as { dispatched: number }
    assert.equal(done.dispatched, 1, '完成触发 kick，依赖解锁的下一步被派发')
    const s2 = loadCampaign(dir, 'c1').subtasks.get(second.subtaskId)!
    assert.equal(s2.status, 'in_progress')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R3 自主认领与守卫：参战方限定、一户一役、陈旧令牌拒绝、blocked 回池', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-sched-'))
  try {
    recruit(dir)
    // 手工造两个 open 子任务（不经 war_troop_task——司令建题会以自身为 parent 触发 kick 自动认领）。
    appendEvent(dir, { type: 'subtask_created', ts: 't5', campaignId: 'c1', subtaskId: 'st-aaa', title: '甲', deps: [] })
    appendEvent(dir, { type: 'subtask_created', ts: 't6', campaignId: 'c1', subtaskId: 'st-bbb', title: '乙', deps: [] })
    const deps = makeDeps(dir, fakeSubagents().face, FLAG_ON, RESOLVE_CMD)
    await assert.rejects(execTool(deps, 'war_troop_claim', { task_id: 'c1', subtask_id: 'st-aaa' }, 'intruder'), /参战方/)
    const claim = await execTool(deps, 'war_troop_claim', { task_id: 'c1', subtask_id: 'st-aaa' }, 'child-a') as { attemptId: string }
    // child-a 已有在役子任务 → 不得再认领乙。
    await assert.rejects(execTool(deps, 'war_troop_claim', { task_id: 'c1', subtask_id: 'st-bbb' }, 'child-a'), /在役/)
    // 陈旧令牌更新被拒。
    await assert.rejects(execTool(deps, 'war_troop_update', { task_id: 'c1', subtask_id: 'st-aaa', attempt_id: 'st-STALE', status: 'completed' }, 'child-a'), /令牌/)
    // blocked → 回池并立刻转派给另一闲置部队（放弃者被排除，防单部队活锁）。
    await execTool(deps, 'war_troop_update', { task_id: 'c1', subtask_id: 'st-aaa', attempt_id: claim.attemptId, status: 'blocked', note: '缺依赖' }, 'child-a')
    const aaa = loadCampaign(dir, 'c1').subtasks.get('st-aaa')!
    assert.equal(aaa.status, 'in_progress', '回池后 kick 立即转派')
    assert.equal(aaa.claimedBy, 'child-b', '转派给另一闲置部队，而非放弃者')
    // child-b 现持有甲 → 不得再认领乙（一户一役另一向）。
    await assert.rejects(execTool(deps, 'war_troop_claim', { task_id: 'c1', subtask_id: 'st-bbb' }, 'child-b'), /在役/)
    // 释放出来的 child-a 可认领乙。
    const claimB = await execTool(deps, 'war_troop_claim', { task_id: 'c1', subtask_id: 'st-bbb' }, 'child-a') as { attemptId: string }
    assert.ok(claimB.attemptId.length > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R3 war_status 子任务可见性随 flag（off 不增字段）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-sched-'))
  try {
    recruit(dir)
    appendEvent(dir, { type: 'subtask_created', ts: 't9', campaignId: 'c1', subtaskId: 's9', title: '甲', deps: [] })
    const off = await execTool(makeDeps(dir, fakeSubagents().face, FLAG_OFF), 'war_status', { task_id: 'c1' }, 'cmd-1') as Record<string, unknown>
    assert.equal('subtasks' in off, false)
    const on = await execTool(makeDeps(dir, fakeSubagents().face, FLAG_ON), 'war_status', { task_id: 'c1' }, 'cmd-1') as { subtasks: Array<{ subtaskId: string; status: string }> }
    assert.equal(on.subtasks.length, 1)
    assert.equal(on.subtasks[0]!.status, 'open')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R3 调度熔断入口 kickIdleTroops 可独立调用（30s 兜底由 index 装配）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-sched-'))
  try {
    recruit(dir)
    appendEvent(dir, { type: 'subtask_created', ts: 't5', campaignId: 'c1', subtaskId: 's1', title: '甲', deps: [] })
    const fake = fakeSubagents({ idle: ['child-b'] })
    const deps = makeDeps(dir, fake.face, FLAG_ON, RESOLVE_CMD)
    const { kickIdleTroops } = await import('../src/tools.ts')
    const n = await kickIdleTroops(deps, 'c1', new AbortController().signal)
    assert.equal(n, 1)
    assert.equal(fake.followups.length, 1)
    assert.equal(loadCampaign(dir, 'c1').subtasks.get('s1')!.claimedBy, 'child-b')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
