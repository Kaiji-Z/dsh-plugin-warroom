/**
 * B1-件③ JSONL 装载缓存：进程内 mtime+size 指纹缓存「原始事件数组」。三条
 * append-only 日志（campaigns/directives/threads）+ planets 的读取原先每次
 * readFileSync 全量重读——板请求、引信 tick、SSE 连接周期全是 O(总事件数) 的
 * 磁盘读。指纹与 boardRevision 同思路：append 必然改 size（append-only 纪律），
 * 不存在同尺寸覆写，mtime+size 联合判据可靠。
 *
 * 只缓存「解析后的原始事件数组」，不缓存 fold 结果——fold 是纯 CPU（微秒级），
 * IO+JSON.parse 才是大头；缓存 fold 会把可变对象跨调用方共享，风险不成比例。
 * state.json 不进缓存（writeFileSync 覆写式，同尺寸覆写真实存在）。
 * @module dsh-plugin-warroom/fold-cache
 */

import { readFileSync, statSync } from 'node:fs'

interface CacheEntry {
  readonly mtimeMs: number
  readonly size: number
  readonly value: unknown
}

const cache = new Map<string, CacheEntry>()

/** 探针计数器（只增不减；测试与 trace 用——「未变更→零重读」的机检判据）。 */
const probe = { fileReads: 0, cacheHits: 0 }

/**
 * Read one JSONL log through the fingerprint cache. `parse` receives a
 * trimmed non-empty line and returns the parsed value (throw to skip a torn
 * line — same discipline as the old per-loop try/catch). A file that stops
 * existing clears its entry and reads as empty.
 */
export function readJsonlCached<T>(file: string, parse: (line: string) => T): T[] {
  let st: { mtimeMs: number; size: number }
  try {
    st = statSync(file)
  } catch {
    cache.delete(file)
    return []
  }
  const hit = cache.get(file)
  if (hit !== undefined && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    probe.cacheHits += 1
    return hit.value as T[]
  }
  probe.fileReads += 1
  const value: T[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      value.push(parse(trimmed))
    } catch {
      // Crash-torn tail line: ignore, the log stays append-only.
    }
  }
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, value })
  return value
}

/** Cache counters for tests and trace（B1-件③ 机检判据的读计数器）。 */
export function foldCacheProbe(): Readonly<{ fileReads: number; cacheHits: number }> {
  return { ...probe }
}

/** Test hook: drop every cached entry (fresh tmp dirs make this a no-op in prod). */
export function __resetFoldCacheForTests(): void {
  cache.clear()
  probe.fileReads = 0
  probe.cacheHits = 0
}
