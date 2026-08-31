/**
 * B1-件④ 全局状态 tiny-pointer——缺文件默认态 / 坏 JSON 降级 / save→load 往返 /
 * resolveStateDir 三分支（显式 path / DSH_HOME / 家目录缺省）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadWarState, resolveStateDir, saveWarState, stateFilePath } from '../src/state.ts'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-state-'))
}

test('件④: 缺文件 → 默认关停态；坏 JSON → 同样默认态', () => {
  const dir = tmpDir()
  try {
    assert.deepEqual(loadWarState(dir), { version: 2, active: false })
    writeFileSync(stateFilePath(dir), '{broken json')
    assert.deepEqual(loadWarState(dir), { version: 2, active: false }, '坏 JSON 不炸，降级默认态')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: save → load 往返（active + 指针字段；非法字段被规整掉）', () => {
  const dir = tmpDir()
  try {
    saveWarState(dir, { version: 2, active: true, hqSessionId: 's1', commanderChildId: 'c1' })
    assert.deepEqual(loadWarState(dir), { version: 2, active: true, hqSessionId: 's1', commanderChildId: 'c1' })
    // 手写脏账：active 非 true / 指针非字符串 → 读回规整。
    writeFileSync(stateFilePath(dir), JSON.stringify({ version: 2, active: 'yes', hqSessionId: 42 }))
    const dirty = loadWarState(dir)
    assert.equal(dirty.active, false)
    assert.equal(dirty.hqSessionId, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: resolveStateDir 三分支', () => {
  // 显式 statePath → 其 dirname（node dirname 保留输入的分隔符风格）。
  assert.equal(resolveStateDir('D:/x/y/state.json'), 'D:/x/y')
  // DSH_HOME 环境变量 → <home>/warroom-plugin。
  const saved = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = 'D:/dshhome'
    assert.equal(resolveStateDir(''), join('D:/dshhome', 'warroom-plugin'))
  } finally {
    if (saved === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = saved
  }
  // 都没有 → ~/.dsh/warroom-plugin（只断言尾段，家目录平台差异不硬编码）。
  const saved2 = process.env.DSH_HOME
  try {
    delete process.env.DSH_HOME
    const fallback = resolveStateDir('')
    assert.ok(fallback.endsWith(join('.dsh', 'warroom-plugin')), fallback)
  } finally {
    if (saved2 !== undefined) process.env.DSH_HOME = saved2
  }
})
