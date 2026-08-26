import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { chainDigest, chainOutcomeOf, createCommandFuse, pivotPromptFor, relayPendingCommands, relayPromptFor, type SessionsApiFace } from '../src/relay.ts'
import { appendEvent } from '../src/events.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-relay-'))
}

/** Fake apiProxy sessions face recording every call (ids increment per create;
 * V10 targets 记录每个 prompt 打进的会话号——pivot 断言要用）。 */
function fakeSessions(opts: { failPrompts?: boolean } = {}): SessionsApiFace & { created: number; prompts: string[]; renamed: string[]; targets: string[] } {
  return {
    created: 0,
    prompts: [],
    renamed: [],
    targets: [],
    async create() {
      this.created += 1
      return { result: { ok: true, value: { sessionId: `sec-${this.created}` } } }
    },
    async rename(_req) {
      this.renamed.push(_req.payload.title)
      return { result: { ok: true, value: {} } }
    },
    async prompt(req) {
      if (opts.failPrompts === true) return { result: { ok: false, error: { code: 'agent-busy', message: 'busy' } } }
      this.targets.push(req.payload.sessionId)
      this.prompts.push(req.payload.content.map(c => c.text).join('\n'))
      return { result: { ok: true, value: { accepted: true } } }
    },
  }
}

function fakeStore(active = false) {
  const state = { version: 2 as const, active, hqSessionId: undefined as string | undefined }
  return { get: () => state, save: () => {} }
}

test('relayPromptFor carries the command id, text, and drafting instructions', () => {
  const text = relayPromptFor({ id: 'cmd-1', text: '帮我做个记账小工具', createdAt: 't0', status: 'draft' })
  assert.ok(text.includes('cmd-1'))
  assert.ok(text.includes('帮我做个记账小工具'))
  assert.ok(text.includes('commandId=cmd-1'))
  assert.ok(text.includes('warroom-bounty-drafting'))
  assert.ok(text.includes('war_abandon_command'))
})

test('v3 每命令一会话: two draft commands get two distinct staff sessions', async () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '一命令' })
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't1', directiveId: 'cmd-2', text: '二命令' })
    const sessions = fakeSessions()
    const store = fakeStore(false)
    const result = await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => { store.get().active = true } }, sessions)
    // Per-command sessions: two creates, two 参谋· renames, two prompts.
    assert.equal(sessions.created, 2)
    assert.equal(sessions.renamed.length, 2)
    assert.ok(sessions.renamed[0]!.startsWith('参谋·'))
    assert.ok(sessions.renamed[1]!.startsWith('参谋·'))
    // Inactive war room: activation is code-side (store flip via activate()),
    // the queue carries only relay texts — never a '/war' string.
    assert.equal(store.get().active, true)
    assert.deepEqual(sessions.prompts.map(p => p.split('\n')[0]), ['【命令区】新命令 cmd-1', '【命令区】新命令 cmd-2'])
    assert.equal(result.relayed, 2)
    const directives = loadDirectives(dir)
    assert.deepEqual(directives.map(d => d.status), ['received', 'received'])
    assert.equal(directives[0]!.staffSessionId, 'sec-1')
    assert.equal(directives[1]!.staffSessionId, 'sec-2')
    // Legacy fallback: the FIRST per-command session becomes hqSessionId.
    assert.equal(store.get().hqSessionId, 'sec-1')
    // Second pass: nothing pending → no new prompts, no session churn.
    const again = await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => { store.get().active = true } }, sessions)
    assert.equal(again.relayed, 0)
    assert.equal(sessions.created, 2)
    assert.equal(sessions.prompts.length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('relayPendingCommands: a prompt-failed command stays draft and reuses its session on retry', async () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '一命令' })
    const failing = fakeSessions({ failPrompts: true })
    const store = fakeStore(true)
    const first = await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => {} }, failing)
    assert.equal(first.relayed, 0)
    assert.equal(failing.created, 1) // session opened and recorded…
    assert.equal(loadDirectives(dir)[0]!.status, 'draft') // …but the command stays draft
    // Retry with prompts working: the SAME session is reused (no second create).
    const working = fakeSessions()
    await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => {} }, working)
    assert.equal(working.created, 0)
    assert.equal(loadDirectives(dir)[0]!.status, 'received')
    assert.equal(loadDirectives(dir)[0]!.staffSessionId, 'sec-1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('command fuse: tickNow relays and stop halts the interval', async () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: 'x' })
    const sessions = fakeSessions()
    const store = fakeStore(true)
    store.get().hqSessionId = 'sec-legacy'
    const fuse = createCommandFuse({ store, stateDir: dir, warRoot: '/war', activate: () => {} })
    fuse.bind(sessions)
    fuse.start()
    await fuse.tickNow()
    assert.equal(loadDirectives(dir)[0]!.status, 'received')
    fuse.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// --- V10 战线续接：pivot 直插分路 / 常轨兜底带战线档案 ------------------------

const isoAt = (m: number): string => new Date(Date.UTC(2026, 7, 26, 8, m)).toISOString()

/** 父命令已批准挂 T-9（标记 received 防引信二次处理），子命令按指定模式续接。 */
function seedChain(dir: string, mode: 'deepen' | 'retry' | 'pivot'): void {
  appendEvent(dir, { type: 'task_created', ts: isoAt(0), campaignId: 'T-9', title: '初代仗', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: isoAt(1), campaignId: 'T-9', workspacePath: '/ws/A' })
  appendDirectiveEvent(dir, { type: 'directive_created', ts: isoAt(0), directiveId: 'cmd-1', text: '初代命令原文' })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: isoAt(1), directiveId: 'cmd-1', staffSessionId: 'sec-past' })
  appendDirectiveEvent(dir, { type: 'directive_approved', ts: isoAt(3), directiveId: 'cmd-1', taskId: 'T-9' })
  appendDirectiveEvent(dir, { type: 'directive_created', ts: isoAt(4), directiveId: 'cmd-2', text: '续战令文本', continuesFrom: 'cmd-1', continuationMode: mode })
}

test('V10 pivot 分路：指令直插活体执行会话队列，一穿五态挂父任务；不开新参谋会话', async () => {
  const dir = tmpStateDir()
  try {
    // 活体 attempt：claimedBy 即执行会话号（endedAt 空 = 作战中）。
    appendEvent(dir, { type: 'task_claimed', ts: isoAt(2), campaignId: 'T-9', claimedBy: 'cmd-live-1' })
    seedChain(dir, 'pivot')
    const sessions = fakeSessions()
    const store = fakeStore(true)
    const r = await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => {} }, sessions)
    assert.equal(r.relayed, 1)
    assert.equal(sessions.created, 0, 'pivot 不开新参谋会话')
    assert.deepEqual(sessions.targets, ['cmd-live-1'], '插进的是父任务的执行会话')
    assert.ok(sessions.prompts[0]!.includes('【续战令·转向】'), '转达文本署名续战令')
    assert.ok(sessions.prompts[0]!.includes('续战令文本'))
    assert.ok(sessions.prompts[0]!.includes('本回合结束后送达'), '明示排队送达预期')
    const child = loadDirectives(dir).find(d => d.id === 'cmd-2')!
    assert.equal(child.status, 'approved', '一穿五态即刻终态归档')
    assert.equal(child.taskId, 'T-9', '挂到父任务号——命令卡天然跳任务链')
    assert.equal(child.staffSessionId, 'cmd-live-1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V10 pivot 兜底：无活体 attempt 落回常轨走参谋，且战线档案随令注入', async () => {
  const dir = tmpStateDir()
  try {
    // 父任务已发布但无人领令——无执行会话可插。
    seedChain(dir, 'pivot')
    const sessions = fakeSessions()
    const store = fakeStore(true)
    await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => {} }, sessions)
    assert.equal(sessions.created, 1, '落回常轨开参谋会话')
    assert.ok(sessions.targets[0]!.startsWith('sec-'))
    const text = sessions.prompts.find(p => p.includes('【命令区】新命令 cmd-2'))!
    assert.ok(text.includes('【战线档案 · Ⅱ 代续战令】'), '兜底档案随令')
    assert.ok(text.includes('已发布，待指挥官领令'), '档案含父代战况')
    assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-2')!.status, 'received')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V10 retry 档案：败仗续战令把父代败因注入征召词（防重蹈覆辙）', async () => {
  const dir = tmpStateDir()
  try {
    // 败仗发生在发布之后（fold 有序：先有账才有败）。
    seedChain(dir, 'retry')
    appendEvent(dir, { type: 'task_failed', ts: isoAt(3), campaignId: 'T-9', reason: '回归测试三连红，冒烟无从下手' })
    const sessions = fakeSessions()
    const store = fakeStore(true)
    await relayPendingCommands({ store, stateDir: dir, warRoot: '/war', activate: () => {} }, sessions)
    const text = sessions.prompts.find(p => p.includes('【命令区】新命令 cmd-2'))!
    assert.ok(text.includes('【战线档案'), '档案出现')
    assert.ok(text.includes('Ⅰ 代「初代命令原文」'), '父代条目在案（罗马代际）')
    assert.ok(text.includes('败退——败因：回归测试三连红'), '败因明文注入')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V10 纯函数：chainDigest/chainOutcomeOf/pivotPromptFor 的格式契约', () => {
  assert.equal(chainOutcomeOf(undefined), '未成形（尚未发布成任务）')
  assert.equal(chainOutcomeOf({ status: 'closed', closedVerdict: '八步全绿收官' }), '已收官：八步全绿收官')
  assert.equal(chainOutcomeOf({ status: 'failed', lastError: '配额熔断' }), '败退——败因：配额熔断')
  const digest = chainDigest([
    { generation: 1, text: '一', outcome: '已收官：通过' },
    { generation: 2, text: '', outcome: undefined },
  ])
  assert.ok(digest.includes('Ⅰ 代「一」→ 已收官：通过'))
  assert.ok(digest.includes('战况不详'), '缺账本行给兜底话术而非空白')
  const pv = pivotPromptFor('初代命令原文超长会被截断的标题文本', 'cmd-9', '改用 plan B')
  assert.ok(pv.includes('cmd-9') && pv.includes('plan B'))
  assert.ok(pv.includes('初代命令原文超长会被截断') && pv.includes('…'), '长父题截断入文')
})
