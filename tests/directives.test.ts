import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, dueScheduledDirectives, foldDirectives, loadDirectives, newDirectiveId, pendingDirectives, readDirectiveEvents } from '../src/directives.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-dir-'))
}

test('fold derives the full command lifecycle: created → received → talking → approved', () => {
  const state = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '帮我做个记账小工具' },
    { type: 'directive_received', ts: 't1', directiveId: 'cmd-1', staffSessionId: 'sec-1' },
    { type: 'directive_talking', ts: 't2', directiveId: 'cmd-1' },
    { type: 'directive_approved', ts: 't3', directiveId: 'cmd-1', taskId: '20260823-1000-ab12' },
  ])
  assert.equal(state.length, 1)
  assert.equal(state[0]!.status, 'approved')
  assert.equal(state[0]!.text, '帮我做个记账小工具')
  assert.equal(state[0]!.createdAt, 't0')
  assert.equal(state[0]!.staffSessionId, 'sec-1')
  assert.equal(state[0]!.taskId, '20260823-1000-ab12')
})

test('fold keeps creation order across multiple commands', () => {
  const state = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '一' },
    { type: 'directive_created', ts: 't1', directiveId: 'cmd-2', text: '二' },
    { type: 'directive_cancelled', ts: 't2', directiveId: 'cmd-1', reason: '元首放弃' },
    { type: 'directive_received', ts: 't3', directiveId: 'cmd-2', staffSessionId: 'sec' },
  ])
  assert.deepEqual(state.map(d => d.id), ['cmd-1', 'cmd-2'])
  assert.equal(state[0]!.status, 'cancelled')
  assert.equal(state[0]!.cancelledReason, '元首放弃')
  assert.equal(state[1]!.status, 'received')
})

test('events for unknown ids and after terminal states are ignored', () => {
  // Events for an id that never had directive_created are dropped whole.
  assert.equal(foldDirectives([
    { type: 'directive_received', ts: 't0', directiveId: 'ghost', staffSessionId: 'sec' },
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
    { type: 'directive_received', ts: 't2', directiveId: 'cmd-2', staffSessionId: 'sec' },
    { type: 'directive_created', ts: 't3', directiveId: 'cmd-3', text: '已取消' },
    { type: 'directive_cancelled', ts: 't4', directiveId: 'cmd-3', reason: 'r' },
  ])
  assert.deepEqual(pendingDirectives(directives).map(d => d.id), ['cmd-1'])
})

test('append/read roundtrip survives torn tail lines', () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-x', text: 'ok' })
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: 'cmd-x', staffSessionId: 'sec' })
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

test('术语归一兼容：旧日志的 secretarySessionId 字段 fold 归一为 staffSessionId', () => {
  // V5 前的 append-only 历史用旧字段名——不迁移日志，fold 双读归一。
  const legacy = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'c1', text: 'x' },
    { type: 'directive_session_opened', ts: 't1', directiveId: 'c1', secretarySessionId: 'sec-legacy' },
    { type: 'directive_received', ts: 't2', directiveId: 'c1', secretarySessionId: 'sec-legacy' },
  ] as unknown as Parameters<typeof foldDirectives>[0])
  assert.equal(legacy[0]!.status, 'received')
  assert.equal(legacy[0]!.staffSessionId, 'sec-legacy')
  // 新拼写照常。
  const modern = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'c2', text: 'x' },
    { type: 'directive_received', ts: 't1', directiveId: 'c2', staffSessionId: 'staff-new' },
  ])
  assert.equal(modern[0]!.staffSessionId, 'staff-new')
})

// --- V9.2 定时下达（cron 一次性发令）----------------------------------------
test('定时命令：created 带 cron → schedule 落账；未 dispatched 不进引信工作清单', () => {
  const folded = foldDirectives([
    { type: 'directive_created', ts: '2026-08-25T01:00:00Z', directiveId: 'sc1', text: '明早九点跑一遍回归', cron: '0 9 * * *' },
    { type: 'directive_created', ts: '2026-08-25T01:00:00Z', directiveId: 'sc2', text: '普通命令' },
  ])
  assert.equal(folded[0]!.schedule?.cron, '0 9 * * *')
  assert.equal(folded[0]!.schedule?.dispatchedAt, undefined)
  assert.equal(folded[1]!.schedule, undefined)
  const pending = pendingDirectives(folded)
  assert.deepEqual(pending.map(d => d.id), ['sc2'], '定时未到点的命令引信不可见')
})

test('定时命令：dispatched 幂等且只认一次；发完回归 draft 工作清单', () => {
  const folded = foldDirectives([
    { type: 'directive_created', ts: '2026-08-25T01:00:00Z', directiveId: 'sc1', text: 'x', cron: '0 9 * * *' },
    { type: 'directive_dispatched', ts: '2026-08-25T01:00:10Z', directiveId: 'sc1' },
    { type: 'directive_dispatched', ts: '2026-08-25T01:00:20Z', directiveId: 'sc1' },
    { type: 'directive_dispatched', ts: '2026-08-25T01:00:30Z', directiveId: 'ghost' },
  ])
  assert.equal(folded[0]!.schedule?.dispatchedAt, '2026-08-25T01:00:10Z', '重复 dispatched 以首条为准')
  assert.equal(pendingDirectives(folded).length, 1, '发完的定时命令回到普通 draft 流程')
})

test('dueScheduledDirectives：anchor=创建时刻，nextRun≤now 即到点；发过/不可达永不 due', () => {
  // schedule.ts 走本地墙钟——用本地 Date 构造，测试与跑机器时区无关。
  const anchor = new Date(2026, 7, 25, 8, 0, 0).toISOString()
  const now = new Date(2026, 7, 25, 9, 30, 0).getTime()
  const mk = (id: string, cron: string, dispatched = false): Parameters<typeof foldDirectives>[0][number] => {
    const ev: Array<Parameters<typeof foldDirectives>[0][number]> = [
      { type: 'directive_created', ts: anchor, directiveId: id, text: 'x', cron },
    ]
    if (dispatched) ev.push({ type: 'directive_dispatched', ts: anchor, directiveId: id })
    return foldDirectives(ev)[0]!
  }
  const due = (d: Parameters<typeof foldDirectives>[0][number]): string =>
    dueScheduledDirectives([d], now).join(',')
  // 本地 9:00 的 cron，anchor 本地 8:00 → next 9:00 ≤ 9:30 → 到点。
  assert.equal(due(mk('a', '0 9 * * *')), 'a')
  // 未到点：本地 10:00 才触发。
  assert.equal(due(mk('b', '0 10 * * *')), '')
  // 已发过：永不再 due（一次性）。
  assert.equal(due(mk('c', '0 9 * * *', true)), '')
  // 不可达时刻（2 月 30 日不存在）：nextRun 无解 → 永不 due，不抛错。
  assert.equal(due(mk('d', '0 9 30 2 *')), '')
  // 存储的非法 cron（绕过发布校验的脏数据）：静默跳过。
  assert.equal(due(mk('e', 'not a cron')), '')
})
