/**
 * V7-① 「等你定夺」收件箱——纯客户端聚合，零后端。
 * 把散落三处、需要舰长动作的时刻聚成一条队列：答澄清（talking 命令）、
 * 批计划（plan pending）、翻任务回报（reported 任务）、决重试（failed 任务）。
 * 红线：收件箱只导航到动作发生地，板上不长任务写操作。
 * @module dsh-plugin-stardeck/client/inbox
 */

import type { BoardCommand, BoardTask } from './data.ts'

export type InboxKind = 'clarify' | 'plan' | 'review' | 'retry'

/** aging 阈值（SPEC v7 §1①）：30 分钟起 warn、2 小时起 err。 */
export const INBOX_WARN_MS = 30 * 60_000
export const INBOX_ERR_MS = 2 * 3_600_000

export interface InboxItem {
  kind: InboxKind
  /** commandId（clarify/plan）或 taskId（review/retry）。 */
  refId: string
  /** 卡片标题（命令正文 / 任务标题）。 */
  title: string
  /** 等待开始的 ISO 时间戳（talking/批计划用 createdAt 近似——无更细时间戳）。 */
  since: string
  waitMs: number
  tone: '' | 'warn' | 'err'
}

export function agingTone(waitMs: number): '' | 'warn' | 'err' {
  if (waitMs >= INBOX_ERR_MS) return 'err'
  if (waitMs >= INBOX_WARN_MS) return 'warn'
  return ''
}

/** 等待时长人话（"35 分钟" / "3 小时" / "2 天"，不满 1 分钟按 "刚刚"）。 */
export function formatWait(waitMs: number): string {
  if (waitMs < 60_000) return '刚刚'
  if (waitMs < 3_600_000) return `${Math.floor(waitMs / 60_000)} 分钟`
  if (waitMs < 86_400_000) return `${Math.floor(waitMs / 3_600_000)} 小时`
  return `${Math.floor(waitMs / 86_400_000)} 天`
}

function mkItem(kind: InboxKind, refId: string, title: string, since: string, now: number): InboxItem {
  const t = Date.parse(since)
  const waitMs = Number.isFinite(t) ? Math.max(0, now - t) : 0
  return { kind, refId, title, since, waitMs, tone: agingTone(waitMs) }
}

/** 聚合四类待定夺动作；等得最久的排最前（aging 视觉强调对齐）。 */
export function collectInbox(commands: BoardCommand[], tasks: BoardTask[], now: number = Date.now()): InboxItem[] {
  const items: InboxItem[] = []
  for (const c of commands) {
    // V9.5（复评 P3-1）：同一命令同时是 talking + 计划待批时只出一行——
    // 批计划是更靠后的管线阶段，胜出；两条近重复行读起来像 bug。
    const planPending = c.plan !== null && c.plan.status === 'pending'
    if (planPending) items.push(mkItem('plan', c.commandId, c.text, c.createdAt, now))
    else if (c.status === 'talking') items.push(mkItem('clarify', c.commandId, c.text, c.createdAt, now))
  }
  for (const t of tasks) {
    if (t.status === 'reported') {
      const lastReport = t.reports.length > 0 ? t.reports[t.reports.length - 1]!.ts : t.startedAt
      items.push(mkItem('review', t.taskId, t.title, lastReport, now))
    }
    if (t.status === 'failed') {
      const lastFail = [...t.attemptLog].reverse().find(a => a.outcome === 'failed')?.endedAt
      items.push(mkItem('retry', t.taskId, t.title, lastFail ?? t.startedAt, now))
    }
  }
  return items.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0))
}

/** err 档内的「等最久」领跑者（V7.1 老化通胀整改：全红时红也要有先后——
 *  最老一条加粗+徽标，红=年龄里再挤出一个「最该先决」）。返回条目键
 *  （`${kind}:${refId}`），无 err 档时 null。 */
export function agingLeader(items: InboxItem[]): string | null {
  const first = items.find(i => i.tone === 'err')
  return first === undefined ? null : `${first.kind}:${first.refId}`
}

/** V10.1 审查（通知可达性）：收件箱净增判定——灵动岛礼貌播报只在该出声时
 * 出声。纯函数供单测钉死语义：
 *  - 未水合（SSE/首灌期）：一律不出声——计数 0→N 是「到访现状」，摘要横幅的
 *    本职，不是新事件（开局播「新增 4 件」是噪音，probe 实抓）；
 *  - 水合后首次（prev === null）：只记基线不出声；
 *  - 之后净增（next > prev）：返回增量（播「新增 N 件」）；持平/减少：null。
 */
export function inboxGrowthAnnounce(prev: number | null, next: number, hydrated: boolean): number | null {
  if (!hydrated) return null
  if (prev === null) return null
  return next > prev ? next - prev : null
}
