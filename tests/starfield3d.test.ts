import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ease, pad2, qbez, warzonePlanets } from '../src/client/warzone-scene.ts'

/** V11.4 warzone demo 移植的纯函数面：星球布局确定性（红线①——同种子恒同貌，
 * SSE 零抖动、探针可断言的根基）+ 贝塞尔航迹几何。 */

test('warzonePlanets: 16 星、大3 中6 小7、命名/编号齐全', () => {
  const a = warzonePlanets()
  assert.equal(a.length, 16)
  assert.equal(a.filter(p => p.cls === 'large').length, 3)
  assert.equal(a.filter(p => p.cls === 'medium').length, 6)
  assert.equal(a.filter(p => p.cls === 'small').length, 7)
  assert.equal(a[0]!.name, '克洛诺斯 · P-01')
  assert.equal(a[15]!.name, '恩底弥翁 · P-16')
  for (const p of a) {
    if (p.cls === 'large') assert.ok(p.radius >= 9 && p.radius <= 13)
    else if (p.cls === 'medium') assert.ok(p.radius >= 4.5 && p.radius <= 6.5)
    else assert.ok(p.radius >= 1.8 && p.radius <= 3)
    assert.ok(p.orbit.ecc >= 0.05 && p.orbit.ecc <= 0.22, '偏心率带距')
    assert.ok(p.level >= 1 && p.level <= 4)
  }
})

test('warzonePlanets: 同种子恒同布局（SSE 零抖动根基）、异种子异貌', () => {
  assert.deepEqual(warzonePlanets('warzone'), warzonePlanets('warzone'))
  assert.notDeepEqual(warzonePlanets('warzone'), warzonePlanets('other-seed'))
})

test('warzonePlanets: 24 次拒绝采样后任意两星间距 > 半径和（球面近似）', () => {
  const ps = warzonePlanets()
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i]!, b = ps[j]!
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    assert.ok(d > a.radius + b.radius + 4, `${a.name}↔${b.name} d=${d.toFixed(1)}`)
  }
  // 母舰净空：内圈轨道 r ≥60，初始位不进母舰 36 半径拾取域。
  for (const p of ps) assert.ok(Math.hypot(p.x, p.y, p.z) > 40, `${p.name} 距原点 ${Math.hypot(p.x, p.y, p.z).toFixed(0)}`)
})

test('qbez: t=0/1 端点精确、t=.5 近控制点中点', () => {
  const a = { x: 0, y: 0, z: 0 }, c = { x: 10, y: 20, z: 30 }, b = { x: 20, y: 0, z: 0 }
  const out = { x: 0, y: 0, z: 0 }
  qbez(a, c, b, 0, out)
  assert.deepEqual([out.x, out.y, out.z], [0, 0, 0])
  qbez(a, c, b, 1, out)
  assert.deepEqual([out.x, out.y, out.z], [20, 0, 0])
  qbez(a, c, b, 0.5, out)
  assert.deepEqual([out.x, out.y, out.z], [10, 10, 15])
})

test('ease/pad2: 缓动端点与补零（demo 逐字行为）', () => {
  assert.equal(ease(0), 0)
  assert.equal(ease(1), 1)
  assert.ok(ease(0.25) < 0.25, '前半程慢启动')
  assert.equal(pad2(3), '03')
  assert.equal(pad2(17), '17')
})
