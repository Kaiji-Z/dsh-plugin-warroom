/**
 * 取证探针（命令 cmd-20260825-211902-94b6）：对指定命令执行**真实 war_triage
 * 工具**——档位强制是宿主侧代码（tools.ts 的 overrideMarkerOf 压过参谋建议），
 * 与「谁调用工具」无关，因此探针可以确定性复现分诊环节，不依赖 LLM。
 * 浏览器取证（scripts/shoot-composer.py）在起草器提交后调用本探针完成
 * 「参谋接令 + 分诊」，使命令卡显示强制档（档位 chip 来自 fold 的
 * directive_triaged 事件）。
 *
 * Usage: node --import tsx scripts/triage-probe.ts <stateDir> <commandId> <suggested> [reason]
 *   suggested: L0|L1|L2 —— 取证时故意传与文本标记相反的建议，验证强制改档。
 * stdout 末行输出 JSON：{ ok, commandId, grade, suggested, override?, already? }
 *   already=true 表示命令已被（在线参谋会话）分诊——同一宿主侧强制路径，
 *   探针直接回读落账档位，不重复分诊（war_triage 每命令只许一次）。
 */
import { join } from 'node:path'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'

const PROBE = 'sec-forensic-probe'
const [dir, commandId, suggestedArg, reasonArg] = process.argv.slice(2)
if (dir === undefined || commandId === undefined || suggestedArg === undefined) {
  console.error('usage: triage-probe.ts <stateDir> <commandId> <suggested> [reason]')
  process.exit(2)
}
const reason = reasonArg ?? '取证探针分诊'
// 与 tests/composer-marker-e2e.test.ts 同款显式旗（纯显式、确定性）。
const flags: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-triage,staff-plan' })

const roster: Roster = { units: [], errors: [] }
const deps: Parameters<typeof warTools>[0] = {
  store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
  stateDir: dir,
  maxUnits: 4,
  maxAttempts: 3,
  roster: () => roster,
  subagents: {} as SubagentsServiceFace,
  commander: { conscript: async () => ({ spawned: false }) },
  workspace: {
    materialize: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }),
    materializeInstance: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }),
  },
  warRoot: 'C:/reg',
  flags,
}

const directive = loadDirectives(dir).find(d => d.id === commandId)
if (directive === undefined) {
  console.log(JSON.stringify({ ok: false, error: `command ${commandId} not found in ${dir}` }))
  process.exit(1)
}
if (directive.grade !== undefined) {
  console.log(JSON.stringify({ ok: true, already: true, commandId, grade: directive.grade }))
  process.exit(0)
}
// 参谋接令（真实链路里由命令引信落；探针代落，fold 语义等价）。
appendDirectiveEvent(dir, { type: 'directive_received', ts: new Date().toISOString(), directiveId: commandId, staffSessionId: PROBE })
const tool = warTools(deps).find(t => t.name === 'war_triage')
if (tool === undefined) {
  console.log(JSON.stringify({ ok: false, error: 'war_triage tool missing' }))
  process.exit(1)
}
const result = await tool.execute(
  { command_id: commandId, grade: suggestedArg, reason },
  { agent: { id: PROBE }, signal: new AbortController().signal },
) as { commandId: string; grade: string; suggested: string; override?: string }
console.log(JSON.stringify({ ok: true, commandId, ...result }))
