import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, loadCampaign } from '../src/events.ts'
import { boardProjection, dueBounties } from '../src/dashboard.ts'
import { nextRunOf, parseCron, CronParseError } from '../src/schedule.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-sched-'))
}

test('parseCron accepts wildcards, steps, ranges, lists; 7 maps to Sunday', () => {
  const f = parseCron('*/15 9-11 1,15 * 7')
  assert.deepEqual([...f.minutes], [0, 15, 30, 45])
  assert.deepEqual([...f.hours], [9, 10, 11])
  assert.deepEqual([...f.daysOfMonth], [1, 15])
  assert.ok(f.daysOfWeek.has(0) && !f.daysOfWeek.has(7))
})

test('parseCron rejects bad shapes with the field hint', () => {
  assert.throws(() => parseCron('0 9'), CronParseError)
  assert.throws(() => parseCron('60 * * * *'), CronParseError)
  assert.throws(() => parseCron('* * 0 * *'), CronParseError)
  assert.throws(() => parseCron('* */x * * *'), CronParseError)
})

test('nextRunOf lands on the next matching wall-clock minute (strictly after)', () => {
  // 2026-08-23 是周日。每天 9:00 的任务令：周六 20:00 问 → 次日（周日）9:00。
  const sat2000 = new Date(2026, 7, 22, 20, 0, 0).getTime()
  const next = nextRunOf('0 9 * * *', sat2000)
  assert.equal(next, new Date(2026, 7, 23, 9, 0, 0).getTime())
  // 周日 9:30 问 → 下一次是周一 9:00（严格晚于当前时刻）。
  const sun0930 = new Date(2026, 7, 23, 9, 30, 0).getTime()
  assert.equal(nextRunOf('0 9 * * *', sun0930), new Date(2026, 7, 24, 9, 0, 0).getTime())
  // 每 15 分钟：12:07 → 12:15。
  assert.equal(nextRunOf('*/15 * * * *', new Date(2026, 7, 23, 12, 7).getTime()), new Date(2026, 7, 23, 12, 15).getTime())
  // 仅周一 9 点：周日问 → 次日周一 9 点。
  assert.equal(nextRunOf('0 9 * * 1', sun0930), new Date(2026, 7, 24, 9, 0).getTime())
})

test('nextRunOf returns undefined for impossible dates within the horizon', () => {
  assert.equal(nextRunOf('0 9 30 2 *', Date.now()), undefined)
})

test('dueBounties: busy rounds skip, finished rounds reopen, gap never backfills', () => {
  const dir = tmpStateDir()
  try {
    const base = [
      { type: 'task_created', ts: '2026-08-20T00:00:00.000Z', campaignId: 'daily', title: '日常', brief: 'b', acceptance: 'a', priority: 'normal' },
      { type: 'task_published', ts: '2026-08-20T00:00:01.000Z', campaignId: 'daily', workspacePath: '/w' },
      { type: 'task_scheduled', ts: '2026-08-20T00:00:02.000Z', campaignId: 'daily', cron: '0 9 * * *', enabled: true },
    ] as const
    for (const e of base) appendEvent(dir, e)
    const now = new Date('2026-08-25T02:00:00.000Z').getTime()
    // 未收官（一直 published）→ 到点只跳过，不开新轮。
    const busy = dueBounties(dir, now)
    assert.equal(busy.length, 1)
    assert.equal(busy[0]!.openRound, false)
    assert.match(busy[0]!.reason, /跳过/)
    // 收官后同一时刻问 → 开新轮；且五天只算一次（锚点滚动，不回填）。
    appendEvent(dir, { type: 'task_closed', ts: '2026-08-21T00:00:00.000Z', campaignId: 'daily', verdict: 'ok' } as never)
    const reopen = dueBounties(dir, now)
    assert.equal(reopen.length, 1)
    assert.equal(reopen[0]!.openRound, true)
    // 模拟 tick 写入跳过事件后：锚点滚动，同刻不再重复到期。
    appendEvent(dir, { type: 'task_schedule_triggered', ts: '2026-08-25T02:00:00.000Z', campaignId: 'daily', skipped: true, note: '上一轮（published）尚未收官' } as never)
    const after = dueBounties(dir, now + 10_000)
    assert.equal(after.length, 0)
    // 看板投影带 nextRunAt 与轮次。
    const proj = boardProjection(dir).find(t => t.taskId === 'daily')!
    assert.equal(proj.schedule !== null && typeof proj.schedule === 'object' ? (proj.schedule as { nextRunAt: string | null }).nextRunAt !== null : false, true)
    assert.equal(loadCampaign(dir, 'daily').rounds, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
