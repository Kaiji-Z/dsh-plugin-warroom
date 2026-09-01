/**
 * V7-② 到访摘要——「自上次看过以来」的增量计算（纯函数，node 直测）。
 * 晨间到访第一眼：夜里收官了几单、折了几单、新下几道命令、现在几件等定夺。
 * lastSeen 由 shell-entry 关板时写入（warroom-last-seen）；本模块只读不写，
 * WarView 挂载时取一次快照——到访期间数字不跳动。
 * @module dsh-plugin-stardeck/client/visit
 */

import type { BoardCommand, BoardTask } from './data.ts'

export interface VisitDelta {
  /** 自 lastSeen 起新收官的任务数。 */
  closed: number
  /** 自 lastSeen 起新终败的任务数。 */
  failed: number
  /** 自 lastSeen 起新下达的命令数。 */
  commands: number
  /** 当前等你定夺件数（现状，非增量）。 */
  pending: number
  /** 是否值得显示横幅（任一数字 > 0）。 */
  any: boolean
}

/** 任务「落定时刻」的近似：收官/终败以最后 attempt 结束与最后任务回报较晚者为准。 */
export function taskSettledAt(t: BoardTask): number {
  let latest = Date.parse(t.startedAt) || 0
  for (const a of t.attemptLog) {
    const end = Date.parse(a.endedAt ?? '')
    if (Number.isFinite(end) && end > latest) latest = end
  }
  for (const r of t.reports) {
    const ts = Date.parse(r.ts)
    if (Number.isFinite(ts) && ts > latest) latest = ts
  }
  return latest
}

export function visitDelta(commands: BoardCommand[], tasks: BoardTask[], pending: number, lastSeen: number, now: number = Date.now()): VisitDelta {
  // 首次到访（无 lastSeen）：不制造「全部都是新的」假增量——板本身就是现状。
  if (!(lastSeen > 0)) return { closed: 0, failed: 0, commands: 0, pending, any: pending > 0 }
  const closed = tasks.filter(t => t.status === 'closed' && taskSettledAt(t) > lastSeen).length
  const failed = tasks.filter(t => t.status === 'failed' && taskSettledAt(t) > lastSeen).length
  const cmds = commands.filter(c => (Date.parse(c.createdAt) || 0) > lastSeen).length
  return { closed, failed, commands: cmds, pending, any: closed + failed + cmds + pending > 0 }
}
