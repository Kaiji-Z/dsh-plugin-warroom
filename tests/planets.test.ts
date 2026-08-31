/**
 * B1-件④ planets 注册库纯函数——幂等注册 / 坏行跳过 / 后写覆盖 title。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadPlanets, registerPlanet } from '../src/planets.ts'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-planets-'))
}

test('件④: 注册同路径幂等——重复注册不落第二笔', () => {
  const dir = tmpDir()
  try {
    const a = registerPlanet(dir, 'D:/proj/a', 'A')
    assert.equal(a.length, 1)
    const again = registerPlanet(dir, 'D:/proj/a', '改名')
    assert.equal(again.length, 1, '同路径幂等，不追加')
    assert.equal(again[0]!.title, 'A', '先注册的 title 存续（幂等不覆盖）')
    const b = registerPlanet(dir, 'D:/proj/b')
    assert.equal(b.length, 2)
    assert.equal(b.find(p => p.path === 'D:/proj/b')!.title, null, '未给 title=null')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: 坏行跳过 + 后写覆盖先写（手工直写注册账本）', () => {
  const dir = tmpDir()
  try {
    const file = join(dir, 'planets.jsonl')
    writeFileSync(file, [
      JSON.stringify({ type: 'planet_registered', ts: 't0', path: 'D:/x', title: '旧名' }),
      '{"type":"planet_regis',
      JSON.stringify({ type: 'other_event', ts: 't1' }),
      JSON.stringify({ type: 'planet_registered', ts: 't2', path: 'D:/x', title: '新名' }),
      '',
    ].join('\n'))
    const planets = loadPlanets(dir)
    assert.equal(planets.length, 1)
    assert.equal(planets[0]!.title, '新名', '后写覆盖先写')
    assert.equal(planets[0]!.registeredAt, 't2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: 空目录/无文件 → 空表', () => {
  const dir = tmpDir()
  try {
    assert.deepEqual(loadPlanets(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
