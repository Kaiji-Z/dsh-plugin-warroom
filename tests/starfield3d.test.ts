import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archetypeOf, attemptPhaseOf, clampCam, dampCam, ease, pad2, planetNoise, planCallouts, qbez, truncateForArc, warLogOf, warzoneLayoutFor, warzonePlanets, WZ_CAM_DIST_MAX, WZ_CAM_DIST_MIN, WZ_CAM_HOME, WZ_CAM_PITCH_MAX, WZ_CAM_PITCH_MIN, wzCamBounds, wzStatusText } from '../src/client/warzone-scene.ts'

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
    // V11.5g（舰长令）：星阶以 HQ 为锚整体上调——旧 LV4 大星档(9-13)降为小星档。
    if (p.cls === 'large') assert.ok(p.radius >= 19 && p.radius <= 24)
    else if (p.cls === 'medium') assert.ok(p.radius >= 14 && p.radius <= 18)
    else assert.ok(p.radius >= 9 && p.radius <= 13)
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
  // 星舰净空：内圈轨道 r ≥60，初始位不进星舰 36 半径拾取域。
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
  const clsOf = new Map(a.map(p => [p.name, p.cls]))
  assert.equal(clsOf.get('deploy'), 'large')
  assert.equal(clsOf.get('alpha'), 'large')
  assert.equal(clsOf.get('ui'), 'medium')
  assert.equal(clsOf.get('ops'), 'small')
  assert.equal(a[0]!.name, 'alpha', 'V18 命名=目录名（编号退役）')
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
  // 最短弧：跨 2π→0 回绕边界必须向前小幅推进，不得反向扫大半圈。
  const wrapStep = dampCam({ yaw: 6.2, pitch: 0.5, dist: 200 }, { yaw: 0.1, pitch: 0.5, dist: 200 }, 1 / 60)
  assert.ok(wrapStep.yaw > 6.15 && wrapStep.yaw < Math.PI * 2, `回绕边界应向前推进（+0.18 弧度方向），got ${wrapStep.yaw}`)
})

test('V11.5g wzCamBounds: 缩放界随星体/布局/视高实时限界（舰长令）', () => {
  // 近界防穿模：随最大星体抬升，且 HQ 船体（~15）打底。
  const b0 = wzCamBounds(9, 24, 334, 800)
  assert.ok(b0.min >= Math.max(24, 15) * 2.3, `近界≥max(星体,HQ)×2.3，got ${b0.min}`)
  // 远界双卡：星球取景（(外沿+最大星)×2.6）与最小星可见性取小；不低于初始机位（复位永合法）。
  assert.ok(b0.max <= (334 + 24) * 2.6 + 1 && b0.max >= WZ_CAM_HOME.dist, `远界∈[home, (外沿+最大星)×2.6]，got ${b0.max}`)
  // 视高越大（同星体），可见性界越远。
  const bTall = wzCamBounds(9, 24, 334, 1600)
  assert.ok(bTall.max > b0.max || b0.max === (334 + 24) * 2.6, '视高↑远界↑（或已被取景卡封顶）')
  // 大布局允许拉得更远（取景卡随外沿扩张）。
  const bWide = wzCamBounds(9, 24, 800, 800)
  assert.ok(bWide.max > b0.max, '外沿↑远界↑')
  // 小星球也有底线：max ≥ home、min < max。
  const bTiny = wzCamBounds(9, 13, 60, 600)
  assert.ok(bTiny.max >= WZ_CAM_HOME.dist && bTiny.min < bTiny.max, `小星球界退化仍合法，got ${JSON.stringify(bTiny)}`)
  // clampCam/dampCam 可选界参：动态界生效且兼容旧无参调用。
  assert.equal(clampCam({ yaw: 0, pitch: 0.5, dist: 5000 }, b0.min, b0.max).dist, b0.max)
  assert.equal(clampCam({ yaw: 0, pitch: 0.5, dist: 10 }, b0.min, b0.max).dist, b0.min)
  assert.equal(clampCam({ yaw: 0, pitch: 0.5, dist: 99999 }).dist, WZ_CAM_DIST_MAX, '无参退静态常数（向后兼容）')
  assert.equal(dampCam({ yaw: 0, pitch: 0.5, dist: 300 }, { yaw: 0, pitch: 0.5, dist: 5000 }, 0, 9, b0.min, b0.max).dist, b0.max, 'dt=0 吸附也吃动态界')
})

test('V11.5h NASA 自然色：archetypeOf 确定性+六型全覆盖；planetNoise 确定性', () => {
  const ws = Array.from({ length: 120 }, (_, i) => `D:/repo/p${i}`)
  const kinds = new Set(ws.map(w => archetypeOf(w)))
  for (const k of ['gas', 'icegas', 'rust', 'gray', 'ice', 'terra'] as const) assert.ok(kinds.has(k), `${k} 应在 120 路径谱内出现`)
  assert.equal(archetypeOf('D:/repo/alpha'), archetypeOf('D:/repo/alpha'), '同 ws 恒同型（SSE 零抖动）')
  const n1 = planetNoise('n:1', 0.3, 0.7)
  assert.equal(n1, planetNoise('n:1', 0.3, 0.7), '同 seed 恒同值')
  assert.ok(n1 >= 0 && n1 <= 1, 'fBm 值域 [0,1]')
  assert.notEqual(n1, planetNoise('n:2', 0.3, 0.7), '异 seed 异值')
})

test('审计轮·批次3：wzStatusText 状态 key→词典显示词（英文枚举做判别、词典出词——改词不静默失配）', () => {
  const sf = { wzStWait: '待进攻', wzStBattle: '执行中', wzStHeld: '已占领' }
  assert.equal(wzStatusText('wait', sf), '待进攻')
  assert.equal(wzStatusText('battle', sf), '执行中')
  assert.equal(wzStatusText('held', sf), '已占领')
})

test('sd 回流：truncateForArc 长名弧排省略号截断（…计入预算绝不超线）', () => {
  const m = (ch: string): number => ch.codePointAt(0)! % 5 + 1  // 每字 1-5px 确定性宽
  assert.equal(truncateForArc(m, '短名', 100), '短名', '放得下原样返回')
  const cut = truncateForArc(m, '很长很长的星球目录名', 20)
  assert.ok(cut.endsWith('…'), '截断必补省略号')
  let w = 0
  for (const ch of [...cut]) w += m(ch)
  assert.ok(w <= 20, `截断结果绝不超预算（${w}px ≤ 20px）`)
  assert.equal(truncateForArc(m, '长名', 1), '…', '首字就放不下只留省略号')
})

test('sd 回流：planCallouts 引线铭牌摆放（侧别朝盘外/同侧堆叠防撞/越界翻侧）', () => {
  // 右半盘两星：铭牌都在右侧（side=1），纵向堆叠 ≥minGap 不相撞。
  const places = planCallouts(100, 100, [
    { id: 'a', x: 140, y: 90, r: 10, w: 30 },
    { id: 'b', x: 150, y: 94, r: 10, w: 30 },
  ], { x0: 0, x1: 300 })
  assert.equal(places.size, 2)
  const pa = places.get('a')!, pb = places.get('b')!
  assert.equal(pa.side, 1); assert.equal(pb.side, 1)
  assert.ok(Math.abs(pa.ly - pb.ly) >= 17 - 1e-9, '同侧铭牌按 minGap 堆叠防撞')
  assert.equal(pa.align, 'left', '右半盘铭牌文本右起点左对齐（朝盘外伸展）')
  // 左半盘：侧别翻到 -1，align 翻 right。
  const pl = planCallouts(100, 100, [{ id: 'l', x: 75, y: 100, r: 10, w: 30 }], { x0: 0, x1: 300 })
  assert.equal(pl.get('l')!.side, -1)
  assert.equal(pl.get('l')!.align, 'right')
  // 右缘越界：铭牌翻侧到星球左侧（align=right），文本不再越出安全区。
  const pe = planCallouts(0, 100, [{ id: 'e', x: 290, y: 100, r: 8, w: 40 }], { x0: 0, x1: 300 })
  const qe = pe.get('e')!
  assert.equal(qe.align, 'right', '越出右界即翻侧')
  assert.ok(qe.tx - 40 >= 0, '翻侧后文本左缘仍在安全区内')
})
