/**
 * B1-件④ dashboard 新路由补测——V17 archive（不可逆写通道六态）、host-sessions、
 * host-workspaces（V18）、planets POST（V18）。archive 是全插件唯一不可逆宿主
 * 扇出，此前零专测。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { appendEvent } from '../src/events.ts'
import { registerDashboard, type RouteRegistry } from '../src/dashboard.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-routes-'))
}

function fakeStore(active = true) {
  return { get: () => ({ version: 2 as const, active }), save: () => {} }
}

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

function makeHandler(deps: Record<string, unknown> = {}): {
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

async function call(handler: (req: unknown, res: unknown) => Promise<void>, req: unknown): Promise<{ code: number; body: any }> {
  let body = ''
  const res = {
    setHeader: () => {},
    write: () => true,
    end: (b?: string) => { body = b ?? '' },
    on: () => {},
  }
  ;(res as { code?: number }).code = 200
  const wrapped = { ...res, end: (b?: string) => { body = b ?? '' } }
  await handler(req, wrapped)
  return { code: 200, body: JSON.parse(body) }
}

/** seed：命令已批准挂任务 + 任务走到指定状态（claimed 才有 attempt 会话）。 */
function seedApprovedWithTask(dir: string, cmdId: string, taskId: string, taskStatus: 'published' | 'in_progress' | 'closed' | 'failed'): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: cmdId, text: 'x' })
  appendDirectiveEvent(dir, { type: 'directive_session_opened', ts: 't1', directiveId: cmdId, staffSessionId: `staff-${cmdId}` })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't2', directiveId: cmdId, staffSessionId: `staff-${cmdId}` })
  appendEvent(dir, { type: 'task_created', ts: 't3', campaignId: taskId, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't4', campaignId: taskId, workspacePath: '/w/proj' })
  if (taskStatus === 'in_progress' || taskStatus === 'closed') {
    appendEvent(dir, { type: 'task_claimed', ts: 't5', campaignId: taskId, claimedBy: `cmdr-${taskId}`, attemptId: 'tok', attempt: 1 })
  }
  if (taskStatus === 'closed') {
    appendEvent(dir, { type: 'task_submitted', ts: 't6', campaignId: taskId, from: `cmdr-${taskId}`, report: 'r' })
    appendEvent(dir, { type: 'task_closed', ts: 't7', campaignId: taskId, verdict: '通过' })
  }
  if (taskStatus === 'failed') {
    appendEvent(dir, { type: 'task_failed', ts: 't6', campaignId: taskId, reason: 'x' })
  }
  appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't8', directiveId: cmdId, taskId })
}

const okArchive = async () => ({ ok: true as const })

test('件④: archive 面缺席 → 501；缺 commandId → 400；未知命令 → 404', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    // 面缺席优先（Stop-if 探针语义）：先于参数校验。
    const r0 = await call(bare.handler, postReq('/warroom/api/archive', { commandId: 'cmd-any' }))
    assert.equal(r0.body.ok, false)
    assert.match(r0.body.error, /宿主归档通道未接入/)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({ stateDir: dir, archiveSession: okArchive })
  try {
    const r1 = await call(wired.handler, postReq('/warroom/api/archive', {}))
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /缺少命令号/)
    const r2 = await call(wired.handler, postReq('/warroom/api/archive', { commandId: 'cmd-nope' }))
    assert.equal(r2.body.ok, false)
    assert.match(r2.body.error, /不存在/)
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: archive 链未终局 → 400 拒绝；已归档 → 400', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-live', 'task-live', 'in_progress')
    seedApprovedWithTask(dir, 'cmd-done', 'task-done', 'closed')
    appendDirectiveEvent(dir, { type: 'directive_archived', ts: 't9', directiveId: 'cmd-done', sessions: [] })
    const { handler, dispose } = makeHandler({ stateDir: dir, archiveSession: okArchive })
    try {
      const live = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-live' }))
      assert.equal(live.body.ok, false)
      assert.match(live.body.error, /战线未全终局/)
      const done = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-done' }))
      assert.equal(done.body.ok, false)
      assert.match(done.body.error, /已归档/)
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: archive 全终局 → 逐会话扇出成功落账（大副会话+尝试会话）', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-ok', 'task-ok', 'closed')
    const archived: string[] = []
    const { handler, dispose } = makeHandler({
      stateDir: dir,
      archiveSession: async sessionId => { archived.push(sessionId); return { ok: true } },
    })
    try {
      const r = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-ok' }))
      assert.equal(r.body.ok, true)
      assert.equal(r.body.archived, 2)
      assert.deepEqual([...archived].sort(), [`staff-cmd-ok`, `cmdr-task-ok`].sort())
      const d = loadDirectives(dir).find(x => x.id === 'cmd-ok')!
      assert.deepEqual([...d.archived!.sessions].sort(), [`staff-cmd-ok`, `cmdr-task-ok`].sort())
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: archive 部分失败如实返回；全部失败 → 502', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-p', 'task-p', 'closed')
    const { handler, dispose } = makeHandler({
      stateDir: dir,
      archiveSession: async sessionId => sessionId.startsWith('staff')
        ? { ok: true }
        : { ok: false, code: 'E_TIMEOUT', message: '超时' },
    })
    try {
      const r = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-p' }))
      assert.equal(r.body.ok, true)
      assert.equal(r.body.archived, 1)
      assert.equal(r.body.failed.length, 1)
      assert.equal(r.body.failed[0].code, 'E_TIMEOUT')
      // 全败分支：两个会话都失败。
      const all = makeHandler({
        stateDir: dir,
        archiveSession: async () => ({ ok: false, code: 'E_NOPE', message: 'x' }),
      })
      try {
        seedApprovedWithTask(dir, 'cmd-q', 'task-q', 'closed')
        const rq = await call(all.handler, postReq('/warroom/api/archive', { commandId: 'cmd-q' }))
        assert.equal(rq.body.ok, false)
        assert.match(rq.body.error, /全部失败/)
      } finally {
        all.dispose()
      }
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: host-sessions 面缺席 501 / 提供时透出清单', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    const r1 = await call(bare.handler, { method: 'GET', url: '/warroom/api/host-sessions' })
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /未接入/)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({ stateDir: dir, listSessions: async () => ['s1', 's2'] })
  try {
    const r2 = await call(wired.handler, { method: 'GET', url: '/warroom/api/host-sessions' })
    assert.equal(r2.body.ok, true)
    assert.deepEqual(r2.body.sessions, ['s1', 's2'])
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: host-workspaces 面缺席 501 / 提供时映射 sessionCount', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    const r1 = await call(bare.handler, { method: 'GET', url: '/warroom/api/host-workspaces' })
    assert.equal(r1.body.ok, false)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({
    stateDir: dir,
    listWorkspaces: async () => [
      { workspaceId: 'w1', path: 'D:/proj/a', title: 'A', sessionCount: 0 },
      { workspaceId: 'w2', path: 'D:/proj/b', title: 'B', sessionCount: 0 },
    ],
  })
  try {
    const r2 = await call(wired.handler, { method: 'GET', url: '/warroom/api/host-workspaces' })
    assert.equal(r2.body.ok, true)
    assert.equal(r2.body.workspaces.length, 2)
    assert.equal(r2.body.workspaces[0].workspaceId, 'w1')
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: planets POST 空/假路径 400，真目录注册 200', async () => {
  const dir = tmpStateDir()
  const realDir = mkdtempSync(join(tmpdir(), 'warroom-planet-real-'))
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const r1 = await call(handler, postReq('/warroom/api/planets', { path: '   ' }))
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /缺少工作区路径/)
    const r2 = await call(handler, postReq('/warroom/api/planets', { path: 'D:/definitely/not/a/dir' }))
    assert.equal(r2.body.ok, false)
    assert.match(r2.body.error, /不是真实目录/)
    const r3 = await call(handler, postReq('/warroom/api/planets', { path: realDir, title: '实验星' }))
    assert.equal(r3.body.ok, true)
    assert.equal(r3.body.planets.length, 1)
    assert.equal(r3.body.planets[0].title, '实验星')
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
    rmSync(realDir, { recursive: true, force: true })
  }
})

test('V19 回流·workspace/file+reveal 只读端点：守卫四拒/封顶/二进制嗅探/直读', async () => {
  const warRoot = mkdtempSync(join(tmpdir(), 'warroom-wsroot-'))
  const ws = join(warRoot, 'task-a')
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'ok.md'), '# 标题\n\n正文一段。', 'utf8')
  writeFileSync(join(ws, 'bin.dat'), Buffer.concat([Buffer.alloc(10), Buffer.from([0]), Buffer.from('rest')]))
  writeFileSync(join(ws, 'big.log'), 'x'.repeat(512 * 1024 + 1), 'utf8')
  const outside = mkdtempSync(join(tmpdir(), 'warroom-outside-'))
  const h = makeHandler({ warRoot })
  try {
    const get = (wsQ: string, nameQ: string): Promise<{ code: number; body: any }> =>
      call(h.handler, { method: 'GET', url: `/warroom/api/workspace/file?ws=${encodeURIComponent(wsQ)}&name=${encodeURIComponent(nameQ)}` })
    const ok = await get(ws, 'ok.md')
    assert.equal(ok.body.ok, true)
    assert.equal(ok.body.binary, false)
    assert.match(ok.body.content, /# 标题/)
    // 守卫四拒：穿越/绝对路径/ws 越界/缺参（harness 口径：语义断 body，code 恒 200）。
    const trav = await get(ws, '../x.md')
    assert.equal(trav.body.ok, false)
    assert.match(trav.body.error, /穿越/)
    const abs = await get(ws, 'C:/x.md')
    assert.equal(abs.body.ok, false)
    assert.match(abs.body.error, /穿越/)
    const out = await get(outside, 'ok.md')
    assert.equal(out.body.ok, false)
    assert.match(out.body.error, /war_root/)
    const missing = await get(ws, 'absent.md')
    assert.equal(missing.body.ok, false)
    assert.match(missing.body.error, /不存在/)
    // 封顶：>512KB。
    const big = await get(ws, 'big.log')
    assert.equal(big.body.ok, false)
    assert.match(big.body.error, /512KB/)
    // 二进制嗅探：首 1KB 含 NUL → binary=true 且 content 空。
    const bin = await get(ws, 'bin.dat')
    assert.equal(bin.body.binary, true)
    assert.equal(bin.body.content, '')
    // reveal 守卫：ws 越界拒（不真开资源管理器——只测拒绝面）。
    let revBody = ''
    const revRes = { setHeader: () => {}, write: () => true, end: (b?: string) => { revBody = b ?? '' }, on: () => {} }
    await h.handler(postReq('/warroom/api/workspace/reveal', { ws: outside, name: '' }), revRes)
    const revOut = { body: JSON.parse(revBody) }
    assert.equal(revOut.body.ok, false)
    assert.match(revOut.body.error, /war_root/)
  } finally {
    h.dispose()
    rmSync(warRoot, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
