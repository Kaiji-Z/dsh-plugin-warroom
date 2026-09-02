import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkClaim, checkDeployment, depsUnsatisfied, frontsOverlap, normalizeFront, normalizeWorkspaceKey, queuePositionOf, sameWorkspace, workspaceConflict } from '../src/rules.ts'
import { foldCampaign } from '../src/events.ts'
import type { WarEvent } from '../src/types.ts'

test('normalizeFront canonicalizes fronts', () => {
  assert.equal(normalizeFront(' src/api/ '), 'src/api')
  assert.equal(normalizeFront('./src//api/'), 'src/api')
  assert.equal(normalizeFront('src\\api\\'), 'src/api')
  assert.equal(normalizeFront(''), '.')
  assert.equal(normalizeFront('.'), '.')
  assert.equal(normalizeFront('/'), '.')
})

test('frontsOverlap: prefix honesty with the slash guard', () => {
  assert.equal(frontsOverlap('src', 'src/api'), true)
  assert.equal(frontsOverlap('src/api', 'src'), true)
  assert.equal(frontsOverlap('src', 'srcx'), false)
  assert.equal(frontsOverlap('src/api', 'src/app'), false)
  assert.equal(frontsOverlap('.', 'docs'), true)
  assert.equal(frontsOverlap('src\\api', 'src/api/v2'), true)
})

function taskWith(status: 'draft' | 'published' | 'in_progress' | 'reported' | 'failed' | 'closed', events: WarEvent[] = []) {
  const head: WarEvent[] = [
    { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' },
  ]
  if (status !== 'draft') head.push({ type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: '/w' })
  if (status === 'in_progress') head.push({ type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd' })
  if (status === 'reported') {
    head.push({ type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd' })
    head.push({ type: 'task_submitted', ts: 't3', campaignId: 'c1', report: 'r', from: 'cmd' })
  }
  if (status === 'failed') {
    head.push({ type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd' })
    head.push({ type: 'task_failed', ts: 't3', campaignId: 'c1', reason: '两次尝试均失败' })
  }
  if (status === 'closed') head.push({ type: 'task_closed', ts: 't9', campaignId: 'c1', verdict: 'done' })
  return foldCampaign('c1', [...head, ...events])
}

test('checkDeployment: claim gate, closed gate, capacity, front exclusivity', () => {
  const base = { unitKnown: true, writes: true, front: 'tasks/c1/src/api', maxUnits: 2 }
  const engineerOnApi = { type: 'unit_deployed' as const, ts: 't3', campaignId: 'c1', childId: 'u1', unitName: 'engineer', label: '工程兵', mission: 'm', front: 'tasks/c1/src/api', writes: true }
  // Unclaimed (published) task: deployment refused — must claim first.
  const unclaimed = checkDeployment(taskWith('published'), base)
  assert.equal(unclaimed.ok, false)
  if (!unclaimed.ok) assert.match(unclaimed.reason, /领取/)
  // Draft: refused likewise.
  assert.equal(checkDeployment(taskWith('draft'), base).ok, false)
  // Closed: refused with a different message.
  const closedCheck = checkDeployment(taskWith('closed'), base)
  assert.equal(closedCheck.ok, false)
  if (!closedCheck.ok) assert.match(closedCheck.reason, /收官/)
  // Claimed and empty: allowed.
  assert.deepEqual(checkDeployment(taskWith('in_progress'), base), { ok: true })
  // Same front, both writers: rejected.
  const clash = checkDeployment(taskWith('in_progress', [engineerOnApi]), base)
  assert.equal(clash.ok, false)
  if (!clash.ok) assert.match(clash.reason, /前线冲突/)
  // Disjoint front and read-only units: allowed.
  assert.equal(checkDeployment(taskWith('in_progress', [engineerOnApi]), { ...base, front: 'tasks/c1/docs' }).ok, true)
  assert.equal(checkDeployment(taskWith('in_progress', [engineerOnApi]), { ...base, writes: false }).ok, true)
  // Capacity.
  const two = [engineerOnApi, { ...engineerOnApi, childId: 'u2', front: 'tasks/c1/docs' }]
  const full = checkDeployment(taskWith('in_progress', two), { ...base, front: 'tasks/c1/lib' })
  assert.equal(full.ok, false)
  if (!full.ok) assert.match(full.reason, /编制已满/)
  // Unknown unit: rejected.
  assert.equal(checkDeployment(taskWith('in_progress'), { ...base, unitKnown: false }).ok, false)
})

test('v1.0: failed and reported tasks refuse troops with the right advice', () => {
  const base = { unitKnown: true, writes: true, front: 'tasks/c1/src', maxUnits: 2 }
  const failedCheck = checkDeployment(taskWith('failed'), base)
  assert.equal(failedCheck.ok, false)
  if (!failedCheck.ok) assert.match(failedCheck.reason, /已失败/)
  const reportedCheck = checkDeployment(taskWith('reported'), base)
  assert.equal(reportedCheck.ok, false)
  if (!reportedCheck.ok) assert.match(reportedCheck.reason, /翻阅/)
})

test('v1.0: depsUnsatisfied only clears on closed, flags unknown ids', () => {
  const statuses: Record<string, import('../src/types.ts').TaskStatus | undefined> = { 'dep-1': 'closed', 'dep-2': 'in_progress' }
  const blocked = depsUnsatisfied(['dep-1', 'dep-2', 'typo-9'], id => statuses[id])
  assert.deepEqual(blocked, ['dep-2（in_progress）', 'typo-9（不存在，请核对任务编号）'])
  assert.deepEqual(depsUnsatisfied(['dep-1'], id => statuses[id]), [])
})

test('v1.0: checkClaim gates on status and deps with human explanations', () => {
  // 已被领取 → 拒绝并解释
  const inProgress = checkClaim(taskWith('in_progress'), [])
  assert.equal(inProgress.ok, false)
  if (!inProgress.ok) assert.match(inProgress.reason, /正在执行中/)
  // 在板上但前置未解锁 → 拒绝并列出
  const blocked = checkClaim(taskWith('published'), ['dep-2（in_progress）'])
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.match(blocked.reason, /未解锁/)
  // 在板上且无阻塞 → 放行
  assert.deepEqual(checkClaim(taskWith('published'), []), { ok: true })
  // failed → 明确说重试用尽
  const failed = checkClaim(taskWith('failed'), [])
  assert.equal(failed.ok, false)
  if (!failed.ok) assert.match(failed.reason, /已失败/)
})

test('v2.0: workspace keys normalize slashes, duplication, and (on win) case', () => {
  // 斜杠/重复/尾缀归一：全平台（两侧同 case，避开平台大小写差异）。
  assert.equal(normalizeWorkspaceKey('C:\\Proj\\App\\'), normalizeWorkspaceKey('C:/Proj//App'))
  assert.equal(normalizeWorkspaceKey('/srv/proj'), '/srv/proj')
  // 大小写归一仅大小写不敏感文件系统（win32/darwin；linux 敏感）。
  assert.equal(sameWorkspace('C:/Proj', 'c:\\proj\\'), process.platform === 'linux' ? false : true)
  assert.equal(sameWorkspace('/srv/a/', '/srv/a'), true)
  assert.equal(sameWorkspace('/srv/a', '/srv/b'), false)
  assert.equal(sameWorkspace(undefined, '/srv/a'), false)
  assert.equal(sameWorkspace('', '/srv/a'), false)
})

test('v2.0: workspaceConflict only blocks on in_progress holders of the SAME workspace', () => {
  const board = [
    { taskId: 'busy', status: 'in_progress' as const, workspacePath: 'C:/Proj/App' },
    { taskId: 'queued', status: 'published' as const, workspacePath: 'C:/Proj/App' },
    { taskId: 'other', status: 'in_progress' as const, workspacePath: 'C:/Proj/Other' },
    { taskId: 'isolated', status: 'in_progress' as const },
  ]
  assert.equal(workspaceConflict('C:/Proj/App//', board)?.taskId, 'busy')
  if (process.platform === 'win32' || process.platform === 'darwin') {
    assert.equal(workspaceConflict('c:\\proj\\app\\', board)?.taskId, 'busy')
  } else {
    assert.equal(workspaceConflict('c:\\proj\\app\\', board), undefined, 'linux 大小写敏感：异 case 视为不同工作区')
  }
  assert.equal(workspaceConflict('C:/Proj/Other', board)?.taskId, 'other')
  assert.equal(workspaceConflict('C:/Proj/Nowhere', board), undefined)
  assert.equal(workspaceConflict(undefined, board), undefined)
})

test('v2.0: checkClaim rejects with the queue advice when the workspace is busy', () => {
  const busy = checkClaim(taskWith('published'), [], 'busy-task')
  assert.equal(busy.ok, false)
  if (!busy.ok) {
    assert.match(busy.reason, /工作区正被占用/)
    assert.match(busy.reason, /busy-task/)
    assert.match(busy.reason, /排队/)
  }
  assert.deepEqual(checkClaim(taskWith('published'), [], undefined), { ok: true })
})

test('V7-⑤ queuePositionOf：同工作区排队位次（占用 +1 / 更优先者各 +1 / 独立域恒 0）', () => {
  const cand = (taskId: string, status: 'published' | 'in_progress', workspacePath: string | undefined, priority: 'normal' | 'high' | undefined, startedAt: string) =>
    ({ taskId, status, workspacePath, priority, startedAt })
  const all = [
    cand('run', 'in_progress', 'D:/ws/a', undefined, '2026-08-25T08:00:00Z'),
    cand('hi', 'published', 'D:/ws/a', 'high', '2026-08-25T10:00:00Z'),
    cand('lo', 'published', 'D:/ws/a', 'normal', '2026-08-25T09:00:00Z'),
    cand('solo', 'published', undefined, 'normal', '2026-08-25T09:00:00Z'),
    cand('other', 'published', 'D:/ws/b', 'normal', '2026-08-25T09:00:00Z'),
  ]
  // hi：工作区被 run 占（+1），无更优先者 → 前方 1
  assert.equal(queuePositionOf(all[1]!, all), 1)
  // lo：被占（+1）+ hi 更优先（+1）→ 前方 2
  assert.equal(queuePositionOf(all[2]!, all), 2)
  // 无工作区 = 独立域恒 0；别的工作区互不影响
  assert.equal(queuePositionOf(all[3]!, all), 0)
  assert.equal(queuePositionOf(all[4]!, all), 0)
})
