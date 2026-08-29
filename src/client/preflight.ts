/**
 * V7-④ 夜间预检 + 起草器档位——纯函数层。
 * 夜间的真敌人不是失败，是卡在等人：升档 L1/L2 的命令必须等舰长批计划才会
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

/** 起草器档位开关 → 命令文本标记（机制沿用户覆写标记：!!直接做 / ??先看方案）。
 * 幂等：正文已以同标记开头（用户手打）就不再拼——否则 !!+L0 档会落
 * 「!!直接做 !!直接做 …」的重复前缀（取证 20260825-41e3 缺陷①）。
 * 空体硬化：纯空白正文返回 ''——绝不产出只有标记没有命令的文本（缺陷②）。 */
export function applyGradeMarker(text: string, grade: ComposerGrade): string {
  const body = text.trim()
  if (body === '') return ''
  if (grade === 'L0') return body.startsWith('!!直接做') ? body : `!!直接做 ${body}`
  if (grade === 'L2') return body.startsWith('??先看方案') ? body : `??先看方案 ${body}`
  return body
}

/** V14 起草器星球选择 → 命令文本标记行（协议 token，跨皮肤同文；写侧 relay/skill
 *  教大副：任务必须发布到该 workspacePath；续接未带标记=沿用父代任务工作区）。
 *  null（大副定）不拼；幂等：正文已含同星球标记行不重复拼。 */
export function applyBattlefieldMarker(text: string, bf: string | null): string {
  const body = text.trim()
  if (body === '' || bf === null) return body
  const marker = `【星球：${bf}】`
  return body.includes(marker) ? body : `${body}
${marker}`
}

/** V16.4 critique P1-1：人读标题剥协议标记行——【星球：…】（V16 正典）与【战场：…】
 *  （V14 旧令，解析双兼容）是给大副看的机器语法，不该成为聚焦页 H1 / 续接 chips /
 *  调度卡标题里人类读到的第一串字符（截断 Windows 路径占满标题位）。
 *  只剥「整行恰为标记」的行；剥完为空则退回原文（绝不产出空标题）。
 *  档位前缀（!!直接做/??先看方案）保留——那是元首自己的意图信号，不是机器词汇。 */
export function displayTitleOf(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '' && !/^【(?:星球|战场)：.+】$/.test(l))
  const t = lines[0] ?? ''
  return t === '' ? text.trim() : t
}
