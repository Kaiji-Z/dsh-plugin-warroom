/**
 * The sovereign's directive feed (命令区) — v2.0. Natural-language commands
 * created from the board UI, relayed to the staff by the host command
 * fuse, and resolved either into a published task (approved) or dropped
 * (cancelled). One append-only JSONL log at `<stateDir>/directives.jsonl`,
 * folded on read — the same discipline as the campaign logs (never
 * overwrite, derive state).
 * @module dsh-plugin-warroom/directives
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextRunOf } from './schedule.ts'
import type { TaskStatus } from './types.ts'

/** Directive lifecycle on the 命令区 board column. */
export type DirectiveStatus = 'draft' | 'received' | 'talking' | 'approved' | 'cancelled'

/** V10 战线续接模式——创建时按父命令当时的战线状态冻结（嫁接是历史不是开关）：
 * deepen=接已终态的成功仗深化、retry=接败仗再战、pivot=插入进行中的执行会话。 */
export type ContinuationMode = 'deepen' | 'retry' | 'pivot'

/** V5 autonomy grade — L0 直发 / L1 计划后做 / L2 澄清收敛后计划（SPEC §1）。 */
export type DirectiveGrade = 'L0' | 'L1' | 'L2'

/** Sovereign override markers baked into the command text (SPEC §0 档位覆写)：
 * `!!直接做` forces L0, `??先看方案` forces L2 — they outrank the staff's
 * suggestion, host-side enforced (never trust the model to honor them). */
export function overrideMarkerOf(text: string): { grade: DirectiveGrade; marker: '!!' | '??' } | undefined {
  if (text.includes('??先看方案')) return { grade: 'L2', marker: '??' }
  if (text.includes('!!直接做')) return { grade: 'L0', marker: '!!' }
  return undefined
}

/** One sovereign command, folded from the directive log. */
export interface Directive {
  readonly id: string
  /** The sovereign's natural-language text, verbatim. */
  readonly text: string
  readonly createdAt: string
  status: DirectiveStatus
  /** The 大副部 session that took the command (set on receive). */
  staffSessionId?: string
  /** The task this directive became (set on approval). */
  taskId?: string
  /** Cancellation reason (set on cancel). */
  cancelledReason?: string
  /** V5 档位账本：当前生效档位（triaged 首落，regraded 可改）。 */
  grade?: DirectiveGrade
  /** 分诊/改档理由（最新一条）。 */
  gradeReason?: string
  /** 分诊置信度（0-1，大副自报；regrade 不改它）。 */
  gradeConfidence?: number
  /** 舰长改档次数（审计）。 */
  regrades?: number
  /** V5-R3 计划态：当前待批/已批/被驳的计划（最新一次呈报）。 */
  plan?: { text: string; status: 'pending' | 'approved' | 'rejected'; decidedAt?: string }
  /** V6 命令拆解（flag staff-decompose）：大副呈批的结构化拆解（最新一稿）。
   *  plan 卡走既有计划态；本字段是机器可读的子任务书，成链发布时逐个落地。 */
  decomposition?: { plan: string; tasks: Array<{ title: string; brief: string; acceptance: string }> }
  /** V9.2 定时下达：created 带 cron 即待发（dispatchedAt 空时引信不取）；
   *  到点 tick 补 directive_dispatched 后回归常轨（一次性，不循环）。 */
  schedule?: { cron: string; dispatchedAt?: string }
  /** V10 战线链：本命令所续接的父命令号（缺省=初代）。append-only 历史零迁移。 */
  readonly continuesFrom?: string
  /** V10 续接意图（与 continuesFrom 同源冻结；pivot 的实际投递由引信分路）。 */
  readonly continuation?: { readonly mode: ContinuationMode; readonly parentId: string }
  /** V15 战线命名：舰长下达时可选（不填=命令原文当战线名）。 */
  readonly name?: string
}

/** The directive log's entry union (one JSON line each). */
export type DirectiveEvent =
  | { type: 'directive_created'; ts: string; directiveId: string; text: string; cron?: string;
      /** V10 战线续接：可选嫁接指针 + 冻结模式（旧日志无此字段照常 fold=初代）。 */
      continuesFrom?: string; continuationMode?: ContinuationMode; /** V15 战线命名（可选，不填=命令原文当战线名）。 */ name?: string }
  | { type: 'directive_dispatched'; ts: string; directiveId: string }
  | { type: 'directive_session_opened'; ts: string; directiveId: string; staffSessionId: string }
  | { type: 'directive_received'; ts: string; directiveId: string; staffSessionId: string }
  | { type: 'directive_talking'; ts: string; directiveId: string }
  | { type: 'directive_triaged'; ts: string; directiveId: string; grade: DirectiveGrade; reason: string; confidence?: number; suggested?: DirectiveGrade; override?: '!!' | '??' }
  | { type: 'directive_regraded'; ts: string; directiveId: string; grade: DirectiveGrade; reason: string }
  // V5-R3 计划态（插件自建——R1 定案：宿主 plan-mode 宿主面不可达）：
  // opened 落计划草案（重复呈报即覆盖待批稿）；approved/rejected 是舰长
  // 判定（decision 路由落地）。发布硬门只认 approved。
  | { type: 'directive_plan_opened'; ts: string; directiveId: string; plan: string }
  | { type: 'directive_plan_approved'; ts: string; directiveId: string; note?: string }
  | { type: 'directive_plan_rejected'; ts: string; directiveId: string; reason: string }
  // V6 命令拆解（flag staff-decompose）：结构化拆解随计划稿一并呈批——
  // plan 态走既有事件，decomposed 只存机器可读子任务书（成链发布用）。
  | { type: 'directive_decomposed'; ts: string; directiveId: string; plan: string; tasks: Array<{ title: string; brief: string; acceptance: string }> }
  // V5-R3 goal 代管入账：大副状态机 goal（永远 disarm）开/收的审计痕迹。
  | { type: 'directive_goal_opened'; ts: string; directiveId: string; goalId: string; disarmed: boolean }
  | { type: 'directive_goal_settled'; ts: string; directiveId: string; goalId: string }
  | { type: 'directive_approved'; ts: string; directiveId: string; taskId: string }
  | { type: 'directive_cancelled'; ts: string; directiveId: string; reason: string }

/** Terminal statuses — later transitions are ignored (a published command
 * cannot be re-approved, a cancelled one cannot resurrect). */
const TERMINAL: ReadonlySet<DirectiveStatus> = new Set(['approved', 'cancelled'])

function directivesFile(stateDir: string): string {
  return join(stateDir, 'directives.jsonl')
}

/** Append one event as a JSON line to the shared directive log. */
export function appendDirectiveEvent(stateDir: string, event: DirectiveEvent): void {
  mkdirSync(stateDir, { recursive: true })
  appendFileSync(directivesFile(stateDir), `${JSON.stringify(event)}\n`, 'utf8')
}

/** Read and parse the directive log; malformed lines are skipped, not fatal. */
export function readDirectiveEvents(stateDir: string): DirectiveEvent[] {
  const file = directivesFile(stateDir)
  if (!existsSync(file)) return []
  const events: DirectiveEvent[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      events.push(JSON.parse(trimmed) as DirectiveEvent)
    } catch {
      // Crash-torn tail line: ignore, the log stays append-only.
    }
  }
  return events
}

/**
 * Fold the shared log into directives. Creation order is preserved; events
 * for unknown ids are ignored; transitions after a terminal status are
 * ignored. Pure: no filesystem, no clock.
 */
export function foldDirectives(events: ReadonlyArray<DirectiveEvent>): Directive[] {
  const byId = new Map<string, Directive>()
  for (const event of events) {
    const current = byId.get(event.directiveId)
    if (current === undefined) {
      if (event.type !== 'directive_created') continue
      byId.set(event.directiveId, {
        id: event.directiveId, text: event.text, createdAt: event.ts, status: 'draft',
        ...(event.cron !== undefined ? { schedule: { cron: event.cron } } : {}),
        ...(event.name !== undefined ? { name: event.name } : {}),
        ...(event.continuesFrom !== undefined
          ? {
              continuesFrom: event.continuesFrom,
              ...(event.continuationMode !== undefined
                ? { continuation: { mode: event.continuationMode, parentId: event.continuesFrom } }
                : {}),
            }
          : {}),
      })
      continue
    }
    if (TERMINAL.has(current.status)) continue
    // 术语归一（secretary→staff）的账本兼容：V5 前的旧日志字段是
    // secretarySessionId——fold 双读归一，append-only 历史不必迁移。
    const sessionOf = (e: DirectiveEvent): string | undefined =>
      (e as { staffSessionId?: unknown }).staffSessionId !== undefined
        ? (e as { staffSessionId: string }).staffSessionId
        : (e as { secretarySessionId?: string }).secretarySessionId
    switch (event.type) {
      // v3 每命令一会话: the per-command staff session lands BEFORE the relay
      // text goes out, so a failed prompt retries into the same conversation.
      case 'directive_session_opened':
        current.staffSessionId = sessionOf(event)
        break
      case 'directive_received':
        current.status = 'received'
        current.staffSessionId = sessionOf(event)
        break
      case 'directive_talking':
        current.status = 'talking'
        break
      // V5 档位账本：triaged 首落档位（含 override 强制改档痕迹），regraded
      // 舰长升降档（计数审计）。二者均受终态守卫——approved/cancelled 后档位失去意义。
      case 'directive_triaged':
        current.grade = event.grade
        current.gradeReason = event.reason
        if (event.confidence !== undefined) current.gradeConfidence = event.confidence
        break
      case 'directive_regraded':
        current.grade = event.grade
        current.gradeReason = event.reason
        current.regrades = (current.regrades ?? 0) + 1
        break
      // V5-R3 计划态：opened 覆盖待批稿；判定只在 pending 时生效（幂等——
      // 路由层已挡重放，fold 层再兜一道）。驳回后大副重呈新稿即回 pending
      // （多轮收敛的机械表达）。终态守卫沿用。
      case 'directive_plan_opened':
        current.plan = { text: event.plan, status: 'pending' }
        break
      // V6 拆解：重复呈报覆盖（与 plan_opened 同语义）；终态守卫沿用。
      case 'directive_decomposed':
        current.decomposition = { plan: event.plan, tasks: event.tasks }
        break
      case 'directive_plan_approved':
        if (current.plan !== undefined && current.plan.status === 'pending') {
          current.plan.status = 'approved'
          current.plan.decidedAt = event.ts
        }
        break
      case 'directive_plan_rejected':
        if (current.plan !== undefined && current.plan.status === 'pending') {
          current.plan.status = 'rejected'
          current.plan.decidedAt = event.ts
        }
        break
      case 'directive_approved':
        current.status = 'approved'
        current.taskId = event.taskId
        break
      case 'directive_cancelled':
        current.status = 'cancelled'
        current.cancelledReason = event.reason
        break
      // V9.2 定时下达到点：一次性发令（幂等——已发过的不再改）。发完保持
      // draft，命令引信下一 tick（≤15s）照常把它转达大副。
      case 'directive_dispatched':
        if (current.schedule !== undefined && current.schedule.dispatchedAt === undefined) {
          current.schedule.dispatchedAt = event.ts
        }
        break
    }
  }
  return [...byId.values()]
}

/** V10 战线链索引（纯，双端复用）：对已折出的命令集做一次祖先闭包遍历。
 *  服务端下达路由只允许 continuesFrom 指向账本中已存在的命令，正常数据天然
 *  无环；本函数仍带深度上限与环/悬挂防御——手改日志最多得到「各自成段」的
 *  稳定投影，绝不抛错、绝不死循环。 */
export interface ChainFold {
  /** 命令 → 链根 id。 */
  readonly rootByCommand: ReadonlyMap<string, string>
  /** 命令 → 代际（初代=1，无徽标；Ⅱ 起上徽标）。 */
  readonly generationOf: ReadonlyMap<string, number>
  /** 链根 → 全体成员 id（按代序Ⅰ→…）。 */
  readonly membersOfRoot: ReadonlyMap<string, readonly string[]>
}

/** 手改日志的环/超深防御上限——真实战线到达不了这个代数。 */
const CHAIN_DEPTH_CAP = 32

export function foldChains(dirs: ReadonlyArray<Directive>): ChainFold {
  const byId = new Map(dirs.map(d => [d.id, d]))
  const rootByCommand = new Map<string, string>()
  const generationOf = new Map<string, number>()
  const membersOfRoot = new Map<string, string[]>()
  for (const d of dirs) {
    if (generationOf.has(d.id)) continue
    const path: Directive[] = []
    const seen = new Set<string>()
    let cur: Directive = d
    let truncated = false
    while (true) {
      if (seen.has(cur.id) || path.length >= CHAIN_DEPTH_CAP) { truncated = true; break }
      seen.add(cur.id)
      path.push(cur)
      if (cur.continuesFrom === undefined) break // 真初代：path 尾即链根
      const parent = byId.get(cur.continuesFrom)
      if (parent === undefined) break // 悬挂指针：上一站按段根投影（半截导入兼容）
      cur = parent
    }
    if (truncated) {
      // 环或超深（只剩手改日志会出现）：该命令自封一段，不连祖先——稳定、诚实。
      rootByCommand.set(d.id, d.id)
      generationOf.set(d.id, 1)
      membersOfRoot.set(d.id, [d.id])
      continue
    }
    const root = path[path.length - 1]!
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i]!
      if (generationOf.has(node.id)) continue
      const gen = path.length - i
      generationOf.set(node.id, gen)
      rootByCommand.set(node.id, root.id)
      const list = membersOfRoot.get(root.id) ?? []
      list.push(node.id)
      membersOfRoot.set(root.id, list)
    }
  }
  return { rootByCommand, generationOf, membersOfRoot }
}

/** 链色槽位：FNV-1a 变体——同根同槽跨重启稳定；服务端算好喂给客户端，
 *  前端不复算哈希（单一事实源）。 */
export function chainHueSlot(rootId: string, slots = 8): number {
  let h = 2166136261
  for (let i = 0; i < rootId.length; i++) {
    h ^= rootId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % slots
}

/** 续接模式推导输入：父命令的挂链任务执行切片（由调用方从 campaign 投影裁出）。 */
export interface ContinuationTaskFace {
  status: TaskStatus
  /** 尝试日志里最近一个已有结算态的结果。 */
  lastOutcome?: 'failed' | 'reported' | 'succeeded'
  /** 未结束 attempt 的外勤小队会话号（进行中才有）。 */
  liveAttemptSessionId?: string
}

/**
 * 按父命令当时的状态推导续接模式（纯）——下达路由的冻结依据：
 * 大副对话未成形→拒绝（直接继续谈）；执行中→pivot（需活体 attempt 会话）；
 * 成功仗/closed→deepen；败仗→retry。错误给可直接展示给舰长的理由。
 */
export function deriveContinuation(
  parent: { status: DirectiveStatus; taskId?: string },
  task?: ContinuationTaskFace,
): { mode: ContinuationMode; targetSessionId?: string } | { error: string } {
  if (parent.status === 'cancelled') return { error: '被取消的命令没有可续接的战线——请直接下新命令。' }
  if (parent.status !== 'approved') return { error: '这条命令还在大副对话里成形，直接点进命令卡继续谈即可；可续接的是已成形的仗。' }
  if (parent.taskId === undefined || task === undefined) return { error: '命令已批准但任务尚未发布成形，暂无可续接的阵地。' }
  if (task.lastOutcome === 'failed' || task.status === 'failed') return { mode: 'retry' }
  if (task.status === 'closed' || task.lastOutcome === 'succeeded' || task.lastOutcome === 'reported') return { mode: 'deepen' }
  if (task.liveAttemptSessionId !== undefined) return { mode: 'pivot', targetSessionId: task.liveAttemptSessionId }
  return { error: '作战正在排队（外勤小队尚未领令接火），此刻无可转向的执行会话。' }
}

/** Load all directives from disk (read + fold), oldest first. */
export function loadDirectives(stateDir: string): Directive[] {
  return foldDirectives(readDirectiveEvents(stateDir))
}

/** The command fuse's worklist: draft commands no staff has taken yet.
 * V9.2：定时命令未到点（schedule 未 dispatched）不出队——引信看不到它。 */
export function pendingDirectives(directives: ReadonlyArray<Directive>): Directive[] {
  return directives.filter(d => d.status === 'draft' && !(d.schedule !== undefined && d.schedule.dispatchedAt === undefined))
}

/** V9.2 定时命令到点判定（纯函数，宿主 30s tick 调用）：anchor = 创建时刻，
 * nextRun ≤ now 即到点。一次性语义——dispatched 后永不再 due；存储的 cron
 * 失效（解析抛错）静默跳过，发布时校验已挡新增。 */
export function dueScheduledDirectives(directives: ReadonlyArray<Directive>, nowMs: number): string[] {
  const out: string[] = []
  for (const d of directives) {
    if (d.schedule === undefined || d.schedule.dispatchedAt !== undefined) continue
    const anchor = Date.parse(d.createdAt)
    if (!Number.isFinite(anchor)) continue
    try {
      const next = nextRunOf(d.schedule.cron, anchor)
      if (next !== undefined && next <= nowMs) out.push(d.id)
    } catch {
      // Stored cron turned invalid — creation-time validation guards new ones.
    }
  }
  return out
}

/** New directive ids: time-ordered, filesystem-safe, visually distinct from
 * task ids (`cmd-` prefix — the two must never be confusable on a card). */
export function newDirectiveId(now: Date = new Date()): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `cmd-${stamp}-${crypto.randomUUID().slice(0, 4)}`
}
