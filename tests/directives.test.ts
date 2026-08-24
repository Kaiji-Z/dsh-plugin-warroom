import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, foldDirectives, loadDirectives, newDirectiveId, pendingDirectives, readDirectiveEvents } from '../src/directives.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-dir-'))
}

test('fold derives the full command lifecycle: created → received → talking → approved', () => {
  const state = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '帮我做个记账小工具' },
    { type: 'directive_received', ts: 't1', directiveId: 'cmd-1', secretarySessionId: 'sec-1' },
    { type: 'directive_talking', ts: 't2', directiveId: 'cmd-1' },
    { type: 'directive_approved', ts: 't3', directiveId: 'cmd-1', taskId: '20260823-1000-ab12' },
  ])
  assert.equal(state.length, 1)
  assert.equal(state[0]!.status, 'approved')
  assert.equal(state[0]!.text, '帮我做个记账小工具')
  assert.equal(state[0]!.createdAt, 't0')
  assert.equal(state[0]!.secretarySessionId, 'sec-1')
  assert.equal(state[0]!.taskId, '20260823-1000-ab12')
})

test('fold keeps creation order across multiple commands', () => {
  const state = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '一' },
    { type: 'directive_created', ts: 't1', directiveId: 'cmd-2', text: '二' },
    { type: 'directive_cancelled', ts: 't2', directiveId: 'cmd-1', reason: '元首放弃' },
    { type: 'directive_received', ts: 't3', directiveId: 'cmd-2', secretarySessionId: 'sec' },
  ])
  assert.deepEqual(state.map(d => d.id), ['cmd-1', 'cmd-2'])
  assert.equal(state[0]!.status, 'cancelled')
  assert.equal(state[0]!.cancelledReason, '元首放弃')
  assert.equal(state[1]!.status, 'received')
})

test('events for unknown ids and after terminal states are ignored', () => {
  // Events for an id that never had directive_created are dropped whole.
  assert.equal(foldDirectives([
    { type: 'directive_received', ts: 't0', directiveId: 'ghost', secretarySessionId: 'sec' },
    { type: 'directive_approved', ts: 't1', directiveId: 'ghost', taskId: 'task-9' },
  ]).length, 0)
  // Terminal guard: an approved command cannot be re-cancelled nor re-approved;
  // a stray directive_created after the fact cannot resurrect it either.
  const after = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: 'x' },
    { type: 'directive_approved', ts: 't1', directiveId: 'cmd-1', taskId: 'task-9' },
    { type: 'directive_cancelled', ts: 't2', directiveId: 'cmd-1', reason: '迟到的原因' },
    { type: 'directive_approved', ts: 't3', directiveId: 'cmd-1', taskId: 'task-10' },
    { type: 'directive_created', ts: 't4', directiveId: 'cmd-1', text: '复活' },
  ])
  assert.equal(after[0]!.status, 'approved')
  assert.equal(after[0]!.taskId, 'task-9')
})

test('pendingDirectives is the command fuse worklist (drafts only)', () => {
  const directives = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '待接' },
    { type: 'directive_created', ts: 't1', directiveId: 'cmd-2', text: '已接' },
    { type: 'directive_received', ts: 't2', directiveId: 'cmd-2', secretarySessionId: 'sec' },
    { type: 'directive_created', ts: 't3', directiveId: 'cmd-3', text: '已取消' },
    { type: 'directive_cancelled', ts: 't4', directiveId: 'cmd-3', reason: 'r' },
  ])
  assert.deepEqual(pendingDirectives(directives).map(d => d.id), ['cmd-1'])
})

test('append/read roundtrip survives torn tail lines', () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-x', text: 'ok' })
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: 'cmd-x', secretarySessionId: 'sec' })
    writeFileSync(join(dir, 'directives.jsonl'), '{"type":"directive_rece', { flag: 'a' })
    const events = readDirectiveEvents(dir)
    assert.equal(events.length, 2)
    assert.equal(loadDirectives(dir)[0]!.status, 'received')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('newDirectiveId is cmd- prefixed and unique-ish', () => {
  const a = newDirectiveId(new Date('2026-08-23T10:00:00Z'))
  assert.ok(a.startsWith('cmd-20260823-'))
  const b = newDirectiveId(new Date('2026-08-23T10:00:00Z'))
  assert.notEqual(a, b)
})
