/**
 * B1-件④ 征召器装配层（createConscriptor）——满编门 / spawn-once 守卫 /
 * 孤儿会话复用 / 工作区占用排队 / patrolNow 补征 / relayTo 降级 / snapshot 视角。
 * 假 relay/workspace faces 录调用；战役账本走真实事件流。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createConscriptor } from '../src/index.ts'
import type { SessionsApiFace, WorkspaceApiFace } from '../src/relay.ts'
import { appendEvent, loadCampaign } from '../src/events.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-conscriptor-'))
}

type Faces = {
  sessions: SessionsApiFace
  workspaces: WorkspaceApiFace
  calls: {
    sessionCreates: number
    workspaceCreates: string[]
    prompts: Array<{ sessionId: string; text: string }>
    renames: number
  }
}

function makeFaces(promptOk: () => boolean): Faces {
  const calls: Faces['calls'] = { sessionCreates: 0, workspaceCreates: [], prompts: [], renames: 0 }
  let seq = 0
  const sessions: SessionsApiFace = {
    create: async () => {
      seq += 1
      calls.sessionCreates += 1
      return { result: { ok: true, value: { sessionId: `sess-${seq}` } } }
    },
    rename: async () => {
      calls.renames += 1
      return { result: { ok: true, value: undefined } }
    },
    prompt: async (req) => {
      calls.prompts.push({ sessionId: req.payload.sessionId, text: req.payload.content[0]!.text })
      return promptOk()
        ? { result: { ok: true, value: undefined } }
        : { result: { ok: false, error: { code: 'BUSY', message: 'busy' } } }
    },
  }
  const workspaces: WorkspaceApiFace = {
    create: async (req) => {
      calls.workspaceCreates.push(req.payload.path)
      return { result: { ok: true, value: { workspace: { workspaceId: `ws-${calls.workspaceCreates.length}` } } } }
    },
    archiveSession: async () => ({ result: { ok: true, value: undefined } }),
  }
  return { sessions, workspaces, calls }
}

interface Rig {
  dir: string
  faces: Faces
  commander: ReturnType<typeof createConscriptor>
  setPromptOk(ok: boolean): void
}

function makeRig(opts: { maxCommanders?: number; promptOk?: boolean } = {}): Rig {
  const dir = tmpStateDir()
  let promptOk = opts.promptOk ?? true
  const faces = makeFaces(() => promptOk)
  const store = { get: () => ({ version: 2 as const, active: true }), save: () => {} }
  const commander = createConscriptor({
    store: store as never,
    stateDir: dir,
    warRoot: join(dir, 'war'),
    maxUnits: 2,
    maxCommanders: opts.maxCommanders ?? 3,
    subagents: {} as never,
  })
  commander.bindRelay(faces.sessions, faces.workspaces)
  return { dir, faces, commander, setPromptOk: ok => { promptOk = ok } }
}

function seedPublished(dir: string, id: string, workspacePath: string, priority: 'normal' | 'high' = 'normal'): void {
  appendEvent(dir, { type: 'task_created', ts: '2026-01-01T00:00:00Z', campaignId: id, title: `任务${id}`, brief: 'b', acceptance: 'a；b', priority })
  appendEvent(dir, { type: 'task_published', ts: '2026-01-01T00:01:00Z', campaignId: id, workspacePath })
}

function seedClaimed(dir: string, id: string, workspacePath: string, claimedBy: string): void {
  seedPublished(dir, id, workspacePath)
  appendEvent(dir, { type: 'task_claimed', ts: '2026-01-01T00:02:00Z', campaignId: id, claimedBy, attemptId: `tok-${id}`, attempt: 1 })
}

const signal = (): AbortSignal => new AbortController().signal

test('件④: 满编门——在役满编时拒征并给拒因', async () => {
  const rig = makeRig({ maxCommanders: 1 })
  try {
    seedClaimed(rig.dir, 'busy', '/ws/shared', 'sess-0')
    seedPublished(rig.dir, 'pub', '/ws/other')
    const r = await rig.commander.conscript(loadCampaign(rig.dir, 'pub'), signal())
    assert.equal(r.spawned, false)
    assert.ok('reason' in r && r.reason.includes('满编'), r.reason)
    assert.equal(rig.faces.calls.sessionCreates, 0, '满编直接拒，不开会话')
  } finally {
    rmSync(rig.dir, { recursive: true, force: true })
  }
})

test('件④: 成功征召 → spawn-once 守卫拦第二次 + snapshot 透出', async () => {
  const rig = makeRig()
  try {
    seedPublished(rig.dir, 'pub', join(rig.dir, 'ws1'))
    const r = await rig.commander.conscript(loadCampaign(rig.dir, 'pub'), signal())
    assert.equal(r.spawned, true)
    assert.ok('childId' in r && r.childId.startsWith('sess-'))
    assert.equal(rig.faces.calls.sessionCreates, 1)
    // 简报真投出去了：文本带任务号与领取纪律。
    assert.ok(rig.faces.calls.prompts[0]!.text.includes('pub'))
    assert.ok(rig.faces.calls.prompts[0]!.text.includes('war_claim'))
    // 第二次征召同一任务：守卫拦截。
    const again = await rig.commander.conscript(loadCampaign(rig.dir, 'pub'), signal())
    assert.equal(again.spawned, false)
    assert.ok('reason' in again && again.reason.includes('待命外勤小队'), again.reason)
    assert.equal(rig.faces.calls.sessionCreates, 1, '守卫期不再开会话')
    assert.ok(rig.commander.snapshot().spawned.includes('pub'))
  } finally {
    rmSync(rig.dir, { recursive: true, force: true })
  }
})

test('件④: 孤儿会话复用——简报投递失败后重投同一会话，不再另建', async () => {
  const rig = makeRig({ promptOk: false })
  try {
    seedPublished(rig.dir, 'pub', join(rig.dir, 'ws1'))
    const first = await rig.commander.conscript(loadCampaign(rig.dir, 'pub'), signal())
    assert.equal(first.spawned, false)
    assert.ok('reason' in first && first.reason.includes('留待复用'), first.reason)
    assert.equal(rig.faces.calls.sessionCreates, 1)
    assert.equal(rig.faces.calls.prompts.length, 1)
    // 下一轮：复用孤儿会话重投（create 不再被调），成功后孤儿出账。
    rig.setPromptOk(true)
    const second = await rig.commander.conscript(loadCampaign(rig.dir, 'pub'), signal())
    assert.equal(second.spawned, true)
    assert.equal(rig.faces.calls.sessionCreates, 1, '复用孤儿会话，不再新建')
    assert.equal(rig.faces.calls.prompts.length, 2)
    assert.equal(rig.faces.calls.prompts[1]!.sessionId, rig.faces.calls.prompts[0]!.sessionId)
    assert.ok(rig.commander.snapshot().spawned.includes('pub'))
  } finally {
    rmSync(rig.dir, { recursive: true, force: true })
  }
})

test('件④: 工作区占用排队——同工作区 in_progress 在役时拒征', async () => {
  const rig = makeRig()
  try {
    seedClaimed(rig.dir, 'busy', '/ws/shared', 'sess-0')
    seedPublished(rig.dir, 'pub', '/ws/shared')
    const r = await rig.commander.conscript(loadCampaign(rig.dir, 'pub'), signal())
    assert.equal(r.spawned, false)
    assert.ok('reason' in r && r.reason.includes('占用'), r.reason)
    assert.equal(rig.faces.calls.sessionCreates, 0)
    assert.ok(rig.commander.snapshot().skips['pub'] !== undefined, '拒因表透出（trace 可见）')
  } finally {
    rmSync(rig.dir, { recursive: true, force: true })
  }
})

test('件④: patrolNow 补征 stranded published 任务', async () => {
  const rig = makeRig()
  try {
    seedPublished(rig.dir, 'pub1', join(rig.dir, 'ws1'))
    seedPublished(rig.dir, 'pub2', join(rig.dir, 'ws2'))
    await rig.commander.patrolNow()
    assert.equal(rig.faces.calls.sessionCreates, 2, '两个空闲工作区各征召一名')
    // 再巡检：spawn-once 守卫下 no-op。
    await rig.commander.patrolNow()
    assert.equal(rig.faces.calls.sessionCreates, 2)
  } finally {
    rmSync(rig.dir, { recursive: true, force: true })
  }
})

test('件④: relayTo——投递失败（面抛错）降级 false 不上抛', async () => {
  const rig = makeRig()
  try {
    assert.equal(await rig.commander.relayTo('sess-x', 'hi'), true)
    const throwing = { ...rig.faces.sessions, prompt: () => { throw new Error('rpc dead') } } as SessionsApiFace
    const store = { get: () => ({ version: 2 as const, active: true }), save: () => {} }
    const c2 = createConscriptor({ store: store as never, stateDir: rig.dir, warRoot: join(rig.dir, 'war'), maxUnits: 2, maxCommanders: 3, subagents: {} as never })
    c2.bindRelay(throwing, rig.faces.workspaces)
    assert.equal(await c2.relayTo('sess-x', 'hi'), false)
  } finally {
    rmSync(rig.dir, { recursive: true, force: true })
  }
})
