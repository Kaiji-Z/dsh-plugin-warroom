import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { appendEvent, loadCampaign } from '../src/events.ts'
import { boardProjection, directiveProjection } from '../src/dashboard.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-e2e-reg-'))
}

/**
 * VERIFICATION.md §8.5 的 happy-path 回归（P0-2）：把 R3 真实 LLM 八步考题
 * （cmd-20260824-134801-ed5d → 任务 20260824-142032-032a，证据
 * .goal/evidence/v3/r3-exam.md）的**事件序列**固化为确定性回归——fold 状态机
 * 与板投影在每个里程碑的形状必须稳定。反验收（§8.5.3）一并断言：
 * 终态守卫、无令牌不得产生胜利会话卡。
 */
function replayEightStep(dir: string): { commandId: string; taskId: string } {
  const commandId = 'cmd-regression-0001'
  const taskId = '20260824-regression-0001'
  // 步1-2: 下命令 → 每命令独立参谋会话 → 接收（tickNow 后的真实顺序）。
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: commandId, text: '给日常工具箱加一个每日格言小工具' })
  appendDirectiveEvent(dir, { type: 'directive_session_opened', ts: 't1', directiveId: commandId, secretarySessionId: 'sec-staff-reg' })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't2', directiveId: commandId, secretarySessionId: 'sec-staff-reg' })
  // 步3: 元首点卡进会话 → talking。
  appendDirectiveEvent(dir, { type: 'directive_talking', ts: 't3', directiveId: commandId })
  // 步4: 参谋 war_publish 携 commandId → 命令批准 + 任务落栏。
  appendEvent(dir, { type: 'task_created', ts: 't4', campaignId: taskId, title: '给日常工具箱加「每日格言」小工具', brief: 'b', acceptance: 'node motto.js today 退出码 0', priority: 'normal', publishedBy: 'sec-staff-reg' })
  appendEvent(dir, { type: 'task_published', ts: 't5', campaignId: taskId, workspacePath: 'C:/reg/daily-toolbox', publishedBy: 'sec-staff-reg' })
  appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't6', directiveId: commandId, taskId })
  // 步5: 指挥官持令牌领取 → 作战。
  appendEvent(dir, { type: 'task_claimed', ts: 't7', campaignId: taskId, claimedBy: 'cmd-commander-reg', attemptId: 'tok-reg-1', attempt: 1 })
  // 步6: 指挥官 war_submit 带 KillCredit 证据 → 待翻阅。
  appendEvent(dir, {
    type: 'task_submitted', ts: 't8', campaignId: taskId, from: 'cmd-commander-reg',
    report: 'motto CLI 完成：today/list 子命令 + 纯函数日期轮换',
    evidence: {
      checks: [{ item: 'node motto.js today 退出码 0，输出一条完整格言', passed: true }, { item: '两个不同日期 → 两条不同格言', passed: true }],
      tests: { command: 'npm test', exitCode: 0, passed: 5, failed: 0 },
      diffstat: '3 files changed, 120 insertions(+)',
      files: ['motto.js', 'package.json', 'motto.test.js'],
    },
    deliverables: [{ kind: 'tests', summary: '5/5 全绿（npm test 退出码 0）', ts: 't8' }],
  })
  // 步7-8: 元首「去处理」跳参谋会话收官 → closed + 胜利会话。
  appendEvent(dir, { type: 'task_closed', ts: 't9', campaignId: taskId, verdict: '验收通过，收官' })
  return { commandId, taskId }
}

test('P0-2 八步回归：命令→会话→批准→落栏→作战→待阅→收官 的折叠终态', () => {
  const dir = tmpStateDir()
  try {
    const { commandId, taskId } = replayEightStep(dir)
    const cmd = loadDirectives(dir).find(d => d.id === commandId)
    assert.ok(cmd !== undefined)
    assert.equal(cmd.status, 'approved')
    assert.equal(cmd.secretarySessionId, 'sec-staff-reg')
    assert.equal(cmd.taskId, taskId)
    // fold 层未设置即 undefined；投影层才归一为 null（dashboard.ts `?? null`）。
    assert.equal(cmd.cancelledReason, undefined)
    const task = loadCampaign(dir, taskId)
    assert.equal(task.status, 'closed')
    assert.ok(task.closedVerdict?.includes('通过'))
    // 胜利会话卡：唯一 attempt 被「通过」判定升格 succeeded。
    assert.equal(task.attemptLog.length, 1)
    assert.equal(task.attemptLog[0]!.outcome, 'succeeded')
    assert.equal(task.attemptLog[0]!.sessionId, 'cmd-commander-reg')
    // KillCredit 证据链原样落账。
    assert.equal(task.reports[0]!.evidence?.tests?.exitCode, 0)
    assert.equal(task.reports[0]!.evidence?.checks.length, 2)
    assert.equal(task.deliverables.length, 1)
    // 板投影：两侧都能机检到同一条链。
    const boardTask = boardProjection(dir).find(t => t.taskId === taskId)
    assert.ok(boardTask !== undefined)
    assert.equal(boardTask.status, 'closed')
    const proj = directiveProjection(dir).find(c => c.commandId === commandId)
    assert.ok(proj !== undefined)
    assert.equal(proj.secretarySessionId, 'sec-staff-reg')
    assert.equal(proj.taskId, taskId)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('P0-2 反验收①：终态守卫——approved 后的取消事件不得改写命令', () => {
  const dir = tmpStateDir()
  try {
    const { commandId } = replayEightStep(dir)
    appendDirectiveEvent(dir, { type: 'directive_cancelled', ts: 't99', directiveId: commandId, reason: '事后翻供' })
    const cmd = loadDirectives(dir).find(d => d.id === commandId)
    assert.equal(cmd?.status, 'approved')
    assert.equal(cmd?.cancelledReason, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('P0-2 反验收②：无领取（无令牌）的提交不得产生胜利会话卡', () => {
  const dir = tmpStateDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c-forged', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c-forged', workspacePath: '/w' })
    // 伪造提交：没有 task_claimed（没有 attemptId 令牌），战报却声称全绿。
    appendEvent(dir, { type: 'task_submitted', ts: 't2', campaignId: 'c-forged', from: 'ghost', report: '全部验收通过', evidence: { checks: [{ item: 'a', passed: true }] } })
    appendEvent(dir, { type: 'task_closed', ts: 't3', campaignId: 'c-forged', verdict: '验收通过，收官' })
    const task = loadCampaign(dir, 'c-forged')
    assert.equal(task.status, 'closed')
    // 没有领取就没有会话卡，也没有可升格的胜利 attempt——幽灵提交不进荣誉簿。
    assert.equal(task.attemptLog.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
