import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CAM_DIST_MAX, CAM_DIST_MIN, CAM_PITCH_MAX, CAM_PITCH_MIN, archetypeOf, camPosition, clampCam, dampCam, galaxyLayout3D, initialCam, layoutExtent, moonPos3D, planetNoise } from '../src/client/starfield3d.tsx'

/** V11.2 3D 太空战区纯数学：相机夹持/阻尼、松散散布确定性（元首规格②——不再
 * 同心环）、光点近地轨道、初始机位按外沿自适应。红线①：同输入恒同输出——
 * SSE revision 翻新零抖动的数学根基。 */

test('clampCam: yaw 环绕归一、pitch/dist 落夹持带', () => {
  const c = clampCam({ yaw: -0.5, pitch: 99, dist: 1 })
  assert.ok(c.yaw >= 0 && c.yaw < Math.PI * 2)
  assert.equal(c.pitch, CAM_PITCH_MAX)
  assert.equal(c.dist, CAM_DIST_MIN)
  const c2 = clampCam({ yaw: 7, pitch: 0, dist: 9999 })
  assert.ok(c2.yaw < Math.PI * 2)
  assert.equal(c2.pitch, CAM_PITCH_MIN)
  assert.equal(c2.dist, CAM_DIST_MAX)
})

test('dampCam: 指数趋近——大步长时间近似直达，永不越界', () => {
  const cur = { yaw: 0, pitch: 0.5, dist: 200 }
  const target = { yaw: 1, pitch: 0.9, dist: 100 }
  const one = dampCam(cur, target, 1 / 60)
  assert.ok(one.yaw > 0 && one.yaw < target.yaw, '一步后应在两者之间')
  const big = dampCam(cur, target, 10)
  assert.ok(Math.abs(big.yaw - target.yaw) < 0.01, '大 dt 逼近目标')
  const clamped = dampCam(cur, { yaw: 0, pitch: 99, dist: 1 }, 10)
  assert.equal(clamped.pitch, CAM_PITCH_MAX, '阻尼结果仍受夹持')
})

test('galaxyLayout3D: 确定性 + 大中小分级 + 母舰净空 + 松散散布互不叠', () => {
  const ws = ['a/ws1', 'b/ws2', 'c/ws3', 'd/ws4', 'e/ws5', 'f/ws6', 'g/ws7', 'h/ws8', 'i/ws9']
  const l1 = galaxyLayout3D(ws)
  const l2 = galaxyLayout3D(ws)
  assert.deepEqual(l1, l2, '同输入恒同输出（SSE 零抖动根基）')
  assert.equal(l1.length, ws.length)
  assert.deepEqual(l1.map(p => p.ring), ws.map((_, i) => i + 1))
  // 元首规格②：大小强烈分异——先两颗大、再三颗中、其余小。
  for (const p of l1.slice(0, 2)) assert.ok(p.size >= 9 && p.size <= 12, `大星半径带：${p.size}`)
  for (const p of l1.slice(2, 5)) assert.ok(p.size >= 5.2 && p.size <= 7.2, `中星半径带：${p.size}`)
  for (const p of l1.slice(5)) assert.ok(p.size >= 2.6 && p.size <= 3.8, `小星半径带：${p.size}`)
  // 母舰净空：船体全长 ~34，一切星球离原点 ≥40。
  for (const p of l1) assert.ok(Math.hypot(p.x, p.y, p.z) > 40, `母舰净空：${p.wsPath}`)
  // 松散但不叠：任意两星间距 > 两星半径和（拒绝采样兜底也至少不重合）。
  for (let i = 0; i < l1.length; i++) for (let j = i + 1; j < l1.length; j++) {
    const a = l1[i]!, b = l1[j]!
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    assert.ok(d > a.size + b.size, `星球不叠：${a.wsPath}↔${b.wsPath} d=${d.toFixed(1)}`)
  }
  // 「不需要规整同心圆」：星球距原点的距离集合不应全等（有松散随机带）。
  const radii = new Set(l1.map(p => Math.round(Math.hypot(p.x, p.y, p.z))))
  assert.ok(radii.size >= Math.min(ws.length, 6), `散布半径应多值：${[...radii].join(',')}`)
})

test('layoutExtent: 外沿=最远星球距', () => {
  const l = galaxyLayout3D(['a/x', 'b/y', 'c/z'])
  const ext = layoutExtent(l)
  assert.ok(ext > 40 && ext <= 160)
  assert.equal(ext, Math.max(...l.map(p => Math.hypot(p.x, p.y, p.z))))
})

test('moonPos3D: 同会话恒同位、槽位偏移生效、绕行星有界且随星等缩放', () => {
  const planets = galaxyLayout3D(['w/a', 'w/b', 'w/c', 'w/d', 'w/e', 'w/f'])
  const big = planets[0]!, small = planets[5]! // 首星=大、第 6 星=小
  const a1 = moonPos3D(big, 'sess-x')
  const a2 = moonPos3D(big, 'sess-x')
  assert.deepEqual(a1, a2)
  const b = moonPos3D(big, 'sess-x', Math.PI / 3)
  assert.notDeepEqual(a1, b)
  const mp = moonPos3D(big, 'sess-x')
  const dBig = Math.hypot(mp.x - big.x, mp.y - big.y, mp.z - big.z)
  const sp = moonPos3D(small, 'sess-y')
  const dSmall = Math.hypot(sp.x - small.x, sp.y - small.y, sp.z - small.z)
  // 轨道面微倾（椭圆投影），3D 距离 ∈ [0.73r, r]——按椭圆下界断言。
  assert.ok(dBig >= (big.size + 3.5) * 0.7, `大星轨道半径随星等放大：${dBig.toFixed(1)} vs ${big.size}`)
  assert.ok(dSmall > 0 && dSmall < dBig, `小星轨道不越大星：${dSmall.toFixed(1)}`)
})

test('initialCam: 外沿越大机位越远、恒在夹持带内、中带收缩退远', () => {
  const small = initialCam(80, 1.8)
  const big = initialCam(160, 1.8)
  assert.ok(big.dist > small.dist)
  assert.ok(small.dist >= CAM_DIST_MIN && big.dist <= CAM_DIST_MAX)
  const wide = initialCam(160, 2.6)
  assert.ok(wide.dist <= big.dist, '宽画幅不需要退那么远')
  // 窄板中带（safeWidthFrac）收缩——初始机位按可用带宽退远（1280 实抓）。
  const pod = initialCam(160, 1.16, 0.36)
  assert.ok(pod.dist > big.dist, '中带被浮舱吃掉时机位应更远')
  const p = camPosition(initialCam(100, 1.8))
  assert.ok(Math.hypot(p.x, p.y, p.z) > 0)
})

test('V11.3 planetNoise/archetypeOf: 同种子恒同值、异种子异值、值域 [0,1]、原型合法', () => {
  assert.equal(planetNoise('te:w/a', 0.3, 0.6), planetNoise('te:w/a', 0.3, 0.6), '同 seed 恒同值（贴图确定性根基）')
  assert.notEqual(planetNoise('te:w/a', 0.3, 0.6), planetNoise('te:w/b', 0.3, 0.6), '异 seed 异貌')
  // 周期性：u 环绕（equirect 接缝两侧同值）。
  assert.ok(Math.abs(planetNoise('k', 0.999, 0.5) - planetNoise('k', 0.001, 0.5)) < 0.35, 'u 环绕近似连续')
  for (let i = 0; i < 60; i++) {
    const v = planetNoise(`k${i}`, i * 0.017, i * 0.031)
    assert.ok(v >= 0 && v <= 1.0001, `值域 [0,1]: ${v}`)
  }
  for (const ws of ['w/a', 'w/b', 'w/c', 'd/e']) {
    assert.equal(archetypeOf(ws), archetypeOf(ws), '同 wsPath 恒同型')
    assert.ok(['gas', 'icegas', 'rust', 'gray', 'ice', 'terra'].includes(archetypeOf(ws)), `原型合法: ${archetypeOf(ws)}`)
  }
})
