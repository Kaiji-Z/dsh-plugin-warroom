import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, foldCampaign, isActiveUnit, listCampaignIds, loadCampaign, readEvents } from '../src/events.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-test-'))
}

test('fold derives the full task lifecycle from the append-only log', () => {
  const events = [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: '拿下登录功能', brief: '任务书…', acceptance: '验收1；验收2', priority: 'high', publishedBy: 'sec-1' },
    { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: '/war/tasks/c1', publishedBy: 'sec-1' },
    { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd-1' },
    { type: 'unit_deployed', ts: 't3', campaignId: 'c1', childId: 'u1', unitName: 'recon', label: '侦察兵', mission: '摸清地形', front: '/war/tasks/c1/src', writes: false },
    { type: 'order_sent', ts: 't4', campaignId: 'c1', childId: 'u1', order: '补充侦察 docs' },
    { type: 'report_received', ts: 't5', campaignId: 'c1', childId: 'u1', summary: '结构清晰' },
    { type: 'task_commented', ts: 't6', campaignId: 'c1', comment: '舰长：注意兼容', from: 'sec-1' },
    { type: 'unit_settled', ts: 't7', campaignId: 'c1', childId: 'u1', stopReason: 'completed' },
    { type: 'task_submitted', ts: 't8', campaignId: 'c1', report: '已完成，验收全过', from: 'cmd-1' },
    { type: 'task_closed', ts: 't9', campaignId: 'c1', verdict: '通过收官' },
  ] as const
  const state = foldCampaign('c1', events)
  assert.equal(state.title, '拿下登录功能')
  assert.equal(state.brief, '任务书…')
  assert.equal(state.acceptance, '验收1；验收2')
  assert.equal(state.priority, 'high')
  assert.equal(state.status, 'closed')
  assert.equal(state.closedVerdict, '通过收官')
  assert.equal(state.workspacePath, '/war/tasks/c1')
  assert.equal(state.claimedBy, 'cmd-1')
  assert.equal(state.hqSessionId, 'cmd-1')
  assert.equal(state.reports.length, 1)
  assert.equal(state.reports[0]!.from, 'cmd-1')
  assert.equal(state.comments.length, 1)
  const u1 = state.units.get('u1')!
  assert.equal(u1.lastReport, '结构清晰')
  assert.deepEqual(u1.orders, [{ ts: 't4', order: '补充侦察 docs' }])
  assert.equal(u1.settled?.stopReason, 'completed')
  assert.equal(isActiveUnit(u1), false)
})

test('intermediate statuses fold correctly', () => {
  const draft = foldCampaign('c2', [{ type: 'task_created', ts: 't0', campaignId: 'c2', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' }])
  assert.equal(draft.status, 'draft')
  const published = foldCampaign('c2', [
    { type: 'task_created', ts: 't0', campaignId: 'c2', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'c2', workspacePath: '/w' },
  ])
  assert.equal(published.status, 'published')
  const claimed = foldCampaign('c2', [...published === undefined ? [] : [], { type: 'task_claimed', ts: 't2', campaignId: 'c2', claimedBy: 'cmd' }] as const)
  assert.equal(claimed.status, 'in_progress')
  const submitted = foldCampaign('c2', [
    { type: 'task_claimed', ts: 't2', campaignId: 'c2', claimedBy: 'cmd' },
    { type: 'task_submitted', ts: 't3', campaignId: 'c2', report: 'r', from: 'cmd' },
  ])
  assert.equal(submitted.status, 'reported')
})

test('v0.1 legacy events still fold (campaign_started/closed compat)', () => {
  const state = foldCampaign('c3', [
    { type: 'campaign_started', ts: 't0', campaignId: 'c3', intent: '旧战役', hqSessionId: 'hq' },
    { type: 'plan_recorded', ts: 't1', campaignId: 'c3', plan: 'v1' },
    { type: 'plan_recorded', ts: 't2', campaignId: 'c3', plan: 'v2' },
    { type: 'campaign_closed', ts: 't3', campaignId: 'c3', outcome: 'done' },
  ])
  assert.equal(state.intent, '旧战役')
  assert.equal(state.plan, 'v1\nv2')
  assert.equal(state.status, 'closed')
  assert.equal(state.closedVerdict, 'done')
})

test('append/read roundtrip survives torn tail lines', () => {
  const dir = tmpStateDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'cx', title: 'i', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'cx', workspacePath: '/w' })
    writeFileSync(join(dir, 'campaigns', 'cx.jsonl'), '{"type":"unit_depl', { flag: 'a' })
    assert.equal(readEvents(dir, 'cx').length, 2)
    assert.equal(loadCampaign(dir, 'cx').status, 'published')
    assert.deepEqual(listCampaignIds(dir), ['cx'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('empty log folds to an empty task (startedAt guard)', () => {
  const state = foldCampaign('missing', [])
  assert.equal(state.startedAt, '')
  assert.equal(state.units.size, 0)
  assert.equal(state.status, 'draft')
})

test('v1.0: quality, deps, and schedule fold from task_created/task_scheduled', () => {
  const state = foldCampaign('q1', [
    { type: 'task_created', ts: 't0', campaignId: 'q1', title: '史诗工程', brief: 'b', acceptance: 'a', priority: 'high', quality: 'epic', deps: ['dep-1', 'dep-2'] },
    { type: 'task_scheduled', ts: 't1', campaignId: 'q1', cron: '0 9 * * *', enabled: true },
  ])
  assert.equal(state.quality, 'epic')
  assert.deepEqual(state.deps, ['dep-1', 'dep-2'])
  assert.equal(state.schedule?.cron, '0 9 * * *')
  assert.equal(state.schedule?.enabled, true)
  assert.equal(state.rounds, 0)
})

test('v1.0: claim rotates the attempt token; requeue kills it; failed is terminal', () => {
  const base = [
    { type: 'task_created', ts: 't0', campaignId: 'f1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'f1', workspacePath: '/w' },
  ] as const
  // 第 1 次尝试失败 → 自动重派回板（旧令牌随之作废）
  const afterRequeue = foldCampaign('f1', [...base,
    { type: 'task_claimed', ts: 't2', campaignId: 'f1', claimedBy: 'cmd', attemptId: 'tok-A', attempt: 1 },
    { type: 'task_attempt_failed', ts: 't3', campaignId: 'f1', reason: '测试没过' },
    { type: 'task_requeued', ts: 't4', campaignId: 'f1', reason: '第 1 次尝试失败：测试没过' },
  ] as const)
  assert.equal(afterRequeue.status, 'published')
  assert.equal(afterRequeue.claimedBy, undefined)
  assert.equal(afterRequeue.attempt, undefined)
  assert.equal(afterRequeue.lastError, '第 1 次尝试失败：测试没过')
  // 第 2 次领取换新令牌；再失败且重试用尽 → failed 终态
  const failed = foldCampaign('f1', [...base,
    { type: 'task_claimed', ts: 't2', campaignId: 'f1', claimedBy: 'cmd', attemptId: 'tok-A', attempt: 1 },
    { type: 'task_attempt_failed', ts: 't3', campaignId: 'f1', reason: '测试没过' },
    { type: 'task_requeued', ts: 't4', campaignId: 'f1', reason: '第 1 次尝试失败：测试没过' },
    { type: 'task_claimed', ts: 't5', campaignId: 'f1', claimedBy: 'cmd', attemptId: 'tok-B', attempt: 2 },
    { type: 'task_attempt_failed', ts: 't6', campaignId: 'f1', reason: '还是没过' },
    { type: 'task_failed', ts: 't7', campaignId: 'f1', reason: '第 2 次尝试失败：还是没过（重试上限 2 已用尽）' },
  ] as const)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.attempts, 2)
  assert.equal(failed.attempt?.id, 'tok-B')
  assert.ok(failed.lastError?.includes('重试上限'))
})

test('v1.0: submission evidence and deliverables fold onto the report', () => {
  const state = foldCampaign('e1', [
    { type: 'task_created', ts: 't0', campaignId: 'e1', title: 'x', brief: 'b', acceptance: 'a1；a2', priority: 'normal' },
    { type: 'task_claimed', ts: 't1', campaignId: 'e1', claimedBy: 'cmd', attemptId: 'tok', attempt: 1 },
    {
      type: 'task_submitted', ts: 't2', campaignId: 'e1', report: '任务回报：全部完成', from: 'cmd',
      evidence: {
        checks: [{ item: 'a1', passed: true }, { item: 'a2', passed: true }],
        tests: { command: 'npm test', exitCode: 0, passed: 12, failed: 0 },
        diffstat: '3 files changed, 41 insertions(+)',
        files: ['src/cli.ts', 'tests/cli.test.ts', 'README.md'],
      },
      deliverables: [
        { kind: 'tests', summary: 'npm test 12/12 全绿', ts: 't2' },
        { kind: 'files', summary: '新增 CLI 与测试', detail: 'src/cli.ts, tests/cli.test.ts', ts: 't2' },
      ],
    },
  ])
  assert.equal(state.status, 'reported')
  assert.equal(state.reports[0]!.evidence?.tests?.exitCode, 0)
  assert.deepEqual(state.reports[0]!.evidence?.files, ['src/cli.ts', 'tests/cli.test.ts', 'README.md'])
  assert.equal(state.deliverables.length, 2)
  assert.equal(state.deliverables[0]!.kind, 'tests')
})

test('v1.0: cron trigger opens a new bounty round (skipped triggers do not)', () => {
  const base = [
    { type: 'task_created', ts: 't0', campaignId: 'd1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'd1', workspacePath: '/w' },
    { type: 'task_scheduled', ts: 't2', campaignId: 'd1', cron: '0 9 * * *', enabled: true },
  ] as const
  const skipped = foldCampaign('d1', [...base, { type: 'task_schedule_triggered', ts: 't3', campaignId: 'd1', skipped: true, note: '上一轮仍在执行，跳过不补跑' }] as const)
  assert.equal(skipped.rounds, 0)
  assert.equal(skipped.schedule?.lastTriggeredAt, 't3')
  const reopened = foldCampaign('d1', [...base,
    { type: 'task_claimed', ts: 't3', campaignId: 'd1', claimedBy: 'cmd', attemptId: 'tok', attempt: 1 },
    { type: 'task_submitted', ts: 't4', campaignId: 'd1', report: 'r', from: 'cmd' },
    { type: 'task_closed', ts: 't5', campaignId: 'd1', verdict: 'ok' },
    { type: 'task_schedule_triggered', ts: 't6', campaignId: 'd1', skipped: false },
  ] as const)
  assert.equal(reopened.rounds, 1)
  assert.equal(reopened.status, 'published')
  assert.equal(reopened.claimedBy, undefined)
  assert.equal(reopened.attempt, undefined)
})

test('v2.0: attemptLog builds session cards — live, failed, reported, succeeded', () => {
  const base = [
    { type: 'task_created', ts: 't0', campaignId: 'a1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'a1', workspacePath: '/w' },
  ] as const
  // 第 1 次尝试失败 → 该 attempt 卡 outcome=failed；重派后第 2 次领取是新的 live 卡。
  const afterRequeue = foldCampaign('a1', [...base,
    { type: 'task_claimed', ts: 't2', campaignId: 'a1', claimedBy: 'cmd-A', attemptId: 'tok-A', attempt: 1 },
    { type: 'task_requeued', ts: 't4', campaignId: 'a1', reason: '外勤小队失联，恢复手术重派' },
    { type: 'task_claimed', ts: 't5', campaignId: 'a1', claimedBy: 'cmd-B', attemptId: 'tok-B', attempt: 2 },
  ] as const)
  // 重派即结算：没走 war_fail 的旧尝试也翻成 failed 卡，不留僵尸 live 卡。
  assert.equal(afterRequeue.attemptLog[0]!.outcome, 'failed')
  assert.equal(afterRequeue.attemptLog[0]!.endedAt, 't4')
  assert.equal(afterRequeue.attemptLog[1]!.outcome, undefined)
  assert.equal(afterRequeue.attemptLog[1]!.sessionId, 'cmd-B')
  // 第 1 次尝试经 war_fail 失败 → failed 卡；重派后第 2 次领取是新的 live 卡。
  const afterFailRequeue = foldCampaign('a1', [...base,
    { type: 'task_claimed', ts: 't2', campaignId: 'a1', claimedBy: 'cmd-A', attemptId: 'tok-A', attempt: 1 },
    { type: 'task_attempt_failed', ts: 't3', campaignId: 'a1', reason: '没过' },
    { type: 'task_requeued', ts: 't4', campaignId: 'a1', reason: '第 1 次尝试失败：没过' },
    { type: 'task_claimed', ts: 't5', campaignId: 'a1', claimedBy: 'cmd-B', attemptId: 'tok-B', attempt: 2 },
  ] as const)
  assert.equal(afterFailRequeue.attemptLog.length, 2)
  assert.equal(afterFailRequeue.attemptLog[0]!.outcome, 'failed')
  assert.equal(afterFailRequeue.attemptLog[0]!.endedAt, 't3')
  assert.equal(afterFailRequeue.attemptLog[1]!.outcome, undefined)
  // 提交 → reported；收官判定含「通过」→ 该会话卡 outcome=succeeded。
  const closed = foldCampaign('a1', [...base,
    { type: 'task_claimed', ts: 't2', campaignId: 'a1', claimedBy: 'cmd-A', attemptId: 'tok-A', attempt: 1 },
    { type: 'task_submitted', ts: 't3', campaignId: 'a1', report: 'r', from: 'cmd-A' },
    { type: 'task_closed', ts: 't4', campaignId: 'a1', verdict: '通过收官' },
  ] as const)
  assert.equal(closed.attemptLog[0]!.outcome, 'succeeded')
  // 打回/作废判定不给 succeeded —— 汇报卡停在 reported。
  const rejected = foldCampaign('a1', [...base,
    { type: 'task_claimed', ts: 't2', campaignId: 'a1', claimedBy: 'cmd-A', attemptId: 'tok-A', attempt: 1 },
    { type: 'task_submitted', ts: 't3', campaignId: 'a1', report: 'r', from: 'cmd-A' },
    { type: 'task_closed', ts: 't4', campaignId: 'a1', verdict: '打回：验收证据不足' },
  ] as const)
  assert.equal(rejected.attemptLog[0]!.outcome, 'reported')
})

test('v2.0: v0.2 legacy claims (no token) still get session cards', () => {
  const legacy = foldCampaign('l1', [
    { type: 'task_created', ts: 't0', campaignId: 'l1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'l1', workspacePath: '/w' },
    { type: 'task_claimed', ts: 't2', campaignId: 'l1', claimedBy: 'old-cmd' },
  ])
  assert.equal(legacy.attemptLog.length, 1)
  assert.equal(legacy.attemptLog[0]!.sessionId, 'old-cmd')
  assert.equal(legacy.attemptLog[0]!.id, '')
})
