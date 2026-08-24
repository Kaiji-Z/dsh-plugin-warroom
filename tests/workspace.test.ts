import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { materializeInstanceWorkspace, materializeTaskWorkspace, resolveWarRoot, instanceSlug } from '../src/workspace.ts'
import { boardProjection } from '../src/dashboard.ts'
import { appendEvent, ensureCampaignsDir } from '../src/events.ts'

test('materializeTaskWorkspace: plain dir mode (no repo)', () => {
  const root = mkdtempSync(join(tmpdir(), 'warroom-ws-'))
  try {
    const ws = materializeTaskWorkspace(root, 't1', '')
    assert.equal(ws.kind, 'dir')
    assert.ok(existsSync(ws.path))
    assert.equal(ws.path, join(root, 'tasks', 't1'))
    // re-materializing the same id is idempotent
    const again = materializeTaskWorkspace(root, 't1', '')
    assert.equal(again.path, ws.path)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('materializeTaskWorkspace: bad repo degrades to dir with note', () => {
  const root = mkdtempSync(join(tmpdir(), 'warroom-ws-'))
  try {
    const ws = materializeTaskWorkspace(root, 't2', join(root, 'not-a-repo'))
    assert.equal(ws.kind, 'dir')
    assert.ok(ws.note !== undefined && ws.note.includes('降级'))
    assert.ok(existsSync(ws.path))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveWarRoot defaults under the server cwd', () => {
  const resolved = resolveWarRoot('')
  assert.ok(resolved.endsWith('.warroom'))
  assert.ok(/[\\/]tmp[\\/]x$/.test(resolveWarRoot('/tmp/x')), 'configured root resolves verbatim-ish')
})

test('v2.0: instanceSlug sanitizes and never yields empty', () => {
  assert.equal(instanceSlug('爬虫 spider!!'), 'spider')
  assert.equal(instanceSlug('  my-app '), 'my-app')
  assert.equal(instanceSlug('???'), 'instance')
})

test('v2.0: materializeInstanceWorkspace creates a git-initialized dir under instances/', () => {
  const root = mkdtempSync(join(tmpdir(), 'warroom-inst-'))
  try {
    const ws = materializeInstanceWorkspace(root, '20260823-1000-ab12', '爬虫 spider')
    assert.equal(ws.kind, 'dir')
    assert.ok(existsSync(ws.path))
    assert.ok(ws.path.includes(join('instances', '20260823-1000-ab12-spider')), `path carries task+slug: ${ws.path}`)
    assert.ok(existsSync(join(ws.path, '.git')), 'git repo initialized (git present on this machine)')
    // idempotent re-materialize
    const again = materializeInstanceWorkspace(root, '20260823-1000-ab12', 'spider')
    assert.equal(again.path, ws.path)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('boardProjection orders by status then priority and projects troops', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-board-'))
  try {
    ensureCampaignsDir(dir)
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'lo', title: '低优先已领', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'lo', workspacePath: '/w/lo' })
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'lo', claimedBy: 'cmd' })
    appendEvent(dir, { type: 'unit_deployed', ts: 't3', campaignId: 'lo', childId: 'u1', unitName: 'recon', label: '侦察兵', mission: 'm', front: '/w/lo/src', writes: false })
    appendEvent(dir, { type: 'task_created', ts: 't4', campaignId: 'hi', title: '高优先待领', brief: 'b', acceptance: 'a', priority: 'high' })
    appendEvent(dir, { type: 'task_published', ts: 't5', campaignId: 'hi', workspacePath: '/w/hi' })
    const tasks = boardProjection(dir) as Array<{ taskId: string; status: string; troops: unknown[] }>
    assert.deepEqual(tasks.map(t => t.taskId), ['hi', 'lo'])
    assert.equal(tasks[0]!.status, 'published')
    assert.equal(tasks[1]!.troops.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
