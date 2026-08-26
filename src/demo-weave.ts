/**
 * 演示织换（V9.11 demo 升级，元首定案「所有点击都要能正常反映项目实际跳转」）：
 * 播种器写的是假会话号（sec-smoke-session / cmd-*-session），凡「直跳原生会话」
 * 的点击落到宿主不存在的会话上就静默落空。本模块在开机（apiProxy faces 就绪）
 * 时按 manifest 把假号换成宿主**真会话**（建在 war root 工作区、按角色命名），
 * 并原地重写三条 JSONL——织换后孤儿卡/聚焦页跳钮/进入对话 chip 全部真跳转。
 *
 * 幂等：`.demo-woven.json` 标记在即跳过；播种器清态时连标记一起清，下次开机
 * 重织（新会话）。失败永不抛进宿主事件循环（best-effort，坏一档不坏整服）。
 * @module dsh-plugin-warroom/demo-weave
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionsApiFace } from './relay.ts'

/** 播种器随态写入的假会话清单：fakeId → 会话显示名。 */
export type DemoSessionManifest = Record<string, string>

/** 织换产物（落盘为 .demo-woven.json 标记）。 */
export interface DemoWovenMarker {
  wovenAt: string
  mapping: Record<string, string>
}

export function readManifest(stateDir: string): DemoSessionManifest | null {
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, '.demo-sessions.json'), 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) return null
    const out: DemoSessionManifest = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof k === 'string' && k !== '' && typeof v === 'string' && v !== '') out[k] = v
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

export function readMarker(stateDir: string): DemoWovenMarker | null {
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, '.demo-woven.json'), 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) return null
    return raw as DemoWovenMarker
  } catch {
    return null
  }
}

/** 纯函数：按映射做子串置换（假会话号在 JSONL 里只作为字符串值出现，子串替换安全）。 */
export function swapIdsInText(text: string, mapping: Record<string, string>): string {
  let out = text
  for (const [fake, real] of Object.entries(mapping)) out = out.split(fake).join(real)
  return out
}

/**
 * 织换主流程。返回 true=本次完成织换；false=无事可做（无 manifest / 标记已在 /
 * 会话创建失败）。会话建在 **currentRoot**（宿主进程 cwd=web 端当前工作区）而非
 * war root——web 侧栏/跳转只认当前工作区的会话列表，建在 war 工作区里的会话
 * sessions.open 选不中（V9.11 实测：假号抛 unknown session、war 工作区真号静默
 * 不切）。演示会话是道具，住进当前工作区才能让每一次点击都真跳转。
 */
export async function weaveDemoSessions(stateDir: string, faces: { sessions: Pick<SessionsApiFace, 'create' | 'rename'>; currentRoot: string }): Promise<boolean> {
  if (readMarker(stateDir) !== null) return false
  const manifest = readManifest(stateDir)
  if (manifest === null) return false
  const mapping: Record<string, string> = {}
  for (const [fake, title] of Object.entries(manifest)) {
    const created = await faces.sessions.create({ rpcId: `warroom-demo-weave-${fake}`, payload: { cwd: faces.currentRoot } })
    if (!created.result.ok) {
      console.log(`[warroom] demo weave: create failed for ${fake}: ${created.result.error.code}`)
      return false
    }
    const sessionId = created.result.value.sessionId
    void faces.sessions.rename({ rpcId: `warroom-demo-weave-rename-${fake}`, payload: { sessionId, title: `演示·${title}` } }).catch(() => undefined)
    mapping[fake] = sessionId
  }
  // 原地重写三条事件流（campaigns/*.jsonl + directives.jsonl + threads.jsonl）。
  const targets: string[] = []
  try {
    const dir = join(stateDir, 'campaigns')
    if (existsSync(dir)) targets.push(...readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => join(dir, f)))
  } catch { /* no campaigns dir — directives still get woven */ }
  for (const name of ['directives.jsonl', 'threads.jsonl']) {
    const p = join(stateDir, name)
    if (existsSync(p)) targets.push(p)
  }
  for (const p of targets) {
    try {
      writeFileSync(p, swapIdsInText(readFileSync(p, 'utf8'), mapping))
    } catch (err) {
      console.log(`[warroom] demo weave: rewrite failed for ${p}: ${String(err)}`)
    }
  }
  writeFileSync(join(stateDir, '.demo-woven.json'), JSON.stringify({ wovenAt: new Date().toISOString(), mapping } satisfies DemoWovenMarker, null, 2))
  console.log(`[warroom] demo woven: ${Object.keys(mapping).length} fake session ids swapped for real ones`)
  return true
}
