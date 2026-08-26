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
import { resolveStateDir } from './state.ts'

/** 播种器随态写入的假会话清单：fakeId → 会话显示名。 */
export type DemoSessionManifest = Record<string, string>

/** 织换产物（落盘为 .demo-woven.json 标记）。 */
export interface DemoWovenMarker {
  wovenAt: string
  mapping: Record<string, string>
}

/** 持久真号映射（.demo-real-map.json）——播种器重播只清 woven 标记不清本档，
 * 二次重建凭它复用宿主既有会话、零新建（V9.12 ③；不赌宿主冷列表时机）。 */
export function readRealMap(stateDir: string): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, '.demo-real-map.json'), 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof k === 'string' && k !== '' && typeof v === 'string' && v !== '') out[k] = v
    }
    return out
  } catch {
    return {}
  }
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
 * 会话创建失败 / 拒绝在真实目录上织换）。会话建在 **currentRoot**（宿主进程
 * cwd=web 端当前工作区）而非 war root——web 侧栏/跳转只认当前工作区的会话列表，
 * 建在 war 工作区里的会话 sessions.open 选不中（V9.11 实测：假号抛 unknown
 * session、war 工作区真号静默不切）。演示会话是道具，住进当前工作区才能让每一
 * 次点击都真跳转。
 *
 * V9.12 ③ 会话复用：宿主会话目录里已有同名「演示·X」时直接复用（marker 被清
 * 而宿主会话仍在的二次重建不再新增会话——泄漏实测 2.5h 36 个）。⑦ 真实目录
 * 守卫：stateDir 解析为默认真实数据目录时拒绝织换（演示只许进隔离 .smoke-state）。
 */
export async function weaveDemoSessions(stateDir: string, faces: { sessions: Pick<SessionsApiFace, 'create' | 'rename'> & Pick<Partial<SessionsApiFace>, 'list'>; currentRoot: string }): Promise<boolean> {
  if (stateDir === resolveStateDir('')) {
    console.log('[warroom] demo weave REFUSED: stateDir is the default real data dir — reseed an isolated .smoke-state instead')
    return false
  }
  if (readMarker(stateDir) !== null) return false
  const manifest = readManifest(stateDir)
  if (manifest === null) return false
  // ③ 复用三级：持久真号映射（重播幸存，确定性）→ 宿主列表按「演示·」名匹配
  // （尽力而为——冷列表时机/标题投影都是宿主边界）→ 全新建。
  const known = readRealMap(stateDir)
  const reusable = new Map<string, string>()
  if (faces.sessions.list !== undefined) {
    try {
      const listed = await faces.sessions.list({ rpcId: 'warroom-demo-weave-list', payload: {} })
      if (listed.result.ok) {
        for (const item of listed.result.value.items) {
          const name = item.title ?? item.displayTitle
          if (name.startsWith('演示·')) reusable.set(name, item.id)
        }
      }
    } catch {
      // 列举失败退回「全部新建」——复用是优化不是正确性依赖。
    }
  }
  const mapping: Record<string, string> = {}
  let reused = 0
  for (const [fake, title] of Object.entries(manifest)) {
    const wanted = `演示·${title}`
    const fromMap = known[fake]
    const fromList = reusable.get(wanted)
    const existing = fromMap ?? fromList
    if (existing !== undefined) {
      mapping[fake] = existing
      reused += 1
      continue
    }
    const created = await faces.sessions.create({ rpcId: `warroom-demo-weave-${fake}`, payload: { cwd: faces.currentRoot } })
    if (!created.result.ok) {
      console.log(`[warroom] demo weave: create failed for ${fake}: ${created.result.error.code}`)
      return false
    }
    const sessionId = created.result.value.sessionId
    void faces.sessions.rename({ rpcId: `warroom-demo-weave-rename-${fake}`, payload: { sessionId, title: wanted } }).catch(() => undefined)
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
  // 真号映射持久化（合并旧档）——播种器重播只清 woven 标记；下次开机凭它零新建。
  writeFileSync(join(stateDir, '.demo-real-map.json'), JSON.stringify({ ...known, ...mapping }, null, 2))
  console.log(`[warroom] demo woven: ${Object.keys(mapping).length} fake session ids swapped for real ones (${reused} reused, ${Object.keys(mapping).length - reused} created)`)
  return true
}
