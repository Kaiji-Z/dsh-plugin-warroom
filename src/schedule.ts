/**
 * Daily-bounty cron: a 5-field expression parser plus a field-set next-run
 * calculator. Pure and clock-free — callers inject "now". The missed-window
 * policy (错过即跳过, never backfill) lives in the host tick: only the NEXT
 * round from the last trigger is ever opened.
 * @module dsh-plugin-warroom/schedule
 */

/** One cron field's parsed candidate set (numbers already domain-checked). */
export interface CronFields {
  readonly minutes: ReadonlySet<number>
  readonly hours: ReadonlySet<number>
  readonly daysOfMonth: ReadonlySet<number>
  readonly months: ReadonlySet<number>
  readonly daysOfWeek: ReadonlySet<number>
  /** dom/dow both restricted → standard cron OR semantics (false = AND-less,
   * i.e. either side may satisfy). */
  readonly domRestricted: boolean
  readonly dowRestricted: boolean
}

export class CronParseError extends Error {
  constructor(message: string) {
    super(`cron 表达式不合法：${message}（应为 5 段：分 时 日 月 周，如 "0 9 * * *"）`)
  }
}

const RANGES: ReadonlyArray<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]

function parseField(raw: string, field: number): ReadonlySet<number> {
  const [lo, hi] = RANGES[field]!
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const [body, stepRaw] = part.split('/')
    const step = stepRaw === undefined ? 1 : Number.parseInt(stepRaw, 10)
    if (!Number.isInteger(step) || step < 1) throw new CronParseError(`步长不合法：${part}`)
    let start = lo
    let end = hi
    if (body !== '*' && body !== '') {
      const range = body.split('-')
      if (range.length > 2) throw new CronParseError(`区间不合法：${part}`)
      start = Number.parseInt(range[0]!, 10)
      end = range.length === 2 ? Number.parseInt(range[1]!, 10) : (stepRaw !== undefined ? hi : start)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < lo || end > hi || start > end) {
        throw new CronParseError(`取值超出范围：${part}（该字段允许 ${lo}-${hi}）`)
      }
    }
    for (let v = start; v <= end; v += step) out.add(v === 7 && field === 4 ? 0 : v)
  }
  return out
}

/** Parse a 5-field cron expression into candidate sets. */
export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new CronParseError(`应是 5 段，实际 ${parts.length} 段`)
  const daysOfMonth = parseField(parts[2]!, 2)
  const daysOfWeek = parseField(parts[4]!, 4)
  return {
    minutes: parseField(parts[0]!, 0),
    hours: parseField(parts[1]!, 1),
    daysOfMonth,
    months: parseField(parts[3]!, 3),
    daysOfWeek,
    domRestricted: !(daysOfMonth.size === 31),
    dowRestricted: !(daysOfWeek.size === 8 || daysOfWeek.size === 7),
  }
}

/**
 * The next firing time strictly after `afterMs` (local wall clock), built by
 * walking candidate field values instead of minute-scanning. Five-year
 * horizon; returns undefined when no candidate exists in it (e.g. 2 月 30 日).
 */
export function nextRunMs(fields: CronFields, afterMs: number): number | undefined {
  const after = new Date(afterMs)
  // Start from the next minute boundary; zero out sub-minute parts.
  const cursor = new Date(after.getFullYear(), after.getMonth(), after.getDate(), after.getHours(), after.getMinutes() + 1, 0, 0)
  for (let i = 0; i < 60 * 24 * 366 * 5; i++) {
    if (!fields.months.has(cursor.getMonth() + 1)) {
      // Skip the whole month (field-set walking, not minute-scanning).
      cursor.setMonth(cursor.getMonth() + 1, 1)
      cursor.setHours(0, 0, 0, 0)
      continue
    }
    const domOk = fields.daysOfMonth.has(cursor.getDate())
    const dowOk = fields.daysOfWeek.has(cursor.getDay())
    const dayOk = fields.domRestricted && fields.dowRestricted ? (domOk || dowOk) : (domOk && dowOk)
    if (!dayOk) {
      cursor.setHours(24, 0, 0, 0)
      continue
    }
    if (!fields.hours.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0)
      continue
    }
    if (fields.minutes.has(cursor.getMinutes())) {
      return cursor.getTime()
    }
    cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
  }
  return undefined
}

/** Human-facing helper: parse + next run in one step. */
export function nextRunOf(expr: string, afterMs: number): number | undefined {
  return nextRunMs(parseCron(expr), afterMs)
}

/** V18.8 闹钟式定时（元首令：cron 裸串对人不友好）：起草器的重复模式 + 时刻
 *  选择 → 5 段 cron。纯函数零时钟依赖；无效输入返回空串（提交按钮禁用）。
 *  @param mode once=指定日一次 / daily=每天 / weekday=周一至五 / weekly=自选周几 */
export interface AlarmSpec {
  readonly mode: 'once' | 'daily' | 'weekday' | 'weekly'
  /** HH:MM（24 小时制，本地时）。 */
  readonly time: string
  /** once 用：YYYY-MM-DD（本地日）。 */
  readonly date: string
  /** weekly 用：ISO 周几（1=一 … 7=日；7 由 parseField 归 0=周日）。 */
  readonly dows: ReadonlyArray<number>
}

export function buildAlarmCron(a: AlarmSpec): string {
  const tm = /^(\d{1,2}):(\d{2})$/.exec(a.time)
  if (tm === null) return ''
  const H = Number(tm[1])
  const M = Number(tm[2])
  if (H > 23 || M > 59) return ''
  if (a.mode === 'daily') return `${M} ${H} * * *`
  if (a.mode === 'weekday') return `${M} ${H} * * 1-5`
  if (a.mode === 'weekly') {
    const dows = [...new Set(a.dows)].filter(d => Number.isInteger(d) && d >= 1 && d <= 7).sort((x, y) => x - y)
    if (dows.length === 0) return ''
    return `${M} ${H} * * ${dows.join(',')}`
  }
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.date)
  if (dm === null) return ''
  const mon = Number(dm[2])
  const day = Number(dm[3])
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return ''
  return `${M} ${H} ${day} ${mon} *`
}
