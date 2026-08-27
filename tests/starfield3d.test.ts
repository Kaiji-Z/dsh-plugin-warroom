import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attemptPhaseOf, clampCam, dampCam, ease, pad2, qbez, warLogOf, warzoneLayoutFor, warzonePlanets, WZ_CAM_DIST_MAX, WZ_CAM_DIST_MIN, WZ_CAM_PITCH_MAX, WZ_CAM_PITCH_MIN } from '../src/client/warzone-scene.ts'

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

test('V11.5 warzoneLayoutFor: 真实 workspace 谱——确定性/大小按任务量排名/命名编号', () => {
  const ws = ['D:/repo/alpha', 'D:/repo/beta', 'D:/repo/gamma', 'D:/repo/deploy', 'D:/repo/docs', 'D:/repo/ops', 'D:/repo/tools', 'D:/repo/ui', 'D:/repo/web']
  const act = [12, 1, 5, 30, 2, 0, 3, 8, 4]
  const a = warzoneLayoutFor(ws, act)
  const b = warzoneLayoutFor(ws, act)
  assert.deepEqual(a, b, '同谱恒同布局（SSE 零抖动）')
  assert.equal(a.length, ws.length)
  // 任务量 top2（deploy 30/alpha 12）=大星；3-5 名（ui 8/gamma 5/web 4）=中星。
  const clsOf = new Map(a.map(p => [p.name.split(' ·')[0]!, p.cls]))
  assert.equal(clsOf.get('deploy'), 'large')
  assert.equal(clsOf.get('alpha'), 'large')
  assert.equal(clsOf.get('ui'), 'medium')
  assert.equal(clsOf.get('ops'), 'small')
  assert.equal(a[0]!.name, 'alpha · W-01', '命名=目录名 · W-编号')
  // 间距拒绝采样仍生效。
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const d = Math.hypot(a[i]!.x - a[j]!.x, a[i]!.y - a[j]!.y, a[i]!.z - a[j]!.z)
    assert.ok(d > a[i]!.radius + a[j]!.radius, '真实谱星球不叠')
  }
})

test('V11.5 attemptPhaseOf: 配额暂停=驻泊 / 有动词=交战 / 否则=集结', () => {
  assert.equal(attemptPhaseOf(null, false), 'holding')
  assert.equal(attemptPhaseOf('', false), 'holding')
  assert.equal(attemptPhaseOf('编辑中', false), 'battle')
  assert.equal(attemptPhaseOf(null, true), 'deployed', '暂停优先于动词（等你 > 机器在动）')
  assert.equal(attemptPhaseOf('编辑中', true), 'deployed')
})

test('V11.5 warLogOf: 时间倒序 + 30 封顶 + stamp 本地时分', () => {
  const items = [
    { ts: '2026-08-27T10:00:00Z', color: '#a', text: '早' },
    { ts: '2026-08-27T09:00:00Z', color: '#b', text: '更早' },
    ...Array.from({ length: 40 }, (_, i) => ({ ts: `2026-08-26T0${i % 10}:30:00Z`, color: '#c', text: `条目${i}` })),
  ]
  const log = warLogOf(items)
  assert.equal(log.length, 30, '30 封顶')
  assert.equal(log[0]!.text, '早', '最新在前')
  assert.ok(log[0]!.stamp !== undefined && /^\d{2}:\d{2}$/.test(log[0]!.stamp!), 'stamp=本地时分')
})

test('V11.5b 三键相机纯函数：clampCam 夹持/yaw 环绕；dampCam 趋近且 dt=0 直接吸附', () => {
  const c = clampCam({ yaw: -0.5, pitch: 9, dist: 1 })
  assert.ok(c.yaw >= 0 && c.yaw < Math.PI * 2)
  assert.equal(c.pitch, WZ_CAM_PITCH_MAX)
  assert.equal(c.dist, WZ_CAM_DIST_MIN)
  const c2 = clampCam({ yaw: 7, pitch: 0, dist: 99999 })
  assert.equal(c2.pitch, WZ_CAM_PITCH_MIN)
  assert.equal(c2.dist, WZ_CAM_DIST_MAX)
  const cur = { yaw: 0, pitch: 0.5, dist: 200 }
  const tar = { yaw: 1, pitch: 0.9, dist: 100 }
  const one = dampCam(cur, tar, 1 / 60)
  assert.ok(one.yaw > 0 && one.yaw < tar.yaw, '一步在两者之间')
  const snap = dampCam(cur, tar, 0)
  assert.equal(snap.yaw, tar.yaw, 'reduced-motion（dt=0）直接吸附目标')
})
