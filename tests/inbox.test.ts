import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agingLeader, agingTone, collectInbox, formatWait, inboxGrowthAnnounce, INBOX_ERR_MS, INBOX_WARN_MS, type InboxItem } from '../src/client/inbox.ts'
import type { BoardCommand, BoardTask } from '../src/client/data.ts'

/** V7-① 等你发落收件箱——纯聚合层（不引 react/node 专属 API），node 直测。
 * 红线相伴：本模块只算导航数据，板上不长任务写操作。 */

const NOW = Date.parse('2026-08-25T12:00:00Z')

function cmd(partial: Partial<BoardCommand>): BoardCommand {
  return {
    commandId: 'c1', text: '做记账小工具', createdAt: '2026-08-25T11:00:00Z', status: 'approved',
    staffSessionId: 's1', taskId: null, cancelledReason: null,
    grade: null, gradeReason: null, gradeConfidence: null, regrades: 0, plan: null,
    ...partial,
  }
}

function task(partial: Partial<BoardTask>): BoardTask {
  return {
    taskId: 'T-1', title: '记账工具', status: 'closed', priority: 'normal', quality: 'common',
    rounds: 1, attempts: 1, deps: [], lastError: null, workspacePath: null, claimedBy: null,
    startedAt: '2026-08-25T10:00:00Z', brief: '', acceptance: '', schedule: null,
    attemptLog: [{ id: 'a1', n: 1, sessionId: 'sess1', startedAt: '2026-08-25T10:00:00Z', endedAt: '2026-08-25T11:00:00Z', outcome: 'succeeded' }],
    troops: [], deliverables: [], reports: [], comments: [], closedVerdict: null,
    ...partial,
  }
}

test('四类来源聚合：talking 命令→答澄清、计划待批→批计划、reported→翻任务回报、failed→决重试', () => {
  const commands = [
    cmd({ commandId: 'c-talk', status: 'talking' }),
    cmd({ commandId: 'c-plan', plan: { text: '计划', status: 'pending', decidedAt: null } }),
    cmd({ commandId: 'c-idle', status: 'received' }), // received 不进收件箱（等大副，不是等舰长）
  ]
  const tasks = [
    task({ taskId: 'T-rep', title: '报表任务', status: 'reported', reports: [{ ts: '2026-08-25T11:30:00Z', from: 'cmd', text: '完成', evidence: null }] }),
    task({ taskId: 'T-fail', title: '失败任务', status: 'failed', attemptLog: [{ id: 'a2', n: 1, sessionId: 'sess2', startedAt: '2026-08-25T10:30:00Z', endedAt: '2026-08-25T11:10:00Z', outcome: 'failed' }] }),
  ]
  const items = collectInbox(commands, tasks, NOW)
  const KIND_ORDER = ['clarify', 'plan', 'review', 'retry'] as const
  assert.deepEqual([...items.map(i => i.kind)].sort((a, b) => KIND_ORDER.indexOf(a as never) - KIND_ORDER.indexOf(b as never)), KIND_ORDER)
  const byKind = Object.fromEntries(items.map(i => [i.kind, i])) as Record<string, InboxItem>
  assert.equal(byKind.clarify.refId, 'c-talk')
  assert.equal(byKind.plan.refId, 'c-plan')
  assert.equal(byKind.review.refId, 'T-rep')
  assert.equal(byKind.retry.refId, 'T-fail')
  // 等待起点：clarify/plan 用 createdAt；review 用最后一条任务回报 ts；retry 用失败 attempt 的 endedAt。
  assert.equal(byKind.clarify.since, '2026-08-25T11:00:00Z')
  assert.equal(byKind.review.since, '2026-08-25T11:30:00Z')
  assert.equal(byKind.retry.since, '2026-08-25T11:10:00Z')
})

test('排序：等得最久的排最前（aging 视觉强调对齐）', () => {
  const commands = [cmd({ commandId: 'c-new', status: 'talking', createdAt: '2026-08-25T11:50:00Z' })]
  const tasks = [task({ taskId: 'T-old', status: 'reported', reports: [{ ts: '2026-08-25T09:00:00Z', from: 'cmd', text: 'x', evidence: null }] })]
  const items = collectInbox(commands, tasks, NOW)
  assert.equal(items[0]!.refId, 'T-old')
  assert.equal(items[1]!.refId, 'c-new')
})

test('aging 阈值：<30 分钟无警示、≥30 分钟 warn、≥2 小时 err', () => {
  assert.equal(agingTone(INBOX_WARN_MS - 1), '')
  assert.equal(agingTone(INBOX_WARN_MS), 'warn')
  assert.equal(agingTone(INBOX_ERR_MS - 1), 'warn')
  assert.equal(agingTone(INBOX_ERR_MS), 'err')
  const items = collectInbox([cmd({ commandId: 'c-err', status: 'talking', createdAt: '2026-08-25T09:00:00Z' })], [], NOW)
  assert.equal(items[0]!.tone, 'err')
})

test('formatWait 人话时长', () => {
  assert.equal(formatWait(30_000), '刚刚')
  assert.equal(formatWait(5 * 60_000), '5 分钟')
  assert.equal(formatWait(3 * 3_600_000), '3 小时')
  assert.equal(formatWait(2 * 86_400_000), '2 天')
})

test('空收件箱与坏时间戳防御', () => {
  assert.deepEqual(collectInbox([], [], NOW), [])
  const bad = collectInbox([cmd({ commandId: 'c-bad', status: 'talking', createdAt: 'not-a-date' })], [], NOW)
  assert.equal(bad.length, 1)
  assert.equal(bad[0]!.waitMs, 0) // NaN 防御：不可解析按 0 计
})

test('agingLeader：err 档最老一条领跑（全红时红里也要有先后），无 err 则 null', () => {
  // 两条都超 2 小时进 err（10:00 与 09:00 起算）+ 一条 warn——领跑者是最老的 09:00。
  const commands = [
    cmd({ commandId: 'c-older', status: 'talking', createdAt: '2026-08-25T09:00:00Z' }),
    cmd({ commandId: 'c-err', status: 'talking', createdAt: '2026-08-25T10:00:00Z' }),
  ]
  const items = collectInbox(commands, [], NOW)
  assert.equal(agingLeader(items), 'clarify:c-older')
  // 只有 warn / 空队列时无领跑者。
  const warnOnly = collectInbox([cmd({ commandId: 'c-warn', status: 'talking', createdAt: '2026-08-25T11:30:00Z' })], [], NOW)
  assert.equal(warnOnly[0]!.tone, 'warn')
  assert.equal(agingLeader(warnOnly), null)
  assert.equal(agingLeader([]), null)
})

// V10.1 灵动岛收件箱播报判定：水合静默 / 基线静默 / 净增播 / 持平减少静默。
test('inboxGrowthAnnounce: 水合期一律静默（到访现状归摘要横幅，不播）', () => {
  assert.equal(inboxGrowthAnnounce(null, 0, false), null)
  assert.equal(inboxGrowthAnnounce(null, 4, false), null)
  assert.equal(inboxGrowthAnnounce(1, 5, false), null)
})

test('inboxGrowthAnnounce: 水合后首次只记基线不出声', () => {
  assert.equal(inboxGrowthAnnounce(null, 4, true), null)
})

test('inboxGrowthAnnounce: 净增返回增量，持平/减少静默', () => {
  assert.equal(inboxGrowthAnnounce(4, 5, true), 1)
  assert.equal(inboxGrowthAnnounce(4, 8, true), 4)
  assert.equal(inboxGrowthAnnounce(4, 4, true), null)
  assert.equal(inboxGrowthAnnounce(4, 2, true), null)
})
