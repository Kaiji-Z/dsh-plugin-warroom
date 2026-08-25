/**
 * V7-⑤ 「为什么还没动」——published/in_progress 卡片的等待解释（纯函数）。
 * AFK 场景下用户焦虑的第一问题不是「进展如何」而是「怎么没动静」；本模块
 * 从板投影的只读加料（queueAhead/quotaPaused）判出解释类别，文案由词典给。
 * @module dsh-plugin-warroom/client/waithint
 */

import type { BoardTask } from './data.ts'

export type WaitKind = 'queued' | 'awaitingClaim' | 'quotaPaused'

/** 解释类别；null = 无可解释的等待（前置未解锁由既有 depLock 徽章解释）。 */
export function waitKindOf(task: BoardTask, statuses: Map<string, BoardTask['status']>): WaitKind | null {
  if (task.status === 'published') {
    if (task.deps.some(d => statuses.get(d) !== 'closed')) return null
    if ((task.queueAhead ?? 0) > 0) return 'queued'
    return 'awaitingClaim'
  }
  if (task.status === 'in_progress' && task.quotaPaused === true) return 'quotaPaused'
  return null
}
