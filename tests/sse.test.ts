import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent } from '../src/directives.ts'
import { appendEvent } from '../src/events.ts'
import { boardProjection, boardRevision, directiveProjection, registerDashboard, type RouteRegistry } from '../src/dashboard.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-sse-'))
}

function fakeStore(active = false) {
  return { get: () => ({ version: 2 as const, active }), save: () => {} }
}

/** A fake POST request streaming a JSON body (the commands channel). */
function postReq(url: string, body: unknown): { method: string; url: string; on(event: string, cb: (chunk?: unknown) => void): void } {
  const text = JSON.stringify(body)
  return {
    method: 'POST',
    url,
    on(event, cb) {
      if (event === 'data') queueMicrotask(() => cb(text))
      if (event === 'end') queueMicrotask(() => cb())
    },
  }
}

test('boardRevision moves when an event lands', () => {
  const dir = tmpStateDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 's1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    const r1 = boardRevision(dir)
    assert.match(r1, /^[0-9a-f]{12}$/)
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 's1', workspacePath: '/w' })
    assert.notEqual(boardRevision(dir), r1)
    // v2.0: the shared directive log is part of the board signature.
    const r2 = boardRevision(dir)
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't2', directiveId: 'cmd-1', text: 'x' })
    assert.notEqual(boardRevision(dir), r2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('v2.0: POST /warroom/api/commands creates a draft card; talking flips received', async () => {
  const dir = tmpStateDir()
  let handler: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
  const registry: RouteRegistry = { register: route => { handler = route.handler; return () => {} } }
  const dispose = registerDashboard(registry, { store: fakeStore(true) as never, stateDir: dir, roster: () => ({ units: [], errors: [] }) as never, warRoot: '/w' })
  try {
    const ended: string[] = []
    const res = { setHeader: () => {}, write: () => true, end: (b?: string) => { ended.push(b ?? '') } }
    // 新建命令：落到 draft。
    await handler!(postReq('/warroom/api/commands', { text: '帮我做个记账小工具' }), res)
    const created = JSON.parse(ended[ended.length - 1]!) as { ok: boolean; commandId: string }
    assert.equal(created.ok, true)
    assert.ok(created.commandId.startsWith('cmd-'))
    assert.equal(directiveProjection(dir)[0]!.status, 'draft')
    // 空文本 → 400。
    await handler!(postReq('/warroom/api/commands', { text: '   ' }), res)
    assert.ok(ended[ended.length - 1]!.includes('空'))
    // received 之后 talking 才落事件；draft 状态的 talking 是 no-op。
    await handler!(postReq('/warroom/api/commands/talking', { commandId: created.commandId }), res)
    assert.equal(directiveProjection(dir)[0]!.status, 'draft')
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: created.commandId, secretarySessionId: 'sec' })
    await handler!(postReq('/warroom/api/commands/talking', { commandId: created.commandId }), res)
    assert.equal(directiveProjection(dir)[0]!.status, 'talking')
    // 未知命令 → 404。
    await handler!(postReq('/warroom/api/commands/talking', { commandId: 'cmd-nope' }), res)
    assert.ok(ended[ended.length - 1]!.includes('不存在'))
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('v2.0: board projection carries attempt session cards and commands', () => {
  const dir = tmpStateDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'p1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'p1', workspacePath: '/w' })
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'p1', claimedBy: 'cmd-9', attemptId: 'tok', attempt: 1 })
    const tasks = boardProjection(dir) as Array<{ attempts: number; attemptLog: Array<{ sessionId: string; outcome: string | null }> }>
    assert.equal(tasks[0]!.attempts, 1)
    assert.equal(tasks[0]!.attemptLog.length, 1)
    assert.equal(tasks[0]!.attemptLog[0]!.sessionId, 'cmd-9')
    assert.equal(tasks[0]!.attemptLog[0]!.outcome, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('SSE route: initial revision frame, pushes on change, heartbeats otherwise', async () => {
  const dir = tmpStateDir()
  let handler: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
  const registry: RouteRegistry = { register: route => { handler = route.handler; return () => {} } }
  const dispose = registerDashboard(registry, { store: fakeStore() as never, stateDir: dir, roster: () => ({ units: [], errors: [] }) as never, warRoot: '/w' })
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 's2', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    const frames: string[] = []
    let closed = false
    const res = {
      setHeader: () => {},
      write: (chunk: string) => { frames.push(chunk); return true },
      end: () => {},
      on: (ev: string, cb: () => void) => { if (ev === 'close') closeCb = cb },
    }
    let closeCb: () => void = () => {}
    await handler!({ method: 'GET', url: '/warroom/api/events' }, res)
    // 初始帧：retry + 当前 revision。
    assert.ok(frames.some(f => f.startsWith('retry:')))
    assert.ok(frames.some(f => f.startsWith('data: ') && f.includes('"rev"')))
    const initialDataFrames = frames.filter(f => f.startsWith('data: ')).length
    // 1.2s 内没有任何新事件 → 只有心跳注释，无新 data 帧。
    await new Promise(r => setTimeout(r, 1200))
    assert.equal(frames.filter(f => f.startsWith('data: ')).length, initialDataFrames)
    assert.ok(frames.some(f => f.trim() === ': ping'))
    // 写入新事件 → 下一秒内推出新 revision 帧。
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 's2', workspacePath: '/w' })
    await new Promise(r => setTimeout(r, 1500))
    assert.ok(frames.filter(f => f.startsWith('data: ')).length > initialDataFrames)
    // 连接关闭 → 观察器停跳（不再有新帧）。
    const before = frames.length
    closeCb()
    appendEvent(dir, { type: 'task_closed', ts: 't2', campaignId: 's2', verdict: 'ok' })
    await new Promise(r => setTimeout(r, 1500))
    assert.equal(frames.length, before)
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})
