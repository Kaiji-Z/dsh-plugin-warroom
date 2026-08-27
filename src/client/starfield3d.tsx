/**
 * V11.2 可交互 3D 太空战区（元首规格 2026-08-27）：
 * ①场景中心=大型母舰 Headquarters（低多边形金属船体+脉动引擎光晕，静泊原点，
 *   全场景最大单体，是全部派兵的出发点）；②星球松散随机散布（大/中/小三级、
 *   独有色相/贴图/自发光光晕——不再规整同心环）；③作战部队=小型战机：真实
 *   派兵事件驱动从母舰起飞，缓动贝塞尔航线飞往目标星球，到岗驻泊巡护，attempt
 *   收束返航消隐——**飞行动画=真实部署的动态呈现**（挂载期对已驻单位演「到场上
 *   演回放」，非状态伪造；元首本轮亲自放行「不造假运动」红线给派兵剧场）。
 * ④深空底：闪烁星海（shader uTime）+ 星云 + 深空雾 + 辉光后期。
 *
 * 不变的三条底座：①坐标全确定性（hash01 种子，同输入恒同貌——SSE revision
 * 翻新零抖动；相机状态是用户本地 ref，不随渲染重置）；②WebGL 不可用整棵回落
 * 2D 星域；③DOM 覆盖层承载全部交互实体（aria/键盘/族系高亮/取证针脚原封），
 * canvas 只画空间与剧场。reduced-motion：不飞不闪，直接驻泊。
 * @module dsh-plugin-warroom/client/starfield3d
 */
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { hash01, moonAngleRad, planetLabel, type PlanetGarrison } from './starfield.tsx'

/* ================================================================
 * 1. 纯数学（全部导出单测钉死）
 * ================================================================ */

export interface CamState { yaw: number; pitch: number; dist: number }
export const CAM_PITCH_MIN = 0.14, CAM_PITCH_MAX = 1.45
export const CAM_DIST_MIN = 60, CAM_DIST_MAX = 900
export const CAM_FOV_DEG = 50

function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)) }

export function clampCam(c: CamState): CamState {
  const yaw = ((c.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return { yaw, pitch: clamp(c.pitch, CAM_PITCH_MIN, CAM_PITCH_MAX), dist: clamp(c.dist, CAM_DIST_MIN, CAM_DIST_MAX) }
}

/** 阻尼趋近（指数）：k 越大跟得越紧；dt 大到 1/k 量级即近似直达。 */
export function dampCam(cur: CamState, target: CamState, dt: number, k = 9): CamState {
  const t = 1 - Math.exp(-k * Math.max(dt, 0))
  return clampCam({ yaw: cur.yaw + (target.yaw - cur.yaw) * t, pitch: cur.pitch + (target.pitch - cur.pitch) * t, dist: cur.dist + (target.dist - cur.dist) * t })
}

export interface Planet3D {
  readonly wsPath: string
  /** 1 起：创建序（色相板与「大中小」分级仍按它排，但几何不再同心环）。 */
  readonly ring: number
  /** 星球半径（世界单位）：大 8.5-11 / 中 5-7 / 小 2.8-4。 */
  readonly size: number
  readonly x: number
  readonly y: number
  readonly z: number
}

/** 确定性 rand：[lo,hi) 同 key 恒同值（一切「随机」的唯一来源——红线①）。 */
const det = (k: string, lo: number, hi: number): number => lo + hash01(k) * (hi - lo)

/**
 * 松散散布布局（元首规格②「轨道松散随机，不需要规整同心圆」）：大/中/小三级
 * 按创建序分配（先大后中再小），半径带各自随机（大星偏远小星偏近、带间可交
 * 错），方位 hash，纵向随距离展宽；逐颗与已落位星球做最小间距拒绝采样（12 次
 * 尝试；同输入恒同序=恒同貌）。母舰净空 ≥40（船体全长 ~34）。
 */
export function galaxyLayout3D(wsPathsInCreationOrder: readonly string[]): Planet3D[] {
  const placed: Array<{ x: number; y: number; z: number; size: number }> = []
  const grow = wsPathsInCreationOrder.length * 1.2
  return wsPathsInCreationOrder.map((wsPath, k) => {
    const cls = k < 2 ? 'large' : k < 5 ? 'medium' : 'small'
    const size = cls === 'large' ? det(`sz:${wsPath}`, 9, 12) : cls === 'medium' ? det(`sz:${wsPath}`, 5.2, 7.2) : det(`sz:${wsPath}`, 2.6, 3.8)
    const band = cls === 'large' ? [68 + grow, 100 + grow] : cls === 'medium' ? [46 + grow, 76 + grow] : [34 + grow, 62 + grow]
    let x = 0, y = 0, z = 0
    for (let tr = 0; tr < 12; tr++) {
      const a = det(`a:${wsPath}:${tr}`, 0, Math.PI * 2)
      const r = det(`r:${wsPath}:${tr}`, band[0]!, band[1]!)
      x = r * Math.cos(a)
      z = r * Math.sin(a)
      y = det(`y:${wsPath}:${tr}`, -1, 1) * r * 0.22
      const clear = Math.hypot(x, y, z) > 40
      const spaced = placed.every(p => Math.hypot(x - p.x, y - p.y, z - p.z) > p.size + size + 12)
      if (clear && spaced) break
    }
    placed.push({ x, y, z, size })
    return { wsPath, ring: k + 1, size: +size.toFixed(2), x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) }
  })
}

/** 光点近地轨道（纯）：同会话恒同位（相位=hash、半径按星球尺寸缩放、轨道面微倾）。 */
export function moonPos3D(planet: Planet3D, sessionId: string, slotOffsetRad = 0): { x: number; y: number; z: number } {
  const a = moonAngleRad(sessionId) + slotOffsetRad
  const r = Math.max(planet.size + 3.5, 8)
  return { x: planet.x + r * Math.cos(a), y: planet.y + r * 0.38 * Math.sin(a), z: planet.z + r * 0.62 * Math.sin(a) }
}

/** 布局外沿（纯）：最远星球距——初始机位与碎石带都按它定。 */
export function layoutExtent(planets: ReadonlyArray<Planet3D>): number {
  return planets.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y, p.z)), 0)
}

/** 初始相机（纯）：纵向按全高、横向按【可用带宽】（safeWidthFrac：浮舱吃位后
 * 的中带占比）双约束取紧者；外沿 ×1.5 裕度含光点/标签随从。 */
export function initialCam(extent: number, aspect: number, safeWidthFrac = 1): CamState {
  const half = Math.tan((CAM_FOV_DEG * Math.PI) / 360)
  const fitH = (extent * 1.28) / half
  const fitW = (extent * 1.28) / (half * Math.max(aspect, 0.1) * Math.max(safeWidthFrac, 0.2))
  return clampCam({ yaw: 0.65, pitch: 0.55, dist: Math.max(fitH, fitW) })
}

/** 相机球坐标 → 世界位（相机恒看 center）。 */
export function camPosition(cam: CamState): { x: number; y: number; z: number } {
  return {
    x: cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    y: cam.dist * Math.sin(cam.pitch),
    z: cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  }
}

/* ================================================================
 * 2. three 场景（程序生成素材，零外部资源）
 * ================================================================ */

interface SceneTheme { orbit: number; ambient: number; hull: number; engine: number; shipGlow: number }
const DARK: SceneTheme = { orbit: 0x32415c, ambient: 0x334466, hull: 0x9aa8c2, engine: 0xffb35c, shipGlow: 0xff9a5c }
const LIGHT: SceneTheme = { orbit: 0xb9c3d4, ambient: 0x8a94a8, hull: 0x8f9cb5, engine: 0xe89b3f, shipGlow: 0xd97f3a }
/** 行星色板（demo hues 移植）：每星一色 + hash 微抖，同行星恒同貌。 */
const PLANET_HUES = [0.58, 0.66, 0.75, 0.55, 0.08, 0.03, 0.14, 0.47]

function radialTexture(stops: Array<[number, string]>): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [o, col] of stops) g.addColorStop(o, col)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

/** 行星球体贴图（demo planetTexture 移植+确定性化）：横带/大陆斑块/陨石坑/极冠。 */
function planetTexture(color: THREE.Color, key: string): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const ctx = c.getContext('2d')!
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  const col = (l: number, a = 1): string => `hsla(${(hsl.h * 360) | 0},${(hsl.s * 100) | 0}%,${(l * 100) | 0}%,${a})`
  ctx.fillStyle = col(hsl.l)
  ctx.fillRect(0, 0, 256, 128)
  const bands = 5 + Math.floor(det(`pb:${key}`, 0, 7))
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = col(hsl.l + det(`pbl:${key}:${i}`, -0.11, 0.11), det(`pba:${key}:${i}`, 0.18, 0.48))
    ctx.fillRect(0, det(`pby:${key}:${i}`, 0, 128), 256, 3 + det(`pbh:${key}:${i}`, 0, 16))
  }
  const blobs = 8 + Math.floor(det(`pn:${key}`, 0, 10))
  for (let i = 0; i < blobs; i++) {
    ctx.beginPath()
    ctx.ellipse(det(`pnx:${key}:${i}`, 0, 256), 10 + det(`pny:${key}:${i}`, 0, 108), det(`pnr:${key}:${i}`, 6, 32), det(`pnr2:${key}:${i}`, 4, 16), det(`pna:${key}:${i}`, 0, Math.PI), 0, Math.PI * 2)
    ctx.fillStyle = col(hsl.l + (det(`pns:${key}:${i}`, 0, 1) > 0.5 ? 0.14 : -0.14), det(`pno:${key}:${i}`, 0.12, 0.34))
    ctx.fill()
  }
  for (let i = 0; i < 40; i++) {
    ctx.beginPath()
    ctx.arc(det(`pcx:${key}:${i}`, 0, 256), det(`pcy:${key}:${i}`, 0, 128), det(`pcr:${key}:${i}`, 0.5, 2.1), 0, Math.PI * 2)
    ctx.fillStyle = col(hsl.l - 0.18, 0.35)
    ctx.fill()
  }
  const pg = ctx.createLinearGradient(0, 0, 0, 128)
  pg.addColorStop(0, 'rgba(255,255,255,.3)')
  pg.addColorStop(0.16, 'rgba(255,255,255,0)')
  pg.addColorStop(0.84, 'rgba(255,255,255,0)')
  pg.addColorStop(1, 'rgba(255,255,255,.3)')
  ctx.fillStyle = pg
  ctx.fillRect(0, 0, 256, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function isDarkTheme(): boolean {
  return document.body.dataset.dsDarkTheme !== undefined
}

interface ShipState {
  sessionId: string
  target: { x: number; y: number; z: number }
  group: THREE.Group
  phase: 'fly' | 'stationed' | 'return' | 'gone'
  t: number
  from: THREE.Vector3
  ctrl: THREE.Vector3
  to: THREE.Vector3
  duration: number
  stationAngle: number
}

/** three 场景封装：母舰 + 散布星球 + 派兵战机 + 闪烁星海 + 星云/碎石带/雾/辉光。 */
class SpaceScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly ambient = new THREE.AmbientLight(0x334466, 0.7)
  /** 主光=方向灯（默认机位侧上方）：行星朝相机面受光，纹理可读——点光在原点
   * 只会给行星逆光剪影（目检实抓：深色主题行星全黑、浅色成扁平深蓝圆片）。 */
  private readonly keyLight = new THREE.DirectionalLight(0xfff2e0, 2.4)
  private readonly rimLight = new THREE.DirectionalLight(0x88aaff, 0.5)
  private readonly engineLight = new THREE.PointLight(0xffc27a, 260, 260, 2)
  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly starMats: THREE.ShaderMaterial[] = []
  private readonly nebulaMats: THREE.SpriteMaterial[] = []
  private readonly planetMats: THREE.MeshStandardMaterial[] = []
  private readonly haloMats: THREE.SpriteMaterial[] = []
  private readonly haloPool: THREE.Sprite[] = []
  private readonly ghostPool: THREE.Sprite[] = []
  private readonly engineGlows: THREE.Sprite[] = []
  private readonly engineMats: THREE.SpriteMaterial[] = []
  private readonly hullMat: THREE.MeshStandardMaterial
  private readonly mother = new THREE.Group()
  private readonly shipGeo = new THREE.ConeGeometry(1.5, 5.2, 5)
  private readonly shipMat: THREE.MeshStandardMaterial
  private readonly shipGlowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']])
  private readonly ships = new Map<string, ShipState>()
  private belt: THREE.InstancedMesh | null = null
  private theme: SceneTheme = DARK
  private hqActive = true

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.camera = new THREE.PerspectiveCamera(CAM_FOV_DEG, width / Math.max(height, 1), 0.1, 6000)
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.0, 0.65, 0.18)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.scene.add(this.ambient)
    this.keyLight.position.set(340, 420, 260)
    this.scene.add(this.keyLight)
    this.rimLight.position.set(-300, 140, -280)
    this.scene.add(this.rimLight)
    this.engineLight.position.set(0, 0, 10)
    this.scene.add(this.engineLight)
    this.shipMat = new THREE.MeshStandardMaterial({ color: 0xd9dee8, flatShading: true, roughness: 0.5, metalness: 0.55, emissive: 0xff7a45, emissiveIntensity: 0.55 })
    this.disposables.push(this.shipGeo, this.shipMat, this.shipGlowTex)
    this.hullMat = new THREE.MeshStandardMaterial({ color: this.theme.hull, flatShading: true, roughness: 0.42, metalness: 0.62, emissive: 0x2a3a55, emissiveIntensity: 0.5 })
    this.disposables.push(this.hullMat)
    this.buildMother()
    this.mother.scale.setScalar(1.18)
    // 闪烁星海（demo 星 shader 移植+确定性相位/尺寸）：远小 1600 / 中 700 / 亮
    // 180，五色调×亮度；uTime 每帧推，逐星相位错开——深空「活着」的底噪。
    const palette: ReadonlyArray<readonly [number, number, number]> = [[1, 1, 1], [0.72, 0.82, 1], [1, 0.85, 0.65], [0.82, 0.72, 1], [0.65, 0.9, 1]]
    const mkStars = (n: number, rLo: number, rHi: number, size: number, tag: string): void => {
      const pos = new Float32Array(n * 3), colA = new Float32Array(n * 3), siz = new Float32Array(n), pha = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const u = det(`su:${tag}:${i}`, -1, 1), th = det(`st:${tag}:${i}`, 0, Math.PI * 2)
        const rr = det(`sr:${tag}:${i}`, rLo, rHi), sq = Math.sqrt(1 - u * u)
        pos[i * 3] = sq * Math.cos(th) * rr; pos[i * 3 + 1] = u * rr; pos[i * 3 + 2] = sq * Math.sin(th) * rr
        const c = palette[Math.floor(det(`sp:${tag}:${i}`, 0, palette.length)) % palette.length]!
        const b = det(`sb:${tag}:${i}`, 0.72, 1)
        colA[i * 3] = c[0] * b; colA[i * 3 + 1] = c[1] * b; colA[i * 3 + 2] = c[2] * b
        siz[i] = size * det(`ss:${tag}:${i}`, 0.7, 1.5)
        pha[i] = det(`sph:${tag}:${i}`, 0, Math.PI * 2)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aColor', new THREE.BufferAttribute(colA, 3))
      g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1))
      g.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1))
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uDim: { value: 1 }, uPR: { value: this.renderer.getPixelRatio() } },
        transparent: true, depthWrite: false,
        vertexShader: `
          attribute float aSize; attribute float aPhase; attribute vec3 aColor;
          varying vec3 vC; uniform float uTime; uniform float uPR;
          void main(){
            vC = aColor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float tw = 0.72 + 0.42 * sin(uTime * (0.5 + fract(aPhase * 0.159) * 1.7) + aPhase);
            gl_PointSize = aSize * tw * uPR * (1400.0 / max(1.0, -mv.z));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vC; uniform float uDim;
          void main(){
            vec2 uv = gl_PointCoord - 0.5;
            float a = smoothstep(0.5, 0.05, length(uv));
            gl_FragColor = vec4(vC * uDim, a);
          }`,
      })
      this.scene.add(new THREE.Points(g, m))
      this.starMats.push(m)
      this.disposables.push(g, m)
    }
    mkStars(1600, 900, 1600, 1.8, 'far')
    mkStars(700, 850, 1500, 2.7, 'mid')
    mkStars(180, 800, 1400, 4.0, 'bright')
    // 星云（demo 四片移植：深蓝/暗紫/深青/酒红——深空蓝紫主调的底色层）。
    const nebs: Array<[number, ReadonlyArray<number>, number, number]> = [
      [0x12235f, [-900, 350, -1100], 1900, 0.2],
      [0x35155e, [950, -260, -1000], 1700, 0.18],
      [0x0d3450, [-700, -420, 1000], 2100, 0.16],
      [0x46203f, [850, 460, 950], 1600, 0.15],
    ]
    const nebTex = radialTexture([[0, 'rgba(255,255,255,.9)'], [0.5, 'rgba(255,255,255,.28)'], [1, 'rgba(255,255,255,0)']])
    this.disposables.push(nebTex)
    for (const [hex, pos, scale, opacity] of nebs) {
      const mat = new THREE.SpriteMaterial({ map: nebTex, color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      const sp = new THREE.Sprite(mat)
      sp.position.set(pos[0]!, pos[1]!, pos[2]!)
      sp.scale.setScalar(scale)
      this.scene.add(sp)
      this.nebulaMats.push(mat)
      this.disposables.push(mat)
    }
  }

  /** 母舰 Headquarters（元首规格①）：低多边形金属船体——主舰身（纵轴 Z，舰首
   * -Z）+ 舰首锥 + 舰桥/桅杆 + 双舷舱 + 尾鳍；三喷口引擎光晕加法混合，脉动=
   * 战时心跳。静泊原点（规格：「固定在场景坐标原点」），不自转不巡游。 */
  private buildMother(): void {
    const hull = this.hullMat
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
      const mesh = new THREE.Mesh(geo, hull)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rx, ry, rz)
      this.mother.add(mesh)
      this.disposables.push(geo)
    }
    add(new THREE.CylinderGeometry(2.0, 3.6, 17, 6), 0, 0, 0, Math.PI / 2)            // 主舰身（+Z 艉粗 -Z 艏细）
    add(new THREE.CylinderGeometry(0.9, 2.2, 6, 6), 0, 0, -11, -Math.PI / 2)          // 舰首锥（尖端 -Z）
    add(new THREE.BoxGeometry(3.4, 2.6, 4.2), 0, 3.2, -2.5)                           // 舰桥（艏部上层）
    add(new THREE.BoxGeometry(0.7, 2.6, 3.4), 0, 5.6, -3.2)                           // 桅杆
    add(new THREE.CylinderGeometry(1.05, 1.25, 11, 5), -4.4, -0.4, 0.4, Math.PI / 2)  // 左舷舱
    add(new THREE.CylinderGeometry(1.05, 1.25, 11, 5), 4.4, -0.4, 0.4, Math.PI / 2)   // 右舷舱
    add(new THREE.BoxGeometry(0.5, 3.6, 5.2), 0, 2.2, 6.6)                            // 尾鳍
    const glowTex = radialTexture([[0, 'rgba(255,236,200,.95)'], [0.28, 'rgba(255,170,80,.5)'], [1, 'rgba(255,140,60,0)']])
    this.disposables.push(glowTex)
    for (const [ex, ey] of [[-2.2, -0.2], [2.2, -0.2], [0, -1.8]] as const) {
      const mat = new THREE.SpriteMaterial({ map: glowTex, color: this.theme.engine, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      const sp = new THREE.Sprite(mat)
      sp.position.set(ex, ey, 9.2)
      sp.scale.setScalar(2.6)
      this.mother.add(sp)
      this.engineGlows.push(sp)
      this.engineMats.push(mat)
      this.disposables.push(mat)
    }
    this.scene.add(this.mother)
  }

  /** 碎石带（demo 移植，InstancedMesh 140 块一次绘制）：外沿 0.9 倍圈，确定性，静态。 */
  private rebuildBelt(radius: number): void {
    if (this.belt !== null) { this.scene.remove(this.belt); this.belt.geometry.dispose(); (this.belt.material as THREE.Material).dispose() }
    if (radius <= 0) { this.belt = null; return }
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ color: 0x59637a, flatShading: true, roughness: 0.9, metalness: 0.25 })
    const im = new THREE.InstancedMesh(geo, mat, 120)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3()
    for (let i = 0; i < 120; i++) {
      // 大半径差 ±30 + 纵向 ±16：读作碎屑云而非「规整圆环」（元首「不要规整同心圆」）。
      const a = det(`ba:${i}`, 0, Math.PI * 2), r = radius + det(`br:${i}`, -30, 30), k = det(`bk:${i}`, 0.25, 0.95)
      m4.compose(new THREE.Vector3(Math.cos(a) * r, det(`by:${i}`, -16, 16), Math.sin(a) * r),
        q.setFromEuler(e.set(det(`be1:${i}`, 0, Math.PI * 2), det(`be2:${i}`, 0, Math.PI * 2), 0)),
        sv.set(k, k, k))
      im.setMatrixAt(i, m4)
    }
    this.scene.add(im)
    this.belt = im
    this.disposables.push(geo, mat)
  }

  setTheme(dark: boolean): void {
    this.theme = dark ? DARK : LIGHT
    this.scene.fog = dark ? new THREE.FogExp2(0x06070f, 0.00075) : null
    this.ambient.color.setHex(this.theme.ambient)
    this.ambient.intensity = dark ? 0.55 : 0.9
    this.rimLight.intensity = dark ? 0.5 : 0.35
    this.bloom.strength = dark ? 0.85 : 0.45
    this.bloom.threshold = dark ? 0.28 : 0.32
    for (const m of this.starMats) m.uniforms.uDim!.value = dark ? 1 : 0.5
    for (const m of this.nebulaMats) m.opacity = dark ? 0.17 : 0.035
    for (const m of this.haloMats) m.opacity = dark ? 0.28 : 0.07
    for (const m of this.planetMats) m.emissiveIntensity = dark ? 0.42 : 0.22
    for (const m of this.engineMats) m.color.setHex(this.theme.engine)
    for (const sid of this.ships.keys()) {
      const glow = this.ships.get(sid)!.group.children.find(c => c.type === 'Sprite') as THREE.Sprite | undefined
      if (glow !== undefined) (glow.material as THREE.SpriteMaterial).color.setHex(this.theme.shipGlow)
    }
    this.hullMat.color.setHex(this.theme.hull)
    this.setHqActive(this.hqActive)
  }

  setHqActive(active: boolean): void {
    this.hqActive = active
    this.keyLight.intensity = active ? 2.4 : 0.6
    this.engineLight.intensity = active ? 260 : 50
  }

  /** 星球重建（demo 材质栈：条纹贴图+自发光+大气光晕）；松散散布不画轨道环。 */
  syncPlanets(planets: ReadonlyArray<Planet3D>): void {
    for (const m of this.planetMats) {
      this.scene.remove((m.userData as { mesh?: THREE.Object3D }).mesh ?? null)
      const mesh = (m.userData as { mesh?: THREE.Mesh }).mesh
      if (mesh !== undefined) mesh.geometry.dispose()
      m.map?.dispose()
      m.emissiveMap?.dispose()
      m.dispose()
    }
    this.planetMats.length = 0
    this.haloMats.length = 0
    for (const h of this.haloPool) h.visible = false
    this.rebuildBelt(planets.length > 0 ? layoutExtent(planets) * 1.18 : 0)
    const sphere = new THREE.SphereGeometry(1, 28, 20)
    this.disposables.push(sphere)
    while (this.haloPool.length < planets.length) {
      const mat = new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(255,255,255,.7)'], [0.5, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false, opacity: 0.32, blending: THREE.AdditiveBlending, fog: false })
      const sp = new THREE.Sprite(mat)
      this.scene.add(sp)
      this.haloPool.push(sp)
      this.haloMats.push(mat)
      this.disposables.push(mat, mat.map!)
    }
    planets.forEach((p, i) => {
      const hue = PLANET_HUES[(p.ring - 1) % PLANET_HUES.length]! + det(`phj:${p.wsPath}`, -0.03, 0.03)
      const base = new THREE.Color().setHSL(hue, det(`ps:${p.wsPath}`, 0.5, 0.7), det(`pl:${p.wsPath}`, 0.42, 0.58))
      const tex = planetTexture(base, p.wsPath)
      const mat = new THREE.MeshStandardMaterial({
        map: tex, flatShading: true, roughness: 0.92, metalness: 0.05,
        emissive: base.clone().lerp(new THREE.Color(1, 1, 1), 0.15), emissiveMap: tex, emissiveIntensity: 0.32,
      })
      const mesh = new THREE.Mesh(sphere, mat)
      mesh.scale.setScalar(p.size)
      mesh.position.set(p.x, p.y, p.z)
      mat.userData = { mesh }
      this.scene.add(mesh)
      this.planetMats.push(mat)
      const halo = this.haloPool[i]!
      halo.visible = true
      halo.position.set(p.x, p.y, p.z)
      halo.scale.setScalar(p.size * 3.4)
      ;(halo.material as THREE.SpriteMaterial).color.copy(base.clone().lerp(new THREE.Color(1, 1, 1), 0.3))
    })
    this.setTheme(this.theme === DARK)
  }

  /** ghost（昔日阵地）：空心环 sprite，悬停族系显形——静态。 */
  syncGhosts(ghosts: ReadonlyArray<{ world: { x: number; y: number; z: number }; fail: boolean }>): void {
    while (this.ghostPool.length < ghosts.length) {
      const mat = new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(255,255,255,0)'], [0.7, 'rgba(255,255,255,.9)'], [0.82, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false, fog: false })
      const s = new THREE.Sprite(mat)
      s.scale.setScalar(12)
      this.scene.add(s)
      this.ghostPool.push(s)
      this.disposables.push(mat, mat.map!)
    }
    ghosts.forEach((g, i) => {
      const s = this.ghostPool[i]!
      s.visible = true
      s.position.set(g.world.x, g.world.y, g.world.z)
      ;(s.material as THREE.SpriteMaterial).color.setHex(g.fail ? (this.theme === DARK ? 0xff7a6a : 0xc94b3f) : (this.theme === DARK ? 0x66d4a0 : 0x2f8f66))
    })
    for (let i = ghosts.length; i < this.ghostPool.length; i++) this.ghostPool[i]!.visible = false
  }

  /** 派兵同步（元首规格③）：新 attempt → 母舰起飞；消失 → 返航；已有 → 目标
   * 随动。instantStation（reduced-motion/首帧）直接驻泊不演飞行。 */
  syncShips(troops: ReadonlyArray<{ sessionId: string; world: { x: number; y: number; z: number } }>, instantStation: boolean): void {
    const live = new Set(troops.map(t => t.sessionId))
    for (const [sid, ship] of this.ships) {
      if (!live.has(sid) && ship.phase !== 'return' && ship.phase !== 'gone') {
        ship.phase = 'return'
        ship.t = 0
        ship.from = ship.group.position.clone()
        ship.to = new THREE.Vector3(det(`rx:${sid}`, -4, 4), det(`ry:${sid}`, 1, 6), det(`rz:${sid}`, 8, 12))
        ship.ctrl = ship.from.clone().lerp(ship.to, 0.5).add(new THREE.Vector3(det(`rcx:${sid}`, -30, 30), det(`rcy:${sid}`, 6, 26), det(`rcz:${sid}`, -30, 30)))
        ship.duration = 2.2
      }
    }
    for (const t of troops) {
      const ship = this.ships.get(t.sessionId)
      if (ship === undefined) {
        const group = new THREE.Group()
        const body = new THREE.Mesh(this.shipGeo, this.shipMat)
        body.rotation.x = Math.PI / 2
        group.add(body)
        const glowMat = new THREE.SpriteMaterial({ map: this.shipGlowTex, color: this.theme.shipGlow, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
        const glow = new THREE.Sprite(glowMat)
        glow.scale.setScalar(9)
        group.add(glow)
        this.scene.add(group)
        this.disposables.push(glowMat)
        const to = new THREE.Vector3(t.world.x, t.world.y, t.world.z)
        const from = new THREE.Vector3(det(`sx:${t.sessionId}`, -6, 6), det(`sy:${t.sessionId}`, 2, 7), det(`sz:${t.sessionId}`, 9, 13))
        const st: ShipState = {
          sessionId: t.sessionId, target: { x: t.world.x, y: t.world.y, z: t.world.z },
          group, phase: 'fly', t: 0, from, ctrl: new THREE.Vector3(), to,
          duration: 3.2, stationAngle: det(`sa:${t.sessionId}`, 0, Math.PI * 2),
        }
        st.ctrl.copy(from.clone().lerp(to, 0.5).add(new THREE.Vector3(det(`cx:${t.sessionId}`, -34, 34), det(`cy:${t.sessionId}`, 8, 34), det(`cz:${t.sessionId}`, -34, 34))))
        this.ships.set(t.sessionId, st)
        if (instantStation) { st.phase = 'stationed'; st.group.position.copy(to) }
        continue
      }
      ship.target = { x: t.world.x, y: t.world.y, z: t.world.z }
      if (ship.phase === 'stationed') ship.group.position.set(t.world.x, t.world.y, t.world.z)
    }
  }

  /** 帧推进（元首规格⑧「飞行平滑移动动画」）：战机缓入缓出贝塞尔航线/驻泊巡
   * 护/返航消隐 + 引擎脉动 + 星闪 uTime。frozen（reduced-motion）全部静止。 */
  update(dt: number, time: number, frozen: boolean): void {
    for (const m of this.starMats) m.uniforms.uTime!.value = frozen ? 0 : time
    const pulse = this.hqActive ? 0.8 + Math.sin(time * 2.4) * 0.18 : 0.35
    for (const g of this.engineGlows) g.scale.setScalar(frozen ? 2.6 : 2.3 + pulse * 1.0)
    for (const mat of this.engineMats) mat.opacity = this.hqActive ? 0.4 + pulse * 0.2 : 0.18
    for (const [sid, ship] of this.ships) {
      if (ship.phase === 'fly' || ship.phase === 'return') {
        if (frozen) {
          ship.group.position.copy(ship.to)
          ship.phase = ship.phase === 'fly' ? 'stationed' : 'gone'
        } else {
          const prev = ship.group.position.clone()
          ship.t = Math.min(ship.t + dt / ship.duration, 1)
          const e = ship.t < 0.5 ? 2 * ship.t * ship.t : 1 - Math.pow(-2 * ship.t + 2, 2) / 2
          const p = ship.from.clone().lerp(ship.ctrl, e).lerp(ship.ctrl.clone().lerp(ship.to, e), e)
          ship.group.position.copy(p)
          if (p.distanceToSquared(prev) > 1e-6) ship.group.lookAt(p.clone().add(p.clone().sub(prev)))
          if (ship.t >= 1) ship.phase = ship.phase === 'fly' ? 'stationed' : 'gone'
        }
      }
      if (ship.phase === 'stationed') {
        const a = ship.stationAngle + (frozen ? 0 : time * 0.35)
        const px = ship.target.x + Math.cos(a) * 2.4
        const py = ship.target.y + Math.sin(a) * 0.9
        const pz = ship.target.z + Math.sin(a) * 2.4
        const prev = ship.group.position.clone()
        ship.group.position.set(px, py, pz)
        ship.group.lookAt(px * 2 - prev.x, py * 2 - prev.y, pz * 2 - prev.z)
      }
      if (ship.phase === 'gone') {
        this.scene.remove(ship.group)
        const glow = ship.group.children.find(c => c.type === 'Sprite') as THREE.Sprite | undefined
        glow?.material.dispose()
        this.ships.delete(sid)
      }
    }
  }

  render(cam: CamState, center?: { x: number; y: number; z: number }): void {
    const p = camPosition(cam)
    const c = center ?? { x: 0, y: 0, z: 0 }
    this.camera.position.set(c.x + p.x, c.y + p.y, c.z + p.z)
    this.camera.lookAt(c.x, c.y, c.z)
    this.composer.render()
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}

/* ================================================================
 * 3. 组件：canvas（空间+剧场）+ DOM 覆盖层（交互实体）+ 三键相机
 * ================================================================ */

export interface Troop3D {
  readonly sessionId: string
  readonly world: { x: number; y: number; z: number }
  readonly verbLabel: string | null
  readonly paused: boolean
  readonly sourceCommandId: string | null
  readonly sourceLabel: string | null
  readonly untraced?: boolean
}

export interface Ghost3D {
  readonly sessionId: string
  readonly world: { x: number; y: number; z: number }
  readonly outcome: 'failed' | 'reported' | 'succeeded'
}

export interface Starfield3DProps {
  readonly active: boolean
  readonly planets: ReadonlyArray<{ spec: Planet3D; garrison: PlanetGarrison }>
  readonly troops: ReadonlyArray<Troop3D>
  readonly ghosts: ReadonlyArray<Ghost3D>
  readonly ariaLabel: string
  readonly controlsHint: string
  readonly hqTitleLit: string
  readonly hqTitleDark: string
  readonly orbIdleLabel: string
  readonly mapLegend?: string
  readonly untracedLabel?: string
  readonly onOpenCommand?: (commandId: string) => void
  readonly onOrbHover?: (sourceCommandId: string | null) => void
  readonly onPlanetOpen?: (wsPath: string) => void
  /** WebGL 不可用/初始化失败：父级回落 2D 星域。 */
  readonly onUnavailable: () => void
  /** 全幅星域中带安全宽度占比（浮舱吃位后的可用横向；初始机位按它收缩）。 */
  readonly safeWidthFrac?: number
}

export function Starfield3D(props: Starfield3DProps): ReactNode {
  const { active, planets, troops, ghosts, ariaLabel, controlsHint, hqTitleLit, hqTitleDark, orbIdleLabel, mapLegend, untracedLabel, onOpenCommand, onOrbHover, onPlanetOpen, onUnavailable, safeWidthFrac = 1 } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SpaceScene | null>(null)
  const camRef = useRef<{ cur: CamState; target: CamState; center: { x: number; y: number; z: number } }>({ cur: initialCam(120, 1.8), target: initialCam(120, 1.8), center: { x: 0, y: 0, z: 0 } })
  // 缩放基准距：必须与相机初始/复位同源——挂载瞬时尺寸不可信（曾把基准算到
  // 219 而相机 120，s 恒钉 1.6 上限、滚轮缩放不可见的真坑）。数据落地时按真
  // 实 aspect 一次定标，复位/键盘缩放全走它。
  const baseDistRef = useRef<number | null>(null)
  const planetCountRef = useRef(planets.length)
  const extentRef = useRef(120)
  const safeFracRef = useRef(safeWidthFrac)
  const entriesRef = useRef<Array<{ el: HTMLElement; x: number; y: number; z: number }>>([])
  const [failed, setFailed] = useState(false)

  // 相机交互的目标值藏在 ref 里——SSE 翻新重渲染绝不重置视角（红线①）。
  useEffect(() => {
    const canvas = canvasRef.current
    const root = rootRef.current
    if (canvas === null || root === null) return
    let scene: SpaceScene
    try {
      scene = new SpaceScene(canvas, root.clientWidth, root.clientHeight)
    } catch {
      setFailed(true)
      onUnavailable()
      return
    }
    sceneRef.current = scene
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = performance.now()
    const t0 = last
    const tmp = new THREE.Vector3()
    const baseDistOf = (): number => baseDistRef.current ?? initialCam(extentRef.current, 1.8).dist
    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const cam = camRef.current
      cam.cur = reduce.matches ? clampCam(cam.target) : dampCam(cam.cur, cam.target, dt)
      scene.update(dt, (now - t0) / 1000, reduce.matches)
      scene.render(cam.cur, camRef.current.center)
      const w = root.clientWidth, h = root.clientHeight
      scene.camera.updateMatrixWorld()
      for (const e of entriesRef.current) {
        const el = e.el
        tmp.set(e.x, e.y, e.z).applyMatrix4(scene.camera.matrixWorldInverse)
        const depth = -tmp.z
        if (depth <= 0.5) { el.style.visibility = 'hidden'; continue }
        tmp.applyMatrix4(scene.camera.projectionMatrix)
        if (tmp.z > 1 || tmp.z < -1) { el.style.visibility = 'hidden'; continue }
        el.style.visibility = ''
        const px = (tmp.x * 0.5 + 0.5) * w
        const py = (-tmp.y * 0.5 + 0.5) * h
        const s = Math.min(1.6, Math.max(0.5, baseDistOf() / depth))
        el.style.transform = `translate(-50%,-50%) translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(${s.toFixed(3)})`
        el.style.zIndex = String(Math.round(baseDistOf() / depth * 1000))
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // 尺寸随动 + 首次真实尺寸定标（挂载瞬时尺寸不可信：数据 effect 曾在布局
    // 未稳时按 aspect≈0 定标，dist 被夹到上限、滚轮「失灵」的真坑）。
    const seedBase = (): void => {
      if (baseDistRef.current !== null || planetCountRef.current === 0) return
      if (root.clientWidth <= 0 || root.clientHeight <= 0) return
      baseDistRef.current = initialCam(extentRef.current, root.clientWidth / root.clientHeight, safeFracRef.current).dist
      camRef.current.target = clampCam({ ...camRef.current.target, dist: baseDistRef.current })
    }
    const ro = new ResizeObserver(() => { scene.resize(root.clientWidth, root.clientHeight); seedBase() })
    ro.observe(root)
    seedBase()
    // 主题跟随宿主明暗（attr 突变即换肤）。
    scene.setTheme(isDarkTheme())
    scene.setHqActive(active)
    const mo = new MutationObserver(() => { scene.setTheme(isDarkTheme()) })
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    // 三键相机（元首定）：左键拖拽=平移（即时跟手——位移不做阻尼，手感是
    // 「推着星系走」）；中键拖拽=旋转（阻尼）；滚轮=缩放。左键从交互实体起步
    // 仍是点击；平移量并入 center（相机位=center+球坐标偏移），双击/R 归零。
    let mode: 'pan' | 'rotate' | null = null
    let lx = 0, ly = 0
    const PAN_LIMIT = 300
    const onDown = (e: PointerEvent): void => {
      if (e.button === 1) { mode = 'rotate' }
      else if (e.button === 0) {
        if ((e.target as HTMLElement).closest('button') !== null) return
        mode = 'pan'
      } else return
      lx = e.clientX; ly = e.clientY
      root.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent): void => {
      if (mode === null) return
      const dx = e.clientX - lx, dy = e.clientY - ly
      lx = e.clientX; ly = e.clientY
      if (mode === 'rotate') {
        camRef.current.target = clampCam({ ...camRef.current.target, yaw: camRef.current.target.yaw + dx * 0.006, pitch: camRef.current.target.pitch + dy * 0.0045 })
        return
      }
      // 平移：像素 → 世界（按中心距换算），沿相机右/上轴推动 center。
      const cam = camRef.current
      const distToCenter = Math.max(cam.cur.dist, 1)
      const worldPerPx = (2 * Math.tan((CAM_FOV_DEG * Math.PI) / 360) * distToCenter) / Math.max(root.clientHeight, 1)
      const rightX = Math.cos(cam.cur.yaw), rightZ = -Math.sin(cam.cur.yaw)
      cam.center = {
        x: cam.center.x - dx * rightX * worldPerPx,
        y: cam.center.y + dy * Math.cos(cam.cur.pitch) * worldPerPx,
        z: cam.center.z - dx * rightZ * worldPerPx,
      }
      const m = Math.hypot(cam.center.x, cam.center.y, cam.center.z)
      if (m > PAN_LIMIT) { const k = PAN_LIMIT / m; cam.center = { x: cam.center.x * k, y: cam.center.y * k, z: cam.center.z * k } }
    }
    const onUp = (e: PointerEvent): void => { mode = null; try { root.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ } }
    // 中键 mousedown 默认（浏览器自动滚动圈）必须拦——pointerdown 的 preventDefault 拦不住它。
    const onMouseDown = (e: MouseEvent): void => { if (e.button === 1) e.preventDefault() }
    const onWheel = (e: WheelEvent): void => {
      camRef.current.target = clampCam({ ...camRef.current.target, dist: camRef.current.target.dist * Math.exp(e.deltaY * 0.0012) })
    }
    const onDbl = (): void => { camRef.current.target = clampCam({ yaw: 0.65, pitch: 0.55, dist: baseDistOf() }); camRef.current.center = { x: 0, y: 0, z: 0 } }
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('mousedown', onMouseDown)
    root.addEventListener('wheel', onWheel, { passive: true })
    root.addEventListener('dblclick', onDbl)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect(); mo.disconnect()
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('mousedown', onMouseDown)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('dblclick', onDbl)
      scene.dispose()
      sceneRef.current = null
    }
    // onUnavailable 属于失败回调闭包，不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 数据面：three 实体同步 + 覆盖层元素登记（key→world 坐标，rAF 每帧投影）。
  useEffect(() => {
    planetCountRef.current = planets.length
    extentRef.current = Math.max(layoutExtent(planets.map(p => p.spec)), 60)
    safeFracRef.current = safeWidthFrac
    if (baseDistRef.current === null && planets.length > 0) {
      const root = rootRef.current
      if (root !== null && root.clientWidth > 0 && root.clientHeight > 0) {
        baseDistRef.current = initialCam(extentRef.current, root.clientWidth / root.clientHeight, safeWidthFrac).dist
        camRef.current.target = clampCam({ ...camRef.current.target, dist: baseDistRef.current })
      }
    }
    const scene = sceneRef.current
    if (scene !== null) {
      scene.syncPlanets(planets.map(p => p.spec))
      scene.syncGhosts(ghosts.map(g => ({ world: g.world, fail: g.outcome === 'failed' })))
      scene.syncShips(troops, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      scene.setHqActive(active)
    }
    const overlay = overlayRef.current
    if (overlay !== null) {
      // 登记不走 CSS 选择器：Windows 反斜杠路径（盘符反斜杠形式）在 CSS
      // 属性选择器里是转义符——querySelector 永不命中（shoot 板实抓）。JS 侧建
      // key 映射，任意路径形状免疫。
      const byKey = new Map<string, HTMLElement>()
      for (const el of overlay.querySelectorAll<HTMLElement>('[data-w3]')) byKey.set(el.getAttribute('data-w3') ?? '', el)
      const entries: Array<{ el: HTMLElement; x: number; y: number; z: number }> = []
      const push = (key: string, w: { x: number; y: number; z: number }): void => {
        const el = byKey.get(key)
        if (el !== undefined) entries.push({ el, x: w.x, y: w.y, z: w.z })
      }
      push('hq', { x: 0, y: 0, z: 0 })
      for (const p of planets) push(`p:${p.spec.wsPath}`, p.spec)
      for (const t of troops) push(`o:${t.sessionId}`, t.world)
      for (const g of ghosts) push(`g:${g.sessionId}`, g.world)
      entriesRef.current = entries
    }
  }, [planets, troops, ghosts, active, safeWidthFrac])

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const t = camRef.current.target
    if (e.key === 'ArrowLeft') camRef.current.target = clampCam({ ...t, yaw: t.yaw - 0.15 })
    else if (e.key === 'ArrowRight') camRef.current.target = clampCam({ ...t, yaw: t.yaw + 0.15 })
    else if (e.key === 'ArrowUp') camRef.current.target = clampCam({ ...t, pitch: t.pitch + 0.1 })
    else if (e.key === 'ArrowDown') camRef.current.target = clampCam({ ...t, pitch: t.pitch - 0.1 })
    else if (e.key === '+' || e.key === '=') camRef.current.target = clampCam({ ...t, dist: t.dist * 0.86 })
    else if (e.key === '-') camRef.current.target = clampCam({ ...t, dist: t.dist * 1.16 })
    else if (e.key === 'r' || e.key === 'R' || e.key === 'Home') { camRef.current.target = clampCam({ yaw: 0.65, pitch: 0.55, dist: baseDistRef.current ?? t.dist }); camRef.current.center = { x: 0, y: 0, z: 0 } }
    else return
    e.preventDefault()
  }

  if (failed) return null
  return createElement('div', {
    ref: rootRef,
    className: 'war-starfield war-starfield3d',
    'data-war-view': 'map', 'data-war-3d': '1',
    role: 'group', 'aria-label': `${ariaLabel}——${controlsHint}`,
    title: controlsHint,
    tabIndex: 0,
    onKeyDown: onKey,
  },
    createElement('canvas', { ref: canvasRef, className: 'war-s3d-canvas', 'aria-hidden': 'true' }),
    createElement('div', { ref: overlayRef, className: 'war-s3d-overlay' },
      createElement('div', {
        className: `war-hq${active ? ' lit' : ''}`, 'data-active': String(active),
        'data-w3': 'hq', title: active ? hqTitleLit : hqTitleDark, role: 'img',
        'aria-label': active ? hqTitleLit : hqTitleDark,
      }),
      ...planets.map(({ spec, garrison }) =>
        createElement('button', {
          key: spec.wsPath, type: 'button',
          className: `war-planet${garrison.orbs.length > 0 ? ' busy' : ''}`,
          'data-ws-index': String(spec.ring), 'data-triumphs': String(garrison.triumphs),
          'data-w3': `p:${spec.wsPath}`,
          title: `${planetLabel(spec.wsPath)} · 活跃 ${garrison.orbs.length} · 待发 ${garrison.awaiting} · 凯旋 ${garrison.triumphs} · 败 ${garrison.failing}`,
          'aria-label': `战区 ${planetLabel(spec.wsPath)}：活跃 ${garrison.orbs.length}、待发 ${garrison.awaiting}、凯旋 ${garrison.triumphs}、败 ${garrison.failing}——跳最近的源命令`,
          onClick: () => { onPlanetOpen?.(spec.wsPath) },
          onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlanetOpen?.(spec.wsPath) } },
        },
        createElement('span', { className: 'war-planet-ball', 'aria-hidden': 'true' }),
        createElement('span', { className: 'war-planet-label' }, `${planetLabel(spec.wsPath)}${garrison.triumphs > 0 ? ` ✓${garrison.triumphs}` : ''}`),
        garrison.orbs.length + garrison.awaiting + garrison.failing > 0
          ? createElement('span', { className: `war-planet-stats${garrison.awaiting > 0 ? ' wait' : ''}${garrison.failing > 0 ? ' fail' : ''}` },
              `${garrison.orbs.length > 0 ? `活跃${garrison.orbs.length}` : ''}${garrison.awaiting > 0 ? ` 待发${garrison.awaiting}` : ''}${garrison.failing > 0 ? ` 败${garrison.failing}` : ''}`.trim())
          : null,
        )),
      ...troops.map(t =>
        createElement('button', {
          key: t.sessionId, type: 'button',
          className: `war-orb${t.paused ? ' wait' : ''}${t.sourceCommandId !== null ? ' clickable' : ''}`,
          'data-session': t.sessionId, 'data-w3': `o:${t.sessionId}`,
          title: t.verbLabel !== null && t.verbLabel !== '' ? t.verbLabel : undefined,
          'aria-label': `${t.verbLabel ?? orbIdleLabel} · ${t.sourceLabel ?? t.sessionId.slice(0, 8)}`,
          onMouseEnter: () => { onOrbHover?.(t.sourceCommandId) },
          onMouseLeave: () => { onOrbHover?.(null) },
          onFocus: () => { onOrbHover?.(t.sourceCommandId) },
          onBlur: () => { onOrbHover?.(null) },
          onClick: () => { if (t.sourceCommandId !== null) onOpenCommand?.(t.sourceCommandId) },
        },
        createElement('span', { className: 'war-orb-body', 'aria-hidden': 'true' }),
        t.verbLabel !== null && t.verbLabel !== '' ? createElement('span', { className: 'war-orb-verb' }, t.verbLabel) : null,
        )),
      ...ghosts.map(g =>
        createElement('div', {
          key: `ghost-${g.sessionId}`,
          className: `war-orb-ghost${g.outcome === 'failed' ? ' fail' : ''}`,
          'data-ghost': g.outcome, 'data-w3': `g:${g.sessionId}`, 'aria-hidden': 'true',
        }),
      ),
    ),
    createElement('div', { className: 'war-live-stack' },
      troops.length > 0
        ? createElement('div', { className: 'war-live-bar', role: 'status', 'aria-live': 'polite', 'data-war-live': String(troops.length) },
            ...troops.slice(0, 3).map(t =>
              createElement('span', { key: `lb-${t.sessionId}`, className: 'war-live-item' },
                createElement('span', { className: 'war-live-verb' }, t.verbLabel ?? orbIdleLabel),
                createElement('span', { className: 'war-live-cmd' }, t.sourceLabel ?? untracedLabel ?? t.sessionId.slice(0, 8)))),
            ...(troops.length > 3 ? [createElement('span', { key: 'lb-more', className: 'war-live-item' }, `+${troops.length - 3}`)] : []))
        : null,
      mapLegend !== undefined
        ? createElement('div', { className: 'war-map-legend', 'aria-hidden': 'true' },
            createElement('span', { className: 'war-legend-dot dot-run' }),
            createElement('span', { className: 'war-legend-dot dot-wait' }),
            createElement('span', { className: 'war-legend-dot dot-done' }),
            createElement('span', { className: 'war-legend-dot dot-fail' }),
            createElement('span', { className: 'war-map-legend-text' }, mapLegend))
        : null),
  )
}
