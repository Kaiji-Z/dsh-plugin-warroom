/**
 * V7-④ 夜间预检 + 起草器档位——纯函数层。
 * 夜间的真敌人不是失败，是卡在等人：升档 L1/L2 的命令必须等元首批计划才会
 * 继续，夜里没人批就停整晚。stalledOnUserPlan 判定「将停在计划待批」，
 * 呈现层给后果提示 + 「改直发」出口（走既有 regrade API，不新增写端点）。
 * @module dsh-plugin-warroom/client/preflight
 */

import type { BoardCommand } from './data.ts'

/** 该命令是否会停在「等你批计划」：L1/L2、未终态、计划未获批（含未呈报/待批/被驳重呈中）。 */
export function stalledOnUserPlan(cmd: BoardCommand): boolean {
  if (cmd.grade !== 'L1' && cmd.grade !== 'L2') return false
  if (cmd.status === 'approved' || cmd.status === 'cancelled') return false
  return cmd.plan === null || cmd.plan.status !== 'approved'
}

export type ComposerGrade = 'auto' | 'L0' | 'L2'

/** 起草器档位开关 → 命令文本标记（机制沿用户覆写标记：!!直接做 / ??先看方案）。 */
export function applyGradeMarker(text: string, grade: ComposerGrade): string {
  const body = text.trim()
  if (grade === 'L0') return `!!直接做 ${body}`
  if (grade === 'L2') return `??先看方案 ${body}`
  return body
}
