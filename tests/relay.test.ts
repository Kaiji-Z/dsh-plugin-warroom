import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { createCommandFuse, relayPendingCommands, relayPromptFor, type SessionsApiFace } from '../src/relay.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-relay-'))
}

/** Fake apiProxy sessions face recording every call (ids increment per create). */
function fakeSessions(opts: { failPrompts?: boolean } = {}): SessionsApiFace & { created: number; prompts: string[]; renamed: string[] } {
  return {
    created: 0,
    prompts: [],
    renamed: [],
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
