/**
 * 外勤组员任务回报事件解析（V9.12 R1）——registerReportCapture 的纯函数半边。
 *
 * 宿主 SessionEvent 包一层 { type, seq, time, data }：载荷（source/content）
 * 在 .data 下（2026-08-26 实测，与 activity.ts 的 reduceActivity 同源结论）。
 * 旧实现读顶层字段——在嵌套形状下静默失效（P1-1），本模块按「嵌套优先、扁平
 * 退回」两头兼容；坏形状一律返 null（调用方降级为「不自动记账」，绝不抛）。
 * @module dsh-plugin-warroom/report-capture
 */

export interface ParsedUnitReportEvent {
  readonly kind: 'subagent-report' | 'subagent-settled'
  readonly childId: string
  readonly text: string
}

const CHILD_ID_RE = /Background subagent ([\w-]+)/

/** user/message × subagent-report/settled × 文本含子代理 id → 解析结果；其余 null。 */
export function parseUnitReportEvent(ev: unknown): ParsedUnitReportEvent | null {
  if (ev === null || typeof ev !== 'object') return null
  const raw = ev as Record<string, unknown>
  if (raw.type !== 'user/message') return null
  const payload = raw.data ?? raw
  if (payload === null || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const source = p.source as { kind?: unknown } | undefined
  const kind = source !== undefined && typeof source.kind === 'string' ? source.kind : undefined
  if (kind !== 'subagent-report' && kind !== 'subagent-settled') return null
  const blocks = Array.isArray(p.content) ? (p.content as Array<{ type?: unknown; text?: unknown }>) : []
  const text = blocks
    .filter(b => b !== null && typeof b === 'object' && b.type === 'text')
    .map(b => (typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  const childId = CHILD_ID_RE.exec(text)?.[1]
  if (childId === undefined) return null
  return { kind, childId, text }
}
