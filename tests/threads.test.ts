import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendThreadEvent, foldThreads, loadAttachedThreads, type ThreadEvent } from '../src/threads.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-threads-'))
}

test('v3 挂载: fold registers attach, removes detach, re-attach refreshes note', () => {
  const events: ThreadEvent[] = [
    { type: 'thread_attached', ts: 't0', sessionId: 'sess-a', note: '竞品调研' },
    { type: 'thread_attached', ts: 't1', sessionId: 'sess-b', note: '' },
  ]
  let folded = foldThreads(events)
  assert.deepEqual(folded.map(t => t.sessionId), ['sess-a', 'sess-b'])
  assert.equal(folded[0]!.note, '竞品调研')
  assert.equal(folded[0]!.attachedAt, 't0')

  folded = foldThreads([...events, { type: 'thread_detached', ts: 't2', sessionId: 'sess-a' }])
  assert.deepEqual(folded.map(t => t.sessionId), ['sess-b'])

  folded = foldThreads([
    ...events,
    { type: 'thread_detached', ts: 't2', sessionId: 'sess-a' },
    { type: 'thread_attached', ts: 't3', sessionId: 'sess-a', note: '重新挂载，换了备注' },
  ])
  assert.equal(folded.length, 2)
  assert.equal(folded.find(t => t.sessionId === 'sess-a')!.note, '重新挂载，换了备注')
  assert.equal(folded.find(t => t.sessionId === 'sess-a')!.attachedAt, 't3')

  // Detach of an unknown session is a no-op.
  assert.equal(foldThreads([{ type: 'thread_detached', ts: 't9', sessionId: 'ghost' }]).length, 0)
})

test('v3 挂载: append + load round-trips through threads.jsonl', () => {
  const dir = tmpStateDir()
  try {
    assert.deepEqual(loadAttachedThreads(dir), [])
    appendThreadEvent(dir, { type: 'thread_attached', ts: 't0', sessionId: 'sess-x', note: '外部会话' })
    appendThreadEvent(dir, { type: 'thread_attached', ts: 't1', sessionId: 'sess-y', note: '另一个' })
    appendThreadEvent(dir, { type: 'thread_detached', ts: 't2', sessionId: 'sess-x' })
    const loaded = loadAttachedThreads(dir)
    assert.deepEqual(loaded.map(t => t.sessionId), ['sess-y'])
    assert.equal(loaded[0]!.note, '另一个')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
