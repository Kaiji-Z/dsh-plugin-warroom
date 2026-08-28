import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, chainHueSlot, deriveContinuation, dueScheduledDirectives, foldChains, foldDirectives, loadDirectives, newDirectiveId, pendingDirectives, readDirectiveEvents } from '../src/directives.ts'

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
    { type: 'directive_cancelled', ts: 't2', directiveId: 'cmd-1', reason: '舰长放弃' },
    { type: 'directive_received', ts: 't3', directiveId: 'cmd-2', staffSessionId: 'sec' },
  ])
  assert.deepEqual(state.map(d => d.id), ['cmd-1', 'cmd-2'])
  assert.equal(state[0]!.status, 'cancelled')
  assert.equal(state[0]!.cancelledReason, '舰长放弃')
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

// --- V10 战线续接（continuesFrom 嫁接 + foldChains 祖先闭包）------------------

test('V10 嫁接：created 带续接字段落账到 Directive；不带=初代；账序无关（子先父后也能折）', () => {
  const childFirst = foldDirectives([
    { type: 'directive_created', ts: 't1', directiveId: 'cmd-2', text: '续作', continuesFrom: 'cmd-1', continuationMode: 'deepen' },
    { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '初代' },
  ])
  assert.equal(childFirst[0]!.id, 'cmd-2', 'fold 保持输入序')
  assert.equal(childFirst[0]!.continuesFrom, 'cmd-1')
  assert.deepEqual(childFirst[0]!.continuation, { mode: 'deepen', parentId: 'cmd-1' })
  assert.equal(childFirst[1]!.id, 'cmd-1')
  assert.equal(childFirst[1]!.continuesFrom, undefined, '初代命令零迁移兼容')
  assert.equal(childFirst[1]!.continuation, undefined)
})

test('V10 foldChains：三代链 root/代际/链长全对；成员按代序；同根链色槽位稳定', () => {
  const dirs = foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'c1', text: 'Ⅰ' },
    { type: 'directive_created', ts: 't1', directiveId: 'c2', text: 'Ⅱ', continuesFrom: 'c1', continuationMode: 'retry' },
    { type: 'directive_created', ts: 't2', directiveId: 'c3', text: 'Ⅲ', continuesFrom: 'c2', continuationMode: 'deepen' },
  ])
  const chains = foldChains(dirs)
  assert.equal(chains.generationOf.get('c1'), 1)
  assert.equal(chains.generationOf.get('c2'), 2)
  assert.equal(chains.generationOf.get('c3'), 3)
  for (const id of ['c1', 'c2', 'c3']) assert.equal(chains.rootByCommand.get(id), 'c1')
  assert.deepEqual([...(chains.membersOfRoot.get('c1') ?? [])], ['c1', 'c2', 'c3'])
  assert.equal(chainHueSlot('c1'), chainHueSlot('c1'), '同根同槽')
  assert.ok(chainHueSlot('c1') < 8 && chainHueSlot('c9-nope') < 8, '槽位落在槽位数域内')
})

test('V10 foldChains 防御：悬挂指针按段根投影；手改环不抛错、各自成段；深度护栏不爆栈', () => {
  // 悬挂：父号不存在——c2 自成一段根。
  const dangling = foldChains(foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'c2', text: '孤儿', continuesFrom: 'ghost-parent' },
  ]))
  assert.deepEqual({ root: dangling.rootByCommand.get('c2'), gen: dangling.generationOf.get('c2') }, { root: 'c2', gen: 1 })
  // 手改环：a←b←a——稳定返回，不抛错不死循环。
  const cyclic = foldChains(foldDirectives([
    { type: 'directive_created', ts: 't0', directiveId: 'ca', text: 'x', continuesFrom: 'cb' },
    { type: 'directive_created', ts: 't1', directiveId: 'cb', text: 'y', continuesFrom: 'ca' },
  ]))
  assert.equal(cyclic.generationOf.size, 2)
  for (const d of cyclic.generationOf.values()) assert.equal(d, 1, '环上各点自封段根')
  // 超深护栏：40 节点直链折完不炸，且尾部节点不受祖先链污染。
  const long = Array.from({ length: 40 }, (_, i) =>
    ({ type: 'directive_created', ts: `t${i}`, directiveId: `n${i}`, text: 'x',
       ...(i > 0 ? { continuesFrom: `n${i - 1}` } : {}) }) as Parameters<typeof foldDirectives>[0][number])
  const deepFold = foldChains(foldDirectives(long))
  assert.equal(deepFold.generationOf.size, 40)
})

test('V10 deriveContinuation：大副未成形拒绝；败仗 retry；成功/closed deepen；活体 pivot；排队无火可转', () => {
  const say = (r: ReturnType<typeof deriveContinuation>): string => ('error' in r ? r.error : r.mode)
  assert.match(say(deriveContinuation({ status: 'cancelled' }, undefined)), /取消/)
  assert.match(say(deriveContinuation({ status: 'talking' }, undefined)), /大副对话/)
  assert.match(say(deriveContinuation({ status: 'approved' }, undefined)), /尚未发布成形/)
  // 败仗：lastOutcome failed 或任务 failed 都判 retry。
  assert.equal(say(deriveContinuation({ status: 'approved', taskId: 't1' }, { status: 'failed', lastOutcome: 'failed' })), 'retry')
  assert.equal(say(deriveContinuation({ status: 'approved', taskId: 't1' }, { status: 'in_progress', lastOutcome: 'failed' })), 'retry')
  // 成功仗与已收官都深化；reported（待验收交稿）也按深化接续。
  assert.equal(say(deriveContinuation({ status: 'approved', taskId: 't1' }, { status: 'closed', lastOutcome: 'succeeded' })), 'deepen')
  assert.equal(say(deriveContinuation({ status: 'approved', taskId: 't1' }, { status: 'reported', lastOutcome: 'reported' })), 'deepen')
  // 进行中且有活体 attempt → pivot 携目标执行会话。
  const pivot = deriveContinuation({ status: 'approved', taskId: 't1' }, { status: 'in_progress', liveAttemptSessionId: 'ses-live' })
  assert.deepEqual(pivot, { mode: 'pivot', targetSessionId: 'ses-live' })
  // published 排队中无执行会话 → 明确拒绝。
  assert.match(say(deriveContinuation({ status: 'approved', taskId: 't1' }, { status: 'published' })), /排队/)
})
