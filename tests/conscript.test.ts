import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { conscriptBeats, conscriptPlan } from '../src/rules.ts'
import { appendDossierEntry, dossierEntryFor, dossierPath, dossierSlug, readDossier } from '../src/dossier.ts'
import { conscriptBriefing } from '../src/persona.ts'
import { foldCampaign } from '../src/events.ts'

function taskOf(id: string, status: 'published' | 'in_progress', workspacePath: string | undefined, priority: 'normal' | 'high' = 'normal', startedAt = 't0') {
  return { taskId: id, status, workspacePath, priority, startedAt }
}

test('v2.0: conscriptPlan picks the best queued task per free workspace', () => {
  const plan = conscriptPlan([
    taskOf('busy', 'in_progress', 'C:/Proj/A'),
    taskOf('queued-a1', 'published', 'c:\\proj\\a\\', 'normal', 't2'),
    taskOf('queued-a2', 'published', 'C:/Proj/A', 'high', 't5'),
    taskOf('queued-b', 'published', 'C:/Proj/B'),
    taskOf('solo', 'published', undefined),
  ])
  // 工作区 A 被 busy 占用 → 两个排队任务都不征召；B 空闲 → 征召；无工作区 → 单列。
  assert.deepEqual(plan.map(t => t.taskId), ['queued-b', 'solo'])
})

test('v2.0: a freed workspace conscripts its best (high first, then oldest)', () => {
  const plan = conscriptPlan([
    taskOf('old-normal', 'published', '/w/x', 'normal', 't1'),
    taskOf('new-normal', 'published', '/w/x', 'normal', 't9'),
    taskOf('high', 'published', '/w/x', 'high', 't5'),
  ])
  assert.deepEqual(plan.map(t => t.taskId), ['high'])
  const noHigh = conscriptPlan([
    taskOf('old-normal', 'published', '/w/x', 'normal', 't1'),
    taskOf('new-normal', 'published', '/w/x', 'normal', 't9'),
  ])
  assert.deepEqual(noHigh.map(t => t.taskId), ['old-normal'])
  assert.equal(conscriptBeats(taskOf('a', 'published', '/w', 'high', 't9'), taskOf('b', 'published', '/w', 'normal', 't1')), true)
})

test('v2.0: dossier slug is filesystem-safe and collision-resistant', () => {
  const slug = dossierSlug('C:/Proj 有一点中文/App')
  assert.match(slug, /^[a-zA-Z0-9-_]+-[0-9a-f]{6}$/)
  assert.ok(slug.startsWith('App-'))
  assert.match(dossierSlug('???'), /^[^-]+-[0-9a-f]{6}$/)
})

test('v2.0: dossier read initializes the template; entries append and persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-dossier-'))
  try {
    const first = readDossier(dir, '/srv/proj')
    assert.ok(first.includes('工作区履历档案'))
    appendDossierEntry(dir, '/srv/proj', '任务一', '结果：收官（通过）。战利品：测试全绿。', '2026-08-23T10:00:00Z')
    const second = readDossier(dir, '/srv/proj')
    assert.ok(second.includes('任务一'))
    assert.ok(second.includes('战利品：测试全绿'))
    // A different workspace gets a different file.
    assert.notEqual(dossierPath(dir, '/srv/other'), dossierPath(dir, '/srv/proj'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('v2.0: dossierEntryFor summarizes closed and failed tasks', () => {
  const closed = foldCampaign('c1', [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: '健康检查', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: '/w' },
    { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd', attemptId: 'tok', attempt: 1 },
    { type: 'task_submitted', ts: 't3', campaignId: 'c1', report: 'r', from: 'cmd', deliverables: [{ kind: 'tests', summary: '8/8 全绿', ts: 't3' }] },
    { type: 'task_closed', ts: 't4', campaignId: 'c1', verdict: '通过收官' },
  ])
  const closedEntry = dossierEntryFor(closed)
  assert.ok(closedEntry.includes('收官'))
  assert.ok(closedEntry.includes('8/8 全绿'))
  const failed = foldCampaign('f1', [
    { type: 'task_created', ts: 't0', campaignId: 'f1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
    { type: 'task_published', ts: 't1', campaignId: 'f1', workspacePath: '/w' },
    { type: 'task_failed', ts: 't2', campaignId: 'f1', reason: '依赖装不上' },
  ])
  assert.ok(dossierEntryFor(failed).includes('依赖装不上'))
})

test('v2.0: conscriptBriefing carries task id, workspace, queue advice, and dossier', () => {
  const text = conscriptBriefing({ taskId: 't-1', title: '健康检查', workspacePath: 'D:/proj/kaijibot', acceptance: 'npm test 全绿', dossier: '## 历史\n上次踩过坑' })
  assert.ok(text.includes('t-1'))
  assert.ok(text.includes('健康检查'))
  assert.ok(text.includes('D:/proj/kaijibot'))
  assert.ok(text.includes('war_claim t-1'))
  assert.ok(text.includes('工作区正被占用'))
  assert.ok(text.includes('上次踩过坑'))
})
