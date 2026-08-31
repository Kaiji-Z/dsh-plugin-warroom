/**
 * B1-件⑤ 会话生命周期闭环——孤儿会话落盘跨「重启」复用 / forget GC /
 * in_progress 死会话 rescue（resume 续命 + 连败判死回栏 + quotaPaused 豁免 +
 * 面缺席降级）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createConscriptor } from '../src/index.ts'
import type { SessionsApiFace, WorkspaceApiFace } from '../src/relay.ts'
import { appendEvent, loadCampaign } from '../src/events.ts'
import { rescueNudgeFor } from '../src/prompts.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-lifecycle-'))
}

interface Faces {
  sessions: SessionsApiFace
  workspaces: WorkspaceApiFace
  calls: { sessionCreates: number; prompts: Array<{ sessionId: string; text: string }> }
}

function makeFaces(promptOk: () => boolean): Faces {
  const calls: Faces['calls'] = { sessionCreates: 0, prompts: [] }
  let seq = 0
  const sessions: SessionsApiFace = {
    create: async () => {
      seq += 1
      calls.sessionCreates += 1
      return { result: { ok: true, value: { sessionId: `sess-${seq}` } } }
    },
    rename: async () => ({ result: { ok: true, value: undefined } }),
    prompt: async (req) => {
      calls.prompts.push({ sessionId: req.payload.sessionId, text: req.payload.content[0]!.text })
      return promptOk()
        ? { result: { ok: true, value: undefined } }
        : { result: { ok: false, error: { code: 'BUSY', message: 'busy' } } }
    },
  }
  const workspaces: WorkspaceApiFace = {
    create: async (req) => ({ result: { ok: true, value: { workspace: { workspaceId: `ws-${req.payload.path.length}` } } } }),
    archiveSession: async () => ({ result: { ok: true, value: undefined } }),
  }
  return { sessions, workspaces, calls }
}

interface RigOpts {
  promptOk?: boolean
  resolveAgent?: (id: string) => unknown
  resumeAgent?: (id: string) => Promise<unknown>
}

function makeRig(dir: string, opts: RigOpts = {}): { faces: Faces; commander: ReturnType<typeof createConscriptor> } {
  let promptOk = opts.promptOk ?? true
  const faces = makeFaces(() => promptOk)
  const store = { get: () => ({ version: 2 as const, active: true }), save: () => {} }
  const commander = createConscriptor({
    store: store as never,
    stateDir: dir,
    warRoot: join(dir, 'war'),
    maxUnits: 2,
    maxCommanders: 3,
    maxAttempts: 3,
    subagents: {} as never,
    ...(opts.resolveAgent !== undefined ? { resolveAgent: opts.resolveAgent } : {}),
    ...(opts.resumeAgent !== undefined ? { resumeAgent: opts.resumeAgent } : {}),
  })
  commander.bindRelay(faces.sessions, faces.workspaces)
  return { faces, commander }
}

function seedClaimed(dir: string, id: string, workspacePath: string, claimedBy: string): void {
  appendEvent(dir, { type: 'task_created', ts: '2026-01-01T00:00:00Z', campaignId: id, title: `任务${id}`, brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: '2026-01-01T00:01:00Z', campaignId: id, workspacePath })
  appendEvent(dir, { type: 'task_claimed', ts: '2026-01-01T00:02:00Z', campaignId: id, claimedBy, attemptId: `tok-${id}`, attempt: 1 })
}

const signal = (): AbortSignal => new AbortController().signal

test('件⑤: 孤儿会话落盘——「重启」后新征召器实例复用同一会话', async () => {
  const dir = tmpStateDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'pub', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'pub', workspacePath: join(dir, 'ws1') })
    // 第一代征召器：简报投递失败 → 孤儿落盘。
    const a = makeRig(dir, { promptOk: false })
    const r1 = await a.commander.conscript(loadCampaign(dir, 'pub'), signal())
    assert.equal(r1.spawned, false)
    assert.equal(a.faces.calls.sessionCreates, 1)
    const onDisk = JSON.parse(readFileSync(join(dir, 'orphans.json'), 'utf8')) as Record<string, string>
    assert.equal(onDisk.pub, 'sess-1', '孤儿已落盘')
    // 「重启」：全新实例（内存失忆）从盘上读回孤儿，复用不再新建。
    const b = makeRig(dir, { promptOk: true })
    const r2 = await b.commander.conscript(loadCampaign(dir, 'pub'), signal())
    assert.equal(r2.spawned, true)
    assert.equal(b.faces.calls.sessionCreates, 0, '复用盘上孤儿，零新建')
    assert.equal(b.faces.calls.prompts[0]!.sessionId, 'sess-1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件⑤: forget GC——终态清三表并落盘，再征召走新建', async () => {
  const dir = tmpStateDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'pub', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'pub', workspacePath: join(dir, 'ws1') })
    const rig = makeRig(dir, { promptOk: false })
    await rig.commander.conscript(loadCampaign(dir, 'pub'), signal())
    rig.commander.forget('pub')
    const onDisk = JSON.parse(readFileSync(join(dir, 'orphans.json'), 'utf8')) as Record<string, string>
    assert.equal(onDisk.pub, undefined, 'GC 后盘上无孤儿')
    // forget 后再征召（prompt 已恢复）：走新建会话而非复用。
    const b = makeRig(dir, { promptOk: true })
    const r = await b.commander.conscript(loadCampaign(dir, 'pub'), signal())
    assert.equal(r.spawned, true)
    assert.equal(b.faces.calls.sessionCreates, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件⑤: 死会话 rescue——resume 续命 + 续行提示入队，不动任务状态', async () => {
  const dir = tmpStateDir()
  try {
    seedClaimed(dir, 't1', '/ws/a', 'sess-9')
    const resumed: string[] = []
    const rig = makeRig(dir, {
      resolveAgent: () => undefined, // 无活体
      resumeAgent: async id => { resumed.push(id); return {} },
    })
    await rig.commander.patrolNow()
    assert.deepEqual(resumed, ['sess-9'], '对搁浅会话 resume 续命')
    const nudge = rig.faces.calls.prompts.find(p => p.sessionId === 'sess-9' && p.text === rescueNudgeFor('t1'))
    assert.ok(nudge !== undefined, '续行提示已入队')
    assert.equal(loadCampaign(dir, 't1').status, 'in_progress', '续命不换状态不烧 attempt')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件⑤: 活体会话与 quotaPaused 任务豁免 rescue', async () => {
  const dir = tmpStateDir()
  try {
    seedClaimed(dir, 'alive', '/ws/a', 'sess-a')
    seedClaimed(dir, 'paused', '/ws/b', 'sess-b')
    appendEvent(dir, { type: 'task_paused_quota', ts: 't3', campaignId: 'paused' })
    const resumed: string[] = []
    const rig = makeRig(dir, {
      resolveAgent: id => (id === 'sess-a' ? { live: true } : undefined),
      resumeAgent: async id => { resumed.push(id); return {} },
    })
    await rig.commander.patrolNow()
    assert.deepEqual(resumed, [], '活体不救、配额暂停不救')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件⑤: resume 连败 2 次判死回栏（烧 attempt）；单败只记拒因', async () => {
  const dir = tmpStateDir()
  try {
    seedClaimed(dir, 'dead', '/ws/a', 'sess-d')
    const rig = makeRig(dir, {
      resolveAgent: () => undefined,
      resumeAgent: async () => { throw new Error('no persisted session') },
    })
    await rig.commander.patrolNow()
    assert.equal(loadCampaign(dir, 'dead').status, 'in_progress', '首败不回栏（防瞬时打嗝烧 attempt）')
    assert.ok(rig.commander.snapshot().skips.dead !== undefined, '拒因已记（trace 可见）')
    await rig.commander.patrolNow()
    const after = loadCampaign(dir, 'dead')
    assert.equal(after.status, 'published', '连败第 2 次判死回栏重征')
    assert.ok((after.lastError ?? '').includes('失联'), after.lastError)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件⑤: resume 面缺席——只记拒因留置，绝不回栏', async () => {
  const dir = tmpStateDir()
  try {
    seedClaimed(dir, 'cold', '/ws/a', 'sess-c')
    const rig = makeRig(dir, { resolveAgent: () => undefined }) // 无 resumeAgent
    await rig.commander.patrolNow()
    await rig.commander.patrolNow()
    const after = loadCampaign(dir, 'cold')
    assert.equal(after.status, 'in_progress', '面缺席无法判死，留置等会话重开')
    assert.ok(rig.commander.snapshot().skips.cold !== undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件⑤: 判死回栏后 forget 清 rescue 拒因——GC 覆盖 rescue 表', async () => {
  const dir = tmpStateDir()
  try {
    seedClaimed(dir, 't2', '/ws/a', 'sess-e')
    const rig = makeRig(dir, { resolveAgent: () => undefined, resumeAgent: async () => { throw new Error('boom') } })
    await rig.commander.patrolNow()
    await rig.commander.patrolNow()
    assert.equal(loadCampaign(dir, 't2').status, 'published')
    rig.commander.forget('t2')
    assert.equal(rig.commander.snapshot().skips.t2, undefined, '终态 GC 清拒因')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
