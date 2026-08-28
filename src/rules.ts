/**
 * Rules of engagement — the HARD discipline layer. Pure functions the deploy
 * tool consults before any troop starts; violations are refused in code, never
 * left to model good will (caps like max_threads/max_depth
 * are config, not prompt requests).
 * @module dsh-plugin-warroom/rules
 */

import type { CampaignState, TaskStatus, UnitRecord } from './types.ts'

/**
 * Normalize a front (星域) to a comparable directory-prefix form: POSIX
 * slashes, no leading './' or '/', no trailing '/', '' and '.' → '.' (root).
 */
export function normalizeFront(front: string): string {
  let f = front.trim().replace(/\\/g, '/')
  while (f.startsWith('./')) f = f.slice(2)
  f = f.replace(/\/+/g, '/').replace(/\/+$/, '')
  if (f === '' || f === '.') return '.'
  return f
}

/**
 * Do two fronts overlap? Root ('.') overlaps everything; otherwise one must
 * be the other or a directory-child of it ('src' vs 'srcx' do NOT overlap —
 * the slash guard keeps prefixes honest).
 */
export function frontsOverlap(a: string, b: string): boolean {
  const x = normalizeFront(a)
  const y = normalizeFront(b)
  if (x === '.' || y === '.') return true
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)
}

/** Units that still hold their fronts (deployed, not recalled/settled). */
export function activeUnits(campaign: CampaignState): UnitRecord[] {
  return [...campaign.units.values()].filter(u => u.recalled === undefined && u.settled === undefined)
}

export type DeployCheck = { ok: true } | { ok: false; reason: string }

/**
 * The full hard-rule gate for war_deploy_unit:
 * task claimed by this commander · unit known · capacity · write-front
 * exclusivity. Claiming (war_claim) is the explicit trigger that licenses
 * deployment — an unclaimed task refuses troops.
 */
export function checkDeployment(campaign: CampaignState, opts: {
  unitKnown: boolean
  writes: boolean
  front: string
  maxUnits: number
}): DeployCheck {
  if (campaign.status === 'closed') {
    return { ok: false, reason: `任务已收官（${campaign.closedVerdict ?? ''}）；新需求请让大副重新发布任务。` }
  }
  if (campaign.status === 'failed') {
    return { ok: false, reason: `任务已失败：${campaign.lastError ?? '原因未记录'}。重试次数已用完——请舰长翻阅任务回报后，让大副重新立案（可拆小一点再发）。` }
  }
  if (campaign.status === 'reported') {
    return { ok: false, reason: '任务任务回报已呈递，正等舰长翻阅。要继续动工请先等舰长批复（war_close_task 或加批示），不要抢跑。' }
  }
  if (campaign.status !== 'in_progress') {
    return { ok: false, reason: '任务尚未领取：先用 war_claim 领取任务，才能加派组员。' }
  }
  if (!opts.unitKnown) {
    return { ok: false, reason: '未知组员。请用 war_status 查看当前组员编制。' }
  }
  const active = activeUnits(campaign)
  if (active.length >= opts.maxUnits) {
    return { ok: false, reason: `编制已满：在役外勤组员 ${active.length}/${opts.maxUnits}。请先 war_recall 或等待外勤组员收队。` }
  }
  if (opts.writes) {
    const clash = active.find(u => u.writes && frontsOverlap(u.front, opts.front))
    if (clash !== undefined) {
      return { ok: false, reason: `战线冲突：星域「${normalizeFront(opts.front)}」与在役${clash.label}（${clash.childId}）的星域「${clash.front}」重叠。有写权限的外勤组员不得挤同一条战线——请重新划线或分目录加派组员。` }
    }
  }
  return { ok: true }
}

/**
 * Which declared deps are still unresolved? A dep counts as cleared only when
 * its folded status is `closed` (舰长验收过才算数). Unknown dep ids count as
 * unresolved too — a typo must block, not silently pass.
 */
export function depsUnsatisfied(deps: ReadonlyArray<string>, statusOf: (campaignId: string) => TaskStatus | undefined): string[] {
  const blocked: string[] = []
  for (const dep of deps) {
    const status = statusOf(dep)
    if (status !== 'closed') blocked.push(status === undefined ? `${dep}（不存在，请核对任务编号）` : `${dep}（${status}）`)
  }
  return blocked
}

/**
 * Normalize a workspace path to a comparable key: POSIX slashes, collapsed,
 * no trailing slash, lowercased on case-insensitive filesystems (win32/darwin)
 * so the mutex never leaks on `C:/Proj` vs `c:\proj\`.
 */
export function normalizeWorkspaceKey(path: string): string {
  let p = path.trim().replace(/\\/g, '/')
  p = p.replace(/\/+/g, '/').replace(/\/+$/, '')
  if (process.platform === 'win32' || process.platform === 'darwin') p = p.toLowerCase()
  return p
}

/** Do two workspace paths denote the same workspace? Empty/absent never matches. */
export function sameWorkspace(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false
  if (a.trim() === '' || b.trim() === '') return false
  return normalizeWorkspaceKey(a) === normalizeWorkspaceKey(b)
}

/** A board row's workspace-occupancy view (the mutex's input). */
export interface WorkspaceTaskView {
  readonly taskId: string
  readonly status: TaskStatus
  readonly workspacePath?: string
}

/**
 * Which in_progress task currently holds this workspace? The workspace is the
 * concurrency unit (v2.0 征召制): same-workspace tasks queue, cross-workspace
 * tasks parallelize. Returns undefined when the workspace is free — tasks
 * without a workspace path (v1.0 auto-isolated dirs) never conflict.
 */
export function workspaceConflict(candidate: string | undefined, tasks: ReadonlyArray<WorkspaceTaskView>): WorkspaceTaskView | undefined {
  if (candidate === undefined || candidate.trim() === '') return undefined
  return tasks.find(t => t.status === 'in_progress' && sameWorkspace(candidate, t.workspacePath))
}

/** A board row as the conscription planner sees it. */
export interface ConscriptCandidate {
  readonly taskId: string
  readonly status: TaskStatus
  readonly workspacePath?: string
  readonly priority?: 'normal' | 'high'
  readonly startedAt: string
}

/** Conscription precedence: high priority first, then oldest. */
export function conscriptBeats(a: ConscriptCandidate, b: ConscriptCandidate): boolean {
  const ah = a.priority === 'high' ? 1 : 0
  const bh = b.priority === 'high' ? 1 : 0
  if (ah !== bh) return ah > bh
  return a.startedAt < b.startedAt
}

/**
 * The conscription plan (v2.0 征召制): for each workspace free of an
 * in_progress holder, the best queued task (high first, then oldest). Tasks
 * without a workspace path (v1.0 auto-isolated dirs) each get their own slot.
 * Pure — the spawn sites and the patrol both consume it.
 */
export function conscriptPlan(tasks: ReadonlyArray<ConscriptCandidate>): ConscriptCandidate[] {
  const busy = new Set<string>()
  for (const t of tasks) {
    if (t.status === 'in_progress' && t.workspacePath !== undefined && t.workspacePath.trim() !== '') {
      busy.add(normalizeWorkspaceKey(t.workspacePath))
    }
  }
  const best = new Map<string, ConscriptCandidate>()
  const solo: ConscriptCandidate[] = []
  for (const t of tasks) {
    if (t.status !== 'published') continue
    if (t.workspacePath === undefined || t.workspacePath.trim() === '') {
      solo.push(t)
      continue
    }
    const key = normalizeWorkspaceKey(t.workspacePath)
    if (busy.has(key)) continue
    const current = best.get(key)
    if (current === undefined || conscriptBeats(t, current)) best.set(key, t)
  }
  return [...best.values(), ...solo]
}

/** V7-⑤「为什么还没动」：published 任务距「现在可被征召」还有几位。
 * 0 = 现在就可征召（外勤任务简报可发）；>0 = 同工作区被占（+1）和/或还有更优先
 * 的排队者（每位 +1）——互斥域内不并行。无工作区路径 = 独立域，恒 0。纯函数。 */
export function queuePositionOf(task: ConscriptCandidate, all: ReadonlyArray<ConscriptCandidate>): number {
  if (task.workspacePath === undefined || task.workspacePath.trim() === '') return 0
  const key = normalizeWorkspaceKey(task.workspacePath)
  let ahead = 0
  for (const t of all) {
    if (t.status === 'in_progress' && t.workspacePath !== undefined && normalizeWorkspaceKey(t.workspacePath) === key) ahead += 1
    if (t.taskId !== task.taskId && t.status === 'published' && t.workspacePath !== undefined
      && normalizeWorkspaceKey(t.workspacePath) === key && conscriptBeats(t, task)) ahead += 1
  }
  return ahead
}

/** The claim gate: bounty on the board, deps cleared, workspace free. */
export function checkClaim(campaign: CampaignState, blockedDeps: ReadonlyArray<string>, busyWith?: string): DeployCheck {
  if (campaign.status !== 'published') {
    const where: Record<string, string> = {
      draft: '任务还在草稿，尚未发布到任务栏。',
      in_progress: '任务已被领取，正在执行中。',
      reported: '任务任务回报已呈递，等舰长翻阅。',
      failed: '任务已失败且重试用尽，等舰长让大副重新立案。',
      closed: '任务已收官。',
    }
    return { ok: false, reason: `${where[campaign.status] ?? '当前状态不可领取。'}当前状态：${campaign.status}。` }
  }
  if (blockedDeps.length > 0) {
    return { ok: false, reason: `前置任务未完成，任务令尚未解锁：${blockedDeps.join('、')}。请先完成前置，或让大副调整任务链。` }
  }
  if (busyWith !== undefined) {
    return { ok: false, reason: `工作区正被占用：任务 ${busyWith} 正在该工作区执行。同工作区的任务排队执行（避免互相踩踏）——请稍后重新领取，或先领取其他工作区的任务。` }
  }
  return { ok: true }
}
