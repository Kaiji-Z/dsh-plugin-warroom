/**
 * The war map's shared store: an SSE channel (`/warroom/api/events`) drives
 * immediate refreshes when the board revision moves, with a slow safety poll
 * as the fallback for transports without EventSource. One module-level
 * singleton while any component subscribes (useSyncExternalStore). Writes are
 * server-side (tools); the client is a projection — the operating-form
 * decision the sovereign made.
 * @module dsh-plugin-warroom/client/data
 */

import { useSyncExternalStore } from 'react'

export interface BoardTroop {
  childId: string
  label: string
  unit: string
  front: string
  recalled: boolean
  settled: boolean
  lastReport: string | null
}

export interface BoardEvidence {
  checks: Array<{ item: string; passed: boolean }>
  tests?: { command: string; exitCode: number; passed: number; failed: number }
  diffstat?: string
  files?: string[]
}

export interface BoardReport { ts: string; from: string; text: string; evidence: BoardEvidence | null }
export interface BoardComment { ts: string; from: string; text: string }
export interface BoardDeliverable { kind: string; summary: string; detail: string | null; ts: string }
export type BoardQuality = 'common' | 'fine' | 'rare' | 'epic' | 'legendary'

/** One commander attempt (执行会话) — the unit of the 进行中/已完成/已失败 columns. */
export interface BoardAttempt {
  id: string
  n: number
  sessionId: string
  startedAt: string
  endedAt: string | null
  outcome: 'failed' | 'reported' | 'succeeded' | null
  /** V9.11 R2 执行卡实时活动（宿主 session/event → 动词；仅 live attempt 携带，
   * label 宿主侧单点计算——双皮肤同词）。无追踪/已结束为 undefined。 */
  activity?: { verb: string; label: string; ts: string } | null
}

/** One sovereign command (命令区的卡片). */
export interface BoardCommand {
  commandId: string
  text: string
  /** V15 战线命名（舰长下达时可选；null=旧命令/未命名，战线名回落命令原文）。 */
  name?: string | null
  createdAt: string
  status: 'draft' | 'received' | 'talking' | 'approved' | 'cancelled'
  staffSessionId: string | null
  taskId: string | null
  cancelledReason: string | null
  /** V5 档位账本（未分诊为 null）。 */
  grade: 'L0' | 'L1' | 'L2' | null
  gradeReason: string | null
  gradeConfidence: number | null
  regrades: number
  /** V5-R3 计划态（未呈报为 null）。 */
  plan: { text: string; status: 'pending' | 'approved' | 'rejected'; decidedAt: string | null } | null
  /** V9.2 定时下达（未定时为 null；dispatchedAt 空 = 待发，nextRunAt 为下次触发）。 */
  schedule: { cron: string; dispatchedAt: string | null; nextRunAt: string | null } | null
  /** V10 战线链身份（服务端 foldChains 单点计算；初代也给对象，generation=1）。 */
  chain: { generation: number; rootId: string; length: number; hueSlot: number }
  /** V17 归档（未入档为 null）：宿主会话已 archiveSession 的账面痕迹。 */
  archived?: { at: string; sessions: string[] } | null
  /** V10 续接意图（初代为 null）。 */
  continuation: { mode: 'deepen' | 'retry' | 'pivot' } | null
}

export interface BoardTask {
  taskId: string
  title: string
  status: 'draft' | 'published' | 'in_progress' | 'reported' | 'failed' | 'closed'
  priority: 'normal' | 'high'
  quality: BoardQuality
  rounds: number
  attempts: number
  deps: string[]
  lastError: string | null
  workspacePath: string | null
  /** V15：工作区绑定形态投影（null=旧任务，客户端回落路径启发式）。 */
  workspaceKind: string | null
  claimedBy: string | null
  startedAt: string
  brief: string
  acceptance: string
  schedule: { cron: string; enabled: boolean; nextRunAt: string | null } | null
  /** V7-⑤ 只读加料：征召排队位次（0=现在可征召；缺失视为未知不提示）。 */
  queueAhead?: number | null
  /** V7-⑤ 只读加料：配额暂停位（in_progress 原地暂停，恢复续作）。 */
  quotaPaused?: boolean
  /** Session cards, newest attempt last. */
  attemptLog: BoardAttempt[]
  troops: BoardTroop[]
  deliverables: BoardDeliverable[]
  reports: BoardReport[]
  comments: BoardComment[]
  closedVerdict: string | null
}

/** One externally-attached thread (v3 挂载 — the battlefield's「外部」cards). */
export interface BoardThread {
  sessionId: string
  note: string
  attachedAt: string
}

export interface BoardData {
  ok: boolean
  active: boolean
  warRoot: string
  hqSessionId: string | null
  revision?: string
  commands: BoardCommand[]
  tasks: BoardTask[]
  threads: BoardThread[]
  /** V18 注册星球（真实工作区；HQ 弹窗/发布侧注册，planets.jsonl 折叠）。 */
  planets?: ReadonlyArray<{ path: string; title: string | null; registeredAt: string }>
  roster: Array<{ name: string; label: string; description: string; sandboxMode: string; source: string }>
  rosterErrors: string[]
}

/** V10 起草器「战线续接」候选：已批准且挂了任务的命令（新→旧 ≤5，live=有未收束 attempt）。 */
export interface ContinueCandidate {
  commandId: string
  text: string
  generation: number
  hueSlot: number
  live: boolean
  /** V14：候选所属战线的星球键（composer 星球选择器续接默认带出；null=未锚定）。 */
  bf: string | null
}

/** 命令区 + 按钮 → 建一张 draft 命令卡（命令引信 15s 内转交大副）。 */
export async function createCommand(text: string, cron?: string, continuesFrom?: string, name?: string): Promise<{ ok: boolean; commandId?: string; scheduled?: boolean; continuationMode?: 'deepen' | 'retry' | 'pivot'; error?: string }> {
  try {
    const payload: Record<string, string> = { text }
    if (cron !== undefined) payload.cron = cron
    if (continuesFrom !== undefined) payload.continuesFrom = continuesFrom
    if (name !== undefined && name.trim() !== '') payload.name = name.trim().slice(0, 24)
    const res = await fetch('/warroom/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json() as { ok: boolean; commandId?: string; scheduled?: boolean; continuationMode?: 'deepen' | 'retry' | 'pivot'; error?: string }
    return body
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 进入大副会话时把 received 命令卡翻成 对话中。 */
export async function markTalking(commandId: string): Promise<void> {
  try {
    await fetch('/warroom/api/commands/talking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId }),
    })
  } catch {
    // Best-effort transition — the card still opens the session.
  }
}

/** V5 档位账本：舰长在命令卡上升降档（未分诊/旗关时服务端拒绝）。 */
export async function regradeCommand(commandId: string, grade: 'L0' | 'L1' | 'L2'): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/warroom/api/commands/regrade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId, grade }),
    })
    const body = await res.json() as { ok: boolean; error?: string }
    return body
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** V5-R3 计划判定：舰长批准/驳回待批计划。 */
/** V17 归档：链全终局的命令批量归档全部相关会话（服务端同闸；不可逆）。 */
export async function archiveCommand(commandId: string): Promise<{ ok: boolean; archived?: number; failed?: Array<{ sessionId: string; code: string; message: string }>; error?: string }> {
  try {
    const r = await fetch('/warroom/api/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId }),
    })
    return (await r.json()) as { ok: boolean; archived?: number; failed?: Array<{ sessionId: string; code: string; message: string }>; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function decidePlan(commandId: string, decision: 'approve' | 'reject', note?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/warroom/api/commands/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId, decision, ...(note !== undefined ? { note } : {}) }),
    })
    const body = await res.json() as { ok: boolean; error?: string }
    return body
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** v3 挂载: pin an external session onto the battlefield. */
export async function attachThread(sessionId: string, note: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/warroom/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, note }),
    })
    const body = await res.json() as { ok: boolean; error?: string }
    return body
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** v3 摘除: unpin an externally-attached session from the battlefield. */
export async function detachThread(sessionId: string): Promise<void> {
  try {
    await fetch('/warroom/api/threads/detach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  } catch {
    // Best-effort — the next board refresh reconciles.
  }
}

/** 事件流不可用时的兜底轮询节奏（正常路径：SSE 推送驱动即时刷新）。 */
const SAFETY_POLL_MS = 15_000

class WarBoardStore {
  private snapshot: BoardData | null = null
  private error: string | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private source: EventSource | undefined
  private lastRev: string | undefined
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      void this.tick()
      this.openStream()
      this.timer = setInterval(() => { void this.tick() }, SAFETY_POLL_MS)
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        if (this.timer !== undefined) {
          clearInterval(this.timer)
          this.timer = undefined
        }
        this.closeStream()
      }
    }
  }

  getSnapshot = (): BoardData | null => this.snapshot
  getError = (): string | null => this.error

  refresh = (): void => { void this.tick() }

  private openStream(): void {
    if (typeof EventSource === 'undefined') return
    try {
      const es = new EventSource('/warroom/api/events')
      es.onmessage = (ev: MessageEvent<string>) => {
        try {
          const rev = (JSON.parse(ev.data) as { rev?: string }).rev
          if (rev !== undefined && rev !== this.lastRev) {
            this.lastRev = rev
            void this.tick()
          }
        } catch {
          // Malformed frame — the safety poll covers us.
        }
      }
      this.source = es
    } catch {
      // EventSource refused — safety poll stays.
    }
  }

  private closeStream(): void {
    this.source?.close()
    this.source = undefined
    this.lastRev = undefined
  }

  private async tick(): Promise<void> {
    try {
      const res = await fetch('/warroom/api/board')
      if (!res.ok) throw new Error(`board HTTP ${res.status}`)
      const data = await res.json() as BoardData
      this.snapshot = data
      if (data.revision !== undefined) this.lastRev = data.revision
      this.error = null
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
    for (const l of this.listeners) l()
  }
}

export const warBoardStore = new WarBoardStore()

export interface UseWar {
  data: BoardData | null
  error: string | null
  refresh: () => void
}

export function useWar(): UseWar {
  const data = useSyncExternalStore(warBoardStore.subscribe, warBoardStore.getSnapshot, warBoardStore.getSnapshot)
  const error = useSyncExternalStore(warBoardStore.subscribe, warBoardStore.getError, warBoardStore.getError)
  return { data, error, refresh: warBoardStore.refresh }
}
