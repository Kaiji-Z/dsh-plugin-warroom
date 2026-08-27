/**
 * V11.4 战区引擎：space-warzone.html 全要素 1:1 移植（元首令「完全一比一」）。
 * 世界是 demo 自己的——16 星球战争模拟（待进攻→作战中→已占领→失守反转，永不
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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { hash01 } from './starfield.tsx'

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
export type WzStatus = '待进攻' | '作战中' | '已占领'

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
    const radius = cls === 'large' ? det(`r:${k}`, 9, 13) : cls === 'medium' ? det(`r:${k}`, 4.5, 6.5) : det(`r:${k}`, 1.8, 3)
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
 * 场景实体与引擎
 * ================================================================ */

export interface WzPlanet {
  kind: 'planet'
  id: number
  name: string
  cls: WzClass
  level: number
  radius: number
  mesh: THREE.Mesh
  halo: THREE.Sprite
  proxy: THREE.Mesh
  baseGlow: THREE.Color
  haloScale: number
  orbit: WzPlanetSpec['orbit']
  status: WzStatus
  garrison: number
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
  code: string
  cname: string
  group: THREE.Group
  proxy: THREE.Mesh
  glowMat: THREE.SpriteMaterial
  ships: number
  target: WzPlanet
  phase: 'outbound' | 'battle' | 'deployed' | 'return'
  t: number
  start: THREE.Vector3
  ctrl: THREE.Vector3
  dur: number
  seed: number
  orbitA: number
  orbitSpd: number
  battleT: number
}

export interface WzLogEntry { t: number; color: string; text: string }

const CFG = { planetCount: 16, squadCap: 9, squadSpeed: 26, spawnGapLo: 4.5, spawnGapHi: 8 }

function radialTex(stops: Array<[number, string]>): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const ctx = cv.getContext('2d')!
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  stops.forEach(s => gr.addColorStop(s[0]!, s[1]!))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(cv)
}

/** 星球表面（demo planetTexture 逐字，随机 det 化）：条带+斑块+陨石坑+极冠。 */
function planetTexture(color: THREE.Color, key: string): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128
  const ctx = cv.getContext('2d')!
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  const col = (l: number, a = 1): string => `hsla(${(hsl.h * 360) | 0},${(hsl.s * 100) | 0}%,${(l * 100) | 0}%,${a})`
  ctx.fillStyle = col(hsl.l); ctx.fillRect(0, 0, 256, 128)
  for (let i = 0, n = 5 + Math.floor(det(`pb0:${key}`, 0, 7)); i < n; i++) {
    ctx.fillStyle = col(hsl.l + det(`pb1:${key}:${i}`, -0.11, 0.11), det(`pb2:${key}:${i}`, 0.18, 0.48))
    ctx.fillRect(0, det(`pb3:${key}:${i}`, 0, 128), 256, 3 + det(`pb4:${key}:${i}`, 0, 16))
  }
  for (let i = 0, n = 8 + Math.floor(det(`pe0:${key}`, 0, 10)); i < n; i++) {
    ctx.beginPath()
    ctx.ellipse(det(`pe1:${key}:${i}`, 0, 256), 10 + det(`pe2:${key}:${i}`, 0, 108), det(`pe3:${key}:${i}`, 6, 32), det(`pe4:${key}:${i}`, 4, 16), det(`pe5:${key}:${i}`, 0, Math.PI), 0, PI2)
    ctx.fillStyle = col(hsl.l + (detBool(`pe6:${key}:${i}`, 0.5) ? 0.14 : -0.14), det(`pe7:${key}:${i}`, 0.12, 0.34))
    ctx.fill()
  }
  for (let i = 0; i < 40; i++) {
    ctx.beginPath()
    ctx.arc(det(`pc1:${key}:${i}`, 0, 256), det(`pc2:${key}:${i}`, 0, 128), det(`pc3:${key}:${i}`, 0.5, 2.1), 0, PI2)
    ctx.fillStyle = col(hsl.l - 0.18, 0.35); ctx.fill()
  }
  const pg = ctx.createLinearGradient(0, 0, 0, 128)
  pg.addColorStop(0, 'rgba(255,255,255,.3)'); pg.addColorStop(0.16, 'rgba(255,255,255,0)')
  pg.addColorStop(0.84, 'rgba(255,255,255,0)'); pg.addColorStop(1, 'rgba(255,255,255,.3)')
  ctx.fillStyle = pg; ctx.fillRect(0, 0, 256, 128)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
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

/** 战区 3D 引擎（demo §1-§9 全量）：渲染栈/灯光/星海/星云/碎石带/母舰/16 星/
 * 编队模拟/冲击波环/派兵循环。 */
export class WarzoneScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
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

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    // 不透明画布（demo 正案）：alpha:true 会让宿主浅色主题的白底透出来，
    // 加法混合的白星画在白底上=整片星空隐身（目检实抓）。
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setClearColor(0x02030a, 1)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.scene.fog = new THREE.FogExp2(0x06070f, 0.00075)
    this.camera = new THREE.PerspectiveCamera(55, width / Math.max(height, 1), 0.1, 5000)
    this.camera.position.set(64, 108, 252)
    // 轨道控制器（demo 正案）：左键旋转 / 中键推拉 / 滚轮缩放 / 禁平移禁右键。
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.enablePan = false
    this.controls.rotateSpeed = 0.7
    this.controls.zoomSpeed = 0.85
    this.controls.minDistance = 50
    this.controls.maxDistance = 620
    this.controls.minPolarAngle = 0.05
    this.controls.maxPolarAngle = Math.PI - 0.05
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: -1 }
    const rt = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(rt.x, rt.y, { samples: 4 }))
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.0, 0.65, 0.18)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.scene.add(new THREE.AmbientLight(0x334466, 0.7))
    const dirLight = new THREE.DirectionalLight(0xaabbff, 1.6)
    dirLight.position.set(220, 320, 120)
    this.scene.add(dirLight)
    this.glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']])
    this.disposables.push(this.glowTex)
    this.buildStars()
    this.buildNebulae()
    this.belt = this.buildBelt()
    const hq = this.buildHq()
    this.hqEngineMat = this.hqEngines[0]!.material as THREE.SpriteMaterial
    this.hqBeacon = hq.userData.beacon as THREE.Mesh
    this.scene.add(new THREE.PointLight(0xff8844, 1500, 220, 2).translateY(-26))
    this.scene.add(new THREE.PointLight(0x66ccff, 900, 200, 2).translateY(36))
    this.buildPlanets()
    this.seedInitialSquads()
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
      this.scene.add(sp)
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

  /** 母舰 Headquarters（demo §3 逐字）：八棱柱舰体/上层甲板/指挥塔/信标/传感
   * 球/环绕桁架/六连接梁/四引擎舱（光晕呼吸）/8 舷窗灯带。 */
  private buildHq(): THREE.Group {
    const hq = new THREE.Group()
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x828da6, metalness: 0.9, roughness: 0.32, flatShading: true })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a3242, metalness: 0.85, roughness: 0.5, flatShading: true })
    const accMat = new THREE.MeshStandardMaterial({ color: 0x3c465c, metalness: 0.8, roughness: 0.4, flatShading: true })
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.35, 1.7) })
    const engMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.0, 0.38) })
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
    const beacon = add(new THREE.SphereGeometry(1.7, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 2.2, 2.6) }), 31)
    add(new THREE.SphereGeometry(3.2, 8, 8), darkMat, 37.5)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 2.4, 8, 28), darkMat)
    ring.rotation.x = Math.PI / 2; ring.position.y = -2; hq.add(ring)
    this.disposables.push(ring.geometry)
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
      const sp = this.glowSprite(new THREE.Color(2.2, 1.0, 0.4), 9, 0.85)
      sp.position.set(x, -24.5, z); hq.add(sp); this.hqEngines.push(sp)
    }
    for (let a = 0; a < 8; a++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 3.4), winMat)
      w.position.set(Math.cos(a / 8 * PI2) * 11.6, -6 + (a % 3) * 6, Math.sin(a / 8 * PI2) * 11.6)
      w.rotation.y = -a / 8 * PI2; hq.add(w)
      this.disposables.push(w.geometry)
    }
    const bg = this.glowSprite(new THREE.Color(1.1, 2.2, 2.6), 8, 0.7)
    bg.position.y = 31; hq.add(bg)
    this.scene.add(hq)
    const hqProxy = new THREE.Mesh(hitGeo, hitMat)
    hqProxy.scale.setScalar(36)
    hqProxy.userData.ref = { kind: 'hq' as const }
    this.scene.add(hqProxy)
    this.pickables.push(hqProxy)
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

  private buildPlanets(): void {
    const sphereGeo = new THREE.SphereGeometry(1, 16, 12)
    const hitGeo = new THREE.SphereGeometry(1, 8, 6)
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    this.disposables.push(sphereGeo, hitGeo, hitMat)
    for (const spec of warzonePlanets('warzone')) {
      const base = new THREE.Color().setHSL(spec.hue, spec.sat, spec.light)
      const tex = planetTexture(base, `p${spec.index}`)
      const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
        map: tex, flatShading: true, roughness: 0.92, metalness: 0.05,
        emissive: base.clone().lerp(new THREE.Color(1, 1, 1), 0.15), emissiveMap: tex, emissiveIntensity: 0.32,
      }))
      mesh.scale.setScalar(spec.radius)
      mesh.position.set(spec.x, spec.y, spec.z)
      this.scene.add(mesh)
      const baseGlow = base.clone().lerp(new THREE.Color(1, 1, 1), 0.3)
      const halo = this.glowSprite(baseGlow.clone(), spec.radius * 3.4, 0.32)
      halo.position.copy(mesh.position)
      this.scene.add(halo)
      const proxy = new THREE.Mesh(hitGeo, hitMat)
      proxy.scale.setScalar(Math.max(spec.radius * 1.35, 4.5))
      proxy.position.copy(mesh.position)
      this.scene.add(proxy)
      this.pickables.push(proxy)
      const p: WzPlanet = {
        kind: 'planet', id: spec.index, name: spec.name, cls: spec.cls, level: spec.level,
        radius: spec.radius, mesh, halo, proxy, baseGlow, haloScale: spec.radius * 3.4,
        orbit: spec.orbit, status: spec.heldStart ? '已占领' : '待进攻', garrison: spec.garrison,
        battleT: 0, ringT: 0, inbound: 0, deployedSquads: [], seed: spec.seed, rot: spec.rotSpeed,
      }
      mesh.userData.ref = p
      proxy.userData.ref = p
      this.planets.push(p)
    }
  }

  private makeShip(parent: THREE.Group, glowMat: THREE.SpriteMaterial): void {
    const shipHullMat = new THREE.MeshStandardMaterial({ color: 0x8d99b0, metalness: 0.85, roughness: 0.3, flatShading: true })
    const shipAccMat = new THREE.MeshStandardMaterial({ color: 0x51427e, metalness: 0.7, roughness: 0.35, flatShading: true })
    const shipEngMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.15, 0.45) })
    this.disposables.push(shipHullMat, shipAccMat, shipEngMat)
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 4), shipHullMat)
    body.rotation.x = Math.PI / 2
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.9), shipAccMat); wing.position.z = -0.3
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.8), shipAccMat); fin.position.set(0, 0.35, -0.5)
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.6), shipEngMat); eng.position.z = -1.25
    const sp = new THREE.Sprite(glowMat); sp.scale.setScalar(2.2); sp.position.z = -1.6
    parent.add(body, wing, fin, eng, sp)
    this.disposables.push(body.geometry, wing.geometry, fin.geometry, eng.geometry)
  }

  private createSquad(target: WzPlanet, phase: 'outbound' | 'deployed' = 'outbound', presetT = 0): WzSquad {
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
      kind: 'squad', id, code: 'SQ-' + pad2(id), cname: `第${id}突击编队`,
      group, proxy, glowMat, ships: n, target, phase,
      t: presetT, start, ctrl: new THREE.Vector3(), dur: 1,
      seed: det(`ss:${id}`, 0, 10), orbitA: det(`so:${id}`, 0, PI2),
      orbitSpd: det(`sp:${id}`, 0.8, 1.4), battleT: 0,
    }
    this.planPath(s, target.mesh.position, target.radius + 6)
    if (phase === 'outbound') target.inbound++
    proxy.userData.ref = s
    this.squads.push(s)
    if (phase === 'outbound') this.pushLog('#ffc98a', `${s.code} ${s.cname}出击 ▸ ${target.name.split(' ·')[0]!}`)
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
    p.inbound = Math.max(0, p.inbound - 1)
    const rel = _v1.copy(s.group.position).sub(p.mesh.position)
    s.orbitA = Math.atan2(rel.z, rel.x)
    if (p.status === '待进攻') {
      p.status = '作战中'
      s.phase = 'battle'
      s.battleT = p.battleT = det(`bt:${s.id}`, 6, 14)
      s.orbitSpd = det(`osb:${s.id}`, 1.8, 2.6)
      this.pushLog('#ff7755', `${s.code} 接敌 · ${p.name.split(' ·')[0]!} 交战开始`)
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
    this.spawnRing(p.mesh.position, p.radius * 1.6, 0x66d4ff)
    this.pushLog('#5fc4ff', `${s.code} 攻占 ${p.name.split(' ·')[0]!} · 驻军 +${s.ships}`)
  }

  private removeSquad(i: number): void {
    const s = this.squads[i]!
    this.scene.remove(s.group, s.proxy)
    const pi = this.pickables.indexOf(s.proxy)
    if (pi >= 0) this.pickables.splice(pi, 1)
    this.squads.splice(i, 1)
  }

  private sendHome(s: WzSquad): void {
    const ti = s.target.deployedSquads.indexOf(s)
    if (ti >= 0) s.target.deployedSquads.splice(ti, 1)
    s.start = s.group.position.clone()
    s.phase = 'return'
    this.planPath(s, _v1.set(0, -6, 0), 14)
  }

  private seedInitialSquads(): void {
    let dep = 0
    this.planets.filter(p => p.status === '已占领').forEach(p => {
      if (dep++ < 5) {
        const s = this.createSquad(p, 'deployed')
        s.group.position.copy(p.mesh.position).add(_v1.set(p.radius + 8, 2, 0))
      }
    })
    const targets = this.planets.filter(p => p.status === '待进攻')
    if (targets.length) this.createSquad(targets[Math.floor(det(`i0`, 0, targets.length)) % targets.length]!)
    if (targets.length > 1) this.createSquad(targets[1 + Math.floor(det(`i1`, 0, targets.length - 1))]!, 'outbound', 0.35)
  }

  private spawnRing(pos: THREE.Vector3, radius: number, color: number): void {
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
    ;(f.mesh.material as THREE.MeshBasicMaterial).color.set(color)
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
          this.spawnRing(p.mesh.position, p.radius * 1.4, 0xff5a33)
          this.pushLog('#ff5a5a', `${p.name.split(' ·')[0]!} 遭敌反攻 · 失守!`)
        }
      }
    }
  }

  private pushLog(color: string, text: string): void {
    this.log.unshift({ t: this.simT, color, text })
    if (this.log.length > 30) this.log.pop()
  }

  /** 射线拾取（demo updateHover 3D 半边）：返回命中实体 ref 或 null。 */
  pick(ndcX: number, ndcY: number): { kind: 'hq' | 'planet' | 'squad'; ref: unknown } | null {
    this.raycaster.setFromCamera(_v2.set(ndcX, ndcY, 0) as unknown as THREE.Vector2, this.camera)
    const hits = this.raycaster.intersectObjects(this.pickables, false)
    return hits.length ? (hits[0]!.object.userData.ref as { kind: 'hq' | 'planet' | 'squad'; ref: unknown }) : null
  }

  /** 帧推进（demo animate 的模拟半边）：母舰呼吸/星球轨道与状态/编队/特效/调度。 */
  update(dt: number, t: number): void {
    this.simT += dt
    const hq = this.hqBeacon.parent as THREE.Group
    hq.rotation.y += dt * 0.06
    const pulse = 1 + 0.18 * Math.sin(t * 5)
    this.hqEngines.forEach((sp, i) => sp.scale.setScalar(9 * (1 + 0.16 * Math.sin(t * 5 + i * 1.7))))
    this.hqEngineMat.opacity = 0.7 + 0.25 * pulse * 0.5
    ;(this.hqBeacon.material as THREE.MeshBasicMaterial).color.setRGB(1.1, 2.2, 2.6).multiplyScalar(0.8 + 0.3 * Math.sin(t * 3))
    for (const p of this.planets) {
      const o = p.orbit
      o.angle += o.speed * dt
      const rr = o.r * (1 + o.ecc * Math.sin(o.angle * 1.618 + o.phase))
      p.mesh.position.set(Math.cos(o.angle) * rr, o.yBase + Math.sin(o.angle * 0.9 + o.phase * 2) * o.tiltA, Math.sin(o.angle) * rr)
      p.mesh.rotation.y += p.rot * dt
      p.halo.position.copy(p.mesh.position)
      p.proxy.position.copy(p.mesh.position)
      _c1.copy(p.baseGlow)
      let op = 0.3
      if (p.status === '作战中') {
        _c1.set(0xff5a33)
        op = 0.42 + 0.18 * Math.sin(t * 7 + p.seed * 6)
        p.ringT -= dt
        if (p.ringT <= 0) { this.spawnRing(p.mesh.position, p.radius * 1.15, 0xff6a33); p.ringT = det(`rt:${p.id}:${Math.floor(t * 2)}`, 0.8, 1.6) }
      } else if (p.status === '已占领') {
        _c1.lerp(_c2.set(0x66d4ff), 0.4)
        op = 0.34
      }
      p.halo.material.color.lerp(_c1, 0.08)
      p.halo.material.opacity += (op - p.halo.material.opacity) * 0.1
    }
    for (let i = this.squads.length - 1; i >= 0; i--) {
      const s = this.squads[i]!
      const glow = 0.72 + 0.28 * Math.sin(t * 22 + s.seed)
      if (s.phase === 'outbound' || s.phase === 'return') {
        const end = s.phase === 'return'
          ? _v2.set(0, -6, 0)
          : _v1.copy(s.target.mesh.position).add(_v3.copy(s.start).sub(s.target.mesh.position).normalize().multiplyScalar(s.target.radius + 6))
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
        const rr = s.target.radius + (s.phase === 'battle' ? 5 : 8) + Math.sin(t * 2 + s.seed) * 0.8
        const by = Math.sin(t * 1.6 + s.seed) * 2.5
        s.group.position.set(tp.x + Math.cos(s.orbitA) * rr, tp.y + by, tp.z + Math.sin(s.orbitA) * rr)
        s.group.lookAt(tp.x + Math.cos(s.orbitA + 0.35) * rr, tp.y + by, tp.z + Math.sin(s.orbitA + 0.35) * rr)
        if (s.phase === 'battle') {
          s.battleT -= dt
          if (s.battleT <= 0) this.capturePlanet(s.target, s)
        }
      }
      s.glowMat.opacity = glow
      s.proxy.position.copy(s.group.position)
    }
    this.updateRings(dt, this.camera)
    this.warLoop(dt)
    this.starMat.uniforms.uTime!.value = t
    this.starGroup.rotation.y += dt * 0.004
    this.belt.rotation.y += dt * 0.01
  }

  render(): void {
    this.composer.render()
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
  }

  dispose(): void {
    this.controls.dispose()
    for (const d of this.disposables) d.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}

/* ================================================================
 * 指挥室 2D 战术视图（demo §8.5 全量）：雷达盘/扫描余辉/HQ 八角/星球符号/
 * 编队三角+虚线航迹/编队名册/态势统计/战况速报/CRT 扫描线。
 * ================================================================ */

export interface TacHit { x: number; y: number; r: number; ref: unknown }

export class WarzoneTactical {
  private readonly g: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly scanPat: CanvasPattern | null
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

  private get zoom(): number { return Number(this.canvas.dataset.zoom ?? 1) }

  resize(w: number, h: number): void {
    const dpr = Math.min(devicePixelRatio, 2)
    this.w = w; this.h = h
    this.canvas.width = w * dpr
    this.canvas.height = h * dpr
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private panel(x: number, y: number, w: number, h: number, title: string): void {
    const g = this.g
    g.fillStyle = 'rgba(6,13,26,.78)'
    g.strokeStyle = 'rgba(111,227,255,.3)'; g.lineWidth = 1
    g.beginPath()
    if (g.roundRect) g.roundRect(x, y, w, h, 6); else g.rect(x, y, w, h)
    g.fill(); g.stroke()
    g.fillStyle = 'rgba(111,227,255,.1)'; g.fillRect(x, y, w, 24)
    g.strokeStyle = 'rgba(111,227,255,.3)'
    g.beginPath(); g.moveTo(x, y + 24); g.lineTo(x + w, y + 24); g.stroke()
    g.fillStyle = '#9fdcff'; g.font = 'bold 11px "Microsoft YaHei",Consolas'
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    g.fillText(title, x + 10, y + 16)
  }

  /** 帧绘制（demo drawTactical 逐字；t=任务秒，sweep 由内部推进）。 */
  draw(t: number, dt: number, planets: ReadonlyArray<WzPlanet>, squads: ReadonlyArray<WzSquad>, log: ReadonlyArray<WzLogEntry>, hits: TacHit[]): void {
    const g = this.g
    const w = this.w, h = this.h
    const cx = this.cx = w / 2
    const cy = this.cy = h / 2 + 10
    const baseR = Math.max(180, Math.min(h * 0.5 - 70, w * 0.5 - 300, 460))
    this.worldScale = baseR / 300 * this.zoom
    const ws = this.worldScale
    hits.length = 0
    const W2S = (x: number, z: number, out: { x: number; y: number }): void => { out.x = cx + x * ws; out.y = cy + z * ws }
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
    bg.addColorStop(0, '#04101f'); bg.addColorStop(0.5, '#020812'); bg.addColorStop(1, '#010409')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(60,120,190,.07)'; g.lineWidth = 1
    g.beginPath()
    for (let x = cx % 46; x < w; x += 46) { g.moveTo(x, 0); g.lineTo(x, h) }
    for (let y = cy % 46; y < h; y += 46) { g.moveTo(0, y); g.lineTo(w, y) }
    g.stroke()
    // 雷达盘
    const R = 300 * ws
    g.save(); g.translate(cx, cy)
    for (let wr = 75; wr <= 300; wr += 75) {
      const r = wr * ws
      g.beginPath(); g.arc(0, 0, r, 0, PI2)
      g.strokeStyle = 'rgba(80,160,230,.2)'; g.lineWidth = 1; g.stroke()
      g.fillStyle = 'rgba(110,180,240,.4)'; g.font = '10px Consolas'
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'
      g.fillText(wr + 'k', 4, -r + 12)
    }
    g.strokeStyle = 'rgba(80,160,230,.15)'
    g.beginPath(); g.moveTo(-R - 30, 0); g.lineTo(R + 30, 0); g.moveTo(0, -R - 30); g.lineTo(0, R + 30); g.stroke()
    for (let a = 0; a < 360; a += 15) {
      const rad = a * Math.PI / 180, len = a % 45 === 0 ? 10 : 5
      g.beginPath()
      g.moveTo(Math.cos(rad) * R, Math.sin(rad) * R)
      g.lineTo(Math.cos(rad) * (R + len), Math.sin(rad) * (R + len))
      g.strokeStyle = 'rgba(90,170,240,.35)'; g.stroke()
    }
    g.fillStyle = 'rgba(120,190,250,.5)'; g.font = '10px Consolas'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('000', 0, -R - 22); g.fillText('090', R + 22, 0)
    g.fillText('180', 0, R + 22); g.fillText('270', -R - 22, 0)
    // 扫描波束 + 55 段余辉
    const sweepA = t * 0.9
    for (let i = 0; i < 55; i++) {
      const a = sweepA - i * 0.028
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R)
      g.strokeStyle = `rgba(90,220,170,${0.1 * (1 - i / 55)})`; g.lineWidth = 2.2; g.stroke()
    }
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(sweepA) * R, Math.sin(sweepA) * R)
    g.strokeStyle = 'rgba(140,255,210,.8)'; g.lineWidth = 2; g.stroke()
    g.restore()
    // HQ 符号
    const s1 = { x: 0, y: 0 }, s2 = { x: 0, y: 0 }
    W2S(0, 0, s1)
    const pk = (t * 0.7) % 1
    g.beginPath(); g.arc(s1.x, s1.y, 16 + 12 * pk, 0, PI2)
    g.strokeStyle = `rgba(111,227,255,${0.55 * (1 - pk)})`; g.lineWidth = 1.5; g.stroke()
    g.save(); g.translate(s1.x, s1.y); g.rotate(t * 0.3)
    g.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI2, px = Math.cos(a) * 13, py = Math.sin(a) * 13
      if (i) g.lineTo(px, py); else g.moveTo(px, py)
    }
    g.closePath()
    g.fillStyle = 'rgba(20,50,90,.92)'; g.fill()
    g.strokeStyle = '#9fdcff'; g.lineWidth = 1.6; g.stroke()
    g.beginPath(); g.arc(0, 0, 4.5, 0, PI2); g.fillStyle = '#cfeeff'; g.fill()
    g.restore()
    g.fillStyle = '#bfe6ff'; g.font = 'bold 11px Consolas,"Microsoft YaHei"'
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.fillText('HQ · HEADQUARTERS', s1.x, s1.y + 32)
    hits.push({ x: s1.x, y: s1.y, r: 26, ref: { kind: 'hq' } })
    // 星球符号
    planets.forEach(p => {
      W2S(p.mesh.position.x, p.mesh.position.z, s1)
      const col = p.status === '作战中' ? '#ff6a55' : p.status === '已占领' ? '#5fc4ff' : '#ffc24d'
      const rr = Math.max(7, p.radius * 0.9)
      if (p.status === '作战中') {
        const k = (t * 1.4 + p.seed) % 1
        g.beginPath(); g.arc(s1.x, s1.y, rr + 4 + k * 16, 0, PI2)
        g.strokeStyle = `rgba(255,90,60,${0.6 * (1 - k)})`; g.lineWidth = 1.5; g.stroke()
      }
      g.beginPath(); g.arc(s1.x, s1.y, rr, 0, PI2)
      g.fillStyle = col + '2e'; g.fill()
      g.strokeStyle = col; g.lineWidth = 1.6; g.stroke()
      g.beginPath(); g.arc(s1.x, s1.y, 2.2, 0, PI2); g.fillStyle = col; g.fill()
      if (p.garrison > 0) {
        g.beginPath(); g.arc(s1.x, s1.y, rr + 5, -Math.PI / 2, -Math.PI / 2 + Math.min(PI2, p.garrison / 12 * PI2))
        g.strokeStyle = 'rgba(95,196,255,.7)'; g.lineWidth = 2; g.stroke()
      }
      g.font = '10px "Microsoft YaHei",Consolas'; g.textAlign = 'center'
      g.fillStyle = 'rgba(200,225,250,.85)'
      g.fillText(p.name.split(' ·')[0]!, s1.x, s1.y - rr - 6)
      g.fillStyle = col; g.font = '9px Consolas'
      g.fillText(`LV${p.level}·${p.garrison}艘`, s1.x, s1.y + rr + 13)
      hits.push({ x: s1.x, y: s1.y, r: Math.max(rr + 6, 12), ref: p })
    })
    // 编队符号 + 虚线航迹
    squads.forEach(s => {
      W2S(s.group.position.x, s.group.position.z, s1)
      const ph = s.phase
      const col = ph === 'battle' ? '#ff7755' : ph === 'return' ? '#9a86ff' : ph === 'deployed' ? '#5fc4ff' : '#ffc98a'
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
    // 左面板：作战编队名册
    const lpW = 252, lpH = Math.min(340, 58 + squads.length * 31)
    this.panel(18, 64, lpW, lpH, '作战编队 FLEET ROSTER')
    squads.slice(0, 9).forEach((s, i) => {
      const ry = 64 + 40 + i * 31
      const ph = s.phase
      const col = ph === 'battle' ? '#ff7755' : ph === 'return' ? '#9a86ff' : ph === 'deployed' ? '#5fc4ff' : '#ffc98a'
      const stTxt = ph === 'outbound' ? `出征 ${Math.min(99, s.t * 100) | 0}%` : ph === 'battle' ? '交战中' : ph === 'deployed' ? '已部署' : `返航 ${Math.min(99, s.t * 100) | 0}%`
      g.fillStyle = '#dceaff'; g.font = '11px Consolas,"Microsoft YaHei"'; g.textAlign = 'left'
      g.fillText(`${s.code}`, 28, ry)
      g.fillStyle = col; g.fillText(stTxt, 82, ry)
      g.fillStyle = 'rgba(150,180,215,.85)'; g.textAlign = 'right'
      g.fillText(ph === 'return' ? '▸ HQ' : '▸ ' + s.target.name.split(' ·')[0]!, 18 + lpW - 10, ry)
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(28, ry + 6, lpW - 56, 3)
      if (ph === 'outbound' || ph === 'return') {
        g.fillStyle = col; g.fillRect(28, ry + 6, (lpW - 56) * Math.min(1, s.t), 3)
      } else {
        g.fillStyle = col + '99'; g.fillRect(28, ry + 6, lpW - 56, 3)
      }
    })
    // 右面板：态势统计 + 战况速报
    const rpW = 272, rpX = w - rpW - 18
    const cnt: Record<WzStatus, number> = { '待进攻': 0, '作战中': 0, '已占领': 0 }
    planets.forEach(p => cnt[p.status]++)
    this.panel(rpX, 64, rpW, 76, '战区态势 STATUS')
    ;([['待进攻', cnt['待进攻'], '#ffc24d'], ['作战中', cnt['作战中'], '#ff6a55'], ['已占领', cnt['已占领'], '#5fc4ff']] as Array<[string, number, string]>).forEach((it, i) => {
      const ix = rpX + 16 + i * 88
      g.fillStyle = it[2]!; g.fillRect(ix, 104, 8, 8)
      g.fillStyle = '#cfe3ff'; g.font = 'bold 17px Consolas'; g.textAlign = 'left'
      g.fillText(String(it[1]), ix + 14, 113)
      g.fillStyle = 'rgba(160,190,220,.75)'; g.font = '10px "Microsoft YaHei"'
      g.fillText(it[0]! + '星球', ix, 129)
    })
    const lgN = Math.min(9, log.length)
    this.panel(rpX, 156, rpW, 44 + lgN * 22, '战况速报 WAR LOG')
    log.slice(0, 9).forEach((e, i) => {
      const ey = 156 + 44 + i * 22
      const mm = pad2(e.t / 60 | 0), ss = pad2(e.t % 60 | 0)
      g.fillStyle = 'rgba(140,170,200,.6)'; g.font = '10px Consolas'; g.textAlign = 'left'
      g.fillText(`T+${mm}:${ss}`, rpX + 12, ey)
      g.fillStyle = e.color; g.font = '11px "Microsoft YaHei"'
      g.fillText(e.text, rpX + 76, ey)
    })
    // 顶栏 / 底栏 / 四角括号
    const mm = pad2(t / 60 | 0), ss = pad2(t % 60 | 0)
    g.fillStyle = '#9fdcff'; g.font = 'bold 13px Consolas,"Microsoft YaHei"'; g.textAlign = 'center'
    g.fillText('TACTICAL COMMAND VIEW · 战区指挥态势图', cx, 36)
    g.fillStyle = 'rgba(140,170,200,.65)'; g.font = '10px Consolas'
    g.fillText(`MISSION T+${mm}:${ss}   SIGNAL LOCK · 数据链正常   滚轮 缩放态势图 · V 切换现实视图`, cx, h - 22)
    const B = 26, M = 14
    ;([[M, M, 1, 1], [w - M, M, -1, 1], [M, h - M, 1, -1], [w - M, h - M, -1, -1]] as const).forEach(c => {
      g.strokeStyle = 'rgba(111,227,255,.5)'; g.lineWidth = 2
      g.beginPath(); g.moveTo(c[0] + c[2] * B, c[1]); g.lineTo(c[0], c[1]); g.lineTo(c[0], c[1] + c[3] * B); g.stroke()
    })
    // CRT 扫描线 + 偶发信号闪线
    if (this.scanPat) g.fillStyle = this.scanPat
    g.fillRect(0, 0, w, h)
    if (hash01(`gl:${Math.floor(t * 10)}`) < 0.02) {
      g.fillStyle = 'rgba(120,220,255,.035)'
      g.fillRect(0, hash01(`gly:${Math.floor(t * 10)}`) * h, w, 2)
    }
  }
}
