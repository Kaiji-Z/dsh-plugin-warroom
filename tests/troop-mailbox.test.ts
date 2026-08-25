import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, foldCampaign, loadCampaign } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'
import type { WarEvent } from '../src/types.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_ON: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'troop-mailbox' })

/** Recruit a task with commander session cmd-session-1 and two troops. */
function recruit(dir: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: '直讯考题', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: 'C:/reg/w' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd-session-1', attemptId: 'tok-1', attempt: 1 })
  appendEvent(dir, { type: 'unit_deployed', ts: 't3', campaignId: 'c1', childId: 'child-a', unitName: 'recon', label: '侦察兵', mission: 'm', front: 'src', writes: true })
  appendEvent(dir, { type: 'unit_deployed', ts: 't4', campaignId: 'c1', childId: 'child-b', unitName: 'scribe', label: '文书兵', mission: 'm', front: 'docs', writes: true })
}

/** Fake subagents recording every followup (parent identity included). */
function fakeSubagents(): { face: SubagentsServiceFace; followups: Array<{ parent: { id?: string }; childId: string; text: string }> } {
  const followups: Array<{ parent: { id?: string }; childId: string; text: string }> = []
  return {
    followups,
    face: {
      async startContinuable() { return { childId: 'child-x', messageId: 'm' } },
      async followup(parent, childId, content) {
        followups.push({ parent: parent as { id?: string }, childId, text: content.map(c => c.text).join(' ') })
        return {}
      },
      interrupt() {},
      async listDescendants() { return [] },
    },
  }
}

type DepsOverrides = { flags: FeatureFlags; resolveAgent?: (id: string) => unknown }

function makeDeps(dir: string, sub: SubagentsServiceFace, over: DepsOverrides): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  const base = {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: sub,
    commander: {},
    workspace: {},
    warRoot: 'C:/reg',
    flags: over.flags,
  }
  const deps = { ...base, resolveAgent: over.resolveAgent } as Parameters<typeof warTools>[0] & { resolveAgent?: (id: string) => unknown }
  if (over.resolveAgent === undefined) delete (deps as { resolveAgent?: unknown }).resolveAgent
  return deps
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId: string): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

test('V4-R2 fold：message_logged 入账、message_delivered 标记、未知投递被忽略', () => {
  const events: WarEvent[] = [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'message_logged', ts: 't1', campaignId: 'c1', messageId: 'm1', from: 'cmd-session-1', to: 'child-a', text: '前进' },
    { type: 'message_delivered', ts: 't2', campaignId: 'c1', messageId: 'm1' },
    { type: 'message_delivered', ts: 't3', campaignId: 'c1', messageId: 'ghost' },
  ]
  const state = foldCampaign('c1', events)
  assert.equal(state.messages.length, 1)
  assert.equal(state.messages[0]!.delivered, true)
  const pending = foldCampaign('c1', [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'message_logged', ts: 't1', campaignId: 'c1', messageId: 'm2', from: 'child-a', to: 'child-b', text: '侧翼' },
  ])
  assert.equal(pending.messages[0]!.delivered, undefined)
})

test('V4-R2 flag 门：war_message 仅在 troop-mailbox ON 时注册（off 面不变）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-mailbox-'))
  try {
    recruit(dir)
    const off = warTools(makeDeps(dir, fakeSubagents().face, { flags: FLAG_OFF }))
    assert.equal(off.some(t => t.name === 'war_message'), false, 'flag off 不得出现 war_message')
    const on = warTools(makeDeps(dir, fakeSubagents().face, { flags: FLAG_ON }))
    assert.equal(on.some(t => t.name === 'war_message'), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R2 指挥官→部队：即时唤起（followup 即达）且双事件入账', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-mailbox-'))
  try {
    recruit(dir)
    const sub = fakeSubagents()
    const out = await execTool(makeDeps(dir, sub.face, { flags: FLAG_ON }), 'war_message', { task_id: 'c1', to: 'child-a', text: '侦察报告即刻要' }, 'cmd-session-1') as { delivered: boolean; messageId: string }
    assert.equal(out.delivered, true)
    assert.equal(sub.followups.length, 1)
    assert.equal(sub.followups[0]!.childId, 'child-a')
    assert.equal((sub.followups[0]!.parent as { id?: string }).id, 'cmd-session-1')
    const task = loadCampaign(dir, 'c1')
    assert.equal(task.messages.length, 1)
    assert.equal(task.messages[0]!.delivered, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R2 非参战方不得发信；部队按兵种名寻址（唯一才准）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-mailbox-'))
  try {
    recruit(dir)
    const deps = makeDeps(dir, fakeSubagents().face, { flags: FLAG_ON, resolveAgent: () => ({ id: 'cmd-session-1' }) })
    await assert.rejects(execTool(deps, 'war_message', { task_id: 'c1', to: 'child-a', text: 'x' }, 'intruder'), /参战方/)
    // 部队→部队：兵种名唯一寻址 + 经注册表解析指挥官作 parent。
    const sub2 = fakeSubagents()
    const deps2 = makeDeps(dir, sub2.face, { flags: FLAG_ON, resolveAgent: () => ({ id: 'cmd-session-1' }) })
    const out = await execTool(deps2, 'war_message', { task_id: 'c1', to: 'scribe', text: '侧翼有变' }, 'child-a') as { delivered: boolean }
    assert.equal(out.delivered, true)
    assert.equal(sub2.followups[0]!.childId, 'child-b')
    assert.equal((sub2.followups[0]!.parent as { id?: string }).id, 'cmd-session-1')
    // 同兵种两支部队 → 名称歧义，必须点名 childId。
    appendEvent(dir, { type: 'unit_deployed', ts: 't5', campaignId: 'c1', childId: 'child-c', unitName: 'scribe', label: '文书兵', mission: 'm', front: 'notes', writes: true })
    await assert.rejects(execTool(deps2, 'war_message', { task_id: 'c1', to: 'scribe', text: 'x' }, 'child-a'), /childId/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R2 部队→部队无注册表时：入账待投递（delivered false，不丢信）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-mailbox-'))
  try {
    recruit(dir)
    const sub = fakeSubagents()
    const out = await execTool(makeDeps(dir, sub.face, { flags: FLAG_ON }), 'war_message', { task_id: 'c1', to: 'child-b', text: '侧翼有变' }, 'child-a') as { delivered: boolean }
    assert.equal(out.delivered, false)
    assert.equal(sub.followups.length, 0)
    const task = loadCampaign(dir, 'c1')
    assert.equal(task.messages[0]!.delivered, undefined, 'pending：账在信在，投递可重试')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R2 部队→指挥官：入账待阅（无推信通道是诚实限制）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-mailbox-'))
  try {
    recruit(dir)
    const sub = fakeSubagents()
    const out = await execTool(makeDeps(dir, sub.face, { flags: FLAG_ON }), 'war_message', { task_id: 'c1', to: 'commander', text: '报告：侦察完成' }, 'child-a') as { delivered: boolean }
    assert.equal(out.delivered, false)
    assert.equal(loadCampaign(dir, 'c1').messages[0]!.to, 'commander')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R2 war_status 消息可见性随 flag（off 不增字段）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-mailbox-'))
  try {
    recruit(dir)
    appendEvent(dir, { type: 'message_logged', ts: 't9', campaignId: 'c1', messageId: 'm9', from: 'child-a', to: 'commander', text: '报告' })
    const off = await execTool(makeDeps(dir, fakeSubagents().face, { flags: FLAG_OFF }), 'war_status', { task_id: 'c1' }, 'cmd-session-1') as Record<string, unknown>
    assert.equal('messages' in off, false, 'flag off 时 war_status 输出与 v3 同形')
    const on = await execTool(makeDeps(dir, fakeSubagents().face, { flags: FLAG_ON }), 'war_status', { task_id: 'c1' }, 'cmd-session-1') as { messages: unknown[] }
    assert.equal(on.messages.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
