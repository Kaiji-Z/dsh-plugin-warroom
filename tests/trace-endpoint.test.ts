/**
 * B1-件② GET /warroom/api/trace——三态专测：缺参 400 / 未知 404 / 命中 200；
 * 含任务与无任务两形态 + 征召视角（dep 缺席如实 null / 提供时全量透出）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent } from '../src/directives.ts'
import { appendEvent } from '../src/events.ts'
import { registerDashboard, type RouteRegistry } from '../src/dashboard.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-trace-'))
}

function fakeStore(active = true) {
  return { get: () => ({ version: 2 as const, active }), save: () => {} }
}

function getReq(url: string): { method: string; url: string } {
  return { method: 'GET', url }
}

interface CapturedRes {
  body: string
  res: { setHeader(): void; end(b?: string): void }
}

function captureRes(): CapturedRes {
  const out: CapturedRes = { body: '', res: { setHeader: () => {}, end: (b?: string) => { out.body = b ?? '' } } }
  return out
}

function makeHandler(deps: Partial<Parameters<typeof registerDashboard>[1]> = {}): {
  handler: (req: unknown, res: unknown) => Promise<void>
  dispose: () => void
} {
  let handler: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
  const registry: RouteRegistry = { register: route => { handler = route.handler; return () => {} } }
  const dispose = registerDashboard(registry, {
    store: fakeStore() as never,
    stateDir: '',
    roster: () => ({ units: [], errors: [] }) as never,
    warRoot: '/w',
    ...deps,
  } as never)
  return { handler: (req, res) => Promise.resolve(handler!(req, res)), dispose }
}

test('件②: 缺 commandId → 400', async () => {
  const dir = tmpStateDir()
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const cap = captureRes()
    await handler(getReq('/warroom/api/trace'), cap.res)
    const body = JSON.parse(cap.body) as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.match(body.error, /缺少 commandId/)
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件②: 未知命令 → 404', async () => {
  const dir = tmpStateDir()
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const cap = captureRes()
    await handler(getReq('/warroom/api/trace?commandId=cmd-nope'), cap.res)
    const body = JSON.parse(cap.body) as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.match(body.error, /不存在/)
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件②: 已批准有任务的命令 → 200 全量时间线 + 任务投影 + 征召视角', async () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: '修分页' })
    appendDirectiveEvent(dir, { type: 'directive_triaged', ts: 't1', directiveId: 'cmd-1', grade: 'L0', reason: '小改动' })
    appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't2', directiveId: 'cmd-1', taskId: 'task-9' })
    appendEvent(dir, { type: 'task_created', ts: 't3', campaignId: 'task-9', title: '修分页', brief: 'b', acceptance: 'a；b', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't4', campaignId: 'task-9', workspacePath: '/w' })
    appendEvent(dir, { type: 'task_claimed', ts: 't5', campaignId: 'task-9', claimedBy: 'sess-1', attemptId: 'tok-abc', attempt: 1 })
    const { handler, dispose } = makeHandler({
      stateDir: dir,
      conscription: () => ({ spawned: ['task-9'], skips: { 'task-x': '在役外勤小队满编' } }),
    })
    try {
      const cap = captureRes()
      await handler(getReq('/warroom/api/trace?commandId=cmd-1'), cap.res)
      const body = JSON.parse(cap.body) as {
        ok: boolean
        command: { id: string; status: string; taskId: string; grade: string }
        timeline: { directive: Array<{ type: string }>; campaign: Array<{ type: string }> }
        task: { taskId: string; status: string; queueAhead: number; quotaPaused: boolean; attemptLog: Array<{ id: string }> }
        fuse: { pendingRelay: boolean; scheduledPending: boolean }
        conscription: { spawnedForTask: boolean; skipReasonForTask: string | null; skips: Record<string, string> }
      }
      assert.equal(body.ok, true)
      assert.equal(body.command.id, 'cmd-1')
      assert.equal(body.command.status, 'approved')
      assert.equal(body.command.taskId, 'task-9')
      // 命令时间线逐事件可追溯。
      assert.deepEqual(body.timeline.directive.map(e => e.type), ['directive_created', 'directive_triaged', 'directive_approved'])
      // 任务面：原始事件 + 板投影复用（attemptLog/queueAhead/quotaPaused 都在）。
      assert.deepEqual(body.timeline.campaign.map(e => e.type), ['task_created', 'task_published', 'task_claimed'])
      assert.equal(body.task.taskId, 'task-9')
      assert.equal(body.task.status, 'in_progress')
      assert.equal(body.task.attemptLog[0]!.id, 'tok-abc')
      assert.equal(typeof body.task.queueAhead, 'number')
      assert.equal(body.task.quotaPaused, false)
      // 引信视角：approved 非待转达。
      assert.equal(body.fuse.pendingRelay, false)
      assert.equal(body.fuse.scheduledPending, false)
      // 征召视角透出。
      assert.equal(body.conscription.spawnedForTask, true)
      assert.equal(body.conscription.skipReasonForTask, null)
      assert.equal(body.conscription.skips['task-x'], '在役外勤小队满编')
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件②: draft 定时命令 → task null + 引信不可见（未到点）+ 征召视角缺席如实 null', async () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-2', text: '新命令', cron: '0 9 * * *' })
    const { handler, dispose } = makeHandler({ stateDir: dir })
    try {
      const cap = captureRes()
      await handler(getReq('/warroom/api/trace?commandId=cmd-2'), cap.res)
      const body = JSON.parse(cap.body) as {
        ok: boolean
        task: null
        timeline: { directive: unknown[]; campaign: unknown[] }
        fuse: { pendingRelay: boolean; scheduledPending: boolean }
        conscription: null
      }
      assert.equal(body.ok, true)
      assert.equal(body.task, null)
      assert.equal(body.timeline.campaign.length, 0)
      // 定时未发：引信不可见（pendingRelay false），scheduledPending true。
      assert.equal(body.fuse.pendingRelay, false)
      assert.equal(body.fuse.scheduledPending, true)
      assert.equal(body.conscription, null)
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件②: draft 非定时命令 → 引信待转达', async () => {
  const dir = tmpStateDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-3', text: '立刻做' })
    const { handler, dispose } = makeHandler({ stateDir: dir })
    try {
      const cap = captureRes()
      await handler(getReq('/warroom/api/trace?commandId=cmd-3'), cap.res)
      const body = JSON.parse(cap.body) as { ok: boolean; fuse: { pendingRelay: boolean; scheduledPending: boolean } }
      assert.equal(body.ok, true)
      assert.equal(body.fuse.pendingRelay, true, 'draft 未定时 = 命令引信待转达')
      assert.equal(body.fuse.scheduledPending, false)
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
