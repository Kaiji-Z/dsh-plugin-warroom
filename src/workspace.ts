/**
 * Per-task workspace materialization (the isolated-environment pattern): every task gets its own directory under the war root, so troops
 * of different tasks can never touch each other's files — cross-task write
 * isolation falls out of the directory layout, and the front-prefix rules
 * keep isolating troops WITHIN a task.
 *
 * The war root defaults to `<server cwd>/.warroom` (sandbox-visible; dsh's
 * workspace-write sandbox roots at the server process cwd). When a task
 * declares a source repo that is a git checkout, a linked worktree is
 * created on a best-effort basis (git present + repo clean enough); failures
 * degrade to a plain directory with a note, never to a blocked publish.
 * @module dsh-plugin-warroom/workspace
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface MaterializedWorkspace {
  /** Absolute path of the task workspace. */
  readonly path: string
  /** 'worktree' when a git worktree was linked; 'dir' for a plain directory. */
  readonly kind: 'worktree' | 'dir'
  /** Degradation notes (worktree requested but fell back). */
  readonly note?: string
}

/** Resolve the war root: config override, else `<cwd>/.warroom`. */
export function resolveWarRoot(configured: string): string {
  return configured !== '' ? resolve(configured) : join(process.cwd(), '.warroom')
}

/** V18 指定默认目录（舰长令：大副自建工作区=真实文件夹）：配置优先，
 * 缺省 <warRoot 同级>/warroom-workspaces——在 .warroom 之外（非合成沙盒，
 * 任务可挂真实星球）。 */
export function resolveWorkspaceRoot(configured: string, warRoot: string): string {
  if (configured.trim() !== '') return resolve(configured.trim())
  const wr = resolveWarRoot(warRoot)
  return join(dirname(wr), 'warroom-workspaces')
}

/**
 * Materialize the workspace for one task. `repo` may be empty (plain dir) or
 * a path to a git checkout (attempt a worktree at
 * `<warRoot>/tasks/<taskId>`).
 */
export function materializeTaskWorkspace(warRoot: string, taskId: string, repo: string): MaterializedWorkspace {
  const target = join(resolveWarRoot(warRoot), 'tasks', taskId)
  if (repo.trim() !== '') {
    const repoPath = resolve(repo.trim())
    const result = tryWorktree(repoPath, target)
    if (result !== undefined) return { path: target, kind: 'worktree' }
    mkdirSync(target, { recursive: true })
    return { path: target, kind: 'dir', note: `worktree 创建失败（repo=${repoPath}），已降级为普通目录` }
  }
  mkdirSync(target, { recursive: true })
  return { path: target, kind: 'dir' }
}

function tryWorktree(repoPath: string, target: string): true | undefined {
  try {
    if (!existsSync(join(repoPath, '.git'))) return undefined
    // prune stale worktree metadata first so re-publishing a task id succeeds
    run(repoPath, ['worktree', 'prune'])
    run(repoPath, ['worktree', 'add', '--detach', target])
    return true
  } catch {
    return undefined
  }
}

/** Sanitize an instance slug into a filesystem-safe directory segment. */
export function instanceSlug(slug: string): string {
  const safe = slug.trim().replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '')
  return safe === '' ? 'instance' : safe
}

/**
 * Materialize a 新副本 (instance) workspace for a greenfield task: a fresh
 * directory under `<warRoot>/instances/<taskId>-<slug>` with its own git repo,
 * created at PUBLISH time — never at execution time (the board card shows the
 * real path before any agent runs). Best-effort git init; a missing git just
 * leaves a plain directory with a note, never a blocked publish.
 */
export function materializeInstanceWorkspace(warRoot: string, taskId: string, slug: string): MaterializedWorkspace {
  const target = join(resolveWarRoot(warRoot), 'instances', `${taskId}-${instanceSlug(slug)}`)
  mkdirSync(target, { recursive: true })
  try {
    run(target, ['init'])
    return { path: target, kind: 'dir' }
  } catch {
    return { path: target, kind: 'dir', note: 'git init 失败（未装 git？），副本为普通目录' }
  }
}

function run(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', timeout: 60_000 })
}
