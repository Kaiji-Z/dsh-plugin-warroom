/**
 * V11.4 星域引擎：space-warzone.html 全要素 1:1 移植（舰长令「完全一比一」）。
 * 世界是 demo 自己的——16 星球战争模拟（待进攻→执行中→已占领→失守反转，永不
 * 落幕）、编队出征/接敌/攻占/返航、2D 指挥室战术视图、战况日志。与项目后端的
 * 数据连线是下一个独立阶段，本模块暂不消费任何板数据。
 *
 * 移植纪律：所有视觉/行为常量与 demo 逐字对齐（CFG/半径带/轨道参数/光晕/ bloom
 * /雷达盘/CRT 质感）；唯一系统性偏差=随机源：demo 的 Math.random 全部换成
 * hash01 确定性种子 det()——同一种子恒同貌（项目红线①，SSE 零抖动、探针可断言）。
 * @module dsh-plugin-warroom/client/warzone-scene
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { hash01 } from './starfield.tsx'
import { readTacPalette, warLogColors, TAC_FALLBACK_DARK, type WarTacPalette, type WzLogKind } from './war-tokens.ts'
import { UNGROUPED_WS_KEY, type WzBridgeFrontLite } from './front.ts'

/* ================================================================
 * 三键相机（舰长定 2026-08-27，V11.5b）：3D 软件范式——左键平移（即时跟手）/
 * 中键旋转（阻尼，绕当前屏幕中心）/ 滚轮缩放（指数）；双击/R 复位含平移归零。
 * 旋转不再恒对准 HQ：center 是被lookAt的锚点，平移推动它——空间记忆由 V11.5a
 * 地形恒定保证，相机 center 与地形坐标解耦。纯函数导出单测。
 * ================================================================ */

export interface WzCamState { yaw: number; pitch: number; dist: number }
export const WZ_CAM_PITCH_MIN = 0.08, WZ_CAM_PITCH_MAX = 1.52
export const WZ_CAM_DIST_MIN = 40, WZ_CAM_DIST_MAX = 800
/** 初始机位（demo 方位角，距离按 V11.5f 分散重排后的外沿拉远）。 */
export const WZ_CAM_HOME: WzCamState = { yaw: Math.atan2(64, 252), pitch: Math.asin(108 / Math.hypot(64, 108, 252)), dist: 350 }

const wzClamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** V11.5g（舰长令）：缩放界随星球实时限界——近界防穿模（最大星体×2.3，HQ 船
 * 体半径 ~15 也入算），远界双卡：最小星可见性（viewH 下仍 ≥9px）与星球取景
 * （布局外沿×2.6）；再兜底不小于初始机位（复位永远合法）。纯函数导出单测。 */
export function wzCamBounds(minR: number, maxR: number, extent: number, viewH: number): { min: number; max: number } {
  const min = Math.max(WZ_CAM_DIST_MIN, Math.max(maxR, 15) * 2.3)
  const visMax = (Math.max(minR, 1) * Math.max(viewH, 320)) / (9 * Math.tan((55 * Math.PI) / 360))
  const extMax = (extent + Math.max(maxR, 1)) * 2.6
  const max = Math.max(Math.min(visMax, extMax, 3200), WZ_CAM_HOME.dist, min * 1.6)
  return { min, max }
}

export function clampCam(c: WzCamState, dMin = WZ_CAM_DIST_MIN, dMax = WZ_CAM_DIST_MAX): WzCamState {
  const yaw = ((c.yaw % (PI2)) + PI2) % PI2
  return { yaw, pitch: wzClamp(c.pitch, WZ_CAM_PITCH_MIN, WZ_CAM_PITCH_MAX), dist: wzClamp(c.dist, Math.min(dMin, dMax), Math.max(dMin, dMax)) }
}

/** 阻尼趋近（指数，k=9）；dt=0（reduced-motion/冻结帧）直接吸附目标。
 * yaw 必须走最短弧：线性插值在 2π→0 回绕边界会反向扫过近一整圈（舰长实抓
 * 「快到 360° 瞬间反向转」）——先折算到 (-π,π] 再插值。 */
export function dampCam(cur: WzCamState, target: WzCamState, dt: number, k = 9, dMin?: number, dMax?: number): WzCamState {
  if (dt <= 0) return clampCam(target, dMin, dMax)
  const t = 1 - Math.exp(-k * dt)
  const TAU = Math.PI * 2
  let dy = target.yaw - cur.yaw
  dy = (((dy + Math.PI) % TAU) + TAU) % TAU - Math.PI
  return clampCam({ yaw: cur.yaw + dy * t, pitch: cur.pitch + (target.pitch - cur.pitch) * t, dist: cur.dist + (target.dist - cur.dist) * t }, dMin, dMax)
}

const PI2 = Math.PI * 2
/** 确定性 rand：[lo,hi) 同 key 恒同值（demo Math.random 的系统性替身）。 */
const det = (k: string, lo: number, hi: number): number => lo + hash01(k) * (hi - lo)
const detBool = (k: string, p: number): boolean => hash01(k) < p

export const pad2 = (n: number): string => String(n).padStart(2, '0')
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** 二次贝塞尔（demo qbez 逐字）：out 为 {x,y,z} 形状即可。 */
export function qbez(a: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, t: number, out: { x: number; y: number; z: number }): void {
  const u = 1 - t
  out.x = u * u * a.x + 2 * u * t * c.x + t * t * b.x
  out.y = u * u * a.y + 2 * u * t * c.y + t * t * b.y
  out.z = u * u * a.z + 2 * u * t * c.z + t * t * b.z
}

/* ================================================================
 * 星球生成（纯）：16 星（大3 中6 小7），松散随机轨道 + 24 次间距拒绝采样。
 * ================================================================ */

export type WzClass = 'large' | 'medium' | 'small'
export type WzStatus = '待进攻' | '执行中' | '已占领'

export interface WzPlanetSpec {
  readonly index: number
  readonly cls: WzClass
  readonly name: string
  readonly radius: number
  readonly level: number
  readonly hue: number
  readonly sat: number
  readonly light: number
  readonly heldStart: boolean
  readonly garrison: number
  readonly rotSpeed: number
  readonly seed: number
  readonly orbit: { r: number; ecc: number; speed: number; angle: number; phase: number; tiltA: number; yBase: number }
  readonly x: number
  readonly y: number
  readonly z: number
}

export const PLANET_NAMES = ['克洛诺斯', '阿瑞斯', '维尔塔', '奥米茄', '泰坦', '涅墨西斯', '卡戎', '伊卡洛斯', '泽塔', '珀尔修斯', '赫尔墨斯', '安泰拉斯', '德罗恩', '弗蕾亚', '洛基', '恩底弥翁']

/** 星球布局（纯，导出供单测钉确定性）：demo §4 逐字，随机全数 det 化。 */
export function warzonePlanets(seed = 'warzone'): WzPlanetSpec[] {
  const hues = [0.58, 0.66, 0.75, 0.55, 0.08, 0.03, 0.14, 0.47]
  const classes: WzClass[] = ['large', 'large', 'large', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'small', 'small', 'small', 'small', 'small', 'small', 'small']
  const placed: Array<{ x: number; y: number; z: number; radius: number }> = []
  return classes.map((cls, i) => {
    const k = `${seed}:${i}`
    // V11.5g（舰长令）：星阶以 HQ（船体半径~15）为锚整体上调——旧 LV4 大星(9-13)
    // 降为 LV1 小星档，中/大按步进续推；拉远小星仍可见（旧 1.8-3 在 dist>500 时不足 4px）。
    const radius = cls === 'large' ? det(`r:${k}`, 19, 24) : cls === 'medium' ? det(`r:${k}`, 14, 18) : det(`r:${k}`, 9, 13)
    const orbit = {
      r: cls === 'large' ? det(`or:${k}`, 175, 260) : cls === 'medium' ? det(`or:${k}`, 95, 175) : det(`or:${k}`, 60, 150),
      ecc: det(`oe:${k}`, 0.05, 0.22),
      speed: det(`os:${k}`, 0.008, 0.028) * (detBool(`od:${k}`, 0.5) ? 1 : -1),
      angle: det(`oa:${k}`, 0, PI2),
      phase: det(`op:${k}`, 0, PI2),
      tiltA: det(`ot:${k}`, 4, 22),
      yBase: det(`oy:${k}`, -38, 38),
    }
    let x = 0, y = 0, z = 0
    for (let tr = 0; tr < 24; tr++) {
      orbit.angle = det(`oa:${k}:${tr}`, 0, PI2)
      orbit.yBase = det(`oy:${k}:${tr}`, -38, 38)
      const rr = orbit.r * (1 + orbit.ecc * Math.sin(orbit.angle * 1.618 + orbit.phase))
      x = Math.cos(orbit.angle) * rr
      z = Math.sin(orbit.angle) * rr
      y = orbit.yBase + Math.sin(orbit.angle * 0.9 + orbit.phase * 2) * orbit.tiltA
      if (placed.every(p => Math.hypot(x - p.x, y - p.y, z - p.z) > p.radius + radius + 20)) break
    }
    placed.push({ x, y, z, radius })
    const heldStart = detBool(`hh:${k}`, 0.4)
    return {
      index: i,
      cls,
      name: `${PLANET_NAMES[i]!} · P-${pad2(i + 1)}`,
      radius,
      level: cls === 'large' ? 4 : cls === 'medium' ? 3 : detBool(`lv:${k}`, 0.5) ? 2 : 1,
      hue: hues[i % hues.length]! + det(`hu:${k}`, -0.03, 0.03),
      sat: det(`sa:${k}`, 0.5, 0.7),
      light: det(`li:${k}`, 0.42, 0.58),
      heldStart,
      garrison: heldStart ? 5 + Math.floor(det(`ga:${k}`, 0, 8)) : 0,
      rotSpeed: det(`rs:${k}`, 0.02, 0.12) * (detBool(`rd:${k}`, 0.5) ? 1 : -1),
      seed: det(`sd:${k}`, 0, 10),
      orbit,
      x, y, z,
    }
  })
}

/* ================================================================
 * 板桥接（V11.5 连线）：宇宙 = 舰长（HQ）+ workspace（星球）+ agent 会话（编队）。
 * 以下纯函数导出单测钉死；demo 自驱模拟（trySpawn/失守反转）在 bridged 态旁路。
 * ================================================================ */

const dirNameOf = (wsPath: string): string => {
  // V13 未分组行星：合成沙盒聚合键——名字词典化（「未分组」），不走目录名。
  if (wsPath === UNGROUPED_WS_KEY) return '未分组'
  const parts = wsPath.split(/[\\/]+/).filter(p => p.length > 0)
  return parts.length > 0 ? parts[parts.length - 1]! : wsPath
}

export interface WzBridgePlanet {
  readonly wsPath: string
  /** 历史任务量（大小分级依据：多仗=大星）。 */
  readonly activity: number
  readonly status: '待进攻' | '执行中' | '已占领'
  /** 达成数（驻军弧）。 */
  readonly garrison: number
  readonly failing: number
  /** 待发（inbound 计数）。 */
  readonly inbound: number
}

export type WzSquadPhase = 'outbound' | 'battle' | 'deployed' | 'holding' | 'return'

export interface WzBridgeSquad {
  readonly sessionId: string
  readonly wsPath: string
  /** 板面判定相位：battle=执行中 / deployed=驻泊（待验收或配额暂停）/ holding=集结待命。 */
  readonly phase: 'battle' | 'deployed' | 'holding'
  readonly verb: string | null
  readonly paused: boolean
  readonly sourceLabel: string | null
  /** 源命令 id（执行卡点击跳聚焦页）。 */
  readonly sourceCommandId: string | null
  /** 活体会话（attempt 未收束）——执行卡只挂活体。 */
  readonly live: boolean
}

/** 真实 workspace 谱系（纯）：沿用 demo 轨道/间距算法，命名=目录名 · W-02，
 * 大小分级按历史任务量排名（前 2 大 / 中 3 / 余小；不足时降级取齐）。 */
export function warzoneLayoutFor(wsPaths: readonly string[], activity: readonly number[], seed = 'bridge'): WzPlanetSpec[] {
  const hues = [0.58, 0.66, 0.75, 0.55, 0.08, 0.03, 0.14, 0.47]
  const rank = wsPaths.map((_, i) => i).sort((a, b) => activity[b]! - activity[a]!)
  const clsOf = new Map<number, WzClass>()
  rank.forEach((idx, r) => { clsOf.set(idx, r < 2 && wsPaths.length > 2 ? 'large' : r < 5 && wsPaths.length > 4 ? 'medium' : 'small') })
  const placed: Array<{ x: number; y: number; z: number; radius: number }> = []
  return wsPaths.map((wsPath, i) => {
    const k = `${seed}:${wsPath}`
    const cls = clsOf.get(i) ?? 'small'
    // V11.5g（舰长令）：星阶以 HQ（船体半径~15）为锚整体上调——旧 LV4 大星(9-13)
    // 降为 LV1 小星档，中/大按步进续推；拉远小星仍可见（旧 1.8-3 在 dist>500 时不足 4px）。
    const radius = cls === 'large' ? det(`r:${k}`, 19, 24) : cls === 'medium' ? det(`r:${k}`, 14, 18) : det(`r:${k}`, 9, 13)
    // V11.5f（舰长令）：排布尽可能分散——带宽外扩 + 拒绝间距 20→42 + 纵向展宽。
    const orbit = {
      r: cls === 'large' ? det(`or:${k}`, 200, 310) : cls === 'medium' ? det(`or:${k}`, 130, 240) : det(`or:${k}`, 90, 200),
      ecc: det(`oe:${k}`, 0.05, 0.22),
      speed: det(`os:${k}`, 0.008, 0.028) * (detBool(`od:${k}`, 0.5) ? 1 : -1),
      angle: det(`oa:${k}`, 0, PI2),
      phase: det(`op:${k}`, 0, PI2),
      tiltA: det(`ot:${k}`, 6, 30),
      yBase: det(`oy:${k}`, -55, 55),
    }
    let x = 0, y = 0, z = 0
    for (let tr = 0; tr < 24; tr++) {
      orbit.angle = det(`oa:${k}:${tr}`, 0, PI2)
      orbit.yBase = det(`oy:${k}:${tr}`, -55, 55)
      const rr = orbit.r * (1 + orbit.ecc * Math.sin(orbit.angle * 1.618 + orbit.phase))
      x = Math.cos(orbit.angle) * rr
      z = Math.sin(orbit.angle) * rr
      y = orbit.yBase + Math.sin(orbit.angle * 0.9 + orbit.phase * 2) * orbit.tiltA
      if (placed.every(p => Math.hypot(x - p.x, y - p.y, z - p.z) > p.radius + radius + 42)) break
    }
    placed.push({ x, y, z, radius })
    return {
      index: i,
      cls,
      name: `${dirNameOf(wsPath)} · W-${pad2(i + 1)}`,
      radius,
      level: cls === 'large' ? 4 : cls === 'medium' ? 3 : detBool(`lv:${k}`, 0.5) ? 2 : 1,
      hue: hues[i % hues.length]! + det(`hu:${k}`, -0.03, 0.03),
      sat: det(`sa:${k}`, 0.5, 0.7),
      light: det(`li:${k}`, 0.42, 0.58),
      heldStart: false,
      garrison: 0,
      rotSpeed: det(`rs:${k}`, 0.02, 0.12) * (detBool(`rd:${k}`, 0.5) ? 1 : -1),
      seed: det(`sd:${k}`, 0, 10),
      orbit,
      x, y, z,
    }
  })
}

/** attempt → 编队相位（纯）：配额暂停=驻泊（等你）；有动词=交战（机器在动）；
 * 否则=集结（已领取未起跑）。颜色语义与板面四档对齐由雷达/光晕负责。 */
export function attemptPhaseOf(verb: string | null, paused: boolean): 'battle' | 'deployed' | 'holding' {
  if (paused) return 'deployed'
  if (verb !== null && verb !== '') return 'battle'
  return 'holding'
}

export interface WzLogFeedItem { readonly ts: string; readonly color: string; readonly text: string }

/** V13 战线航迹的拾取/悬停节点（buildCard 消费；点击→根命令聚焦页）。 */
export interface WzFrontNode {
  kind: 'front'
  id: number
  rootId: string
  rootCommandId: string
  label: string
  gens: number
  live: boolean
  settled: boolean
  waiting: boolean
  failed: boolean
  battlefields: number
  hueSlot: number
}

/** 战况日志（纯）：命令下达（琥珀）+ attempt 结算（达成蓝/败红/报琥珀）按时间倒序，30 封顶。 */
export function warLogOf(items: readonly WzLogFeedItem[]): WzLogEntry[] {
  return items
    .slice()
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, 30)
    .map(e => ({ t: new Date(e.ts).getTime() / 1000, color: e.color, text: e.text, stamp: fmtStamp(e.ts) }))
}

const fmtStamp = (ts: string): string => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ================================================================
 * 场景实体与引擎
 * ================================================================ */

export interface WzPlanet {
  kind: 'planet'
  id: number
  name: string
  wsPath: string
  cls: WzClass
  level: number
  radius: number
  mesh: THREE.Group
  cloud: THREE.Mesh | null
  /** V12 浅色态状态件：基座环+执行光柱（深色态为 null，halo 承担语义）。 */
  ring: THREE.Mesh | null
  pillar: THREE.Mesh | null
  halo: THREE.Sprite
  proxy: THREE.Mesh
  baseGlow: THREE.Color
  haloScale: number
  orbit: WzPlanetSpec['orbit']
  status: WzStatus
  garrison: number
  failing: number
  battleT: number
  ringT: number
  inbound: number
  deployedSquads: WzSquad[]
  seed: number
  rot: number
}

export interface WzSquad {
  kind: 'squad'
  id: number
  /** 板面会话号（bridged diff 的键；demo 自驱为 null）。 */
  sessionId: string | null
  code: string
  cname: string
  group: THREE.Group
  proxy: THREE.Mesh
  glowMat: THREE.SpriteMaterial
  ships: number
  target: WzPlanet
  phase: WzSquadPhase
  /** 板面判定相位（bridged：arrival 后相位追它；不参与运动学）。 */
  boardPhase: 'battle' | 'deployed' | 'holding'
  verb: string | null
  paused: boolean
  sourceLabel: string | null
  sourceCommandId: string | null
  live: boolean
  t: number
  start: THREE.Vector3
  ctrl: THREE.Vector3
  dur: number
  seed: number
  orbitA: number
  orbitSpd: number
  battleT: number
}

export interface WzLogEntry { t: number; color: string; text: string; stamp?: string }

const CFG = { planetCount: 16, squadCap: 9, squadSpeed: 26, spawnGapLo: 4.5, spawnGapHi: 8 }

function radialTex(stops: Array<[number, string]>): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const ctx = cv.getContext('2d')!
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  stops.forEach(s => gr.addColorStop(s[0]!, s[1]!))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(cv)
}

/* ================================================================
 * 星球 NASA 自然色（V11.3 定案，V11.5h 复权移植）：六原型确定性 fBm 贴图 +
 * bumpMap 高度场 + 大气临边辉 + 云层 + 行星环。ramp 取真实反照率——照片
 * 显示色直接当 albedo 会被主光推成白板（V11.3 首轮实抓）。贴图模块级缓存
 * （48 组丢最旧），SSE 高频重建零重画；缓存贴图绝不入 disposables。
 * ================================================================ */
export type PlanetArchetype = 'gas' | 'icegas' | 'rust' | 'gray' | 'ice' | 'terra'

/** 原型分派（纯）：同 wsPath 恒同型；权重偏哑光岩质——真实宇宙没有糖果色。 */
export function archetypeOf(wsPath: string): PlanetArchetype {
  const r = hash01(`arch:${wsPath}`)
  if (r < 0.18) return 'gas'
  if (r < 0.32) return 'icegas'
  if (r < 0.5) return 'rust'
  if (r < 0.68) return 'gray'
  if (r < 0.84) return 'ice'
  return 'terra'
}

/** 大气临边辉色（null=无大气壳）：水星型灰星免（无可感大气）。 */
const ATMO_COLOR: Record<PlanetArchetype, number | null> = { gas: 0xe8c9a0, icegas: 0x7f9fd4, rust: 0xd9a075, gray: null, ice: 0xbcd8ff, terra: 0x7fb3ff }

/** 原型中性辉光底色（halo=状态语义载体：执行中橙红/占领蓝/高亮青在 update 覆盖）。 */
const ARCH_GLOW: Record<PlanetArchetype, number> = { gas: 0xc9b795, icegas: 0x9db4d8, rust: 0xc08a66, gray: 0x8d8d92, ice: 0xc4d8ee, terra: 0x7fa8d8 }

/* --- 确定性值噪声：lattice 预生成 Float32Array，逐像素零字符串拼接（512x256 性能护栏） --- */

function noiseGrid(seed: string, gw: number, gh: number): Float32Array {
  const g = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = hash01(`${seed}:${x}:${y}`)
  return g
}

/** 双线性平滑采样；u 横向环绕（equirect 左右无缝），v 纵向夹持（极点收拢）。 */
function sampleGrid(g: Float32Array, gw: number, gh: number, u: number, v: number): number {
  const x = (((u % 1) + 1) % 1) * gw
  const y = Math.min(Math.max(v, 0), 1) * (gh - 1)
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf)
  const x0 = xi % gw, x1 = (xi + 1) % gw
  const y0 = Math.min(yi, gh - 1), y1 = Math.min(yi + 1, gh - 1)
  const a = g[y0 * gw + x0]!, b = g[y0 * gw + x1]!, c = g[y1 * gw + x0]!, d = g[y1 * gw + x1]!
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

const pyramidCache = new Map<string, Float32Array[]>()
function seedPyramid(seed: string): Float32Array[] {
  let p = pyramidCache.get(seed)
  if (p === undefined) {
    p = [noiseGrid(`${seed}:0`, 8, 4), noiseGrid(`${seed}:1`, 16, 8), noiseGrid(`${seed}:2`, 32, 16), noiseGrid(`${seed}:3`, 64, 32)]
    pyramidCache.set(seed, p)
  }
  return p
}

/** fBm 采样（纯，导出供单测钉确定性）：同 seed 恒同值，值域 [0,1]，u/v 任意。 */
export function planetNoise(seed: string, u: number, v: number): number {
  const p = seedPyramid(seed)
  let sum = 0, amp = 0.5, norm = 0
  for (let o = 0; o < 4; o++) { sum += sampleGrid(p[o]!, 8 << o, 4 << o, u, v) * amp; norm += amp; amp *= 0.55 }
  return sum / norm
}

type RGB = readonly [number, number, number]
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }

const TEX_W = 512, TEX_H = 256
interface PaintedMaps { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }
const texCache = new Map<string, PaintedMaps>()
const cloudCache = new Map<string, THREE.CanvasTexture>()
const ringCache = new Map<string, THREE.CanvasTexture>()

/** 贴图缓存（模块级，key=kind:wsPath）：syncPlanets 随 SSE 高频重建网格，但
 * fBm 512x256 一张几十 ms——必须一次生成终身缓存。缓存贴图绝不入 scene
 * disposables（防卸载双释放）。超 48 组丢最旧。 */
function paintedMaps(key: string, paint: (img: ImageData, bump: ImageData) => void, post?: (ctx: CanvasRenderingContext2D, bctx: CanvasRenderingContext2D) => void): PaintedMaps {
  let t = texCache.get(key)
  if (t === undefined) {
    const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H
    const bc = document.createElement('canvas'); bc.width = TEX_W; bc.height = TEX_H
    const ctx = c.getContext('2d')!, bctx = bc.getContext('2d')!
    const img = ctx.createImageData(TEX_W, TEX_H), bimg = bctx.createImageData(TEX_W, TEX_H)
    paint(img, bimg)
    ctx.putImageData(img, 0, 0); bctx.putImageData(bimg, 0, 0)
    post?.(ctx, bctx)
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true
    const bump = new THREE.CanvasTexture(bc); bump.needsUpdate = true
    t = { map, bump }
    texCache.set(key, t)
    if (texCache.size > 48) {
      const oldest = texCache.keys().next().value
      if (oldest !== undefined) { const om = texCache.get(oldest)!; om.map.dispose(); om.bump.dispose(); texCache.delete(oldest) }
    }
  }
  return t
}

/** 坑环（岩质星后处理）：暗坑 + 偏移亮缘；接缝越界对侧补画。 */
function stampCraters(ctx: CanvasRenderingContext2D, bctx: CanvasRenderingContext2D, seed: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const cx = det(`${seed}:cx:${i}`, 0, TEX_W), cy = det(`${seed}:cy:${i}`, TEX_H * 0.08, TEX_H * 0.92), r = det(`${seed}:cr:${i}`, 2, 9)
    for (const ox of [0, -TEX_W, TEX_W]) {
      if (ox !== 0 && cx > r * 2 && cx < TEX_W - r * 2) continue
      ctx.beginPath(); ctx.arc(cx + ox, cy, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,8,6,.24)'; ctx.fill()
      ctx.beginPath(); ctx.arc(cx + ox - r * 0.3, cy - r * 0.3, r * 0.72, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,250,240,.12)'; ctx.fill()
      bctx.beginPath(); bctx.arc(cx + ox, cy, r, 0, Math.PI * 2); bctx.fillStyle = 'rgba(0,0,0,.5)'; bctx.fill()
      bctx.beginPath(); bctx.arc(cx + ox, cy, r * 1.25, 0, Math.PI * 2); bctx.strokeStyle = 'rgba(255,255,255,.35)'; bctx.lineWidth = 1.2; bctx.stroke()
    }
  }
}

/** 气巨（木星型）：湍流域扭曲带纹 + 确定性风暴斑。ramp 取真实反照率
 * （气巨 ~0.35-0.5），照片显示色直接当 albedo 会被主光推成白板（首轮实抓）。 */
function paintGas(img: ImageData, bump: ImageData, seed: string): void {
  const ramp: RGB[] = [[196, 186, 166], [158, 136, 106], [126, 92, 64], [172, 154, 126], [112, 88, 68]]
  const d = img.data, bd = bump.data
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W
      const warp = planetNoise(`${seed}:w`, u, v) - 0.5
      const t = Math.min(Math.max(planetNoise(`${seed}:b`, u * 0.5, v * 7 + warp * 2.4), 0), 1) * (ramp.length - 1)
      const i = Math.min(Math.floor(t), ramp.length - 2)
      const col = mixRGB(ramp[i]!, ramp[i + 1]!, t - i)
      const k = (y * TEX_W + x) * 4
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
      const bh = 118 + warp * 60
      bd[k] = bh; bd[k + 1] = bh; bd[k + 2] = bh; bd[k + 3] = 255
    }
  }
}

function postGas(ctx: CanvasRenderingContext2D, seed: string): void {
  const sx = det(`${seed}:sx`, 0.25, 0.75) * TEX_W, sy = det(`${seed}:sy`, 0.58, 0.7) * TEX_H, sr = TEX_W * 0.075
  const g = ctx.createRadialGradient(sx, sy, sr * 0.15, sx, sy, sr)
  g.addColorStop(0, 'rgba(158,84,58,.85)'); g.addColorStop(0.55, 'rgba(172,104,72,.5)'); g.addColorStop(1, 'rgba(172,104,72,0)')
  ctx.fillStyle = g
  ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.55); ctx.translate(-sx, -sy)
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill(); ctx.restore()
}

/** 冰气巨（海王型）：深蓝弱对比带纹。 */
function paintIceGas(img: ImageData, bump: ImageData, seed: string): void {
  const ramp: RGB[] = [[30, 54, 84], [44, 74, 110], [70, 100, 134], [104, 130, 160]]
  const d = img.data, bd = bump.data
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W
      const warp = planetNoise(`${seed}:w`, u, v) - 0.5
      const t = Math.min(Math.max(0.3 + planetNoise(`${seed}:b`, u * 0.5, v * 5 + warp * 1.2) * 0.4, 0), 1) * (ramp.length - 1)
      const i = Math.min(Math.floor(t), ramp.length - 2)
      const col = mixRGB(ramp[i]!, ramp[i + 1]!, t - i)
      const k = (y * TEX_W + x) * 4
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
      const bh = 122 + warp * 26
      bd[k] = bh; bd[k + 1] = bh; bd[k + 2] = bh; bd[k + 3] = 255
    }
  }
}

/** 锈岩（火星型）：尘 / 玄武斑 / 极冠 + 坑环。 */
function paintRust(img: ImageData, bump: ImageData, seed: string): void {
  const d = img.data, bd = bump.data
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W
      const n = planetNoise(`${seed}:m`, u * 2.2, v * 2.2)
      let col = mixRGB([76, 48, 38], [156, 114, 80], sstep(0.34, 0.7, n))
      if (planetNoise(`${seed}:k`, u * 3.6, v * 3.6) > 0.67) col = mixRGB(col, [52, 34, 28], 0.65)
      const cap = sstep(0.87, 0.96, v) + sstep(0.13, 0.04, v)
      if (cap > 0) col = mixRGB(col, [212, 208, 200], Math.min(cap, 1))
      const k = (y * TEX_W + x) * 4
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
      const bh = n * 255
      bd[k] = bh; bd[k + 1] = bh; bd[k + 2] = bh; bd[k + 3] = 255
    }
  }
}

/** 玄武灰（水星型）：无大气、密坑环。 */
function paintGray(img: ImageData, bump: ImageData, seed: string): void {
  const d = img.data, bd = bump.data
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W
      const n = planetNoise(`${seed}:g`, u * 2.4, v * 2.4)
      let col: RGB = [100 + (n - 0.5) * 40, 98 + (n - 0.5) * 38, 95 + (n - 0.5) * 36]
      if (planetNoise(`${seed}:p`, u * 3, v * 3) > 0.62) col = mixRGB(col, [88, 79, 72], 0.6)
      const k = (y * TEX_W + x) * 4
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
      const bh = n * 255
      bd[k] = bh; bd[k + 1] = bh; bd[k + 2] = bh; bd[k + 3] = 255
    }
  }
}

/** 冰壳（木卫型）：白蓝底 + 裂脊线 + 淡褐斑。 */
function paintIce(img: ImageData, bump: ImageData, seed: string): void {
  const d = img.data, bd = bump.data
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W
      const n = planetNoise(`${seed}:i`, u * 2, v * 2)
      let col = mixRGB([168, 184, 198], [206, 214, 222], n)
      const ridge = Math.abs(planetNoise(`${seed}:r`, u * 2.6, v * 2.6) - 0.5)
      if (ridge < 0.03) col = mixRGB(col, [92, 120, 150], 0.75)
      if (planetNoise(`${seed}:t`, u * 3.2, v * 3.2) > 0.64) col = mixRGB(col, [158, 147, 128], 0.5)
      const k = (y * TEX_W + x) * 4
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
      const bh = 128 + (n - 0.5) * 60 - (ridge < 0.03 ? 40 : 0)
      bd[k] = bh; bd[k + 1] = bh; bd[k + 2] = bh; bd[k + 3] = 255
    }
  }
}

/** 类地（深海 + 棕绿大陆 + 极冠）。 */
function paintTerra(img: ImageData, bump: ImageData, seed: string): void {
  const d = img.data, bd = bump.data
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W
      const n = planetNoise(`${seed}:e`, u, v)
      let col: RGB; let h: number
      if (n < 0.55) {
        col = mixRGB([16, 36, 64], [38, 72, 100], sstep(0.18, 0.55, n))
        h = 88
      } else {
        const e = (n - 0.55) / 0.45
        col = e < 0.22 ? [116, 106, 78] : e < 0.58 ? mixRGB([116, 106, 78], [80, 94, 58], (e - 0.22) / 0.36) : mixRGB([80, 94, 58], [96, 88, 74], (e - 0.58) / 0.42)
        h = 110 + e * 120
      }
      const cap = sstep(0.44, 0.5, Math.abs(v - 0.5))
      if (cap > 0.55) { col = mixRGB(col, [210, 216, 222], Math.min((cap - 0.55) / 0.45, 1) * 0.9); h = Math.max(h, 200) }
      const k = (y * TEX_W + x) * 4
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
      bd[k] = h; bd[k + 1] = h; bd[k + 2] = h; bd[k + 3] = 255
    }
  }
}

const PAINTERS: Record<PlanetArchetype, (img: ImageData, bump: ImageData, seed: string) => void> = { gas: paintGas, icegas: paintIceGas, rust: paintRust, gray: paintGray, ice: paintIce, terra: paintTerra }
const PAINT_POST: Partial<Record<PlanetArchetype, (ctx: CanvasRenderingContext2D, bctx: CanvasRenderingContext2D, seed: string) => void>> = { gas: postGas, rust: (ctx, bctx, s) => stampCraters(ctx, bctx, `rs:${s}`, 22), gray: (ctx, bctx, s) => stampCraters(ctx, bctx, `gr:${s}`, 36) }

/** 云层亮度图（alphaMap 读 G 通道）：纬向拉伸的 fBm 云。 */
function cloudTexture(wsPath: string): THREE.CanvasTexture {
  const key = `cloud:${wsPath}`
  let t = cloudCache.get(key)
  if (t === undefined) {
    const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(TEX_W, TEX_H)
    for (let y = 0; y < TEX_H; y++) {
      const v = y / TEX_H
      for (let x = 0; x < TEX_W; x++) {
        const u = x / TEX_W
        const a = sstep(0.58, 0.78, planetNoise(`cl:${wsPath}`, u * 1.3, v * 3.2)) * 255
        const k = (y * TEX_W + x) * 4
        img.data[k] = a; img.data[k + 1] = a; img.data[k + 2] = a; img.data[k + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    t = new THREE.CanvasTexture(c); t.needsUpdate = true
    cloudCache.set(key, t)
  }
  return t
}

/** 行星环带纹理（径向条带 + Cassini 缝 + 两端羽化）。 */
function ringTexture(wsPath: string): THREE.CanvasTexture {
  const key = `ring:${wsPath}`
  let t = ringCache.get(key)
  if (t === undefined) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 4
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(256, 4)
    for (let x = 0; x < 256; x++) {
      const tt = x / 255
      const n = planetNoise(`rg:${wsPath}`, tt * 2.4, 0.5)
      let a = 0.14 + 0.34 * sstep(0.3, 0.75, n)
      if (Math.abs(tt - 0.64) < 0.04) a *= 0.12
      if (tt < 0.04) a *= tt / 0.04
      else if (tt > 0.97) a *= (1 - tt) / 0.03
      for (let y = 0; y < 4; y++) {
        const k = (y * 256 + x) * 4
        img.data[k] = 198; img.data[k + 1] = 190; img.data[k + 2] = 172; img.data[k + 3] = a * 255
      }
    }
    ctx.putImageData(img, 0, 0)
    t = new THREE.CanvasTexture(c); t.needsUpdate = true
    ringCache.set(key, t)
  }
  return t
}

/** 大气临边辉（BackSide fresnel 薄壳）：真实行星照片的标志——轮廓外圈一圈
 * 大气色，接棒休眠的 halo 光球。 */
function makeAtmoMaterial(hex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uK: { value: 0.18 } },
    vertexShader: 'varying vec3 vN;\nvoid main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; uniform vec3 uColor; uniform float uK;\nvoid main(){ float i = pow(max(0.55 - dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0), 3.5) * uK; gl_FragColor = vec4(uColor * i, i); }',
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })
}

export function hqStats(planets: ReadonlyArray<WzPlanet>, squads: ReadonlyArray<WzSquad>): { inbound: number; battle: number; deployed: number; ships: number; garrison: number } {
  let inbound = 0, battle = 0, deployed = 0, ships = 0
  squads.forEach(s => {
    if (s.phase === 'return') return
    ships += s.ships
    if (s.phase === 'outbound') inbound++
    else if (s.phase === 'battle') battle++
    else deployed++
  })
  return { inbound, battle, deployed, ships, garrison: planets.reduce((a, p) => a + p.garrison, 0) }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3()
const _c1 = new THREE.Color(), _c2 = new THREE.Color()

/** 星域 3D 引擎（demo §1-§9 全量）：渲染栈/灯光/星海/星云/碎石带/星舰/16 星/
 * 编队模拟/冲击波环/加派组员循环。 */
export class WarzoneScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  readonly planets: WzPlanet[] = []
  readonly squads: WzSquad[] = []
  readonly log: WzLogEntry[] = []
  private readonly pickables: THREE.Mesh[] = []
  private readonly raycaster = new THREE.Raycaster()
  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly hqEngines: THREE.Sprite[] = []
  private readonly hqEngineMat: THREE.SpriteMaterial
  private readonly hqBeacon: THREE.Mesh
  private readonly starMat: THREE.ShaderMaterial
  private readonly starGroup = new THREE.Group()
  private readonly belt: THREE.InstancedMesh
  private readonly fxPool: Array<{ mesh: THREE.Mesh; t: number; baseR: number; active: boolean }> = []
  private readonly glowTex: THREE.Texture
  private simT = 0
  private squadSeq = 1
  private spawnT = 3
  private flipT = 14
  private spawnEpoch = 0
  private flipEpoch = 0
  /** V11.5 连线态：星球/编队/日志全由 syncBoard 真实数据驱动，demo 自驱模拟旁路。 */
  private bridged = false
  private hqActive = true
  private planetKey = ''
  private readonly squadBySession = new Map<string, WzSquad>()
  /** 悬停/聚焦高亮星域（V11.5f 舰长令）：光晕增亮 + HQ↔星球虚线轨迹。 */
  private readonly hlWs = new Set<string>()
  private hlLines: THREE.Line[] = []
  /** 三键相机态：cur 阻尼趋近 target；center=屏幕锚（平移推动它，旋转绕它）。 */
  private camCur: WzCamState = { ...WZ_CAM_HOME }
  private camTar: WzCamState = { ...WZ_CAM_HOME }
  /** V11.5g：动态缩放界——wzCamBounds 按 planets 半径/外沿+视高重算（syncBoard/resize 钩）。 */
  private camMinDist = WZ_CAM_DIST_MIN
  private camMaxDist = WZ_CAM_DIST_MAX
  private viewH = 800
  private readonly camCenter = new THREE.Vector3(0, 0, 0)
  private readonly PAN_LIMIT = 340
  /** V12（舰长令·浅色范式=天空）：主题态——null=未初始化（首贴必生效）；
   * 深空件（星海/星云/bloom）与天空件（云层/暖阳）按主题切换可见性与配色。 */
  private darkTheme: boolean | null = null
  private readonly nebGroup = new THREE.Group()
  private readonly cloudGroup = new THREE.Group()
  private ambientLight: THREE.AmbientLight | null = null
  private dirLight: THREE.DirectionalLight | null = null
  private hemiLight: THREE.HemisphereLight | null = null
  private sunMat: THREE.MeshBasicMaterial | null = null
  private sunGlowMat: THREE.SpriteMaterial | null = null
  private readonly shipHullMat = new THREE.MeshStandardMaterial({ color: 0x8d99b0, metalness: 0.85, roughness: 0.3, flatShading: true })
  private readonly shipAccMat = new THREE.MeshStandardMaterial({ color: 0x51427e, metalness: 0.7, roughness: 0.35, flatShading: true })
  private readonly shipEngMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.15, 0.45) })
  private hqGroup: THREE.Group | null = null
  private hqVariant: 'ship' | 'fortress' | null = null
  private hqProxy: THREE.Mesh | null = null
  private lastBridge: { active: boolean; planets: ReadonlyArray<WzBridgePlanet>; squads: ReadonlyArray<WzBridgeSquad>; log: ReadonlyArray<WzLogEntry> } | null = null
  /** V13 战线航迹层：链色管道串起各代星球 + 代际标记（兼拾取代理）+ 活体端点辉光。
   * 重建时机=行星谱变化/战线谱变化/主题翻转（链色随 CSS）。 */
  private readonly frontGroup = new THREE.Group()
  private readonly frontPickables: THREE.Mesh[] = []
  private frontSeq = 0
  private frontKey = ''
  private lastFronts: ReadonlyArray<WzBridgeFrontLite> = []
  /** V12.2 语义令牌视图：CSS 是色源（--war-wz- 系列、--war-tac- 系列、--war-log- 系列），
   * applyTheme 时整组刷新；headless/主题错位由 war-tokens 回退同值基线。 */
  private tac: WarTacPalette = TAC_FALLBACK_DARK
  private logC: Readonly<Record<WzLogKind, string>> = { order: '#ffc98a', engage: '#ff7755', triumph: '#5fc4ff', retreat: '#ff5a5a', 'return': '#9a86ff', review: '#ffc24d' }
  private readonly cHl = new THREE.Color('#6fe3ff')
  private readonly cBattle = new THREE.Color('#ff6a55')
  private readonly cHeld = new THREE.Color('#66d4ff')
  private readonly cWait = new THREE.Color('#b07800')

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    // alpha:true（舰长定）：画布透明，容器 CSS 底透出。
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.scene.fog = new THREE.FogExp2(0x06070f, 0.00075)
    this.camera = new THREE.PerspectiveCamera(55, width / Math.max(height, 1), 0.1, 5000)
    this.viewH = height
    this.camera.position.set(64, 108, 252)
    // V11.5b 三键相机（OrbitControls 休眠）：左平移/中旋转（绕屏幕中心 center）/
    // 滚轮缩放；阻尼在 update() 内推进，render() 落位。
    const rt = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(rt.x, rt.y, { samples: 4 }))
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.0, 0.65, 0.18)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    const ambient = new THREE.AmbientLight(0x334466, 0.7)
    this.ambientLight = ambient
    this.scene.add(ambient)
    // V11.5i（舰长令）：可见太阳——主光方位同向、1200 单位外地平线上 16° 一颗
    // （自发光核+光晕 sprite，bloom 放大成耀斑；材质关雾防远距衰减；蓝白热星色
    // 与主光 0xaabbff 同谱，不重涂星球）+ 半球补光（天冷地暖，背光面 subtle tint）。
    // 仰角压到 16° 的硬理由：相机永远俯视原点（pitch 0.08-1.52 全向下），视图锥
    // 上缘仰角上限 ≈23°——高仰角太阳永远进不了画面（首版 52° 实测 proj.y=4.3 出锥）。
    // 阴影不开：星球尺度（星距 90-310）星球影子无落点，纯付费零收益。
    // V11.2 教训随行：太阳只在远处当视觉锚，绝不让光路再逆光剪影。
    this.glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']])
    this.disposables.push(this.glowTex)
    const dirLight = new THREE.DirectionalLight(0xaabbff, 1.6)
    dirLight.position.set(220, 320, 120)
    this.dirLight = dirLight
    this.scene.add(dirLight)
    const sunH = Math.hypot(220, 120), sunEl = 0.28
    const sunPos = new THREE.Vector3((220 / sunH) * Math.cos(sunEl), Math.sin(sunEl), (120 / sunH) * Math.cos(sunEl)).multiplyScalar(1200)
    const sunGeo = new THREE.SphereGeometry(18, 24, 16)
    const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.1, 2.4), fog: false })
    this.sunMat = sunMat
    const sun = new THREE.Mesh(sunGeo, sunMat)
    sun.name = 'sun'
    sun.position.copy(sunPos)
    this.scene.add(sun)
    this.disposables.push(sunGeo, sunMat)
    const sunGlow = this.glowSprite(new THREE.Color(0.72, 0.8, 1.0), 220, 0.5)
    this.sunGlowMat = sunGlow.material as THREE.SpriteMaterial
    sunGlow.position.copy(sunPos)
    this.scene.add(sunGlow)
    const hemi = new THREE.HemisphereLight(0x33415e, 0x241a12, 0.4)
    this.hemiLight = hemi
    this.scene.add(hemi)
    this.scene.add(this.nebGroup, this.cloudGroup)
    this.scene.add(this.frontGroup)
    this.buildClouds()
    this.disposables.push(this.shipHullMat, this.shipAccMat, this.shipEngMat)
    this.buildStars()
    this.buildNebulae()
    this.belt = this.buildBelt()
    const hq = this.buildHq()
    this.hqGroup = hq
    this.hqEngineMat = this.hqEngines[0]!.material as THREE.SpriteMaterial
    this.hqBeacon = hq.userData.beacon as THREE.Mesh
    this.scene.add(new THREE.PointLight(0xff8844, 1500, 220, 2).translateY(-26))
    this.scene.add(new THREE.PointLight(0x66ccff, 1400, 200, 2).translateY(36)) // V12.1：上方冷补光 900→1400（提亮舰体上表面）
    // V12：主题应用必须在 HQ/星球工厂可用的最后一步——浅色宿主开机即天空范式
    this.applyTheme(document.body.hasAttribute('data-ds-dark-theme'))
    // V11.5：星球/编队不再自建（demo 自驱休眠）——挂载后由 syncBoard 真实数据落子。
  }

  /** 单星球落子（V11.5h NASA 自然色）：Group = 表面 + 云壳（terra/rust）+ 大气
   * 临边辉（非 gray）± 环（气巨 55%）+ halo 状态光晕 + pick 代理，全部本地坐标
   * （轨道推进只推 group）。贴图走模块缓存（arch:wsPath 键，SSE 重建零重画）。 */
  private addPlanet(spec: WzPlanetSpec, wsPath: string, status: WzStatus, garrison: number, failing: number, inbound: number): WzPlanet {
    return this.isDarkTheme ? this.addSpacePlanet(spec, wsPath, status, garrison, failing, inbound) : this.addSkyIsland(spec, wsPath, status, garrison, failing, inbound)
  }

  /** 深空星球（V11.5h NASA 六原型）。 */
  private addSpacePlanet(spec: WzPlanetSpec, wsPath: string, status: WzStatus, garrison: number, failing: number, inbound: number): WzPlanet {
    const arch = archetypeOf(wsPath)
    const post = PAINT_POST[arch]
    const { map, bump } = paintedMaps(`wz:${arch}:${wsPath}`, (img, bimg) => PAINTERS[arch](img, bimg, wsPath), post === undefined ? undefined : (ctx, bctx) => post(ctx, bctx, wsPath))
    const group = new THREE.Group()
    group.position.set(spec.x, spec.y, spec.z)
    group.rotation.z = det(`tilt:${wsPath}`, -0.32, 0.32)
    const sphereGeo = new THREE.SphereGeometry(1, 40, 28)
    const surface = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
      map, bumpMap: bump, bumpScale: 0.45, roughness: 0.96, metalness: 0.02,
      emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.08,
    }))
    surface.scale.setScalar(spec.radius)
    group.add(surface)
    let cloud: THREE.Mesh | null = null
    if (arch === 'terra' || arch === 'rust') {
      const cmat = new THREE.MeshLambertMaterial({ color: 0xe8edf2, alphaMap: cloudTexture(wsPath), transparent: true, depthWrite: false, opacity: 0.8 })
      cloud = new THREE.Mesh(sphereGeo, cmat)
      cloud.scale.setScalar(spec.radius * 1.02)
      group.add(cloud)
    }
    const atmoHex = ATMO_COLOR[arch]
    if (atmoHex !== null) {
      const atmo = new THREE.Mesh(sphereGeo, makeAtmoMaterial(atmoHex))
      atmo.scale.setScalar(spec.radius * 1.15)
      group.add(atmo)
    }
    if ((arch === 'gas' || arch === 'icegas') && det(`ring:${wsPath}`, 0, 1) < 0.55) {
      const inner = spec.radius * 1.5, outer = spec.radius * 2.4
      const rg = new THREE.RingGeometry(inner, outer, 72, 1)
      const posA = rg.attributes.position, uvA = rg.attributes.uv
      for (let i = 0; i < posA.count; i++) {
        const rr = Math.hypot(posA.getX(i)!, posA.getY(i)!)
        uvA.setXY(i, (rr - inner) / (outer - inner), 0.5)
      }
      const ring = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: ringTexture(wsPath), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
      ring.rotation.x = Math.PI / 2 - det(`rt:${wsPath}`, 0.18, 0.42)
      group.add(ring)
    }
    // halo=状态语义载体（执行中橙红脉冲/占领偏蓝/高亮青）——底色取原型中性辉光。
    const baseGlow = new THREE.Color(ARCH_GLOW[arch])
    const halo = this.glowSprite(baseGlow.clone(), spec.radius * 3.0, 0.32)
    group.add(halo)
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
    proxy.scale.setScalar(Math.max(spec.radius * 1.35, 4.5))
    group.add(proxy)
    this.pickables.push(proxy)
    this.scene.add(group)
    const p: WzPlanet = {
      kind: 'planet', id: spec.index, name: spec.name, wsPath, cls: spec.cls, level: spec.level,
      radius: spec.radius, mesh: group, cloud, halo, proxy, baseGlow, haloScale: spec.radius * 3.0,
      orbit: spec.orbit, status, garrison, failing, battleT: 0, ringT: 0, inbound, deployedSquads: [],
      seed: spec.seed, rot: spec.rotSpeed, ring: null, pillar: null,
    }
    surface.userData.ref = p
    proxy.userData.ref = p
    this.addPlanetLabel(p)
    this.planets.push(p)
    return p
  }

  /** 浅色浮空岛（V12 舰长定案：王国之泪层岩为主+纳格兰垂坠石点缀）——workspace=岛。
   * 语义物理化（选型红利）：LV2+长建筑=打过仗、层级/建筑密度=任务量、达成史=
   * 发光达成碑、状态=基座环色+执行光柱（白天辉光失效的正解）。全 hash 确定性。 */
  private addSkyIsland(spec: WzPlanetSpec, wsPath: string, status: WzStatus, garrison: number, failing: number, inbound: number): WzPlanet {
    const k = `isl:${wsPath}`
    const R = spec.radius
    const group = new THREE.Group()
    group.position.set(spec.x, spec.y, spec.z)
    group.rotation.z = det(`tilt:${wsPath}`, -0.12, 0.12)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8f80, flatShading: true, roughness: 0.95, metalness: 0.02 })
    const rock2Mat = new THREE.MeshStandardMaterial({ color: 0x867a6c, flatShading: true, roughness: 0.96, metalness: 0.02 })
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x7fae6b, flatShading: true, roughness: 0.9 })
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcbb9a0, flatShading: true, roughness: 0.85 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a5a44, flatShading: true, roughness: 0.8 })
    const seg = 9
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat)
      m.position.y = y
      group.add(m)
      return m
    }
    // 顶层岩盘 + 草顶（俯视主读面）
    add(new THREE.CylinderGeometry(R * 0.96, R * 0.8, R * 0.3, seg), rockMat, -R * 0.05)
    add(new THREE.CylinderGeometry(R * 1.0, R * 0.97, R * 0.1, seg), grassMat, R * 0.15)
    // 中层岩盘（LV3+ 双层、LV4 三层——层级即任务量）
    const layers = spec.level >= 4 ? 3 : spec.level >= 3 ? 2 : 1
    for (let l = 1; l < layers; l++) {
      const sc = 1 - l * 0.24
      add(new THREE.CylinderGeometry(R * 0.86 * sc, R * 0.66 * sc, R * 0.24, seg), rock2Mat, -R * (0.05 + l * 0.26))
    }
    // 底锥 + 纳格兰式垂坠碎石（悬浮感的两个动作）
    add(new THREE.CylinderGeometry(R * 0.52, R * 0.1, R * 0.8, seg), rock2Mat, -R * (0.3 + layers * 0.22))
    const pebN = 2 + Math.min(2, Math.floor(det(`pn:${k}`, 0, 3)))
    for (let i = 0; i < pebN; i++) {
      const pb = new THREE.Mesh(new THREE.DodecahedronGeometry(det(`pr:${k}:${i}`, R * 0.05, R * 0.13)), rock2Mat)
      pb.position.set(det(`px:${k}:${i}`, -R * 0.5, R * 0.5), -R * (1.1 + det(`py:${k}:${i}`, 0.1, 0.6)), det(`pz:${k}:${i}`, -R * 0.5, R * 0.5))
      pb.rotation.set(det(`pa:${k}:${i}`, 0, 3), det(`pb:${k}:${i}`, 0, 3), 0)
      group.add(pb)
    }
    // 建筑：LV2+ 茅屋 / LV3+ 塔楼（建筑密度=任务量排名）
    const bN = spec.level >= 4 ? 4 : spec.level >= 3 ? 2 : spec.level >= 2 ? 1 : 0
    for (let i = 0; i < bN; i++) {
      const a = det(`ba:${k}:${i}`, 0, PI2), dr = det(`bd:${k}:${i}`, R * 0.2, R * 0.62)
      const tall = spec.level >= 3 && i === 0
      const bw = det(`bw:${k}:${i}`, R * 0.1, R * 0.16)
      const bh = tall ? R * 0.5 : R * 0.2
      const hut = add(new THREE.BoxGeometry(bw, bh, bw), wallMat, R * 0.2 + bh / 2)
      hut.position.x = Math.cos(a) * dr; hut.position.z = Math.sin(a) * dr
      const roof = add(new THREE.ConeGeometry(bw * 1.35, bh * 0.6, 4), roofMat, R * 0.2 + bh + bh * 0.3)
      roof.position.x = hut.position.x; roof.position.z = hut.position.z; roof.rotation.y = det(`br:${k}:${i}`, 0, 1.5)
    }
    // 达成碑（达成史物理表达；亮蓝发光石，白天无需 bloom 也醒目）
    const monoN = Math.min(3, garrison)
    for (let i = 0; i < monoN; i++) {
      const a = det(`ma:${k}:${i}`, 0, PI2), dr = det(`md:${k}:${i}`, R * 0.35, R * 0.8)
      const mo = add(new THREE.BoxGeometry(R * 0.06, R * 0.3, R * 0.06), new THREE.MeshBasicMaterial({ color: 0x35a8e8 }), R * 0.2 + R * 0.15)
      mo.position.x = Math.cos(a) * dr; mo.position.z = Math.sin(a) * dr
    }
    // 状态件：基座环（水线位）+ 执行光柱（王国之泪光柱语言）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, Math.max(0.5, R * 0.05), 6, 42), new THREE.MeshBasicMaterial({ color: 0xb07800, transparent: true, opacity: 0.3, depthWrite: false }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = R * 0.08
    group.add(ring)
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.14, R * 0.3, 62, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    pillar.position.y = R * 0.2 + 31
    pillar.visible = false
    group.add(pillar)
    // halo 语义休眠（浅色态隐藏，环+柱接班）；代理同太空版
    const baseGlow = new THREE.Color(0x7fae6b)
    const halo = this.glowSprite(baseGlow.clone(), R * 2.4, 0.001)
    halo.visible = false
    group.add(halo)
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
    proxy.scale.setScalar(Math.max(R * 1.35, 4.5))
    group.add(proxy)
    this.pickables.push(proxy)
    this.scene.add(group)
    const p: WzPlanet = {
      kind: 'planet', id: spec.index, name: spec.name, wsPath, cls: spec.cls, level: spec.level,
      radius: R, mesh: group, cloud: null, halo, proxy, baseGlow, haloScale: R * 2.4,
      orbit: spec.orbit, status, garrison, failing, battleT: 0, ringT: 0, inbound, deployedSquads: [],
      seed: spec.seed, rot: spec.rotSpeed * 0.3, ring, pillar,
    }
    proxy.userData.ref = p
    this.addPlanetLabel(p)
    this.planets.push(p)
    return p
  }

  /** 空中要塞（V12 浅色态 HQ）：八角石台+中央塔楼+角楼+停机坪环标+信标灯——
   * 与星舰同契约（userData.beacon + hqEngines 脉动槽位），update 无需分支。 */
  private buildFortress(): THREE.Group {
    const hq = new THREE.Group()
    // V12.1（舰长令：浅色要塞也太暗淡）：石面提亮 + 金饰环/青光坪环/信标辉光/
    // 塔顶天光柱——白天不需要 bloom 也能读出「这是中枢」。
    // 暖沙石 vs 青天=冷暖分离；底锥深石=悬浮剪影（白石对白天是白上白，首版实拍抓的根因）
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc9d2dd, flatShading: true, roughness: 0.82, metalness: 0.04 })
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xead9b8, flatShading: true, roughness: 0.8 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2d4a72, flatShading: true, roughness: 0.65 })
    const underMat = new THREE.MeshStandardMaterial({ color: 0x64748a, flatShading: true, roughness: 0.9 })
    const padMat = new THREE.MeshBasicMaterial({ color: 0x2f9de0 })
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xf0c060 })
    this.disposables.push(stoneMat, wallMat, roofMat, padMat, goldMat, underMat)
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat)
      m.position.y = y; hq.add(m); this.disposables.push(geo)
      return m
    }
    add(new THREE.CylinderGeometry(15, 18, 5, 8), stoneMat)
    add(new THREE.CylinderGeometry(13, 3.5, 11, 8), underMat, -7.8) // 浮空底锥（暖石台上深石底——白天剪影）
    add(new THREE.CylinderGeometry(5.5, 7.5, 13, 8), wallMat, 8.5)
    add(new THREE.ConeGeometry(6, 6, 8), roofMat, 18)
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * PI2 + Math.PI / 4
      const t = add(new THREE.CylinderGeometry(1.8, 2.2, 6, 6), wallMat, 4.5)
      t.position.x = Math.cos(a) * 12; t.position.z = Math.sin(a) * 12
      const tr = add(new THREE.ConeGeometry(2.3, 2.6, 6), roofMat, 8.7)
      tr.position.x = t.position.x; tr.position.z = t.position.z
    }
    const pad = add(new THREE.TorusGeometry(9, 0.4, 6, 36), padMat, 2.6)
    pad.rotation.x = Math.PI / 2
    const pad2 = add(new THREE.TorusGeometry(6, 0.28, 6, 30), padMat, 2.6)
    pad2.rotation.x = Math.PI / 2
    const trim = add(new THREE.TorusGeometry(16.8, 0.32, 6, 40), goldMat, 2.4) // 台缘金饰环
    trim.rotation.x = Math.PI / 2
    const trim2 = add(new THREE.TorusGeometry(7.6, 0.3, 6, 28), goldMat, 15.4) // 塔身金饰环
    trim2.rotation.x = Math.PI / 2
    const beacon = add(new THREE.OctahedronGeometry(2.2), new THREE.MeshBasicMaterial({ color: 0x45b4f0, fog: false }), 22)
    hq.userData.beacon = beacon
    const bglow = this.glowSprite(new THREE.Color(0.45, 0.75, 0.95), 11, 0.55)
    bglow.position.y = 22
    hq.add(bglow)
    // 天光柱（HQ 签名：白昼里的一束青白天光，永远在场）
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 9, 95, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    shaft.position.y = 55
    hq.add(shaft)
    this.disposables.push(shaft.geometry, shaft.material as THREE.Material)
    // 角楼旗枪（青色小旗——四角轮廓勾亮）
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * PI2 + Math.PI / 4
      const pole = add(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 4), goldMat, 10.4)
      pole.position.x = Math.cos(a) * 12; pole.position.z = Math.sin(a) * 12
      const flag = add(new THREE.ConeGeometry(0.7, 1.6, 4), padMat, 11)
      flag.position.x = Math.cos(a) * 12; flag.position.z = Math.sin(a) * 12
    }
    for (let i = 0; i < 4; i++) {
      const sp = this.glowSprite(new THREE.Color(1.9, 1.45, 0.7), 5, 0.9)
      sp.userData.base = 5
      const a = i / 4 * PI2
      sp.position.set(Math.cos(a) * 12, 2.6, Math.sin(a) * 12)
      hq.add(sp)
      this.hqEngines.push(sp)
    }
    const fproxy = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
    fproxy.scale.setScalar(34)
    fproxy.userData.ref = { kind: 'hq' as const }
    hq.add(fproxy)
    this.pickables.push(fproxy)
    this.hqProxy = fproxy
    this.scene.add(hq)
    return hq
  }

  private buildStars(): void {
    const N = 2800
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N), pha = new Float32Array(N)
    const palette = [[1, 1, 1], [0.72, 0.82, 1], [1, 0.85, 0.65], [0.82, 0.72, 1], [0.65, 0.9, 1]]
    for (let i = 0; i < N; i++) {
      const u = det(`stu:${i}`, -1, 1), th = det(`stt:${i}`, 0, PI2)
      const rr = det(`str:${i}`, 700, 1500), sxy = Math.sqrt(1 - u * u)
      pos[i * 3] = sxy * Math.cos(th) * rr; pos[i * 3 + 1] = u * rr; pos[i * 3 + 2] = sxy * Math.sin(th) * rr
      const c = palette[Math.floor(det(`stp:${i}`, 0, palette.length)) % palette.length]!
      const b = det(`stb:${i}`, 0.6, 1)
      col[i * 3] = c[0]! * b; col[i * 3 + 1] = c[1]! * b; col[i * 3 + 2] = c[2]! * b
      siz[i] = det(`sts:${i}`, 1.0, 3.6)
      pha[i] = det(`stph:${i}`, 0, PI2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1))
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize; attribute float aPhase; attribute vec3 aColor;
        varying vec3 vC; uniform float uTime;
        void main(){
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.72 + 0.42 * sin(uTime * (0.5 + fract(aPhase*0.159)*1.7) + aPhase);
          gl_PointSize = aSize * tw * (1400.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vC, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.starGroup.add(new THREE.Points(g, this.starMat))
    this.scene.add(this.starGroup)
    this.disposables.push(g, this.starMat)
  }

  private buildNebulae(): void {
    const nebTex = radialTex([[0, 'rgba(255,255,255,.9)'], [0.5, 'rgba(255,255,255,.28)'], [1, 'rgba(255,255,255,0)']])
    this.disposables.push(nebTex)
    const nebs: Array<[number, [number, number, number], number, number]> = [
      [0x12235f, [-900, 350, -1100], 1900, 0.2],
      [0x35155e, [950, -260, -1000], 1700, 0.18],
      [0x0d3450, [-700, -420, 1000], 2100, 0.16],
      [0x46203f, [850, 460, 950], 1600, 0.15],
    ]
    nebs.forEach(n => {
      const mat = new THREE.SpriteMaterial({ map: nebTex, color: n[0], transparent: true, opacity: n[3], blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      const sp = new THREE.Sprite(mat)
      sp.position.set(...n[1])
      sp.scale.setScalar(n[2])
      this.nebGroup.add(sp)
      this.disposables.push(mat)
    })
  }

  private buildBelt(): THREE.InstancedMesh {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ color: 0x69748c, flatShading: true, roughness: 0.9, metalness: 0.25 })
    const im = new THREE.InstancedMesh(geo, mat, 140)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3()
    for (let i = 0; i < 140; i++) {
      const a = det(`ba:${i}`, 0, PI2), r = det(`br:${i}`, 35, 53), k = det(`bk:${i}`, 0.3, 1.25)
      m4.compose(_v1.set(Math.cos(a) * r, det(`by:${i}`, -5, 5), Math.sin(a) * r),
        q.setFromEuler(e.set(det(`be1:${i}`, 0, PI2), det(`be2:${i}`, 0, PI2), 0)),
        s.set(k, k, k))
      im.setMatrixAt(i, m4)
    }
    this.scene.add(im)
    this.disposables.push(geo, mat)
    return im
  }

  /** 星舰 Headquarters（demo §3 逐字）：八棱柱舰体/上层甲板/指挥塔/信标/传感
   * 球/环绕桁架/六连接梁/四引擎舱（光晕呼吸）/8 舷窗灯带。 */
  private buildHq(): THREE.Group {
    const hq = new THREE.Group()
    // V12.1（舰长令：HQ 太暗淡）：metalness 0.9 无环境贴图=黑铁——降反照金属度、
    // 提亮基色，发光细节全面加密（双层舷窗带+环缘航行灯+引擎洗涤光+更大信标）。
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x9fb0c8, metalness: 0.6, roughness: 0.38, flatShading: true })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3d4a62, metalness: 0.6, roughness: 0.5, flatShading: true })
    const accMat = new THREE.MeshStandardMaterial({ color: 0x52618a, metalness: 0.55, roughness: 0.4, flatShading: true })
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.7, 2.1) })
    const engMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.15, 0.42) })
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    const hitGeo = new THREE.SphereGeometry(1, 8, 6)
    this.disposables.push(hullMat, darkMat, accMat, winMat, engMat, hitMat, hitGeo)
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0, ry = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat)
      m.position.y = y; m.rotation.y = ry; hq.add(m)
      this.disposables.push(geo)
      return m
    }
    add(new THREE.CylinderGeometry(11, 15, 26, 8), hullMat)
    add(new THREE.CylinderGeometry(6.5, 10, 12, 8), hullMat, 18)
    add(new THREE.CylinderGeometry(2.5, 4.5, 7, 6), accMat, 27)
    const beacon = add(new THREE.SphereGeometry(2.3, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 2.2, 2.6) }), 31)
    add(new THREE.SphereGeometry(3.2, 8, 8), darkMat, 37.5)
    add(new THREE.SphereGeometry(0.8, 6, 6), winMat, 41) // 塔尖天线灯
    const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 2.4, 8, 28), darkMat)
    ring.rotation.x = Math.PI / 2; ring.position.y = -2; hq.add(ring)
    this.disposables.push(ring.geometry)
    // 双层连续舷窗带（甲板灯带——远距也读得出「有人住的旗舰」）
    for (const wy of [-4, 8]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(wy < 0 ? 12.4 : 9.4, wy < 0 ? 12.4 : 9.4, 0.55, 8, 1, true), winMat)
      band.position.y = wy; hq.add(band)
      this.disposables.push(band.geometry)
    }
    // 环缘航行灯（青/琥珀交替——8 点勾出外环轮廓）
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * PI2
      const nl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 6), k % 2 === 0 ? winMat : engMat)
      nl.position.set(Math.cos(a) * 26, -2 + Math.sin(a * 2) * 1.5, Math.sin(a) * 26)
      hq.add(nl)
      this.disposables.push(nl.geometry)
    }
    // 引擎洗涤光（舰底大柔光——把船体从太空底色里衬出来）
    const wash = this.glowSprite(new THREE.Color(0.55, 1.1, 1.4), 48, 0.1)
    wash.position.y = -30
    hq.add(wash)
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * PI2
      const p = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 10), accMat)
      p.position.set(Math.cos(a) * 17, -2, Math.sin(a) * 17)
      p.rotation.y = -a; hq.add(p)
      this.disposables.push(p.geometry)
    }
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * PI2 + Math.PI / 4, x = Math.cos(a) * 8.5, z = Math.sin(a) * 8.5
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 9, 6), accMat)
      nac.position.set(x, -17.5, z); hq.add(nac)
      this.disposables.push(nac.geometry)
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.4, 1, 6), engMat)
      noz.position.set(x, -22.6, z); hq.add(noz)
      this.disposables.push(noz.geometry)
      const sp = this.glowSprite(new THREE.Color(2.3, 1.05, 0.42), 10, 0.9)
      sp.userData.base = 10
      sp.position.set(x, -24.5, z); hq.add(sp); this.hqEngines.push(sp)
    }
    for (let a = 0; a < 8; a++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 3.4), winMat)
      w.position.set(Math.cos(a / 8 * PI2) * 11.6, -6 + (a % 3) * 6, Math.sin(a / 8 * PI2) * 11.6)
      w.rotation.y = -a / 8 * PI2; hq.add(w)
      this.disposables.push(w.geometry)
    }
    const bg = this.glowSprite(new THREE.Color(1.1, 2.2, 2.6), 11, 0.65)
    bg.position.y = 31; hq.add(bg)
    this.scene.add(hq)
    const hqProxy = new THREE.Mesh(hitGeo, hitMat)
    hqProxy.scale.setScalar(36)
    hqProxy.userData.ref = { kind: 'hq' as const }
    this.scene.add(hqProxy)
    this.pickables.push(hqProxy)
    this.hqProxy = hqProxy
    hq.userData.beacon = beacon
    return hq
  }

  private glowSprite(color: THREE.ColorRepresentation, scale: number, opacity: number): THREE.Sprite {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }))
    sp.scale.setScalar(scale)
    this.disposables.push(sp.material)
    return sp
  }

  private makeShip(parent: THREE.Group, glowMat: THREE.SpriteMaterial): void {
    // V12：舰体材质共享场景级（applyTheme 整体换肤——深空战舰/白昼战机零重建）
    const shipHullMat = this.shipHullMat
    const shipAccMat = this.shipAccMat
    const shipEngMat = this.shipEngMat
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 4), shipHullMat)
    body.rotation.x = Math.PI / 2
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.9), shipAccMat); wing.position.z = -0.3
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.8), shipAccMat); fin.position.set(0, 0.35, -0.5)
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.6), shipEngMat); eng.position.z = -1.25
    const sp = new THREE.Sprite(glowMat); sp.scale.setScalar(2.2); sp.position.z = -1.6
    parent.add(body, wing, fin, eng, sp)
    this.disposables.push(body.geometry, wing.geometry, fin.geometry, eng.geometry)
  }

  private createSquad(target: WzPlanet, phase: WzSquadPhase = 'outbound', presetT = 0, info?: { verb: string | null; paused: boolean; sourceLabel: string | null; boardPhase: 'battle' | 'deployed' | 'holding'; sourceCommandId: string | null; live: boolean }): WzSquad {
    const id = this.squadSeq++
    const group = new THREE.Group()
    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color(2.2, 1.1, 0.45), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
    this.disposables.push(glowMat)
    const n = detBool(`sn:${id}`, 0.4) ? 4 : 3
    const offs = [[0, 0, 0], [-1.7, -0.5, 1.4], [1.7, -0.5, 1.4], [0, 0.9, 2.6]]
    for (let j = 0; j < n; j++) {
      const holder = new THREE.Group()
      this.makeShip(holder, glowMat)
      holder.position.set(offs[j]![0]!, offs[j]![1]!, offs[j]![2]!)
      group.add(holder)
    }
    group.scale.setScalar(1.3)
    const start = new THREE.Vector3(det(`sa:${id}`, -1, 1), det(`sb:${id}`, -1, 1), det(`sc:${id}`, -1, 1)).normalize().multiplyScalar(17)
    start.y *= 0.4; start.y -= 2
    group.position.copy(start)
    this.scene.add(group)
    const hitGeo = new THREE.SphereGeometry(1, 8, 6)
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    this.disposables.push(hitGeo, hitMat)
    const proxy = new THREE.Mesh(hitGeo, hitMat)
    proxy.scale.setScalar(5.5)
    this.scene.add(proxy)
    this.pickables.push(proxy)
    const s: WzSquad = {
      kind: 'squad', id, sessionId: null, code: 'SQ-' + pad2(id),
      cname: info !== undefined ? (info.sourceLabel ?? info.verb ?? `执行编队`) : `第${id}突击编队`,
      group, proxy, glowMat, ships: n, target, phase,
      boardPhase: info?.boardPhase ?? 'deployed',
      verb: info?.verb ?? null, paused: info?.paused ?? false, sourceLabel: info?.sourceLabel ?? null,
      sourceCommandId: info?.sourceCommandId ?? null, live: info?.live ?? false,
      t: presetT, start, ctrl: new THREE.Vector3(), dur: 1,
      seed: det(`ss:${id}`, 0, 10), orbitA: det(`so:${id}`, 0, PI2),
      orbitSpd: det(`sp:${id}`, 0.8, 1.4), battleT: 0,
    }
    this.planPath(s, target.mesh.position, target.radius * 1.15 + 6)
    if (phase === 'outbound' && !this.bridged) target.inbound++
    proxy.userData.ref = s
    this.squads.push(s)
    if (phase === 'outbound' && !this.bridged) this.pushLog(this.logC.order, `${s.code} ${s.cname}出击 ▸ ${target.name.split(' ·')[0]!}`)
    return s
  }

  private planPath(s: WzSquad, endPos: THREE.Vector3, clearance: number): void {
    _v1.copy(endPos).add(_v2.copy(s.start).sub(endPos).normalize().multiplyScalar(clearance))
    s.ctrl.copy(s.start).add(_v1).multiplyScalar(0.5)
      .add(_v3.set(det(`sbx:${s.id}`, -1, 1), det(`sby:${s.id}`, -1, 1), det(`sbz:${s.id}`, -1, 1)).normalize().multiplyScalar(s.start.distanceTo(_v1) * det(`sbk:${s.id}`, 0.25, 0.4)))
    s.dur = Math.max(2.5, s.start.distanceTo(_v1) / (CFG.squadSpeed + det(`sdx:${s.id}`, 0, 8)))
    if (s.t === 0) s.t = 0
  }

  private squadArrive(s: WzSquad): void {
    const p = s.target
    if (!this.bridged) p.inbound = Math.max(0, p.inbound - 1)
    const rel = _v1.copy(s.group.position).sub(p.mesh.position)
    s.orbitA = Math.atan2(rel.z, rel.x)
    if (this.bridged) {
      // 连线态：到达即落板面相位（交战/驻泊/集结）——星球状态不由此改写（红线）。
      s.phase = s.boardPhase
      s.orbitSpd = det(`osd:${s.id}`, 0.4, 0.7)
      return
    }
    if (p.status === '待进攻') {
      p.status = '执行中'
      s.phase = 'battle'
      s.battleT = p.battleT = det(`bt:${s.id}`, 6, 14)
      s.orbitSpd = det(`osb:${s.id}`, 1.8, 2.6)
      this.pushLog(this.logC.engage, `${s.code} 接敌 · ${p.name.split(' ·')[0]!} 交战开始`)
    } else {
      s.phase = 'deployed'
      s.orbitSpd = det(`osd:${s.id}`, 0.4, 0.7)
      p.deployedSquads.push(s)
    }
  }

  private capturePlanet(p: WzPlanet, s: WzSquad): void {
    p.status = '已占领'
    p.garrison += s.ships
    s.phase = 'deployed'
    s.orbitSpd = det(`osc:${s.id}`, 0.4, 0.7)
    p.deployedSquads.push(s)
    this.spawnRing(p.mesh.position, p.radius * 1.6, this.cHeld)
    this.pushLog(this.logC.triumph, `${s.code} 攻占 ${p.name.split(' ·')[0]!} · 驻军 +${s.ships}`)
  }

  private removeSquad(i: number): void {
    const s = this.squads[i]!
    this.scene.remove(s.group, s.proxy)
    const pi = this.pickables.indexOf(s.proxy)
    if (pi >= 0) this.pickables.splice(pi, 1)
    if (s.sessionId !== null) this.squadBySession.delete(s.sessionId)
    this.squads.splice(i, 1)
  }

  private sendHome(s: WzSquad): void {
    const ti = s.target.deployedSquads.indexOf(s)
    if (ti >= 0) s.target.deployedSquads.splice(ti, 1)
    s.start = s.group.position.clone()
    s.phase = 'return'
    this.planPath(s, _v1.set(0, -6, 0), 14)
  }

  private spawnRing(pos: THREE.Vector3, radius: number, color: THREE.Color): void {
    let f = this.fxPool.find(f => !f.active)
    if (!f) {
      const ringGeo = new THREE.RingGeometry(0.85, 1, 48)
      this.disposables.push(ringGeo)
      f = { mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })), t: 0, baseR: 1, active: false }
      this.scene.add(f.mesh)
      this.fxPool.push(f)
    }
    f.active = true; f.t = 0; f.baseR = radius
    f.mesh.visible = true
    ;(f.mesh.material as THREE.MeshBasicMaterial).color.copy(color)
    f.mesh.position.copy(pos)
  }

  private updateRings(dt: number, camera: THREE.Camera): void {
    this.fxPool.forEach(f => {
      if (!f.active) return
      f.t += dt
      const k = f.t / 0.9
      f.mesh.scale.setScalar(f.baseR * (1 + k * 2.2))
      ;(f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k))
      f.mesh.quaternion.copy(camera.quaternion)
      if (f.t > 0.9) { f.active = false; f.mesh.visible = false }
    })
  }

  private trySpawn(): void {
    const active = this.squads.filter(s => s.phase !== 'return')
    if (active.length >= CFG.squadCap) {
      const old = active.find(s => s.phase === 'deployed')
      if (old) this.sendHome(old); else return
    }
    const cands = this.planets.filter(p => p.status === '待进攻' && !p.inbound)
    if (!cands.length) return
    this.createSquad(cands[Math.floor(det(`csp:${this.spawnEpoch}`, 0, cands.length)) % cands.length]!)
  }

  private warLoop(dt: number): void {
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.trySpawn()
      this.spawnT = det(`gap:${this.spawnEpoch++}`, CFG.spawnGapLo, CFG.spawnGapHi)
    }
    this.flipT -= dt
    if (this.flipT <= 0) {
      this.flipT = det(`flip:${this.flipEpoch++}`, 16, 26)
      if (!this.planets.some(p => p.status === '待进攻' || p.inbound)) {
        const occ = this.planets.filter(p => p.status === '已占领')
        if (occ.length) {
          const p = occ[Math.floor(det(`fl:${this.flipEpoch}`, 0, occ.length)) % occ.length]!
          p.status = '待进攻'
          p.garrison = Math.max(0, p.garrison - 3)
          p.deployedSquads.splice(0).forEach(s => this.sendHome(s))
          this.spawnRing(p.mesh.position, p.radius * 1.4, this.cBattle)
          this.pushLog(this.logC.retreat, `${p.name.split(' ·')[0]!} 遭敌反攻 · 失守!`)
        }
      }
    }
  }

  private pushLog(color: string, text: string): void {
    this.log.unshift({ t: this.simT, color, text })
    if (this.log.length > 30) this.log.pop()
  }

  /** 射线拾取（demo updateHover 3D 半边）：返回命中实体 ref 或 null。 */
  pick(ndcX: number, ndcY: number): { kind: 'hq' | 'planet' | 'squad' | 'front'; ref: unknown } | null {
    this.raycaster.setFromCamera(_v2.set(ndcX, ndcY, 0) as unknown as THREE.Vector2, this.camera)
    const hits = this.raycaster.intersectObjects(this.pickables, false)
    return hits.length ? (hits[0]!.object.userData.ref as { kind: 'hq' | 'planet' | 'squad' | 'front'; ref: unknown }) : null
  }

  /** 中键旋转（dYaw/dPitch 弧度，阻尼经 target）。 */
  orbitBy(dYaw: number, dPitch: number): void {
    this.camTar = clampCam({ ...this.camTar, yaw: this.camTar.yaw + dYaw, pitch: this.camTar.pitch + dPitch }, this.camMinDist, this.camMaxDist)
  }

  /** 左键平移：像素→世界（按中心距换算），沿相机右/上轴推 center；即时跟手。 */
  panByPx(dx: number, dy: number, viewH: number): void {
    const wpp = (2 * Math.tan((55 * Math.PI) / 360) * this.camCur.dist) / Math.max(viewH, 1)
    const rightX = Math.cos(this.camCur.yaw), rightZ = -Math.sin(this.camCur.yaw)
    this.camCenter.x += -dx * rightX * wpp
    this.camCenter.y += dy * Math.cos(this.camCur.pitch) * wpp
    this.camCenter.z += -dx * rightZ * wpp
    const m = this.camCenter.length()
    if (m > this.PAN_LIMIT) this.camCenter.multiplyScalar(this.PAN_LIMIT / m)
  }

  /** 滚轮缩放（指数；往外拉=变大）——V11.5g 界随星球动态。 */
  zoomBy(deltaY: number): void {
    this.camTar = clampCam({ ...this.camTar, dist: this.camTar.dist * Math.exp(deltaY * 0.0012) }, this.camMinDist, this.camMaxDist)
  }

  /** 双击/R 复位：机位+平移归零。 */
  resetCam(): void {
    this.camTar = { ...WZ_CAM_HOME }
    this.camCenter.set(0, 0, 0)
  }

  /** 探针/取证快照。 */
  camInfo(): { cx: number; cy: number; cz: number; yaw: number; pitch: number; dist: number; distMin: number; distMax: number } {
    return { cx: this.camCenter.x, cy: this.camCenter.y, cz: this.camCenter.z, yaw: this.camCur.yaw, pitch: this.camCur.pitch, dist: this.camCur.dist, distMin: this.camMinDist, distMax: this.camMaxDist }
  }

  /** V11.5g：按当前星球谱（半径 min/max + 布局外沿）与视高重算缩放界；
   * syncBoard 星球重建与 resize 各钩一次（空板退静态常数）。 */
  private recalcCamBounds(): void {
    if (this.planets.length === 0) { this.camMinDist = WZ_CAM_DIST_MIN; this.camMaxDist = WZ_CAM_DIST_MAX; return }
    let minR = Infinity, maxR = 0, extent = 0
    for (const p of this.planets) {
      minR = Math.min(minR, p.radius)
      maxR = Math.max(maxR, p.radius)
      extent = Math.max(extent, Math.hypot(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z))
    }
    const b = wzCamBounds(minR, maxR, extent, this.viewH)
    this.camMinDist = b.min
    this.camMaxDist = b.max
    this.camCur = clampCam(this.camCur, b.min, b.max)
    this.camTar = clampCam(this.camTar, b.min, b.max)
  }

  /** V12 主题热切换（壳 MutationObserver 驱动）：深空↔天空两套氛围件可见性/配色；
   * R2 起还将触发星球（球体↔浮空岛）/HQ（星舰↔要塞）视觉工厂重建。 */
  setTheme(dark: boolean): void {
    if (this.darkTheme === dark) return
    this.applyTheme(dark)
  }

  get isDarkTheme(): boolean { return this.darkTheme !== false }

  private applyTheme(dark: boolean): void {
    this.darkTheme = dark
    // V12.2 语义令牌刷新：CSS 是色源；美术资产（贴图/舰体/光照）仍走下方工厂分支。
    this.tac = readTacPalette(dark)
    this.logC = warLogColors(dark)
    this.cHl.set(this.tac.hl); this.cBattle.set(this.tac.battle); this.cHeld.set(this.tac.held); this.cWait.set(this.tac.wait)
    // V13：链色随主题翻转（浅压深/深原亮）——航迹层整组重建。
    if (this.lastFronts.length > 0) this.rebuildFrontLines(this.lastFronts)
    this.starGroup.visible = dark
    this.nebGroup.visible = dark
    this.cloudGroup.visible = !dark
    this.bloom.enabled = dark // 白天无辉光可放大——bloom 关（还省一块 GPU）
    this.scene.fog = dark ? new THREE.FogExp2(0x06070f, 0.00075) : new THREE.FogExp2(0xcfe4f5, 0.0006)
    // 加法辉光在白天底上失效——星球 halo 浅色态隐藏（R2 由基座环/光柱接班语义）
    for (const p of this.planets) p.halo.visible = dark
    if (this.sunMat !== null) {
      if (dark) this.sunMat.color.setRGB(2.0, 2.1, 2.4)
      else this.sunMat.color.setRGB(2.3, 1.95, 1.35) // 暖阳
    }
    if (this.sunGlowMat !== null) {
      if (dark) this.sunGlowMat.color.setRGB(0.72, 0.8, 1.0)
      else this.sunGlowMat.color.setRGB(1.0, 0.86, 0.6)
    }
    if (this.dirLight !== null) {
      if (dark) { this.dirLight.color.set(0xaabbff); this.dirLight.intensity = 1.6 }
      else { this.dirLight.color.set(0xfff2dc); this.dirLight.intensity = 2.1 }
    }
    if (this.ambientLight !== null) {
      if (dark) { this.ambientLight.color.set(0x334466); this.ambientLight.intensity = 0.7 }
      else { this.ambientLight.color.set(0xdfeaf5); this.ambientLight.intensity = 0.85 }
    }
    if (this.hemiLight !== null) this.hemiLight.intensity = dark ? 0.4 : 0.55
    // 舰体共享材质换肤：深空战舰（蓝灰合金+橙引擎）↔ 白昼战机（浅机身+冷尾焰）
    if (dark) {
      this.shipHullMat.color.set(0x8d99b0); this.shipAccMat.color.set(0x51427e)
      this.shipEngMat.color.setRGB(2.2, 1.15, 0.45)
    } else {
      this.shipHullMat.color.set(0xdfe6ee); this.shipAccMat.color.set(0x8fa5bd)
      this.shipEngMat.color.setRGB(0.45, 0.55, 0.75)
    }
    for (const s of this.squads) {
      if (dark) { s.glowMat.color.setRGB(2.2, 1.1, 0.45); s.glowMat.opacity = 0.85 }
      else { s.glowMat.color.setRGB(1.95, 1.95, 2.05); s.glowMat.opacity = 0.55 }
    }
    // HQ 换皮：星舰 ↔ 空中要塞（同 beacon/engines/pick-proxy 契约；变体守卫防首贴空转）
    const wantHq: 'ship' | 'fortress' = dark ? 'ship' : 'fortress'
    if (this.hqGroup !== null && this.hqVariant !== wantHq) {
      this.scene.remove(this.hqGroup)
      const seen = new Set<THREE.Material | THREE.BufferGeometry>()
      this.hqGroup.traverse(node => {
        const m = (node as THREE.Mesh).material as THREE.Material | undefined
        const g = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
        if (m !== undefined && !seen.has(m)) { seen.add(m); m.dispose() }
        if (g !== undefined && !seen.has(g)) { seen.add(g); g.dispose() }
      })
      this.hqEngines.length = 0
      if (this.hqProxy !== null) {
        const pi = this.pickables.indexOf(this.hqProxy)
        if (pi >= 0) this.pickables.splice(pi, 1)
        this.hqProxy = null
      }
      const hq = dark ? this.buildHq() : this.buildFortress()
      this.hqGroup = hq
      this.hqVariant = wantHq
      const eng = this.hqEngines[0]?.material as THREE.SpriteMaterial | undefined
      if (eng !== undefined) this.hqEngineMat = eng
      const bc = hq.userData.beacon as THREE.Mesh | undefined
      if (bc !== undefined) this.hqBeacon = bc
    }
    // 星球换皮：整组重建（NASA 球体 ↔ 浮空岛）——重放最近板真值
    if (this.lastBridge !== null && this.planetKey !== '') {
      this.planetKey = ''
      this.syncBoard(this.lastBridge)
    }
    this.rebuildHlLines()
  }

  /** 云层（浅色态氛围件）：确定性散布的宽软 sprite，极慢漂移（舰长放行——
   * 云非地形，类似星闪呼吸感）；|x|>700 环回。 */
  private buildClouds(): void {
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, opacity: det(`cd:${i}`, 0.22, 0.42), depthWrite: false, fog: false })
      const sp = new THREE.Sprite(mat)
      const r = det(`cr:${i}`, 180, 520), a = det(`ca:${i}`, 0, PI2)
      sp.position.set(Math.cos(a) * r, det(`cy:${i}`, 40, 170), Math.sin(a) * r)
      const sc = det(`cs:${i}`, 90, 220)
      sp.scale.set(sc * 1.9, sc, 1)
      sp.userData.drift = det(`cv:${i}`, 1.2, 3.2) * (detBool(`vd:${i}`, 0.5) ? 1 : -1)
      this.cloudGroup.add(sp)
      this.disposables.push(mat)
    }
  }

  /** 高亮星域集合（板卡悬停/聚焦/执行卡悬停共入口）；星球静态，轨迹线重建即可。 */
  setHighlight(ws: ReadonlyArray<string>): void {
    this.hlWs.clear()
    for (const w of ws) this.hlWs.add(w)
    this.rebuildHlLines()
  }

  /** V13.4 常驻行星名牌（critique R3 P2：识别不该靠悬停换——行星是固定参照系
   *  V11.5a，低透明度常驻不抢戏不破空间记忆；挂 mesh 子级随 applyTheme 重建换色）。 */
  private addPlanetLabel(p: WzPlanet): void {
    const cv = document.createElement('canvas')
    let c2: CanvasRenderingContext2D | null = null
    let w = 60
    try { c2 = cv.getContext('2d') } catch { /* headless 无 2D——跳过名牌 */ }
    if (c2 === null) return
    // V16.4-R2 critique P2：失败定位不退化——有败的星球名签缀红「N 败」
    //（2D/3D 同源 p.failing），默认值班态也能 10 秒定位失败。
    const label = p.failing > 0 ? `${p.name} ·${p.failing}挫败` : p.name
    c2.font = '600 30px system-ui, sans-serif'
    w = Math.min(Math.ceil(c2.measureText(label).width) + 26, 380)
    cv.width = w; cv.height = 44
    c2 = cv.getContext('2d')
    if (c2 === null) return
    const dark = this.darkTheme !== false
    c2.font = '600 30px system-ui, sans-serif'
    c2.textAlign = 'center'; c2.textBaseline = 'middle'
    if (p.failing > 0) {
      const nameW = c2.measureText(p.name).width
      const sufW = c2.measureText(` ·${p.failing}败`).width
      const x0 = w / 2 - (nameW + sufW) / 2
      c2.textAlign = 'left'
      c2.fillStyle = dark ? '#c9cdd2' : '#5b6167'
      c2.fillText(p.name, x0, 23)
      c2.fillStyle = '#e5484d'
      c2.fillText(` ·${p.failing}挫败`, x0 + nameW, 23)
    } else {
      c2.fillStyle = dark ? '#c9cdd2' : '#5b6167'
      c2.fillText(label, w / 2, 23)
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: dark ? 0.62 : 0.8, depthWrite: false, fog: false }))
    // V13.5 常屏幕尺寸：目标像素高 + 画布宽高比记进 userData，update 逐帧按相机距离补偿。
    sprite.userData.labelH = 19
    sprite.userData.labelAspect = w / 44
    sprite.scale.set((w / 44) * 3.0, 3.0, 1)
    sprite.position.set(0, -(p.radius + 4.6), 0)
    p.mesh.add(sprite)
  }

  /** V13 战线世代环（舰长定案：战线=血脉∩星球，锚定单星球）：每条战线在其星球
   *  行星外一圈链色环 + 世代标记沿环弧排布（末代放大发光，兼拾取代理）——跨行星
   *  连线不存在（跨星球=新战线，见 front.ts 拆分规则）。收官战线降透明度留痕。
   *  链色经 war-tokens 从 CSS --chain-hue 解析（主题翻转随动）。 */
  private rebuildFrontLines(fronts: ReadonlyArray<WzBridgeFrontLite>): void {
    for (const child of [...this.frontGroup.children]) {
      this.frontGroup.remove(child)
      const seen = new Set<THREE.Material | THREE.BufferGeometry>()
      child.traverse(node => {
        const m = (node as THREE.Mesh).material as THREE.Material | undefined
        const g = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
        if (m !== undefined && !seen.has(m)) { seen.add(m); m.map?.dispose(); m.dispose() }
        if (g !== undefined && !seen.has(g)) { seen.add(g); g.dispose() }
      })
    }
    for (const fp of this.frontPickables) {
      const pi = this.pickables.indexOf(fp)
      if (pi >= 0) this.pickables.splice(pi, 1)
    }
    this.frontPickables.length = 0
    this.lastFronts = fronts
    this.frontSeq++
    // V15.2 语义重铸（舰长定案）：一星球一环、分段=战线数。旧语义（每战线一条
    // 链色环+世代点+末代辉光）在多战线星球退化成密环叠罗汉——战线数改由分段数
    // 编码，不区分链色；环色取星球自身辉光底色（每星球确定性一套色系）。
    // 世代点休眠：代数是卡片层信息（悬停 tooltip/星球面板/任务列组头）。
    const byWs = new Map(this.planets.map(p => [p.wsPath, p]))
    const counts = new Map<string, number>()
    for (const f of fronts) {
      if (!byWs.has(f.battlefield)) continue
      counts.set(f.battlefield, (counts.get(f.battlefield) ?? 0) + 1)
    }
    const light = !this.isDarkTheme
    for (const [ws, count] of counts) {
      const p = byWs.get(ws)!
      const group = new THREE.Group()
      group.position.copy(p.mesh.position)
      group.rotation.x = Math.PI / 2.4
      group.rotation.y = det(`fr:${ws}`, -0.5, 0.5)
      const color = p.baseGlow.clone().lerp(new THREE.Color(light ? '#304050' : '#e8ecf2'), light ? 0.45 : 0.35)
      const segs = Math.max(count, 1)
      const gap = 0.24
      const arc = (Math.PI * 2) / segs - gap
      const tubular = Math.max(6, Math.round(48 / segs))
      for (let i = 0; i < segs; i++) {
        const seg = new THREE.Mesh(
          new THREE.TorusGeometry(p.radius * 1.5, 0.8, 8, tubular, arc),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: light ? 0.6 : 0.45, depthWrite: false, fog: false }),
        )
        seg.rotation.z = ((Math.PI * 2) / segs) * i
        group.add(seg)
      }
      this.frontGroup.add(group)
    }
  }

  private rebuildHlLines(): void {
    for (const l of this.hlLines) { this.scene.remove(l); (l.material as THREE.Material).dispose(); l.geometry.dispose() }
    this.hlLines = []
    for (const p of this.planets) {
      if (!this.hlWs.has(p.wsPath)) continue
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -6, 0), p.mesh.position.clone()])
      const mat = new THREE.LineDashedMaterial({ color: this.cHl, dashSize: 6, gapSize: 4, transparent: true, opacity: this.isDarkTheme ? 0.85 : 0.95 })
      const line = new THREE.Line(geo, mat)
      line.computeLineDistances()
      this.scene.add(line)
      this.hlLines.push(line)
      if (this.hlLines.length >= 4) break
    }
  }

  /** 星球世界位 → 屏幕 CSS px（3D 态，render 之后调用；出视锥 null）。 */
  planetScreen(wsPath: string, w: number, h: number): { x: number; y: number } | null {
    const p = this.planets.find(q => q.wsPath === wsPath)
    if (p === undefined) return null
    _v1.copy(p.mesh.position).project(this.camera)
    if (_v1.z > 1 || _v1.z < -1) return null
    return { x: (_v1.x * 0.5 + 0.5) * w, y: (-_v1.y * 0.5 + 0.5) * h }
  }

  /** V13.5 常屏幕尺寸标签：屏幕高恒定（worldH ∝ 相机距离）——远行星 5-8px 字
   *  读不了的根治（critique R4 P1-1）；近景上限防爆炸、远景下限防隐形。 */
  private fitScreenLabel(s: THREE.Sprite): void {
    s.getWorldPosition(_v1)
    const dist = this.camera.position.distanceTo(_v1)
    const worldH = ((s.userData.labelH as number) / Math.max(this.viewH, 1)) * 2 * Math.tan((55 * Math.PI) / 360) * dist
    s.scale.set(worldH * (s.userData.labelAspect as number), worldH, 1)
  }

  /** 帧推进（demo animate 的模拟半边）：星舰呼吸/星球轨道与状态/编队/特效/调度。 */
  update(dt: number, t: number): void {
    for (const p of this.planets) {
      for (const ch of p.mesh.children) {
        if ((ch as THREE.Sprite).isSprite === true && ch.userData.labelH !== undefined) this.fitScreenLabel(ch as THREE.Sprite)
      }
    }
    for (const g of this.frontGroup.children) {
      for (const ch of g.children) {
        if ((ch as THREE.Sprite).isSprite === true && ch.userData.labelH !== undefined) this.fitScreenLabel(ch as THREE.Sprite)
      }
    }
    this.simT += dt
    this.camCur = dampCam(this.camCur, this.camTar, dt, 9, this.camMinDist, this.camMaxDist)
    const hq = this.hqBeacon.parent as THREE.Group
    hq.rotation.y += dt * 0.06
    const duty = this.hqActive ? 1 : 0.32
    const pulse = 1 + 0.18 * Math.sin(t * 5)
    this.hqEngines.forEach((sp, i) => sp.scale.setScalar(((sp.userData.base as number | undefined) ?? 9) * duty * (1 + 0.16 * Math.sin(t * 5 + i * 1.7))))
    this.hqEngineMat.opacity = (0.7 + 0.25 * pulse * 0.5) * duty
    ;(this.hqBeacon.material as THREE.MeshBasicMaterial).color.setRGB(1.1, 2.2, 2.6).multiplyScalar((0.8 + 0.3 * Math.sin(t * 3)) * duty)
    for (const p of this.planets) {
      const o = p.orbit
      // V11.5a（舰长定）：公转停——地形是固定参照系（空间记忆/拾取稳定/军图惯例），
      // 真实在动的只有单位（编队）；自转保留（不改位置）。demo 漂移仅非 bridged 态。
      if (!this.bridged) o.angle += o.speed * dt
      const rr = o.r * (1 + o.ecc * Math.sin(o.angle * 1.618 + o.phase))
      p.mesh.position.set(Math.cos(o.angle) * rr, o.yBase + Math.sin(o.angle * 0.9 + o.phase * 2) * o.tiltA, Math.sin(o.angle) * rr)
      p.mesh.rotation.y += p.rot * dt
      if (p.cloud !== null) p.cloud.rotation.y += p.rot * dt * 1.16
      if (this.isDarkTheme) {
        _c1.copy(p.baseGlow)
        let op = 0.3
        if (p.status === '执行中') {
          _c1.copy(this.cBattle)
          op = 0.42 + 0.18 * Math.sin(t * 7 + p.seed * 6)
        } else if (p.status === '已占领') {
          _c1.lerp(_c2.copy(this.cHeld), 0.4)
          op = 0.34
        }
        if (this.hlWs.has(p.wsPath)) { op = 0.58; _c1.lerp(_c2.copy(this.cHl), 0.35) }
        p.halo.material.color.lerp(_c1, 0.08)
        p.halo.material.opacity += (op - p.halo.material.opacity) * 0.1
        const hov = this.hlWs.has(p.wsPath) ? 1.16 : 1
        p.halo.scale.setScalar(p.halo.scale.x + (p.haloScale * hov - p.halo.scale.x) * 0.1)
      } else if (p.ring !== null) {
        // V12 浅色：辉光失效——基座环+执行光柱接班状态语义（光柱=王国之泪语言）
        const rm = p.ring.material as THREE.MeshBasicMaterial
        if (p.status === '执行中') {
          rm.color.copy(this.cBattle)
          rm.opacity = 0.5 + 0.25 * Math.sin(t * 7 + p.seed * 6)
          if (p.pillar !== null) {
            p.pillar.visible = true
            ;(p.pillar.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.1 * Math.sin(t * 3.2 + p.seed)
          }
        } else {
          if (p.pillar !== null) p.pillar.visible = false
          if (p.status === '已占领') { rm.color.copy(this.cHeld); rm.opacity = 0.45 }
          else { rm.color.copy(this.cWait); rm.opacity = 0.26 }
        }
        if (this.hlWs.has(p.wsPath)) { rm.color.copy(this.cHl); rm.opacity = 0.85 }
      }
    }
    for (let i = this.squads.length - 1; i >= 0; i--) {
      const s = this.squads[i]!
      const glow = 0.72 + 0.28 * Math.sin(t * 22 + s.seed)
      if (s.phase === 'outbound' || s.phase === 'return') {
        const end = s.phase === 'return'
          ? _v2.set(0, -6, 0)
          : _v1.copy(s.target.mesh.position).add(_v3.copy(s.start).sub(s.target.mesh.position).normalize().multiplyScalar(s.target.radius * 1.15 + 6))
        s.t += dt / s.dur
        const tt = ease(Math.min(s.t, 1))
        qbez(s.start, s.ctrl, end, tt, s.group.position)
        qbez(s.start, s.ctrl, end, Math.min(1, tt + 0.03), _v1)
        s.group.lookAt(_v1)
        if (s.t >= 1) {
          if (s.phase === 'outbound') this.squadArrive(s)
          else { this.removeSquad(i); continue }
        }
      } else {
        const tp = s.target.mesh.position
        s.orbitA += dt * s.orbitSpd * (s.phase === 'battle' ? 2.2 : 1)
        const rr = s.target.radius * 1.18 + (s.phase === 'battle' ? 4 : 7) + Math.sin(t * 2 + s.seed) * 0.8
        const by = Math.sin(t * 1.6 + s.seed) * 2.5
        s.group.position.set(tp.x + Math.cos(s.orbitA) * rr, tp.y + by, tp.z + Math.sin(s.orbitA) * rr)
        s.group.lookAt(tp.x + Math.cos(s.orbitA + 0.35) * rr, tp.y + by, tp.z + Math.sin(s.orbitA + 0.35) * rr)
        if (s.phase === 'battle' && !this.bridged) {
          s.battleT -= dt
          if (s.battleT <= 0) this.capturePlanet(s.target, s)
        }
      }
      s.glowMat.opacity = glow
      s.proxy.position.copy(s.group.position)
    }
    this.updateRings(dt, this.camera)
    if (!this.bridged) this.warLoop(dt)
    this.starMat.uniforms.uTime!.value = t
    this.starGroup.rotation.y += dt * 0.004
    this.belt.rotation.y += dt * 0.01
    if (this.cloudGroup.visible) {
      for (const c of this.cloudGroup.children) {
        c.position.x += (c.userData.drift as number) * dt
        if (c.position.x > 700) c.position.x = -700
        else if (c.position.x < -700) c.position.x = 700
      }
    }
  }

  /** 板同步（V11.5 连线正门）：星球集（wsPath 变更时整组重建，否则原地刷状态）
   * + 编队 diff（新会话=星舰起飞 / 消失=返航 / 相位迁移随板面）+ WAR LOG 整组
   * 替换 + HQ 出航开关。此后 demo 自驱永久旁路。 */
  syncBoard(bridge: { active: boolean; planets: ReadonlyArray<WzBridgePlanet>; squads: ReadonlyArray<WzBridgeSquad>; log: ReadonlyArray<WzLogEntry>; fronts?: ReadonlyArray<WzBridgeFrontLite> }): void {
    this.bridged = true
    this.lastBridge = bridge
    this.hqActive = bridge.active
    const fronts = bridge.fronts ?? []
    const frontKey = fronts.map(f => `${f.rootId}:${f.gens}:${f.live ? 1 : 0}:${f.battlefield}`).join('|')
    const key = bridge.planets.map(p => p.wsPath).join('|')
    if (key !== this.planetKey) {
      for (const p of this.planets) {
        // halo/proxy 是 group 子节点——移除 group 即整棵退场；缓存贴图（模块级
        // texCache）绝不在此 dispose（SSE 重建零重画的根基）。
        this.scene.remove(p.mesh)
        const pi = this.pickables.indexOf(p.proxy)
        if (pi >= 0) this.pickables.splice(pi, 1)
        const seen = new Set<THREE.Material | THREE.BufferGeometry>()
        p.mesh.traverse(node => {
          const m = (node as THREE.Mesh).material as THREE.Material | undefined
          const g = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
          if (m !== undefined && !seen.has(m)) { seen.add(m); m.dispose() }
          if (g !== undefined && !seen.has(g)) { seen.add(g); g.dispose() }
        })
      }
      this.planets.length = 0
      this.planetKey = key
      const specs = warzoneLayoutFor(bridge.planets.map(p => p.wsPath), bridge.planets.map(p => p.activity))
      for (const sp of specs) {
        const b = bridge.planets[sp.index]!
        this.addPlanet(sp, b.wsPath, b.status, b.garrison, b.failing, b.inbound)
      }
      this.rebuildHlLines()
      this.recalcCamBounds()
      this.rebuildFrontLines(fronts)
      this.frontKey = frontKey
    } else {
      bridge.planets.forEach((b, i) => {
        const p = this.planets[i]
        if (p === undefined) return
        p.status = b.status
        p.garrison = b.garrison
        p.failing = b.failing
        p.inbound = b.inbound
      })
      if (frontKey !== this.frontKey) {
        this.frontKey = frontKey
        this.rebuildFrontLines(fronts)
      }
    }
    const byWs = new Map(this.planets.map(p => [p.wsPath, p]))
    const live = new Set(bridge.squads.map(s => s.sessionId))
    for (const s of [...this.squads]) {
      if (s.sessionId !== null && !live.has(s.sessionId) && s.phase !== 'return') {
        this.sendHome(s)
        this.pushLog(this.logC.return, `${s.code} ${s.cname} 返航 · 会话收束`)
      }
    }
    for (const bs of bridge.squads) {
      const existing = this.squadBySession.get(bs.sessionId)
      const planet = byWs.get(bs.wsPath)
      if (planet === undefined) continue
      if (existing === undefined) {
        const s = this.createSquad(planet, 'outbound', 0, { verb: bs.verb, paused: bs.paused, sourceLabel: bs.sourceLabel, boardPhase: bs.phase, sourceCommandId: bs.sourceCommandId, live: bs.live })
        s.sessionId = bs.sessionId
        this.squadBySession.set(bs.sessionId, s)
        this.pushLog(this.logC.order, `${s.code} ${bs.sourceLabel ?? bs.verb ?? '执行会话'}出击 ▸ ${planet.name.split(' ·')[0]!}`)
        continue
      }
      existing.verb = bs.verb
      existing.paused = bs.paused
      existing.sourceLabel = bs.sourceLabel
      existing.sourceCommandId = bs.sourceCommandId
      existing.live = bs.live
      if (bs.sourceLabel !== null || bs.verb !== null) existing.cname = bs.sourceLabel ?? bs.verb ?? existing.cname
      existing.boardPhase = bs.phase
      if (existing.phase !== 'return' && existing.phase !== 'outbound' && existing.phase !== bs.phase) existing.phase = bs.phase
      if (existing.target !== planet) existing.target = planet
    }
    this.log.length = 0
    this.log.push(...bridge.log)
  }

  render(): void {
    const { yaw, pitch, dist } = this.camCur
    this.camera.position.set(
      this.camCenter.x + dist * Math.cos(pitch) * Math.sin(yaw),
      this.camCenter.y + dist * Math.sin(pitch),
      this.camCenter.z + dist * Math.cos(pitch) * Math.cos(yaw),
    )
    this.camera.lookAt(this.camCenter)
    this.composer.render()
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
    this.viewH = h
    this.recalcCamBounds()
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.rebuildFrontLines([]) // V13：航迹层材质/几何随清场释放
    this.composer.dispose()
    this.renderer.dispose()
  }
}

/* ================================================================
 * 指挥室 2D 战术视图（V11.5f 按令去面板）：雷达盘/HQ 八角/星球符号（含高亮
 * 虚线轨迹+名签）/编队三角+虚线航迹/CRT 静态扫描线；名册/态势/速报面板族与
 * 扫描波束动画已随「指挥室屏幕=围合中央自由区」定案休眠。
 * ================================================================ */

export interface TacHit { x: number; y: number; r: number; ref: unknown }

export class WarzoneTactical {
  private readonly g: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly scanPat: CanvasPattern | null
  /** V12：2D 双皮——深色=战术雷达 / 浅色=蓝图纸面（白纸+青蓝制图线，舰长定）。 */
  private dark = true
  /** V12.2：调色板经 war-tokens 从 CSS 令牌读取（setTheme 刷新；headless 回退）。 */
  private tac: WarTacPalette = TAC_FALLBACK_DARK
  private w = 0
  private h = 0
  private cx = 0
  private cy = 0
  private worldScale = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.g = canvas.getContext('2d')!
    const c = document.createElement('canvas'); c.width = 2; c.height = 3
    const q = c.getContext('2d')!
    q.fillStyle = 'rgba(0,0,0,.22)'; q.fillRect(0, 0, 2, 1)
    this.scanPat = this.g.createPattern(c, 'repeat')
  }

  zoomBy(deltaY: number): void {
    this.canvas.dataset.zoom = String(Math.min(1.5, Math.max(0.55, (Number(this.canvas.dataset.zoom ?? 1)) * (1 - deltaY * 0.001))))
  }

  setTheme(dark: boolean): void { this.dark = dark; this.tac = readTacPalette(dark) }

  private get zoom(): number { return Number(this.canvas.dataset.zoom ?? 1) }

  resize(w: number, h: number): void {
    const dpr = Math.min(devicePixelRatio, 2)
    this.w = w; this.h = h
    this.canvas.width = w * dpr
    this.canvas.height = h * dpr
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }


  /** 帧绘制（V11.5f 舰长令）：雷达画进围合中央自由区；名册/态势/速报/顶底栏
   * 文字全部休眠——只剩盘+符号+高亮；扫描波束动态动画此前已休眠。 */
  draw(t: number, planets: ReadonlyArray<WzPlanet>, squads: ReadonlyArray<WzSquad>, hits: TacHit[], safe?: { x: number; y: number; w: number; h: number }, hl?: ReadonlySet<string>): void {
    const g = this.g
    const w = this.w, h = this.h
    const S = safe ?? { x: 0, y: 0, w, h }
    // V12.2 双皮调色板改由 CSS 令牌供给（--war-tac-*/--war-wz-*，war-tokens 读取
    // + 同值回退）：换肤/换主题只改 CSS 一处，雷达/蓝图两皮自动跟随。
    // stWait/stBattle/stHeld 是旧调用点别名（2D 盘内状态三原色）。
    const tac = this.tac
    const P = { ...tac, stWait: tac.wait, stBattle: tac.battle, stHeld: tac.held, scan: this.dark }
    const cx = this.cx = S.x + S.w / 2
    const cy = this.cy = S.y + S.h / 2 + 10
    const baseR = Math.max(130, Math.min(S.h * 0.5 - 64, S.w * 0.5 - 24, 460))
    this.worldScale = baseR / 300 * this.zoom
    const ws = this.worldScale
    hits.length = 0
    const W2S = (x: number, z: number, out: { x: number; y: number }): void => { out.x = cx + x * ws; out.y = cy + z * ws }
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
    bg.addColorStop(0, P.bg0); bg.addColorStop(0.5, P.bg1); bg.addColorStop(1, P.bg2)
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.strokeStyle = P.grid; g.lineWidth = 1
    g.beginPath()
    for (let x = cx % 46; x < w; x += 46) { g.moveTo(x, 0); g.lineTo(x, h) }
    for (let y = cy % 46; y < h; y += 46) { g.moveTo(0, y); g.lineTo(w, y) }
    g.stroke()
    // 雷达盘（距离环/十字线/度刻度/方位标——静态）
    const R = 300 * ws
    g.save(); g.translate(cx, cy)
    for (let wr = 75; wr <= 300; wr += 75) {
      const r = wr * ws
      g.beginPath(); g.arc(0, 0, r, 0, PI2)
      g.strokeStyle = P.ring; g.lineWidth = 1; g.stroke()
      g.fillStyle = P.ringTxt; g.font = '10px Consolas'
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'
      // V16.4-R3 critique P2-1：假距离刻度（demo 遗产世界单位）退役——环保留，数字不再说谎
    }
    g.strokeStyle = P.cross
    g.beginPath(); g.moveTo(-R - 30, 0); g.lineTo(R + 30, 0); g.moveTo(0, -R - 30); g.lineTo(0, R + 30); g.stroke()
    for (let a = 0; a < 360; a += 15) {
      const rad = a * Math.PI / 180, len = a % 45 === 0 ? 10 : 5
      g.beginPath()
      g.moveTo(Math.cos(rad) * R, Math.sin(rad) * R)
      g.lineTo(Math.cos(rad) * (R + len), Math.sin(rad) * (R + len))
      g.strokeStyle = P.tick; g.stroke()
    }
    g.fillStyle = P.bearing; g.font = '10px Consolas'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('000', 0, -R - 22); g.fillText('090', R + 22, 0)
    g.fillText('180', 0, R + 22); g.fillText('270', -R - 22, 0)
    g.restore()
    // HQ 符号
    const s1 = { x: 0, y: 0 }, s2 = { x: 0, y: 0 }
    W2S(0, 0, s1)
    const pk = (t * 0.7) % 1
    g.beginPath(); g.arc(s1.x, s1.y, 16 + 12 * pk, 0, PI2)
    g.strokeStyle = `rgba(${P.hqPulse},${0.55 * (1 - pk)})`; g.lineWidth = 1.5; g.stroke()
    g.save(); g.translate(s1.x, s1.y); g.rotate(t * 0.3)
    g.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI2, px = Math.cos(a) * 13, py = Math.sin(a) * 13
      if (i) g.lineTo(px, py); else g.moveTo(px, py)
    }
    g.closePath()
    g.fillStyle = P.hqFill; g.fill()
    g.strokeStyle = P.hq; g.lineWidth = 1.6; g.stroke()
    g.beginPath(); g.arc(0, 0, 4.5, 0, PI2); g.fillStyle = P.hqCore; g.fill()
    g.restore()
    g.fillStyle = P.hqLabel; g.font = 'bold 11px Consolas,"Microsoft YaHei"'
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.fillText('HQ', s1.x, s1.y + 32)
    hits.push({ x: s1.x, y: s1.y, r: 26, ref: { kind: 'hq' } })
    // 星球符号（V11.5f：高亮=粗环+亮名+HQ 虚线轨迹）
    planets.forEach(p => {
      W2S(p.mesh.position.x, p.mesh.position.z, s1)
      const col = p.status === '执行中' ? P.stBattle : p.status === '已占领' ? P.stHeld : P.stWait
      const rr = Math.max(7, p.radius * 0.9)
      const isHl = hl !== undefined && hl.has(p.wsPath)
      if (isHl) {
        g.setLineDash([5, 6])
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(s1.x, s1.y)
        g.strokeStyle = P.hlLine; g.lineWidth = 1.4; g.stroke()
        g.setLineDash([])
      }
      if (p.status === '执行中') {
        const k = (t * 1.4 + p.seed) % 1
        g.beginPath(); g.arc(s1.x, s1.y, rr + 4 + k * 16, 0, PI2)
        g.strokeStyle = `rgba(${P.battlePulse},${0.6 * (1 - k)})`; g.lineWidth = 1.5; g.stroke()
      }
      g.beginPath(); g.arc(s1.x, s1.y, rr, 0, PI2)
      g.fillStyle = col + '2e'; g.fill()
      g.strokeStyle = isHl ? P.hl : col; g.lineWidth = isHl ? 2.6 : 1.6; g.stroke()
      g.beginPath(); g.arc(s1.x, s1.y, 2.2, 0, PI2); g.fillStyle = col; g.fill()
      if (p.garrison > 0) {
        g.beginPath(); g.arc(s1.x, s1.y, rr + 5, -Math.PI / 2, -Math.PI / 2 + Math.min(PI2, p.garrison / 12 * PI2))
        g.strokeStyle = P.garrison; g.lineWidth = 2; g.stroke()
      }
      g.font = '10px "Microsoft YaHei",Consolas'; g.textAlign = 'center'
      const nm = p.name.split(' ·')[0]!
      if (p.failing > 0) {
        // V16.4-R2：失败星球名签红缀（与 3D 名牌同源同语义）
        const nmW = g.measureText(nm).width
        const suf = ` ·${p.failing}挫败`
        const sufW = g.measureText(suf).width
        g.textAlign = 'left'
        g.fillStyle = isHl ? P.nameHl : P.name
        g.fillText(nm, s1.x - (nmW + sufW) / 2, s1.y - rr - 6)
        g.fillStyle = '#e5484d'
        g.fillText(suf, s1.x - (nmW + sufW) / 2 + nmW, s1.y - rr - 6)
        g.textAlign = 'center'
      } else {
        g.fillStyle = isHl ? P.nameHl : P.name
        if (isHl) g.font = 'bold 12px "Microsoft YaHei",Consolas'
        g.fillText(nm, s1.x, s1.y - rr - 6)
      }
      if (p.garrison > 0) {
        // V16.4-R3 critique P2-1：零值标签是纯噪音（九星九个 0艘）——garrison=0 不渲染
        g.fillStyle = col; g.font = '9px Consolas'
        g.fillText(`达成 ${p.garrison}`, s1.x, s1.y + rr + 13)  /* V16.4-R5：LV·艘 机器黑话退役——用板面自己的词汇（达成数） */
      }
      hits.push({ x: s1.x, y: s1.y, r: Math.max(rr + 6, 12), ref: p })
    })
    // 编队符号 + 虚线航迹
    squads.forEach(s => {
      W2S(s.group.position.x, s.group.position.z, s1)
      const ph = s.phase
      const col = ph === 'battle' ? P.sqBattle : ph === 'return' ? P.sqRet : ph === 'deployed' ? P.sqDep : P.sqHold
      const endW = ph === 'return' ? { x: 0, z: 0 } : s.target.mesh.position
      if (ph === 'outbound' || ph === 'return') {
        W2S(endW.x, endW.z, s2)
        g.beginPath(); g.setLineDash([5, 7]); g.lineDashOffset = -t * 30
        g.moveTo(s1.x, s1.y); g.lineTo(s2.x, s2.y)
        g.strokeStyle = col + '66'; g.lineWidth = 1; g.stroke()
        g.setLineDash([])
      }
      let ang: number
      if (ph === 'outbound' || ph === 'return') {
        W2S(endW.x, endW.z, s2)
        ang = Math.atan2(s2.y - s1.y, s2.x - s1.x)
      } else {
        W2S(s.target.mesh.position.x, s.target.mesh.position.z, s2)
        const rel = Math.atan2(s1.y - s2.y, s1.x - s2.x)
        ang = rel + Math.PI / 2 * (s.orbitSpd >= 0 ? 1 : -1)
      }
      g.save(); g.translate(s1.x, s1.y); g.rotate(ang)
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, 4); g.lineTo(-4, -4); g.closePath()
      g.fillStyle = col; g.fill()
      g.restore()
      hits.push({ x: s1.x, y: s1.y, r: 12, ref: s })
    })
    // V11.5f（舰长令）：名册/态势/速报/顶底栏文字全部休眠——只剩盘+符号+高亮。
    const B = 26, M = 14
    ;([[S.x + M, S.y + M, 1, 1], [S.x + S.w - M, S.y + M, -1, 1], [S.x + M, S.y + S.h - M, 1, -1], [S.x + S.w - M, S.y + S.h - M, -1, -1]] as const).forEach(c => {
      g.strokeStyle = P.corner; g.lineWidth = 2
      g.beginPath(); g.moveTo(c[0] + c[2] * B, c[1]); g.lineTo(c[0], c[1]); g.lineTo(c[0], c[1] + c[3] * B); g.stroke()
    })
    // CRT 静态扫描线（动态闪线按令休眠；纸面态无扫描纹理——白纸干净）
    if (P.scan && this.scanPat) { g.fillStyle = this.scanPat; g.fillRect(0, 0, w, h) }
  }
}
