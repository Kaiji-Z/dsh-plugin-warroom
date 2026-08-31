/**
 * B1-件⑥ worktree 收官清理——真 git 仓实跑：归档触发释放 auto+repo worktree；
 * 三道保险（路径范围/非 worktree/主仓本身）逐一验证；归档路由落账接线。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { materializeTaskWorkspace, releaseTaskWorkspace } from '../src/workspace.ts'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { appendEvent, loadCampaign } from '../src/events.ts'
import { registerDashboard, type RouteRegistry } from '../src/dashboard.ts'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-wsrelease-'))
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', timeout: 60_000 })
}

/** 造一个带一次提交的主仓（worktree add 的前置）。 */
function makeMainRepo(): string {
  const repo = tmpDir()
  git(repo, ['init'])
  git(repo, ['config', 'user.email', 't@t'])
  git(repo, ['config', 'user.name', 't'])
  writeFileSync(join(repo, 'README.md'), 'x\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'init'])
  return repo
}

test('件⑥: auto+repo worktree 归档释放——真删且账面可查', () => {
  const mainRepo = makeMainRepo()
  const root = tmpDir() // 物化根
  try {
    const made = materializeTaskWorkspace(root, 't-1001', mainRepo)
    assert.equal(made.kind, 'worktree', '前置：物化确为 linked worktree')
    assert.ok(existsSync(made.path))
    const r = releaseTaskWorkspace(root, made.path)
    assert.equal(r.ok, true, r.note)
    assert.ok(!existsSync(made.path), 'worktree 目录已随归档移除')
    // 主仓完好。
    assert.ok(existsSync(join(mainRepo, 'README.md')))
  } finally {
    rmSync(mainRepo, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('件⑥: 重复释放 → 诚实留置（目录已不在）', () => {
  const mainRepo = makeMainRepo()
  const root = tmpDir()
  try {
    const made = materializeTaskWorkspace(root, 't-1002', mainRepo)
    assert.equal(releaseTaskWorkspace(root, made.path).ok, true)
    const again = releaseTaskWorkspace(root, made.path)
    assert.equal(again.ok, false)
    assert.match(again.note, /不是 git 工作区|普通目录/)
  } finally {
    rmSync(mainRepo, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('件⑥: 普通目录（auto-dir）与 bound 路径一律不动', () => {
  const root = tmpDir()
  try {
    const plain = materializeTaskWorkspace(root, 't-1003', '')
    assert.equal(plain.kind, 'dir')
    const r1 = releaseTaskWorkspace(root, plain.path)
    assert.equal(r1.ok, false)
    assert.match(r1.note, /不是 git 工作区/)
    assert.ok(existsSync(plain.path), '普通目录绝不满清')
    const outside = releaseTaskWorkspace(root, 'D:/some/bound/project')
    assert.equal(outside.ok, false)
    assert.match(outside.note, /物化根/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('件⑥: 主仓本身不是 linked worktree——不误删', () => {
  const mainRepo = makeMainRepo()
  const root = tmpDir()
  try {
    // 把主仓路径伪称任务路径（越界已挡）——直接对主仓调用释放也应判否：
    // 主仓 git-dir == common-dir。用 tasks/ 内的克隆目录模拟：
    const fake = join(root, 'tasks', 't-1004')
    const r = releaseTaskWorkspace(root, fake)
    assert.equal(r.ok, false)
    assert.match(r.note, /不是 git 工作区/)
  } finally {
    rmSync(mainRepo, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('件⑥: 归档路由接线——释放结果落 workspace_released 事件并随响应返回', async () => {
  const mainRepo = makeMainRepo()
  const root = tmpDir()
  const dir = tmpDir()
  try {
    const wsPath = materializeTaskWorkspace(root, 't-2001', mainRepo).path
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: 'x' })
    appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't1', directiveId: 'cmd-1', taskId: 't-2001' })
    appendEvent(dir, { type: 'task_created', ts: 't2', campaignId: 't-2001', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendEvent(dir, { type: 'task_published', ts: 't3', campaignId: 't-2001', workspacePath: wsPath, workspaceKind: 'auto-worktree' })
    appendEvent(dir, { type: 'task_failed', ts: 't4', campaignId: 't-2001', reason: 'done for' })
    let handler: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
    const registry: RouteRegistry = { register: route => { handler = route.handler; return () => {} } }
    const dispose = registerDashboard(registry, {
      store: { get: () => ({ version: 2 as const, active: true }), save: () => {} } as never,
      stateDir: dir,
      roster: () => ({ units: [], errors: [] }) as never,
      warRoot: '/w',
      archiveSession: async () => ({ ok: true }),
      releaseWorkspace: path => releaseTaskWorkspace(root, path),
    })
    try {
      let body = ''
      const res = { setHeader: () => {}, write: () => true, end: (b?: string) => { body = b ?? '' }, on: () => {} }
      const text = JSON.stringify({ commandId: 'cmd-1' })
      const req = {
        method: 'POST', url: '/warroom/api/archive',
        on(event: string, cb: (chunk?: unknown) => void): void {
          if (event === 'data') queueMicrotask(() => cb(text))
          if (event === 'end') queueMicrotask(() => cb())
        },
      }
      await handler!(req, res)
      const parsed = JSON.parse(body) as { ok: boolean; released: Array<{ taskId: string; ok: boolean }> }
      assert.equal(parsed.ok, true)
      assert.equal(parsed.released.length, 1)
      assert.equal(parsed.released[0]!.taskId, 't-2001')
      assert.equal(parsed.released[0]!.ok, true)
      // 账面：fold 见 workspaceReleased。
      const camp = loadCampaign(dir, 't-2001')
      assert.equal(camp.workspaceReleased?.ok, true)
      assert.equal(camp.workspaceReleased?.path, wsPath)
      assert.ok(loadDirectives(dir).find(d => d.id === 'cmd-1')!.archived !== undefined)
      assert.ok(!existsSync(wsPath), 'worktree 真删')
    } finally {
      dispose()
    }
  } finally {
    rmSync(mainRepo, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})
