/**
 * B1-件③ 板读路径 mtime 指纹缓存——机检判据（读计数器）：
 * 同进程无写入时重复装载零文件重读；任何 append 后指纹失效并重读到新事件。
 */
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { __resetFoldCacheForTests, foldCacheProbe } from '../src/fold-cache.ts'
import { appendEvent, loadCampaign, readEvents } from '../src/events.ts'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { appendThreadEvent, loadAttachedThreads } from '../src/threads.ts'
import { registerPlanet } from '../src/planets.ts'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-foldcache-'))
}

test('件③: 未变更时重复装载零文件重读（读计数器判据）', () => {
  __resetFoldCacheForTests()
  const dir = tmpDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    const a = readEvents(dir, 'c1')
    const reads1 = foldCacheProbe().fileReads
    assert.ok(reads1 >= 1, '首次装载必须真读盘')
    const b = readEvents(dir, 'c1')
    const c = loadCampaign(dir, 'c1')
    assert.equal(foldCacheProbe().fileReads, reads1, '未变更的重复装载不得再读盘')
    assert.deepEqual(b, a, '命中缓存返回同一份数据')
    assert.equal(c.status, 'draft')
    assert.ok(foldCacheProbe().cacheHits >= 2, '命中计数器在走')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件③: append 后指纹失效并重读到新事件', () => {
  __resetFoldCacheForTests()
  const dir = tmpDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c2', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    loadCampaign(dir, 'c2')
    const reads = foldCacheProbe().fileReads
    appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c2', workspacePath: '/w' })
    const after = loadCampaign(dir, 'c2')
    assert.equal(foldCacheProbe().fileReads, reads + 1, 'append 后必须失效重读一次')
    assert.equal(after.status, 'published', '重读后 fold 看到新事件')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件③: 崩溃撕裂尾行跳过语义沿用（手工直写坏行）', () => {
  __resetFoldCacheForTests()
  const dir = tmpDir()
  try {
    appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c3', title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
    appendFileSync(join(dir, 'campaigns', 'c3.jsonl'), '{"type":"task_publ', { flag: 'a' })
    const events = readEvents(dir, 'c3')
    assert.equal(events.length, 1, '撕裂行被跳过，好行保留')
    assert.equal(loadCampaign(dir, 'c3').status, 'draft')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件③: 文件消失读作空表且清缓存', () => {
  __resetFoldCacheForTests()
  const dir = tmpDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: 'x' })
    assert.equal(loadDirectives(dir).length, 1)
    rmSync(join(dir, 'directives.jsonl'))
    assert.deepEqual(loadDirectives(dir), [], '文件不在=空表（与改前语义一致）')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件③: directives/threads/planets 三路装载同享缓存语义', () => {
  __resetFoldCacheForTests()
  const dir = tmpDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-1', text: 'x' })
    appendThreadEvent(dir, { type: 'thread_attached', ts: 't0', sessionId: 's1', note: 'n' })
    registerPlanet(dir, 'D:/proj/a', 'A')
    loadDirectives(dir); loadDirectives(dir)
    loadAttachedThreads(dir); loadAttachedThreads(dir)
    registerPlanet(dir, 'D:/proj/a') // planets 首次真读（此前文件由 append 诞生，未读过）
    const reads = foldCacheProbe().fileReads
    assert.equal(reads, 3, '三个文件各恰好读一次')
    // 未变更：三路全命中，零重读。
    loadDirectives(dir); loadAttachedThreads(dir); registerPlanet(dir, 'D:/proj/a')
    assert.equal(foldCacheProbe().fileReads, reads)
    // planets append 后：只有 planets 路失效重读，另两路照旧命中。
    registerPlanet(dir, 'D:/proj/b') // 内部装载命中（append 前文件未变），随后追加 b
    loadDirectives(dir); loadAttachedThreads(dir)
    const planets = registerPlanet(dir, 'D:/proj/b') // 内部装载 → 指纹已变 → 重读一次
    assert.equal(foldCacheProbe().fileReads, reads + 1, '只有被 append 的 planets 路重读')
    assert.ok(planets.some(p => p.path === 'D:/proj/b'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
