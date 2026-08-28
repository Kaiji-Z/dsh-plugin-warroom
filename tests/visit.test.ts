import assert from 'node:assert/strict'
import { test } from 'node:test'
import { taskSettledAt, visitDelta } from '../src/client/visit.ts'
import type { BoardCommand, BoardTask } from '../src/client/data.ts'

/** V7-② 到访摘要——纯函数层（last-seen 增量），node 直测。 */

const NOW = Date.parse('2026-08-25T12:00:00Z')
const SEEN = Date.parse('2026-08-25T08:00:00Z') // 「昨晚睡前」
const iso = (t: number): string => new Date(t).toISOString()

function cmd(createdAt: string): BoardCommand {
  return {
    commandId: 'c', text: 'x', createdAt, status: 'approved', staffSessionId: null, taskId: null,
    cancelledReason: null, grade: null, gradeReason: null, gradeConfidence: null, regrades: 0, plan: null,
  }
}

function task(p: { status: BoardTask['status']; attemptEnd?: string; reportTs?: string }): BoardTask {
  return {
    taskId: 'T', title: 't', status: p.status, priority: 'normal', quality: 'common', rounds: 1, attempts: 1,
    deps: [], lastError: null, workspacePath: null, claimedBy: null, startedAt: iso(SEEN - 3_600_000),
    brief: '', acceptance: '', schedule: null,
    attemptLog: p.attemptEnd !== undefined
      ? [{ id: 'a1', n: 1, sessionId: 's', startedAt: iso(SEEN - 3_600_000), endedAt: p.attemptEnd, outcome: p.status === 'failed' ? 'failed' : p.status === 'closed' ? 'succeeded' : null }]
      : [],
    troops: [], deliverables: [],
    reports: p.reportTs !== undefined ? [{ ts: p.reportTs, from: 'cmd', text: 'r', evidence: null }] : [],
    comments: [], closedVerdict: null,
  }
}

test('夜间增量：睡前到访后新收官/新终败/新命令各计数', () => {
  const d = visitDelta(
    [cmd(iso(SEEN + 3_600_000)), cmd(iso(SEEN - 3_600_000))], // 一新一旧
    [
      task({ status: 'closed', attemptEnd: iso(SEEN + 2 * 3_600_000) }),   // 夜里收官 → 计
      task({ status: 'closed', attemptEnd: iso(SEEN - 2 * 3_600_000) }),   // 睡前已收官 → 不计
      task({ status: 'failed', attemptEnd: iso(SEEN + 3_600_000) }),       // 夜里终败 → 计
      task({ status: 'in_progress', attemptEnd: iso(SEEN + 3_600_000) }),  // 进行中不算落定
    ],
    2, SEEN, NOW,
  )
  assert.equal(d.closed, 1)
  assert.equal(d.failed, 1)
  assert.equal(d.commands, 1)
  assert.equal(d.pending, 2)
  assert.equal(d.any, true)
})

test('taskSettledAt：取最后 attempt 结束与最后任务回报较晚者', () => {
  const t = task({ status: 'closed', attemptEnd: iso(SEEN + 1_000_000), reportTs: iso(SEEN + 2_000_000) })
  assert.equal(taskSettledAt(t), SEEN + 2_000_000)
})

test('首次到访（lastSeen=0）：不制造假增量，pending 仍如实', () => {
  const d = visitDelta([cmd(iso(SEEN))], [task({ status: 'closed', attemptEnd: iso(SEEN + 1) })], 3, 0, NOW)
  assert.deepEqual({ closed: d.closed, failed: d.failed, commands: d.commands }, { closed: 0, failed: 0, commands: 0 })
  assert.equal(d.pending, 3)
  assert.equal(d.any, true) // pending 单独也值得提示（inbox 在下方）
})

test('全零：any=false 横幅隐藏', () => {
  const d = visitDelta([], [], 0, SEEN, NOW)
  assert.equal(d.any, false)
})
