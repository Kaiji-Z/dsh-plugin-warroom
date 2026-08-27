/**
 * V11 3D 星域战场（元首定案 P2）：真 WebGL 场景（three.js 打进 bundle，禁 CDN）
 * + DOM 覆盖层承载全部交互实体——行星按钮/光点/ghost/速报条仍是 DOM（aria/
 * 键盘/族系高亮/取证针脚原封不动），canvas 只画「空间」：星粒、行星球体、轨道
 * 环、卫星光点、HQ 恒星。相机是手写轨道机（拖拽旋转/滚轮缩放/双击与 R 复位，
 * 阻尼趋近；reduced-motion 直达）。
 *
 * 三条铁律（V10 星域红线沿用）：
 * ①坐标全确定性（hash01/创建序）——SSE revision 翻新零抖动，相机状态是用户
 *   本地量（React state 外的 ref），不随渲染重置；
 * ②不造假运动——星球/光点不自转不巡游，唯一会动的是用户手里的相机；
 * ③WebGL 不可用即整棵回落 2D 星域（StarfieldMap），功能不缺角。
 * @module dsh-plugin-warroom/client/starfield3d
 */
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { hash01, moonAngleRad, planetAngleDeg, planetLabel, type PlanetGarrison } from './starfield.tsx'

/* ================================================================
 * 1. 纯数学（全部导出单测钉死）
 * ================================================================ */

export interface CamState { yaw: number; pitch: number; dist: number }
export const CAM_PITCH_MIN = 0.14, CAM_PITCH_MAX = 1.45
export const CAM_DIST_MIN = 60, CAM_DIST_MAX = 800
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

/** 第 k 圈（1 起）轨道半径（世界单位）。 */
export function ringRadius3D(ring: number): number { return 20 + (ring - 1) * 8 }

export interface Planet3D {
  readonly wsPath: string
  /** 1 起：内环最老（与 2D galaxyLayout 同语义）。 */
  readonly ring: number
  readonly x: number
  readonly y: number
  readonly z: number
}

/** 恒星系 3D 布局（纯）：黄金角方位 + 环序半径 + hash 纵向起伏（±6 世界单位，
 * 给俯视一点纵深但不至于掩映）。同输入恒同输出。 */
export function galaxyLayout3D(wsPathsInCreationOrder: readonly string[]): Planet3D[] {
  return wsPathsInCreationOrder.map((wsPath, k) => {
    const ring = k + 1
    const R = ringRadius3D(ring)
    const ang = (planetAngleDeg(k) * Math.PI) / 180
    const y = (hash01(`y:${wsPath}`) - 0.5) * 12
    return { wsPath, ring, x: +(R * Math.cos(ang)).toFixed(3), y: +y.toFixed(3), z: +(R * Math.sin(ang)).toFixed(3) }
  })
}

/** 光点近地轨道（纯）：同会话恒同位（相位=hash、半径 8、轨道面微倾给纵深）。 */
export function moonPos3D(planet: Planet3D, sessionId: string, slotOffsetRad = 0): { x: number; y: number; z: number } {
  const a = moonAngleRad(sessionId) + slotOffsetRad
  return { x: planet.x + 8 * Math.cos(a), y: planet.y + 3 * Math.sin(a), z: planet.z + 5.6 * Math.sin(a) }
}

/** 初始相机（纯）：纵向按全高、横向按【可用带宽】（safeWidthFrac：全幅星域
 * 左右被任务/战报浮舱吃掉后的中带占比，调用方按实测舱位推；缺省 1=全宽）双
 * 约束取紧者。窄板（1280）环系随带宽收缩退远——与 2D 禁区收缩同语义（多视
 * 口零遮挡 probe 实抓后定案）。俯角 0.55rad 略带纵深，yaw 0.65 打破正对称。 */
export function initialCam(planetCount: number, aspect: number, safeWidthFrac = 1): CamState {
  const Rout = ringRadius3D(Math.max(planetCount, 1))
  const half = Math.tan((CAM_FOV_DEG * Math.PI) / 360)
  const fitH = (Rout * 1.55) / half
  const fitW = (Rout * 1.55) / (half * Math.max(aspect, 0.1) * Math.max(safeWidthFrac, 0.2))
  return clampCam({ yaw: 0.65, pitch: 0.55, dist: Math.max(fitH, fitW) })
}

/** 相机球坐标 → 世界位（相机恒看原点 HQ）。 */
export function camPosition(cam: CamState): { x: number; y: number; z: number } {
  return {
    x: cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    y: cam.dist * Math.sin(cam.pitch),
    z: cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  }
}

/* ================================================================
 * 2. three 场景（过程式贴图，零外部资源）
 * ================================================================ */

interface SceneTheme { star: number; orbit: number; planet: number; hqOn: number; hqOff: number }
const DARK: SceneTheme = { star: 0xcfe3ff, orbit: 0x32415c, planet: 0x8496b4, hqOn: 0xffd27a, hqOff: 0x8b93a5 }
const LIGHT: SceneTheme = { star: 0x6b7280, orbit: 0xb9c3d4, planet: 0x9aa7bc, hqOn: 0xf0b64f, hqOff: 0x9aa3b2 }

function radialTexture(stops: Array<[number, string]>): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  for (const [o, col] of stops) g.addColorStop(o, col)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function ringTexture(color: string): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(32, 32, 24, 0, Math.PI * 2); ctx.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

export function isDarkTheme(): boolean {
  return document.body.dataset.dsDarkTheme !== undefined
}

/** three 场景封装：建/换主题/同步实体/渲染，dispose 全收。 */
class SpaceScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.85)
  private readonly dir = new THREE.DirectionalLight(0xffffff, 0.9)
  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly starMat: THREE.PointsMaterial
  private readonly hqSprite: THREE.Sprite
  private readonly hqMat: THREE.SpriteMaterial
  private readonly orbitMats: THREE.LineBasicMaterial[] = []
  private readonly planetMats: THREE.MeshLambertMaterial[] = []
  private readonly moonPool: THREE.Sprite[] = []
  private readonly ghostPool: THREE.Sprite[] = []
  private theme: SceneTheme = DARK

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.camera = new THREE.PerspectiveCamera(CAM_FOV_DEG, width / Math.max(height, 1), 0.1, 6000)
    this.scene.add(this.ambient)
    this.dir.position.set(80, 160, 100)
    this.scene.add(this.dir)
    // 星粒：球壳两层、确定性种子（i→hash01），不闪不飘。
    const N = 900
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 900 + hash01(`sr:${i}`) * 700
      const t = hash01(`st:${i}`) * Math.PI * 2
      const u = hash01(`su:${i}`) * 2 - 1
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = r * s * Math.cos(t); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(t)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.85 })
    this.scene.add(new THREE.Points(starGeo, this.starMat))
    this.disposables.push(starGeo, this.starMat)
    // HQ 恒星：暖阳 glow（战时开关化身——不亮=灰暗熄星）。
    this.hqMat = new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false })
    this.hqSprite = new THREE.Sprite(this.hqMat)
    this.hqSprite.scale.setScalar(34)
    this.scene.add(this.hqSprite)
    this.disposables.push(this.hqMat, this.hqMat.map!)
  }

  setTheme(dark: boolean): void {
    this.theme = dark ? DARK : LIGHT
    this.starMat.color.setHex(this.theme.star)
    this.starMat.opacity = dark ? 0.85 : 0.5
    this.hqMat.color.setHex(this.theme.hqOn)
    for (const m of this.orbitMats) m.color.setHex(this.theme.orbit)
    for (const m of this.planetMats) m.color.setHex(this.theme.planet)
  }

  setHqActive(active: boolean): void {
    this.hqMat.color.setHex(active ? this.theme.hqOn : this.theme.hqOff)
    this.hqSprite.scale.setScalar(active ? 34 : 22)
  }

  /** 轨道环 + 行星球体按布局重建（数量少，整建整拆最省心）。 */
  syncPlanets(planets: ReadonlyArray<Planet3D>): void {
    for (const m of this.orbitMats) { this.scene.remove(m.userData.line as THREE.Object3D); m.userData.line?.geometry.dispose(); m.dispose() }
    this.orbitMats.length = 0
    for (const m of this.planetMats) { this.scene.remove(m.userData.mesh as THREE.Object3D); (m.userData.mesh as THREE.Mesh).geometry.dispose(); m.dispose() }
    this.planetMats.length = 0
    const maxRing = planets.reduce((m, p) => Math.max(m, p.ring), 0)
    for (let r = 1; r <= maxRing; r++) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2
        pts.push(new THREE.Vector3(ringRadius3D(r) * Math.cos(a), 0, ringRadius3D(r) * Math.sin(a)))
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 })
      const line = new THREE.LineLoop(geo, mat)
      mat.userData = { line }
      this.scene.add(line)
      this.orbitMats.push(mat)
      this.disposables.push(geo, mat)
    }
    const sphere = new THREE.SphereGeometry(5, 24, 16)
    this.disposables.push(sphere)
    for (const p of planets) {
      const mat = new THREE.MeshLambertMaterial({})
      const mesh = new THREE.Mesh(sphere, mat)
      mesh.position.set(p.x, p.y, p.z)
      mat.userData = { mesh }
      this.scene.add(mesh)
      this.planetMats.push(mat)
      this.disposables.push(mat)
    }
    this.setTheme(this.theme === DARK)
  }

  /** 光点/ghost：对象池按需增补，位置一次落定（不动——会动的只有相机）。 */
  syncMoons(moons: ReadonlyArray<{ world: { x: number; y: number; z: number }; kind: 'run' | 'wait' }>, ghosts: ReadonlyArray<{ world: { x: number; y: number; z: number }; fail: boolean }>): void {
    while (this.moonPool.length < moons.length) {
      const mat = new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false })
      const s = new THREE.Sprite(mat)
      s.scale.setScalar(9)
      this.scene.add(s)
      this.moonPool.push(s)
      this.disposables.push(mat, mat.map!)
    }
    moons.forEach((m, i) => {
      const s = this.moonPool[i]!
      s.visible = true
      s.position.set(m.world.x, m.world.y, m.world.z)
      ;(s.material as THREE.SpriteMaterial).color.setHex(m.kind === 'wait' ? (this.theme === DARK ? 0xffc24d : 0xc98a26) : (this.theme === DARK ? 0x6fe3ff : 0x2f7fd4))
    })
    for (let i = moons.length; i < this.moonPool.length; i++) this.moonPool[i]!.visible = false
    while (this.ghostPool.length < ghosts.length) {
      const fail = false
      const mat = new THREE.SpriteMaterial({ map: ringTexture('#ffffff'), transparent: true, depthWrite: false })
      const s = new THREE.Sprite(mat)
      s.scale.setScalar(9)
      this.scene.add(s)
      this.ghostPool.push(s)
      this.disposables.push(mat, mat.map!)
      void fail
    }
    ghosts.forEach((g, i) => {
      const s = this.ghostPool[i]!
      s.visible = true
      s.position.set(g.world.x, g.world.y, g.world.z)
      ;(s.material as THREE.SpriteMaterial).color.setHex(g.fail ? (this.theme === DARK ? 0xff7a6a : 0xc94b3f) : (this.theme === DARK ? 0x66d4a0 : 0x2f8f66))
    })
    for (let i = ghosts.length; i < this.ghostPool.length; i++) this.ghostPool[i]!.visible = false
  }

  render(cam: CamState): void {
    const p = camPosition(cam)
    this.camera.position.set(p.x, p.y, p.z)
    this.camera.lookAt(0, 0, 0)
    this.renderer.render(this.scene, this.camera)
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
  }
}

/* ================================================================
 * 3. 组件：canvas（空间）+ DOM 覆盖层（交互实体）+ 轨道相机
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
  const camRef = useRef<{ cur: CamState; target: CamState }>({ cur: initialCam(planets.length, 1.8), target: initialCam(planets.length, 1.8) })
  // 缩放基准距：必须与相机初始/复位同源——挂载瞬时尺寸不可信（曾把基准算到
  // 219 而相机 120，s 恒钉 1.6 上限、滚轮缩放不可见的真坑）。数据落地时按真
  // 实 aspect 一次定标，复位/键盘缩放全走它。
  const baseDistRef = useRef<number | null>(null)
  const aspectRef = useRef<number | null>(null)
  const planetCountRef = useRef(planets.length)
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
    const tmp = new THREE.Vector3()
    // 缩放基准距：元素尺寸 ∝ 1/视深——基准取本布局初始机位，默认视角下环面
    // 元素≈原尺寸，后拉全圈同比缩小、推进同比放大（NDC z 不可用：透视归一后
    // 几乎不随距离变，首版缩放失灵的根因）。
    // 基准距由数据 effect 定标（首帧前 planets 可能空/尺寸未稳）。
    const baseDistOf = (): number => baseDistRef.current ?? initialCam(planets.length, 1.8).dist
    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const cam = camRef.current
      cam.cur = reduce.matches ? clampCam(cam.target) : dampCam(cam.cur, cam.target, dt)
      scene.render(cam.cur)
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
    // 未稳时按 aspect≈0 定标，dist 被夹到 420 上限、滚轮「失灵」的真坑）。
    const seedBase = (): void => {
      if (baseDistRef.current !== null || planetCountRef.current === 0) return
      if (root.clientWidth <= 0 || root.clientHeight <= 0) return
      baseDistRef.current = initialCam(planetCountRef.current, root.clientWidth / root.clientHeight, safeFracRef.current).dist
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
    // 拖拽旋转（从交互实体起步的拖拽不属于相机——那是点击）。
    let dragging = false
    let lx = 0, ly = 0
    const onDown = (e: PointerEvent): void => {
      if ((e.target as HTMLElement).closest('button') !== null) return
      dragging = true; lx = e.clientX; ly = e.clientY
      root.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return
      camRef.current.target = clampCam({ ...camRef.current.target, yaw: camRef.current.target.yaw + (e.clientX - lx) * 0.006, pitch: camRef.current.target.pitch + (e.clientY - ly) * 0.0045 })
      lx = e.clientX; ly = e.clientY
    }
    const onUp = (e: PointerEvent): void => { dragging = false; try { root.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ } }
    const onWheel = (e: WheelEvent): void => {
      camRef.current.target = clampCam({ ...camRef.current.target, dist: camRef.current.target.dist * Math.exp(e.deltaY * 0.0012) })
    }
    const onDbl = (): void => { camRef.current.target = clampCam({ yaw: 0.65, pitch: 0.55, dist: baseDistOf() }) }
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('wheel', onWheel, { passive: true })
    root.addEventListener('dblclick', onDbl)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect(); mo.disconnect()
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
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
    safeFracRef.current = safeWidthFrac
    {
      const root = rootRef.current
      if (baseDistRef.current === null && planets.length > 0 && root !== null && root.clientWidth > 0 && root.clientHeight > 0) {
        baseDistRef.current = initialCam(planets.length, root.clientWidth / root.clientHeight, safeWidthFrac).dist
        camRef.current.target = clampCam({ ...camRef.current.target, dist: baseDistRef.current })
      }
    }
    const scene = sceneRef.current
    if (scene !== null) {
      scene.syncPlanets(planets.map(p => p.spec))
      scene.syncMoons(troops.map(t => ({ world: t.world, kind: t.paused ? 'wait' : 'run' })), ghosts.map(g => ({ world: g.world, fail: g.outcome === 'failed' })))
      scene.setHqActive(active)
    }
    const overlay = overlayRef.current
    if (overlay !== null) {
      // 登记不走 CSS 选择器：Windows 反斜杠路径（盘符反斜杠形式）在 CSS
      // 属性选择器里是转义符——querySelector 永不命中（shoot 板实抓）。JS 侧建
      // key 映射，任意路径形状免疫。
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
  }, [planets, troops, ghosts, active])

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const t = camRef.current.target
    const root = rootRef.current
    if (e.key === 'ArrowLeft') camRef.current.target = clampCam({ ...t, yaw: t.yaw - 0.15 })
    else if (e.key === 'ArrowRight') camRef.current.target = clampCam({ ...t, yaw: t.yaw + 0.15 })
    else if (e.key === 'ArrowUp') camRef.current.target = clampCam({ ...t, pitch: t.pitch + 0.1 })
    else if (e.key === 'ArrowDown') camRef.current.target = clampCam({ ...t, pitch: t.pitch - 0.1 })
    else if (e.key === '+' || e.key === '=') camRef.current.target = clampCam({ ...t, dist: t.dist * 0.86 })
    else if (e.key === '-') camRef.current.target = clampCam({ ...t, dist: t.dist * 1.16 })
    else if (e.key === 'r' || e.key === 'R' || e.key === 'Home') camRef.current.target = clampCam({ ...camRef.current.target, yaw: 0.65, pitch: 0.55, dist: baseDistRef.current ?? t.dist })
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
