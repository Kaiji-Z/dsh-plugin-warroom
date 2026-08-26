/**
 * 执行卡实时活动行（V9.11 R2）——dsh 原生过程语汇（session/event 事件流）→ 动词。
 * 纯函数 + 内存滚动表，零 harness 类型依赖（事件形状窄化收窄，形状漂移降级为
 * no-op 绝不抛）；板是读投影——本模块只读宿主事件，不写任何东西。
 *
 * 动词双皮肤同词（过程动词是技术语汇，不进皮肤词典；label 由宿主侧单点计算，
 * 前端只渲染字符串）。活动表不落盘：服务器重启后归「待命」直到下个事件——
 * 「当前在做什么」本来就是瞬时态。
 * @module dsh-plugin-warroom/activity
 */

import { createHash } from 'node:crypto'

/** 八态动词 + 通用工具兜底（kind 即稳定标识，label 供人读）。 */
export type ActivityVerb =
  | { kind: 'idle' } // 待命（turn/end 后 / 初始）
  | { kind: 'thinking' } // 思考中（step/start：一次模型出招开始）
  | { kind: 'exploring' } // 探索中（read/grep/glob/fetch/search…）
  | { kind: 'explored' } // 已探索
  | { kind: 'editing' } // 编辑中（edit/write…）
  | { kind: 'edited' } // 已编辑
  | { kind: 'running' } // 运行命令（bash/shell…）
  | { kind: 'ran' } // 命令完成
  | { kind: 'tool'; name: string } // 执行中·<工具名>（未归类工具）
  | { kind: 'tooled'; name: string } // <工具名>·完成

export interface AttemptActivity {
  readonly verb: ActivityVerb
  /** 当前未完成工具调用的 callId（tool/result 完成态配对用）。 */
  readonly callId?: string
  /** 该动词的入账时间（ISO；展示用相对时间由前端算）。 */
  readonly ts: string
}

/** 动词 → 人读文案（双皮肤同词）。 */
export function activityLabel(v: ActivityVerb): string {
  switch (v.kind) {
    case 'idle': return '待命'
    case 'thinking': return '思考中'
    case 'exploring': return '探索中'
    case 'explored': return '已探索'
    case 'editing': return '编辑中'
    case 'edited': return '已编辑'
    case 'running': return '运行命令'
    case 'ran': return '命令完成'
    case 'tool': return `执行中·${v.name}`
    case 'tooled': return `${v.name}·完成`
  }
}

/** 工具名 → 工具类别（大小写不敏感、子串容忍——宿主工具名跨版本会变形）。 */
export function classifyTool(name: string): ActivityVerb {
  const n = name.toLowerCase()
  if (n.includes('edit') || n.includes('write')) return { kind: 'editing' }
  if (n.includes('read') || n.includes('search') || n.includes('grep') || n.includes('glob') || n.includes('fetch') || n.includes('list')) return { kind: 'exploring' }
  if (n.includes('bash') || n.includes('shell') || n.includes('exec') || n === 'run') return { kind: 'running' }
  return { kind: 'tool', name }
}

/** 完成态（进行 → 完成）。非进行态动词原样返回（防御：乱序 result 不改写）。 */
function perfectiveOf(v: ActivityVerb): ActivityVerb {
  switch (v.kind) {
    case 'exploring': return { kind: 'explored' }
    case 'editing': return { kind: 'edited' }
    case 'running': return { kind: 'ran' }
    case 'tool': return { kind: 'tooled', name: v.name }
    default: return v
  }
}

/** 防御性取 callId：宿主 SessionEvent 载荷在 .data 下（tool/call 顶层、
 * tool/result 的 message.callId / message.source.callId / content 首块）。 */
function callIdOf(ev: Record<string, unknown>): string | undefined {
  const d = ((ev.data ?? ev) as Record<string, unknown>)
  if (typeof d.callId === 'string') return d.callId
  const message = d.message as { callId?: unknown; source?: { callId?: unknown }; content?: unknown } | undefined
  if (message !== undefined) {
    if (typeof message.callId === 'string') return message.callId
    if (typeof message.source?.callId === 'string') return message.source.callId
    if (Array.isArray(message.content)) {
      const first = message.content[0] as { callId?: unknown } | undefined
      if (first !== undefined && typeof first.callId === 'string') return first.callId
    }
  }
  return undefined
}

/**
 * 单事件折叠（纯函数）：step/start→思考中；tool/call→按工具类别进行态；
 * tool/result→当前调用配对成功则完成态；turn/end→待命。未知事件一律原样返回
 * （引用相等——调用方据此免写 Map）。
 *
 * 宿主 SessionEvent 包一层 { type, seq, time, data }（与 api-proxy 消费侧
 * event.data 同源，实测 2026-08-26）；防御两头兼容：优先读 data，形状漂移
 * 退回顶层展开。
 */
export function reduceActivity(cur: AttemptActivity, ev: unknown, now: string): AttemptActivity {
  const raw = ev as { type?: unknown; data?: unknown }
  if (typeof raw?.type !== 'string') return cur
  const e = ((raw.data ?? raw) as { name?: unknown })
  if (raw.type === 'step/start') return { verb: { kind: 'thinking' }, ts: now }
  if (raw.type === 'tool/call') {
    const name = typeof e.name === 'string' && e.name !== '' ? e.name : 'tool'
    return { verb: classifyTool(name), callId: callIdOf(raw), ts: now }
  }
  if (raw.type === 'tool/result') {
    const id = callIdOf(raw)
    // 配对：result 属于当前进行中的调用（或形状漂变拿不到 callId 时退化为
    // 「最近一次调用完成」——顺序展示语义下诚实）。
    if (cur.callId === undefined || id === undefined || cur.callId === id) {
      const imperfect = cur.verb.kind === 'exploring' || cur.verb.kind === 'editing' || cur.verb.kind === 'running' || cur.verb.kind === 'tool'
      if (imperfect) return { verb: perfectiveOf(cur.verb), ts: now }
    }
    return cur
  }
  if (raw.type === 'turn/end') return { verb: { kind: 'idle' }, ts: now }
  return cur
}

/**
 * 会话活动滚动表（内存，不落盘）。handle 由 index.ts 的 session/event 监听器
 * 喂——全量会话皆记（表小且有上限），板投影按 live attempt 的 sessionId 取用。
 */
export class ActivityTracker {
  private readonly bySession = new Map<string, AttemptActivity>()
  private clock: () => string

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.clock = clock
  }

  handle(sessionId: string | undefined, ev: unknown): void {
    if (typeof sessionId !== 'string' || sessionId === '') return
    const cur = this.bySession.get(sessionId) ?? { verb: { kind: 'idle' } as ActivityVerb, ts: '' }
    const next = reduceActivity(cur, ev, this.clock())
    if (next !== cur) this.bySession.set(sessionId, next)
    if (this.bySession.size > 256) {
      const oldest = this.bySession.keys().next().value
      if (oldest !== undefined) this.bySession.delete(oldest)
    }
  }

  /** 板投影快照：{ verb 稳定标识, label 人读, ts }；无记录 null（重启后自然归零）。 */
  snapshot(sessionId: string): { verb: string; label: string; ts: string } | null {
    const a = this.bySession.get(sessionId)
    if (a === undefined) return null
    return { verb: a.verb.kind === 'tool' || a.verb.kind === 'tooled' ? `${a.verb.kind}:${a.verb.name}` : a.verb.kind, label: activityLabel(a.verb), ts: a.ts }
  }

  /**
   * revision 盐：只随「动词变化」变（同动词的连续事件——比如连续 10 次 read——
   * 盐不变，SSE 不空转）。与 boardRevision 的文件签名拼装仍守 revision-only 纪律。
   */
  salt(): string {
    const parts: string[] = []
    for (const [id, a] of [...this.bySession.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      const key = a.verb.kind === 'tool' || a.verb.kind === 'tooled' ? `${a.verb.kind}:${a.verb.name}` : a.verb.kind
      parts.push(`${id}=${key}`)
    }
    return createHash('sha1').update(parts.join(';')).digest('hex').slice(0, 12)
  }
}
