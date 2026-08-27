import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CAM_DIST_MAX, CAM_DIST_MIN, CAM_PITCH_MAX, CAM_PITCH_MIN, camPosition, clampCam, dampCam, galaxyLayout3D, initialCam, moonPos3D, ringRadius3D } from '../src/client/starfield3d.tsx'

/** V11 P2 3D 星域纯数学：相机夹持/阻尼、恒星系 3D 布局确定性、初始机位自适应。
 * 红线①：同输入恒同输出——SSE revision 翻新零抖动的数学根基。 */

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

test('galaxyLayout3D: 确定性 + 环序单调外扩 + 纵深有界', () => {
  const ws = ['a/ws1', 'b/ws2', 'c/ws3', 'd/ws4']
  const l1 = galaxyLayout3D(ws)
  const l2 = galaxyLayout3D(ws)
  assert.deepEqual(l1, l2, '同输入恒同输出')
  assert.equal(l1.length, ws.length)
  assert.deepEqual(l1.map(p => p.ring), [1, 2, 3, 4])
  for (const p of l1) {
    const r = Math.hypot(p.x, p.z)
    assert.ok(Math.abs(r - ringRadius3D(p.ring)) < 0.01, `环半径贴合：ring=${p.ring}`)
    assert.ok(Math.abs(p.y) <= 6, '纵深起伏 ±6 内')
  }
})

test('moonPos3D: 同会话恒同位、槽位偏移生效、绕行星有界', () => {
  const planet = galaxyLayout3D(['w/alpha'])[0]!
  const a1 = moonPos3D(planet, 'sess-x')
  const a2 = moonPos3D(planet, 'sess-x')
  assert.deepEqual(a1, a2)
  const b = moonPos3D(planet, 'sess-x', Math.PI / 3)
  assert.notDeepEqual(a1, b)
  const d = Math.hypot(b.x - planet.x, b.y - planet.y, b.z - planet.z)
  assert.ok(d <= 11, `光点在近地轨道内：d=${d.toFixed(2)}`)
})

test('initialCam: 外环越大机位越远、恒在夹持带内、看轴恒过原点', () => {
  const small = initialCam(2, 1.8)
  const big = initialCam(9, 1.8)
  assert.ok(big.dist > small.dist)
  assert.ok(small.dist >= CAM_DIST_MIN && big.dist <= CAM_DIST_MAX)
  const wide = initialCam(9, 2.6)
  assert.ok(wide.dist <= big.dist, '宽画幅不需要退那么远')
  // V11 收口：窄板中带（safeWidthFrac）收缩——初始机位按可用带宽退远
  const pod = initialCam(9, 1.16, 0.36)
  assert.ok(pod.dist > big.dist, '中带被浮舱吃掉时机位应更远（1280 实抓）')
  const p = camPosition(initialCam(3, 1.8))
  assert.ok(Math.hypot(p.x, p.y, p.z) > 0)
})
