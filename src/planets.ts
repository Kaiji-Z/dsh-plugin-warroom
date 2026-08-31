/**
 * V18 星球注册库（舰长令：星域的星球=真实工作区，不再是账本路径聚合的
 * 虚拟行星）。planets.jsonl append-only：`planet_registered {path, title?, ts}`。
 * 注册闸（dashboard 路由侧）=路径必须是磁盘上真实存在的目录；宿主 registry
 * 的 workspace.create 同步幂等收编（best-effort，不阻塞注册）。
 * @module dsh-plugin-warroom/planets
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonlCached } from './fold-cache.ts'

export interface PlanetRecord {
  readonly path: string
  readonly title: string | null
  readonly registeredAt: string
}

interface PlanetEvent { readonly type: 'planet_registered'; readonly ts: string; readonly path: string; readonly title?: string }

const fileOf = (dir: string): string => join(dir, 'planets.jsonl')

/** 注册一个工作区为星球（同路径幂等）；返回注册后全量。 */
export function registerPlanet(dir: string, path: string, title: string | null = null, ts = new Date().toISOString()): PlanetRecord[] {
  const cur = loadPlanets(dir)
  if (cur.some(p => p.path === path)) return cur
  appendFileSync(fileOf(dir), `${JSON.stringify({ type: 'planet_registered', ts, path, title: title ?? undefined })}\n`, 'utf8')
  return [...cur, { path, title, registeredAt: ts }]
}

/** 折叠装载注册星球（坏行跳过；后写覆盖先写）。B1-件③：原始事件经指纹缓存。 */
export function loadPlanets(dir: string): PlanetRecord[] {
  const events = readJsonlCached(fileOf(dir), line => JSON.parse(line) as PlanetEvent)
  const byPath = new Map<string, PlanetRecord>()
  for (const ev of events) {
    if (ev.type === 'planet_registered' && typeof ev.path === 'string' && ev.path !== '') {
      byPath.set(ev.path, { path: ev.path, title: typeof ev.title === 'string' ? ev.title : null, registeredAt: ev.ts })
    }
  }
  return [...byPath.values()]
}
