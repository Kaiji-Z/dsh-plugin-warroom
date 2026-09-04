/**
 * The strategic board HTTP API (web compositions only): the war map tab's
 * data source. GET /warroom/api/board returns the cross-workspace projection
 * — every task with status/workspace/troops/reports — plus the unit roster;
 * POST /warroom/api/active toggles war mode (dashboard-side activation
 * mirrors the /war semantics: surface syncs before responding).
 * @module dsh-plugin-stardeck/dashboard
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { appendDirectiveEvent, chainHueSlot, deriveContinuation, loadDirectives, newDirectiveId, foldChains, pendingDirectives, readDirectiveEvents } from './directives.ts'
import type { ContinuationMode, ContinuationTaskFace } from './directives.ts'
import { appendEvent, listCampaignIds, loadCampaign, readEvents } from './events.ts'
import { appendThreadEvent, loadAttachedThreads } from './threads.ts'
import { nextRunOf, parseCron } from './schedule.ts'
import { queuePositionOf } from './rules.ts'
import type { Roster } from './units.ts'
import type { WarStore } from './state.ts'
import type { CampaignState } from './types.ts'
import { armPlanCard, runSpikeProbe, type SpikeDeps } from './v5spike.ts'
import { planApprovedNotice, planRejectedNotice } from './persona.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'
import { loadPlanets, registerPlanet } from './planets.ts'

/** Structural slice of the harness webServer route registry. */
export interface RouteRegistry {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }): () => void
}

/** Minimal structural req/res (Node-ish) — duck-typed, no host imports. */
interface ReqFace { method?: string; url?: string }
interface ResFace {
  setHeader?(k: string, v: string): void
  end(body?: string): void
  write?(chunk: string): unknown
  on?(event: string, cb: () => void): void
}

/** Read a request body as a string (the commands POST channel). */
function readBody(req: unknown): Promise<string> {
  return new Promise(resolve => {
    const r = req as { on?(event: string, cb: (chunk?: unknown) => void): void }
    const parts: string[] = []
    if (r.on === undefined) {
      resolve('')
      return
    }
    r.on('data', chunk => { parts.push(typeof chunk === 'string' ? chunk : String(chunk)) })
    r.on('end', () => resolve(parts.join('')))
  })
}

/**
 * Cheap board revision: a sha1 signature over the campaign logs' name+mtime+
 * size, the shared directive log, and the global state file. SSE frames carry
 * ONLY this — clients refetch the full projection when it moves (the
 * wire discipline: never ship task lists on the event channel).
 *
 * V9.11 R2: optional activitySalt folds the in-memory exec-activity verbs into
 * the revision (salt changes only when a VERB changes — same-verb tool streams
 * don't churn the SSE). Discipline intact: the channel still ships rev only.
 */
export function boardRevision(stateDir: string, activitySalt?: string): string {
  let sig = ''
  try {
    const dir = join(stateDir, 'campaigns')
    for (const f of readdirSync(dir).filter(x => x.endsWith('.jsonl')).sort()) {
      const st = statSync(join(dir, f))
      sig += `${f}:${st.mtimeMs}:${st.size};`
    }
  } catch {
    // No campaigns directory yet — an empty board still has a revision.
  }
  try {
    const st = statSync(join(stateDir, 'directives.jsonl'))
    sig += `directives:${st.mtimeMs}:${st.size};`
  } catch {
    // 未建账——空板仍有 revision。
  }
  try {
    const st = statSync(join(stateDir, 'planets.jsonl'))  // V18：星球注册入 revision（SSE 推板刷新）
    sig += `planets:${st.mtimeMs}:${st.size};`
  } catch {
    sig += 'directives:-;'
  }
  try {
    const st = statSync(join(stateDir, 'threads.jsonl'))
    sig += `threads:${st.mtimeMs}:${st.size};`
  } catch {
    sig += 'threads:-;'
  }
  try {
    const st = statSync(join(stateDir, 'state.json'))
    sig += `state:${st.mtimeMs}:${st.size}`
  } catch {
    sig += 'state:-'
  }
  if (activitySalt !== undefined) sig += `;activity:${activitySalt}`
  return createHash('sha1').update(sig).digest('hex').slice(0, 12)
}

export interface DashboardDeps {
  store: WarStore
  stateDir: string
  roster(): Roster
  /** War root (informational — the client no longer creates sessions here). */
  warRoot: string
  /** v5 R1 机制验证探针（flag `v5-spike`）。缺省 undefined → 探针路由
   * 404，宿主面行为与改前字节等价。 */
  spike?: SpikeDeps
  /** Feature flags（V5-R2 起 dashboard 需要判档位账本路由的开关）。 */
  flags?: FeatureFlags
  /** K17 计划判定回推：把舰长的批/驳结果投回大副会话（index 经 sessions
   * 面接线；缺席/失败 best-effort，不阻塞判定入账）。 */
  pushToStaff?: (sessionId: string, text: string) => void
  /** v3: fired after a command card is created — the host ticks the command
   * fuse NOW so the staff receives in ~1s instead of waiting out the 15s
   * interval. Optional so pure-route tests can omit it. */
  onCommandCreated?: () => void
  /** V9.11 R2 执行卡实时活动（只读）：session/event → 动词的内存滚动表。
   * 缺席时投影不带 activity 字段、revision 不含活动盐——纯路由测试可省略。 */
  activity?: {
    salt(): string
    snapshot(sessionId: string): { verb: string; label: string; ts: string } | null
  }
  /** V17 归档扇出：逐会话调宿主 workspaces.archiveSession（不可逆）。
   *  缺席 → /warroom/api/archive 报「宿主归档通道未接入」（Stop-if 探针）。 */
  archiveSession?: (sessionId: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>
  /** V17 归档核查（只读）：宿主当前会话 id 清单（A-③ 判据用）。缺席返回 null。 */
  listSessions?: () => Promise<string[] | null>
  /** V18 HQ 工作区注册弹窗：宿主 workspace.list（只读；缺席如实报 null）。 */
  listWorkspaces?: () => Promise<Array<{ workspaceId: string; path: string; title: string; sessionCount: number }> | null>
  /** V18 注册时把真实目录幂等收编进宿主 registry（best-effort，失败不阻塞）。 */
  registerHostWorkspace?: (path: string) => Promise<{ ok: boolean; title?: string }>
  /** B1-件② trace 端点的征召视角（只读）：内存态 spawned 守卫 + 去抖拒因表。
   *  缺席 → trace 的 conscription 字段如实 null（纯路由测试可省略）。 */
  conscription?: () => { spawned: readonly string[]; skips: Readonly<Record<string, string>> }
  /** B1-件⑥ 收官清理：链归档后对成员任务 worktree best-effort 释放（index 侧
   *  接 workspace.ts releaseTaskWorkspace）。缺席 → 归档照常、不清理。 */
  releaseWorkspace?: (path: string) => { ok: boolean; note: string }
}

const STATUS_ORDER: Record<CampaignState['status'], number> = { published: 0, in_progress: 1, reported: 2, draft: 3, failed: 4, closed: 5 }

/** The board projection served to the war map (pure — reusable by tests). */
export function boardProjection(stateDir: string, activityOf?: (sessionId: string) => { verb: string; label: string; ts: string } | null): Record<string, unknown>[] {
  const campaigns = listCampaignIds(stateDir)
    .map(id => loadCampaign(stateDir, id))
    .filter(t => t.startedAt !== '')
    .sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      || ((b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
      || (a.startedAt < b.startedAt ? -1 : 1))
  // V7-⑤ 排队位次的候选视图（与 index.ts 征召器同构：campaignId → taskId）。
  const asCandidate = (t: CampaignState) => ({ taskId: t.campaignId, status: t.status, workspacePath: t.workspacePath, priority: t.priority, startedAt: t.startedAt })
  const candidates = campaigns.map(asCandidate)
  return campaigns
    .map(task => {
      let nextRunAt: string | null = null
      if (task.schedule !== undefined && task.schedule.enabled) {
        const anchor = task.schedule.lastTriggeredAt !== undefined ? Date.parse(task.schedule.lastTriggeredAt) : Date.parse(task.startedAt)
        if (Number.isFinite(anchor)) {
          try {
            const next = nextRunOf(task.schedule.cron, anchor)
            if (next !== undefined) nextRunAt = new Date(next).toISOString()
          } catch { /* invalid stored cron — the projection stays null */ }
        }
      }
      return {
        taskId: task.campaignId,
        title: task.title ?? task.intent,
        status: task.status,
        priority: task.priority ?? 'normal',
        quality: task.quality ?? 'common',
        rounds: task.rounds,
        attempts: task.attempts,
        deps: task.deps ?? [],
        lastError: task.lastError ?? null,
        workspacePath: task.workspacePath ?? null,
        workspaceKind: task.workspaceKind ?? null,
        claimedBy: task.claimedBy ?? null,
        startedAt: task.startedAt,
        brief: task.brief ?? '',
        acceptance: task.acceptance ?? '',
        schedule: task.schedule === undefined ? null : { cron: task.schedule.cron, enabled: task.schedule.enabled, nextRunAt },
        // V7-⑤ 只读加料「为什么还没动」：征召排队位次（0=现在可征召）+
        // 配额暂停位。可选字段——既有消费者不读即不受影响（红线只禁写）。
        queueAhead: queuePositionOf(asCandidate(task), candidates),
        quotaPaused: task.quotaPaused === true,
        // Session cards: every commander attempt with its conversation id.
        // (Named attemptLog — `attempts` is already the numeric count.)
        // V9.11 R2: live attempts carry the exec-activity verb (read-only
        // projection add-on; absent when no tracker is wired).
        attemptLog: task.attemptLog.map(a => ({
          id: a.id,
          n: a.n,
          sessionId: a.sessionId,
          startedAt: a.startedAt,
          endedAt: a.endedAt ?? null,
          outcome: a.outcome ?? null,
          ...(a.outcome === undefined && activityOf !== undefined ? { activity: activityOf(a.sessionId) } : {}),
        })),
        troops: [...task.units.values()].map(u => ({
          childId: u.childId,
          label: u.label,
          unit: u.unitName,
          front: u.front,
          recalled: u.recalled !== undefined,
          settled: u.settled !== undefined,
          lastReport: u.lastReport ?? null,
        })),
        deliverables: task.deliverables.map(d => ({ kind: d.kind, summary: d.summary, detail: d.detail ?? null, ts: d.ts })),
        reports: task.reports.map(r => ({ ts: r.ts, from: r.from, text: r.text, evidence: r.evidence ?? null })),
        comments: task.comments.map(c => ({ ts: c.ts, from: c.from, text: c.text })),
        closedVerdict: task.closedVerdict ?? null,
      }
    })
}

/** A scheduled bounty the 30s tick must act on right now. Pure. */
export interface DueBounty {
  readonly taskId: string
  /** true = open the next round; false = previous round still busy, skip. */
  readonly openRound: boolean
  readonly reason: string
}

/**
 * Which cron bounties are due at `nowMs`? The anchor is the LAST trigger (or
 * task creation), so a long gap collapses into one fire — 错过即跳过, never
 * backfill (the anti-burn rule).
 */
export function dueBounties(stateDir: string, nowMs: number): DueBounty[] {
  const out: DueBounty[] = []
  for (const id of listCampaignIds(stateDir)) {
    const task = loadCampaign(stateDir, id)
    if (task.startedAt === '' || task.schedule === undefined || !task.schedule.enabled) continue
    const anchor = task.schedule.lastTriggeredAt !== undefined ? Date.parse(task.schedule.lastTriggeredAt) : Date.parse(task.startedAt)
    if (!Number.isFinite(anchor)) continue
    try {
      const next = nextRunOf(task.schedule.cron, anchor)
      if (next !== undefined && next <= nowMs) {
        const busy = task.status === 'published' || task.status === 'in_progress' || task.status === 'reported'
        out.push(busy
          ? { taskId: id, openRound: false, reason: `上一轮尚未收官，本次到点跳过、不补跑` }
          : { taskId: id, openRound: true, reason: '到点重开任务令' })
      }
    } catch {
      // Stored cron turned invalid — publish-time validation already guards new ones.
    }
  }
  return out
}

/** The 命令区 projection served to the war map (pure — reusable by tests). */
export function directiveProjection(stateDir: string): Record<string, unknown>[] {
  const directives = loadDirectives(stateDir)
  // V10 战线链身份：一次祖先闭包喂全部命令卡（世代/链根/链长/链色槽）。
  const chains = foldChains(directives)
  return directives.map(d => {
    // V9.2 定时下达：未发（dispatchedAt 空）才报 nextRunAt——发完即常轨命令。
    let nextRunAt: string | null = null
    if (d.schedule !== undefined && d.schedule.dispatchedAt === undefined) {
      try {
        const next = nextRunOf(d.schedule.cron, Date.parse(d.createdAt))
        if (next !== undefined) nextRunAt = new Date(next).toISOString()
      } catch { /* invalid stored cron — projection stays null */ }
    }
    return {
      commandId: d.id,
      text: d.text,
      name: d.name ?? null,
      createdAt: d.createdAt,
      status: d.status,
      staffSessionId: d.staffSessionId ?? null,
      taskId: d.taskId ?? null,
      cancelledReason: d.cancelledReason ?? null,
      // V5 档位账本：档位/理由/置信度/舰长改档次数（未分诊为 null）。
      grade: d.grade ?? null,
      gradeReason: d.gradeReason ?? null,
      gradeConfidence: d.gradeConfidence ?? null,
      regrades: d.regrades ?? 0,
      // V5-R3 计划态：当前计划文本与判定状态（未呈报为 null）。
      plan: d.plan === undefined ? null : { text: d.plan.text, status: d.plan.status, decidedAt: d.plan.decidedAt ?? null },
      // V9.2 定时下达（未定时为 null）。
      schedule: d.schedule === undefined
        ? null
        : { cron: d.schedule.cron, dispatchedAt: d.schedule.dispatchedAt ?? null, nextRunAt },
      // V10 战线链身份（初代也给 chain 对象——generation=1 客户端免分支）。
      chain: (() => {
        const gen = chains.generationOf.get(d.id) ?? 1
        const rootId = chains.rootByCommand.get(d.id) ?? d.id
        const length = chains.membersOfRoot.get(rootId)?.length ?? 1
        return { generation: gen, rootId, length, hueSlot: chainHueSlot(rootId) }
      })(),
      continuation: d.continuation === undefined ? null : { mode: d.continuation.mode },
      // V17 归档（未入档为 null）：宿主会话已 archiveSession 的账面痕迹。
      archived: d.archived === undefined ? null : { at: d.archived.at, sessions: d.archived.sessions },
    }
  })
}

/**
 * B1-件② 单命令追踪投影（纯，只读——板是读投影红线内的调试面）：命令摘要 +
 * 该命令的原始 directive 事件时间线 + 关联任务（复用板投影：attemptLog /
 * queueAhead / quotaPaused 全在）+ 其原始 campaign 事件 + 引信/征召视角。
 * 缺参 400；未知命令 404。
 */
export function traceProjection(
  stateDir: string,
  commandId: string,
  conscription?: { spawned: readonly string[]; skips: Readonly<Record<string, string>> },
): { ok: false; code: 400 | 404; error: string } | { ok: true; command: Record<string, unknown>; timeline: { directive: unknown[]; campaign: unknown[] }; task: Record<string, unknown> | null; fuse: { pendingRelay: boolean; scheduledPending: boolean }; conscription: { spawned: readonly string[]; skips: Readonly<Record<string, string>>; spawnedForTask: boolean; skipReasonForTask: string | null } | null } {
  if (commandId === '') return { ok: false, code: 400, error: '缺少 commandId（用法：/warroom/api/trace?commandId=<命令号>）。' }
  const d = loadDirectives(stateDir).find(x => x.id === commandId)
  if (d === undefined) return { ok: false, code: 404, error: `命令 ${commandId} 不存在。` }
  const campaignEvents = d.taskId !== undefined ? readEvents(stateDir, d.taskId) : []
  const task = d.taskId !== undefined
    ? (boardProjection(stateDir) as Array<Record<string, unknown>>).find(t => t.taskId === d.taskId) ?? null
    : null
  return {
    ok: true,
    command: {
      id: d.id, text: d.text, name: d.name ?? null, createdAt: d.createdAt, status: d.status,
      staffSessionId: d.staffSessionId ?? null, taskId: d.taskId ?? null,
      grade: d.grade ?? null, gradeReason: d.gradeReason ?? null,
      plan: d.plan === undefined ? null : { status: d.plan.status, text: d.plan.text },
      schedule: d.schedule === undefined ? null : { cron: d.schedule.cron, dispatchedAt: d.schedule.dispatchedAt ?? null },
      continuation: d.continuation === undefined ? null : { mode: d.continuation.mode, parentId: d.continuation.parentId },
      cancelledReason: d.cancelledReason ?? null,
    },
    timeline: {
      directive: readDirectiveEvents(stateDir).filter(e => e.directiveId === commandId),
      campaign: campaignEvents,
    },
    task,
    // 引信视角：draft 且未到点的定时令是引信可见的待转达量。
    fuse: {
      pendingRelay: pendingDirectives([d]).length > 0,
      scheduledPending: d.schedule !== undefined && d.schedule.dispatchedAt === undefined,
    },
    conscription: conscription === undefined ? null : {
      spawned: conscription.spawned,
      skips: conscription.skips,
      spawnedForTask: d.taskId !== undefined && conscription.spawned.includes(d.taskId),
      skipReasonForTask: (d.taskId !== undefined ? conscription.skips[d.taskId] : undefined) ?? null,
    },
  }
}

/**
 * Register `/warroom` routes on the web server.
 * @returns the registration disposer.
 */
/**
 * V19 战报可读性回流（stardeck）：产物板内预览的双重限界守卫——ws 须在 war_root
 * 管辖内、name 须是 ws 内的相对路径（绝对路径/`..` 穿越/跨任务串门全拒）。
 * 纯函数，dashboard-routes 测试直测。
 */
export function workspaceFileGuardError(warRoot: string, ws: string, name: string): string | null {
  if (ws.trim() === '' || name.trim() === '') return '缺少工作区或文件名参数'
  // name 必须是相对路径：绝对路径（盘符/根斜杠）显式拒绝——join 不重置绝对段，
  // 会拼出「ws/C:/x」这类怪路径（stat 必败），语义上仍按穿越面拒掉。
  if (/^[a-zA-Z]:[\\/]/.test(name) || name.startsWith('/') || name.startsWith('\\')) return '文件路径越出工作区（拒绝路径穿越）'
  const root = resolve(warRoot)
  const wsAbs = resolve(ws)
  const file = resolve(join(wsAbs, name))
  const inside = (base: string, target: string): boolean => target === base || target.startsWith(base + sep)
  if (!inside(root, wsAbs)) return '该工作区不在 war_root 管辖内，拒绝访问'
  if (!inside(wsAbs, file)) return '文件路径越出工作区（拒绝路径穿越）'
  return null
}

export function registerDashboard(webServer: RouteRegistry, deps: DashboardDeps): () => void {
  const handler = async (req: unknown, res: unknown): Promise<void> => {
    const r = req as ReqFace
    const w = res as ResFace
    const pathname = new URL(r.url ?? '/', 'http://local').pathname
    const send = (code: number, body: unknown): void => {
      w.setHeader?.('content-type', 'application/json; charset=utf-8')
      w.end(JSON.stringify(body))
      void code
    }
    try {
      if (r.method === 'GET' && pathname === '/warroom/api/board') {
        send(200, {
          ok: true,
          active: deps.store.get().active,
          warRoot: deps.warRoot,
          hqSessionId: deps.store.get().hqSessionId ?? null,
          revision: boardRevision(deps.stateDir, deps.activity?.salt()),
          commands: directiveProjection(deps.stateDir),
          tasks: boardProjection(deps.stateDir, deps.activity?.snapshot.bind(deps.activity)),
          threads: loadAttachedThreads(deps.stateDir).map(t => ({ sessionId: t.sessionId, note: t.note, attachedAt: t.attachedAt })),
          roster: deps.roster().units.map(u => ({ name: u.name, label: u.label, description: u.description, sandboxMode: u.sandboxMode, source: u.source })),
          rosterErrors: deps.roster().errors,
          planets: loadPlanets(deps.stateDir),
        })
        return
      }
      if (r.method === 'GET' && pathname === '/warroom/api/host-workspaces') {
        // V18 HQ 点击弹窗数据源：宿主 registry 全量工作区（只读）。
        if (deps.listWorkspaces === undefined) {
          send(501, { ok: false, error: '宿主工作区清单暂不可用。' })
          return
        }
        const workspaces = await deps.listWorkspaces()
        if (workspaces === null) {
          send(501, { ok: false, error: '宿主工作区清单暂不可用。' })
          return
        }
        send(200, { ok: true, workspaces })
        return
      }
      if (r.method === 'GET' && pathname === '/warroom/api/workspace/file') {
        // V19 战报可读性回流：产物板内预览（只读端点）。双重限界见 workspaceFileGuardError；
        // 大小封顶 512KB；首 1KB 含 NUL 判二进制（板面不渲染，指路「打开所在文件夹」）。
        const q = new URL(r.url ?? '/', 'http://local').searchParams
        const ws = q.get('ws') ?? ''
        const name = q.get('name') ?? ''
        const guardErr = workspaceFileGuardError(deps.warRoot, ws, name)
        if (guardErr !== null) { send(403, { ok: false, error: guardErr }); return }
        const file = resolve(join(resolve(ws), name))
        try {
          const st = statSync(file)
          if (!st.isFile()) { send(404, { ok: false, error: '不是文件（可能是目录）' }); return }
          if (st.size > 512 * 1024) { send(413, { ok: false, error: '文件超过 512KB，请用「打开所在文件夹」查看' }); return }
          const content = readFileSync(file, 'utf8')
          const binary = content.slice(0, 1024).includes('\0')
          send(200, { ok: true, path: file, name, size: st.size, binary, content: binary ? '' : content })
        } catch {
          send(404, { ok: false, error: '文件不存在或不可读' })
        }
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/workspace/reveal') {
        // V19 战报可读性回流：本机资源管理器落到产物所在目录（不开任何写通道
        // ——账本零改动）。限界与 file 端点同一守卫；无 name=直接开工作区目录。
        const body = JSON.parse(await readBody(r)) as { ws?: unknown; name?: unknown }
        const ws = typeof body.ws === 'string' ? body.ws : ''
        const name = typeof body.name === 'string' ? body.name : ''
        const guardErr = workspaceFileGuardError(deps.warRoot, ws, name === '' ? 'x' : name)
        if (guardErr !== null && name === '') {
          if (ws.trim() === '') { send(403, { ok: false, error: '缺少工作区参数' }); return }
          const root = resolve(deps.warRoot), wsAbs = resolve(ws)
          if (!(wsAbs === root || wsAbs.startsWith(root + sep))) { send(403, { ok: false, error: '该工作区不在 war_root 管辖内，拒绝访问' }); return }
        } else if (guardErr !== null) { send(403, { ok: false, error: guardErr }); return }
        const target = name === '' ? resolve(ws) : resolve(join(resolve(ws), name))
        let dir = target
        try { if (statSync(target).isFile()) dir = join(target, '..') } catch { /* 目标缺席也允许开目录（资源管理器自己给反馈） */ }
        const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open'
        try {
          const p = spawn(opener, [dir], { detached: true, stdio: 'ignore' })
          p.unref()
          send(200, { ok: true, dir })
        } catch (err) {
          send(500, { ok: false, error: `打开目录失败：${err instanceof Error ? err.message : String(err)}` })
        }
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/planets') {
        // V18 注册工作区为星球：闸=磁盘真实目录（舰长令：星球不得是「不存在
        // 文件夹的行星」）；宿主 registry 收编 best-effort（幂等 create）。
        const body = JSON.parse(await readBody(r)) as { path?: unknown; title?: unknown }
        const path = typeof body.path === 'string' ? body.path.trim() : ''
        const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : null
        if (path === '') { send(400, { ok: false, error: '缺少工作区路径。' }); return }
        let isDir = false
        try { isDir = statSync(path).isDirectory() } catch { isDir = false }
        if (!isDir) { send(400, { ok: false, error: `不是真实目录：${path}` }); return }
        let hostTitle: string | null = title
        if (deps.registerHostWorkspace !== undefined) {
          const r2 = await deps.registerHostWorkspace(path)
          if (r2.ok && r2.title !== undefined) hostTitle = hostTitle ?? r2.title
        }
        const planets = registerPlanet(deps.stateDir, path, hostTitle)
        send(200, { ok: true, planets })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands') {
        // The 命令区 + button: create a draft command card; the command fuse
        // relays it into the staff conversation within 15s. V9.2: optional
        // cron = 定时下达（到点 tick 补 dispatched 后引信才取；一次性）。
        // V10: 可选 continuesFrom = 战线续接——父命令必须存在，续接模式按
        // 其当时状态冻结（嫁接是历史不是开关）；推导失败给明确拒绝理由。
        const body = JSON.parse(await readBody(r)) as { text?: unknown; cron?: unknown; continuesFrom?: unknown; name?: unknown }
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        // V15 战线命名（可选，≤24 字；舰长下达时给，不填=命令原文当战线名）。
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : ''
        if (text === '') {
          send(400, { ok: false, error: '命令内容为空：请用一句大白话写下舰长的意图。' })
          return
        }
        if (text.length > 2000) {
          send(400, { ok: false, error: '命令太长（>2000 字）：请拆成多道命令分别下达。' })
          return
        }
        let cron: string | undefined
        if (body.cron !== undefined && body.cron !== null && body.cron !== '') {
          if (typeof body.cron !== 'string') {
            send(400, { ok: false, error: 'cron 必须是字符串（5 段：分 时 日 月 周，如 "0 9 * * *"）。' })
            return
          }
          try {
            parseCron(body.cron)
          } catch (err) {
            send(400, { ok: false, error: err instanceof Error ? err.message : 'cron 表达式不合法。' })
            return
          }
          cron = body.cron.trim()
        }
        let continuesFrom: string | undefined
        let continuationMode: ContinuationMode | undefined
        let pivotTargetSessionId: string | undefined
        if (body.continuesFrom !== undefined && body.continuesFrom !== null && body.continuesFrom !== '') {
          if (typeof body.continuesFrom !== 'string') {
            send(400, { ok: false, error: 'continuesFrom 必须是父命令号字符串。' })
            return
          }
          const parentId = body.continuesFrom.trim()
          const parent = loadDirectives(deps.stateDir).find(d => d.id === parentId)
          if (parent === undefined) {
            send(400, { ok: false, error: `要续接的命令 ${parentId} 不存在。` })
            return
          }
          let taskFace: ContinuationTaskFace | undefined
          if (parent.taskId !== undefined) {
            try {
              const camp = loadCampaign(deps.stateDir, parent.taskId)
              if (camp.startedAt !== '') {
                const recent = [...camp.attemptLog].reverse()
                taskFace = {
                  status: camp.status,
                  lastOutcome: recent.find(a => a.outcome !== undefined)?.outcome,
                  liveAttemptSessionId: recent.find(a => a.endedAt === undefined)?.sessionId,
                }
              }
            } catch { /* 无此任务账本 → taskFace 留空走统一拒绝口径 */ }
          }
          const derived = deriveContinuation(parent, taskFace)
          if ('error' in derived) {
            send(400, { ok: false, error: derived.error })
            return
          }
          continuesFrom = parentId
          continuationMode = derived.mode
          pivotTargetSessionId = derived.targetSessionId
        }
        const commandId = newDirectiveId()
        appendDirectiveEvent(deps.stateDir, {
          type: 'directive_created', ts: new Date().toISOString(), directiveId: commandId, text,
          ...(cron !== undefined ? { cron } : {}),
          ...(continuesFrom !== undefined ? { continuesFrom } : {}),
          ...(continuationMode !== undefined ? { continuationMode } : {}),
          ...(name !== '' ? { name } : {}),
        })
        // 定时命令不立即引信——到点 dispatched 后 15s 引信自会接手。
        if (cron === undefined) deps.onCommandCreated?.()
        send(200, {
          ok: true, commandId,
          ...(cron !== undefined ? { scheduled: true } : {}),
          ...(continuationMode !== undefined ? { continuationMode, ...(pivotTargetSessionId !== undefined ? { pivotTargetSessionId } : {}) } : {}),
        })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/threads') {
        // v3 挂载: pin an externally-created session onto the battlefield as
        // an「外部」card. Registry only — never writes into the session.
        const body = JSON.parse(await readBody(r)) as { sessionId?: unknown; note?: unknown }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        const note = typeof body.note === 'string' ? body.note.trim() : ''
        if (sessionId === '' || sessionId.length > 200) {
          send(400, { ok: false, error: '会话号不能为空（且不超过 200 字符）：请贴入要挂载的 thread 会话号。' })
          return
        }
        if (note.length > 500) {
          send(400, { ok: false, error: '备注太长（>500 字）：一句话说明这个 thread 在干什么即可。' })
          return
        }
        appendThreadEvent(deps.stateDir, { type: 'thread_attached', ts: new Date().toISOString(), sessionId, note })
        send(200, { ok: true, sessionId })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/threads/detach') {
        const body = JSON.parse(await readBody(r)) as { sessionId?: unknown }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        if (sessionId === '') {
          send(400, { ok: false, error: '缺少会话号。' })
          return
        }
        appendThreadEvent(deps.stateDir, { type: 'thread_detached', ts: new Date().toISOString(), sessionId })
        send(200, { ok: true, sessionId })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands/talking') {
        // Fired by the client when the user opens the staff conversation
        // from a received command card — the card flips to 对话中.
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.status === 'received') {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_talking', ts: new Date().toISOString(), directiveId: directive.id })
        }
        send(200, { ok: true, status: directive.status })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands/regrade') {
        // V5-R2 档位账本（flag staff-triage）：舰长在命令卡上升降档。
        // 旗关 → 404，与改前等价。
        if (deps.flags === undefined || !featureEnabled(deps.flags, 'staff-triage')) {
          send(404, { ok: false, error: `路由不存在：${r.method ?? 'GET'} ${pathname}` })
          return
        }
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown; grade?: unknown; reason?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        const grade = typeof body.grade === 'string' ? body.grade.trim() : ''
        const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : '舰长命令卡升降档'
        if (commandId === '') {
          send(400, { ok: false, error: '缺少命令号。' })
          return
        }
        if (grade !== 'L0' && grade !== 'L1' && grade !== 'L2') {
          send(400, { ok: false, error: '档位必须是 L0 / L1 / L2。' })
          return
        }
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.status === 'approved' || directive.status === 'cancelled') {
          send(400, { ok: false, error: `命令 ${commandId} 已${directive.status === 'approved' ? '批准出任务' : '取消'}，档位不再变更。` })
          return
        }
        if (directive.grade === undefined) {
          send(400, { ok: false, error: `命令 ${commandId} 尚未分诊——等大副完成第一轮分诊后再升降档。` })
          return
        }
        appendDirectiveEvent(deps.stateDir, { type: 'directive_regraded', ts: new Date().toISOString(), directiveId: commandId, grade, reason })
        send(200, { ok: true, commandId, grade })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/commands/plan') {
        // V5-R3 计划判定（flag staff-plan）：舰长在命令卡上批准/驳回计划草案。
        if (deps.flags === undefined || !featureEnabled(deps.flags, 'staff-plan')) {
          send(404, { ok: false, error: `路由不存在：${r.method ?? 'GET'} ${pathname}` })
          return
        }
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown; decision?: unknown; note?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        const decision = typeof body.decision === 'string' ? body.decision.trim() : ''
        const note = typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : undefined
        if (commandId === '') {
          send(400, { ok: false, error: '缺少命令号。' })
          return
        }
        if (decision !== 'approve' && decision !== 'reject') {
          send(400, { ok: false, error: '判定只接受 approve（批准）或 reject（驳回）。' })
          return
        }
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.plan === undefined || directive.plan.status !== 'pending') {
          send(400, { ok: false, error: `命令 ${commandId} 无待批计划（当前：${directive.plan === undefined ? '未呈报' : directive.plan.status}）。` })
          return
        }
        if (decision === 'approve') {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_plan_approved', ts: new Date().toISOString(), directiveId: commandId, ...(note !== undefined ? { note } : {}) })
        } else {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_plan_rejected', ts: new Date().toISOString(), directiveId: commandId, reason: note ?? '舰长驳回，请修订重呈' })
        }
        // K17 判定回推：大副会话在等判定结果——投递 best-effort，失败不阻塞入账
        // （下一次呈报/唤醒还会碰头）。仅在大副会话存在时投。
        if (directive.staffSessionId !== undefined && directive.staffSessionId !== '' && deps.pushToStaff !== undefined) {
          deps.pushToStaff(directive.staffSessionId, decision === 'approve' ? planApprovedNotice(note) : planRejectedNotice(note ?? '请修订重呈'))
        }
        send(200, { ok: true, commandId, decision })
        return
      }
      if (r.method === 'POST' && pathname === '/warroom/api/archive') {
        // V17 归档：链全终局的命令批量 archiveSession 全部相关会话并落
        // directive_archived。三道闸：存在 → 未入档 → 链全终局；扇出逐会话
        // 记账，部分失败如实返回（不假装全成）。
        if (deps.archiveSession === undefined) {
          send(501, { ok: false, error: '宿主归档通道未接入（archiveSession 面缺席）。' })
          return
        }
        const body = JSON.parse(await readBody(r)) as { commandId?: unknown }
        const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
        if (commandId === '') {
          send(400, { ok: false, error: '缺少命令号。' })
          return
        }
        const directives = loadDirectives(deps.stateDir)
        const directive = directives.find(d => d.id === commandId)
        if (directive === undefined) {
          send(404, { ok: false, error: `命令 ${commandId} 不存在。` })
          return
        }
        if (directive.archived !== undefined) {
          send(400, { ok: false, error: `命令 ${commandId} 已归档。` })
          return
        }
        // 链全终局闸：链上每条命令要么 cancelled，要么其任务已 closed/failed。
        const chains = foldChains(directives)
        const rootId = chains.rootByCommand.get(commandId) ?? commandId
        const members = chains.membersOfRoot.get(rootId) ?? [commandId]
        const campaigns = new Map(listCampaignIds(deps.stateDir).map(id => [id, loadCampaign(deps.stateDir, id)]))
        const memberTerminal = (m: { status: string; taskId?: string }): boolean => {
          if (m.status === 'cancelled') return true
          if (m.taskId === undefined) return false
          const st = campaigns.get(m.taskId)?.status
          return st === 'closed' || st === 'failed'
        }
        const membersView = members.map(id => directives.find(d => d.id === id)).filter(d => d !== undefined)
        const notTerminal = membersView.filter(m => !memberTerminal(m))
        if (notTerminal.length > 0) {
          send(400, { ok: false, error: `战线未全终局，不可归档（卡在：${notTerminal.map(m => m.id).join('、')}）。` })
          return
        }
        // 会话清单：每条成员的大副会话 + 任务全部尝试会话（外部挂载 thread 不动）。
        const sessions: string[] = []
        for (const m of membersView) {
          if (m.staffSessionId !== undefined) sessions.push(m.staffSessionId)
          if (m.taskId !== undefined) {
            for (const a of campaigns.get(m.taskId)?.attemptLog ?? []) {
              if (a.sessionId !== '') sessions.push(a.sessionId)
            }
          }
        }
        const unique = [...new Set(sessions)]
        const failed: Array<{ sessionId: string; code: string; message: string }> = []
        const done: string[] = []
        // V17：扇出并行（会话互不依赖；宿主 registry 内部自会串行落盘）——
        // 单 RPC 有 15s 超时界（index 侧），整链最坏 ≈ 一个超时窗而非逐会话累加。
        const results = await Promise.all(unique.map(async sessionId => ({ sessionId, r: await deps.archiveSession(sessionId) })))
        for (const { sessionId, r } of results) {
          if (r.ok) done.push(sessionId)
          else failed.push({ sessionId, code: r.code, message: r.message })
        }
        if (unique.length > 0 && done.length === 0) {
          send(502, { ok: false, error: '宿主归档全部失败。', failed })
          return
        }
        appendDirectiveEvent(deps.stateDir, { type: 'directive_archived', ts: new Date().toISOString(), directiveId: commandId, sessions: done })
        // B1-件⑥ 收官清理：链归档后对成员任务的 auto+repo worktree best-effort
        // 释放（bound/instance/普通目录由 releaseTaskWorkspace 自行判否留置；
        // 成败都落 workspace_released 事件，随响应如实返回）。
        const released: Array<{ taskId: string; path: string; ok: boolean; note: string }> = []
        if (deps.releaseWorkspace !== undefined) {
          for (const m of membersView) {
            if (m.taskId === undefined) continue
            const wsPath = campaigns.get(m.taskId)?.workspacePath
            if (wsPath === undefined) continue
            const r = deps.releaseWorkspace(wsPath)
            appendEvent(deps.stateDir, { type: 'workspace_released', ts: new Date().toISOString(), campaignId: m.taskId, path: wsPath, ok: r.ok, note: r.note })
            released.push({ taskId: m.taskId, path: wsPath, ok: r.ok, note: r.note })
          }
        }
        send(200, { ok: true, commandId, archived: done.length, failed, ...(released.length > 0 ? { released } : {}) })
        return
      }
      if (r.method === 'GET' && pathname === '/warroom/api/host-sessions') {
        // V17 归档核查（只读）：宿主当前会话 id 清单——归档后这些 id 应消失。
        if (deps.listSessions === undefined) {
          send(501, { ok: false, error: '宿主会话清单未接入（listSessions 面缺席）。' })
          return
        }
        const ids = await deps.listSessions()
        if (ids === null) {
          send(501, { ok: false, error: '宿主会话清单缺席（sessions.list 面不可用）。' })
          return
        }
        send(200, { ok: true, sessions: ids })
        return
      }
      if (r.method === 'GET' && pathname === '/warroom/api/trace') {
        // B1-件② 命令追踪（只读调试面）：单命令全事件时间线 + 引信/征召视角。
        const query = new URL(r.url ?? '/', 'http://local').searchParams
        const result = traceProjection(deps.stateDir, (query.get('commandId') ?? '').trim(), deps.conscription?.())
        if (!result.ok) {
          send(result.code, { ok: false, error: result.error })
          return
        }
        send(200, result)
        return
      }
      if (r.method === 'GET' && pathname === '/warroom/api/events') {
        const sse = w as ResFace
        if (typeof sse.write !== 'function') {
          send(501, { ok: false, error: '此连接不支持事件流（SSE）' })
          return
        }
        sse.setHeader?.('content-type', 'text/event-stream; charset=utf-8')
        sse.setHeader?.('cache-control', 'no-cache')
        sse.setHeader?.('connection', 'keep-alive')
        sse.setHeader?.('x-accel-buffering', 'no')
        let last = boardRevision(deps.stateDir, deps.activity?.salt())
        sse.write('retry: 3000\n\n')
        sse.write(`data: ${JSON.stringify({ rev: last })}\n\n`)
        const watch = setInterval(() => {
          try {
            const rev = boardRevision(deps.stateDir, deps.activity?.salt())
            if (rev !== last) {
              last = rev
              sse.write(`data: ${JSON.stringify({ rev })}\n\n`)
            } else {
              sse.write(': ping\n\n')
            }
          } catch {
            // Never let a stat hiccup kill the stream.
          }
        }, 1000)
        sse.on?.('close', () => clearInterval(watch))
        return
      }
      if (deps.spike !== undefined && pathname === '/warroom/api/v5-spike') {
        // v5 R1 机制验证探针（flag v5-spike）：GET = 宿主面可用性快照；
        // POST {sessionId} = 全链探针；POST {action:'planCard', sessionId}
        // = 切 plan mode + 投呈报提示（评审卡截图用）。旗关则整个路由不存在。
        if (r.method === 'GET') {
          send(200, { ok: true, availability: deps.spike.availability() })
          return
        }
        if (r.method === 'POST') {
          const body = JSON.parse(await readBody(r)) as { sessionId?: unknown; action?: unknown; text?: unknown }
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
          if (sessionId === '' || sessionId.length > 200) {
            send(400, { ok: false, error: '缺少 sessionId（贴一个活体会话号，≤200 字符）。' })
            return
          }
          if (body.action === 'planCard') {
            send(200, await armPlanCard(deps.spike, sessionId, typeof body.text === 'string' && body.text.trim() !== '' ? body.text.trim() : undefined))
            return
          }
          send(200, await runSpikeProbe(deps.spike, sessionId))
          return
        }
      }
      send(404, { ok: false, error: `路由不存在：${r.method ?? 'GET'} ${pathname}` })
    } catch (err) {
      send(500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return webServer.register({ kind: 'prefix', path: '/warroom', handler })
}
