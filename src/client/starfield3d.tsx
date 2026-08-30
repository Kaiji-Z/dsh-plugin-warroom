/**
 * V11.4 星域=warzone demo 整体进驻（舰长令「完全一比一」）。本组件只是挂载壳：
 * 3D 引擎与 2D 指挥室全在 warzone-scene.ts（demo 全要素 1:1）；壳负责——容器内
 * 鼠标追踪与拾取（3D 射线 / 2D 邻近）、悬停信息卡（HQ/星球/编队三卡，0.5s 实时
 * 刷新）、3D 视图/2D 视图切换（按钮+V 键，输入态守卫）、尺寸随动、WebGL
 * 失败回落 2D 星域（底线保留）、调试句柄 window.__wz（探针断言用）。
 * V11.5 起板真值驱动（星球=workspace/编队=执行会话/日志=真实事件）；V11.5f 增
 * 执行卡覆盖层（卡钉星球屏位+连线，点击跳源命令）与悬停/聚焦→星球高亮联动。
 * @module dsh-plugin-warroom/client/starfield3d
 */
import { createElement, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { hqStats, WarzoneScene, WarzoneTactical, type TacHit, type WzBridgePlanet, type WzBridgeSquad, type WzFrontNode, type WzLogEntry, type WzPlanet, type WzSquad } from './warzone-scene.ts'
import { activeCopy } from './copy.ts'
import type { WzBridgeFrontLite } from './front.ts'

type WzEntityRef = { kind: 'hq' } | WzPlanet | WzSquad | WzFrontNode

/** V14 星球名（目录名；合成沙盒聚合键=未分组）。 */
const dirLabel = (wsPath: string): string => {
  if (wsPath === '__war_ungrouped__') return activeCopy().starfield.ungrouped
  const parts = wsPath.split(/[\/]+/).filter(p => p.length > 0)
  return parts.length > 0 ? parts[parts.length - 1]! : wsPath
}

/** V18.2 信息卡瘦身（舰长令：悬停只想知道星球的名字/路径/状态——其余是噪音）：
 * 星球卡两行（名+态 / 路径）、编队卡三行（谁/去哪/干什么）、战线卡三行、HQ 卡
 * 两行；词面全走词典（一词一面，trek 词表运行时派生）。 */
function buildCard(ent: WzEntityRef, scene: WarzoneScene): string {
  const sf = activeCopy().starfield
  if (ent.kind === 'hq') {
    const st = hqStats(scene.planets, scene.squads)
    return `<div class="tt-head"><span class="dot"></span>
      <span class="tt-name">${sf.hqName}</span><span class="tt-tag">${sf.hqTag}</span></div>
      <div class="tt-row"><b>${sf.hqRow(scene.planets.length, st.inbound + st.battle + st.deployed, st.garrison)}</b></div>`
  }
  if (ent.kind === 'front') {
    const state = ent.live ? activeCopy().front.stateLive : activeCopy().front.stateSettled
    return `<div class="tt-head"><span class="dot chain war-chain-hue-${ent.hueSlot}"></span>
      <span class="tt-name">${sf.frontN(ent.gens)}</span><span class="tt-tag">${state}</span></div>
      <div class="tt-desc">${ent.label}</div>
      <div class="tt-row"><b class="tt-emph">${sf.viewFront}</b></div>`
  }
  if (ent.kind === 'planet') {
    const st = ent.state === 'active' ? sf.stPlanetActive : ent.state === 'settled' ? sf.stPlanetSettled
      : ent.state === 'failed' ? sf.stPlanetFailed : sf.stPlanetIdle
    const chipCls = ent.state === 'active' ? 'st-battle' : ent.state === 'settled' ? 'st-settled'
      : ent.state === 'failed' ? 'st-failed' : 'st-idle'
    return `<div class="tt-head"><span class="dot" style="background:#${ent.baseGlow.getHexString()}"></span>
      <span class="tt-name">${ent.name}</span><span class="war-wz-chip ${chipCls}">${st}</span></div>
      <div class="tt-desc">${ent.wsPath}</div>`
  }
  const s = ent as WzSquad
  const ph = s.phase === 'outbound' ? sf.phOutbound(Math.min(99, s.t * 100) | 0)
    : s.phase === 'battle' ? (s.verb !== null ? sf.phBattle(s.verb) : sf.orbIdle)
    : s.phase === 'deployed' ? (s.paused ? sf.phPaused : sf.phDeployed)
    : s.phase === 'holding' ? sf.phHolding
    : sf.phReturn(Math.min(99, s.t * 100) | 0)
  const tgt = s.phase === 'return' ? sf.returnHq : s.target.name
  return `<div class="tt-head"><span class="dot warm"></span>
    <span class="tt-name">${s.cname}</span><span class="tt-tag">${sf.sqTag} ${s.code}</span></div>
    <div class="tt-row"><span>${sf.targetLabel}</span><b>${tgt}</b></div>
    <div class="tt-row"><span>${sf.phaseLabel}</span><b class="tt-emph">${ph}</b></div>`
}

/** V18.3 聚焦态钉住卡内嵌战线清单（bfpanel 退役并入）：链色点+战线名+N 代·聚合态，
 *  整行按钮（data-wz-front 事件委托→聚焦页）。词面走既有 front 词典键。 */
function frontRowsHtml(ws: string, fronts: ReadonlyArray<WzBridgeFrontLite>): string {
  const mine = fronts.filter(f => f.battlefield === ws)
  if (mine.length === 0) return ''
  return mine.map(f => `<button type="button" class="war-wz-tipfront war-chain-hue-${f.hueSlot}" data-wz-front="${f.rootCommandId}">
    <span class="war-front-dot" aria-hidden="true"></span>
    <span class="war-wz-tipfront-name">${f.label}</span>
    <span class="war-wz-tipfront-meta">${activeCopy().front.genN(f.gens)} · ${f.live ? activeCopy().front.stateLive : activeCopy().front.stateSettled}</span>
  </button>`).join('')
}

export interface WarzoneProps {
  readonly ariaLabel: string
  /** V11.5 连线：板面真值（HQ 出航/星球谱/编队谱/日志）驱动引擎。 */
  readonly active: boolean
  readonly planets: ReadonlyArray<WzBridgePlanet>
  readonly squads: ReadonlyArray<WzBridgeSquad>
  readonly log: ReadonlyArray<WzLogEntry>
  /** V13 战线航迹：每条战线一条链色管道串起各代星球（含未分组键）。 */
  readonly fronts: ReadonlyArray<WzBridgeFrontLite>
  /** V11.5f：悬停/聚焦命令卡 → 高亮对应星域（星球名+HQ↔星球轨迹）。 */
  readonly highlightWs: ReadonlyArray<string>
  /** 执行卡点击 → 跳源命令聚焦页。 */
  readonly onOpenCommand?: (commandId: string) => void
  /** V17.4（舰长令）：星球悬停 → 高亮相关卡片族（与卡片悬停同路）。ws=null=离场。 */
  readonly onPlanetHover?: (ws: string | null) => void
  /** V17.4：星球点击 → 粘性高亮聚焦（再点同星球/点空处取消——父层管状态）。 */
  readonly onPlanetClick?: (ws: string) => void
  /** V18 点击 HQ → 工作区注册弹窗（星球=真实工作区）。 */
  readonly onHqClick?: () => void
  /** V17.4：点星域空处 → 取消高亮聚焦。 */
  readonly onVoidClick?: () => void
  /** 执行卡动词兜底。 */
  readonly orbIdleLabel: string
  /** WebGL 不可用/初始化失败：父级整棵回落 2D 星域（底线）。 */
  readonly onUnavailable: () => void
  /** V18.3 聚焦态总控（舰长令）：粘性聚焦星球的 wsKey——悬停卡在聚焦态钉住该
   *  星球（锚星球投影、无需悬停）并内嵌战线列表（可点击进聚焦页）；
   *  bfpanel 战线弹窗由此退役。null=无聚焦（悬停卡回到纯悬停行为）。 */
  readonly focusWs: string | null
}

export function Warzone(props: WarzoneProps): ReactNode {
  const { ariaLabel, active, planets, squads, log, fronts, highlightWs, onOpenCommand, onPlanetHover, onPlanetClick, onVoidClick, onHqClick, orbIdleLabel, onUnavailable, focusWs } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const c3dRef = useRef<HTMLCanvasElement | null>(null)
  const c2dRef = useRef<HTMLCanvasElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<WarzoneScene | null>(null)
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const squadsRef = useRef(squads)
  const hlWsRef = useRef(highlightWs)
  const hoverWsRef = useRef<string | null>(null)
  const hlKeyRef = useRef('')
  // V18.3 聚焦态总控：钉住星球 ws + 战线清单走 ref（帧环读，不重挂 effect）。
  const focusWsRef = useRef(focusWs)
  const frontsRef = useRef(fronts)
  /** V11.5g：2D 态执行卡拖放偏移（sessionId→dx/dy，相对安全区锚位；会话级内存不落盘）。 */
  const cardOffRef = useRef(new Map<string, { dx: number; dy: number }>())
  const [failed, setFailed] = useState(false)
  const [cmd, setCmd] = useState(true)

  useEffect(() => {
    const root = rootRef.current
    const c3d = c3dRef.current
    const c2d = c2dRef.current
    if (root === null || c3d === null || c2d === null) return
    let scene: WarzoneScene
    try {
      scene = new WarzoneScene(c3d, root.clientWidth, root.clientHeight)
    } catch {
      setFailed(true)
      onUnavailable()
      return
    }
    const tac = new WarzoneTactical(c2d)
    // V12（舰长令·浅色范式=天空）：主题热切换——body[data-ds-dark-theme] 由宿主
    // theme-presenter 持有，MutationObserver 监听翻转（深空↔天空双皮即时生效）。
    const themeOf = (): boolean => document.body.hasAttribute('data-ds-dark-theme')
    const applyThemes = (): void => { const d = themeOf(); scene.setTheme(d); tac.setTheme(d) }
    applyThemes()
    const themeObs = new MutationObserver(applyThemes)
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    // V11.5 值班默认态=雷达（舰长定：雷达值班+3D 战略）——V 键/按钮双向切换。
    let mode: '3d' | 'cmd' = 'cmd'
    const applyMode = (m: '3d' | 'cmd'): void => {
      mode = m
      root.classList.toggle('war-wz-cmd', m === 'cmd')
    }
    applyMode('cmd')
    sceneRef.current = scene
    // 鼠标（容器相对坐标）+ 拾取
    let mx = 0, my = 0, mouseIn = false
    const onMove = (e: MouseEvent): void => {
      const r = root.getBoundingClientRect()
      mx = e.clientX - r.left; my = e.clientY - r.top
      mouseIn = true
    }
    const onLeave = (): void => { mouseIn = false }
    const onCtx = (e: Event): void => e.preventDefault()
    // 视图切换（V 键带输入态守卫——composer 打字不触发）
    const setMode = (m: '3d' | 'cmd'): void => { applyMode(m); setCmd(m === 'cmd') }
    const toggle = (): void => setMode(mode === '3d' ? 'cmd' : '3d')
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      const typing = t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if ((e.key === 'r' || e.key === 'R') && !typing && mode === '3d') { scene.resetCam(); return }
      if (e.key !== 'v' && e.key !== 'V') return
      if (typing) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      toggle()
    }
    const onBtn = (e: Event): void => {
      const m = (e.currentTarget as HTMLElement).dataset.wzMode
      if (m === '3d' || m === 'cmd') setMode(m)
    }
    const onWheel = (e: WheelEvent): void => {
      if (mode === 'cmd') tac.zoomBy(e.deltaY)
      else scene.zoomBy(e.deltaY)
    }
    // V11.5b 三键相机（舰长定，仅 3D 态）：左键平移（即时跟手）/ 中键旋转（阻尼，
    // 绕屏幕中心）；中键 mousedown 防 autoscroll。滚轮双路由：雷达缩态势图、3D 缩机距。
    let camDrag: 'pan' | 'rotate' | null = null
    let lx = 0, ly = 0
    const onPointerDown = (e: PointerEvent): void => {
      if (mode !== '3d') return
      if (e.button === 1) camDrag = 'rotate'
      else if (e.button === 0) {
        if ((e.target as HTMLElement).closest('button') !== null) return
        camDrag = 'pan'
      } else return
      lx = e.clientX; ly = e.clientY
      root.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (camDrag === null || mode !== '3d') return
      const dx = e.clientX - lx, dy = e.clientY - ly
      lx = e.clientX; ly = e.clientY
      if (camDrag === 'rotate') scene.orbitBy(-dx * 0.006, dy * 0.0045)
      else scene.panByPx(dx, dy, root.clientHeight)
    }
    const onPointerUp = (e: PointerEvent): void => { camDrag = null; try { root.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ } }
    // V13 战线航迹点击：纯点击（位移 <6px）拾取 front 节点 → 开根命令聚焦页；
    // 与相机拖拽/执行卡点击互斥（拖过即不算点击；卡走自己的 onClick）。
    let dragDist = 0
    const onDownDist = (): void => { dragDist = 0 }
    const onMoveDist = (e: PointerEvent): void => { dragDist += Math.abs(e.movementX) + Math.abs(e.movementY) }
    // V17.4：星球优先拾取——编队绕星巡弋，命中圈常盖住星球中心，点/悬停星球
    // 的意图必须优先于恰好路过的编队；编队在星球命中圈外仍可正常拾取。
    const pickAt = (px: number, py: number): WzEntityRef | null => {
      let best: WzEntityRef | null = null
      let bd = 1e9
      let bestPlanet: WzEntityRef | null = null
      let bp = 1e9
      for (const h of hits) {
        const d = Math.hypot(h.x - px, h.y - py)
        if (d >= h.r + 6) continue
        if ((h.ref as { kind?: string }).kind === 'planet') {
          if (d < bp) { bp = d; bestPlanet = h.ref as WzEntityRef }
        } else if (d < bd) { bd = d; best = h.ref as WzEntityRef }
      }
      return bestPlanet ?? best
    }
    const onClickRoot = (e: MouseEvent): void => {
      if (dragDist > 6) return
      if ((e.target as HTMLElement).closest('button') !== null) return
      // V17.4（舰长令）：星球点击 → 粘性高亮聚焦（取代 V14 的 bf 面板直开——
      // 键盘镜像 kbplanet 仍可达面板）；点空处 → 取消聚焦。2D 用帧环 hits 拾取
      //（雷达布局与 3D 投影不同轴——scene.pick 在 2D 态会错位）。
      // V18.4：聚焦态下非聚焦星球不产生任何事件（点击既不换聚焦也不算空处退出）
      const focusLocked = focusWsRef.current
      if (mode === 'cmd') {
        const best = pickAt(e.clientX - rect.left, e.clientY - rect.top)
        if (best !== null && best.kind === 'hq') { onHqClick?.(); return }
        // V18.3：点星球=粘性聚焦（悬停卡钉住并内嵌战线清单）——bfpanel 弹窗退役。
        if (best !== null && best.kind === 'planet') {
          const ws = (best as WzPlanet).wsPath
          if (focusLocked !== null && ws !== focusLocked) return
          onPlanetClick?.(ws)
          return
        }
        onVoidClick?.()
        return
      }
      const hit = scene.pick((e.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1, -((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1)
      if (hit !== null && hit.kind === 'hq') { onHqClick?.(); return }
      if (hit !== null && hit.kind === 'front') { onOpenCommand?.((hit as WzFrontNode).rootCommandId); return }
      if (hit !== null && hit.kind === 'planet') {
        const ws = (hit as WzPlanet).wsPath
        if (focusLocked !== null && ws !== focusLocked) return
        onPlanetClick?.(ws)
        return
      }
      onVoidClick?.()
    }
    const rect = { get left() { return root.getBoundingClientRect().left }, get top() { return root.getBoundingClientRect().top }, get width() { return root.clientWidth }, get height() { return root.clientHeight } }
    const onMouseDownCam = (e: MouseEvent): void => { if (e.button === 1) e.preventDefault() }
    const onDbl = (): void => { if (mode === '3d') scene.resetCam() }
    // V11.5g（舰长令）：2D 态执行卡可自由拖放——委托在卡容器上（React 重渲染不丢
    // 手柄），只记 offset；卡位=安全区锚+offset，实线索引线永连星球。拖拽期间点亮
    // 该星域高亮（与悬停同路）。3D 态卡钉星球投影不可拖（手势让位相机）。
    const cardOff = cardOffRef.current
    let dragSid: string | null = null
    let dragPx = 0, dragPy = 0, dragOx = 0, dragOy = 0
    let dragMoved = false
    let dragSuppressUntil = 0
    const onCardDown = (e: PointerEvent): void => {
      if (mode !== 'cmd' || e.button !== 0) return
      const el = (e.target as HTMLElement).closest<HTMLElement>('.war-wz-xcard')
      if (el === null) return
      dragSid = el.dataset.wzSid ?? null
      if (dragSid === null) return
      const off = cardOff.get(dragSid) ?? { dx: 0, dy: 0 }
      dragOx = off.dx; dragOy = off.dy
      dragPx = e.clientX; dragPy = e.clientY
      dragMoved = false
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    const onCardMove = (e: PointerEvent): void => {
      if (dragSid === null) return
      const dx = e.clientX - dragPx, dy = e.clientY - dragPy
      if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true
      cardOff.set(dragSid, { dx: dragOx + dx, dy: dragOy + dy })
      const sq = squadsRef.current.find(q => q.sessionId === dragSid)
      if (sq !== undefined) hoverWsRef.current = sq.wsPath
    }
    const onCardUp = (e: PointerEvent): void => {
      if (dragSid === null) return
      const el = (e.target as HTMLElement).closest<HTMLElement>('.war-wz-xcard')
      try { (el ?? cardsRef.current)?.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
      // pointer capture 会把拖拽后的 click 落回卡上——真拖过就短窗拦截，防误开源命令。
      if (dragMoved) dragSuppressUntil = performance.now() + 350
      dragSid = null
    }
    const onCardClickCap = (e: MouseEvent): void => {
      if (performance.now() < dragSuppressUntil) { e.stopPropagation(); e.preventDefault() }
    }
    const cardsEl = cardsRef.current
    cardsEl?.addEventListener('pointerdown', onCardDown)
    cardsEl?.addEventListener('pointermove', onCardMove)
    cardsEl?.addEventListener('pointerup', onCardUp)
    cardsEl?.addEventListener('pointercancel', onCardUp)
    cardsEl?.addEventListener('click', onCardClickCap, true)
    // V18.3 悬停卡交互（舰长令）：战线行点击→聚焦页（事件委托，行内 data-wz-front）。
    // 卡体任何点击 stopPropagation——不落回星域 click（误触空处会退出聚焦）。
    const tipEl = tipRef.current
    const onTipClick = (e: MouseEvent): void => {
      e.stopPropagation()
      const row = (e.target as HTMLElement).closest('[data-wz-front]')
      if (row !== null) onOpenCommand?.(row.getAttribute('data-wz-front') ?? '')
    }
    tipEl?.addEventListener('click', onTipClick)
    root.addEventListener('mousemove', onMove)
    root.addEventListener('mouseleave', onLeave)
    root.addEventListener('contextmenu', onCtx)
    root.addEventListener('wheel', onWheel, { passive: true })
    root.addEventListener('pointerdown', onPointerDown)
    root.addEventListener('pointermove', onPointerMove)
    root.addEventListener('pointerup', onPointerUp)
    root.addEventListener('pointercancel', onPointerUp)
    root.addEventListener('mousedown', onMouseDownCam)
    root.addEventListener('dblclick', onDbl)
    root.addEventListener('pointerdown', onDownDist)
    root.addEventListener('pointermove', onMoveDist)
    root.addEventListener('click', onClickRoot)
    window.addEventListener('keydown', onKey)
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-wz-mode]'))) b.addEventListener('click', onBtn)
    // 主循环
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = performance.now()
    let t = 0
    let hoverKey = ''
    // V18.4 钉住卡锚点：聚焦建立时冻结「当下悬停卡位置」（屏幕坐标），移动/缩放
    // 镜头不跟随星球——就是悬停卡被固定住的体感。
    let lastFocusWs: string | null = null
    let pinnedAnchor: { x: number; y: number } | null = null
    let ttTimer = 0
    let hoverPlanetWs: string | null = null
    const hits: TacHit[] = []
    const frame = (now: number): void => {
      const dt = reduce.matches ? 0 : Math.min((now - last) / 1000, 0.05)
      last = now
      t += dt
      scene.update(dt, t)
      // V18.4 聚焦态总控（舰长令）：聚焦下只对聚焦目标悬停/操作——非聚焦星球
      // 从拾取中剔除（无悬停卡/无族高亮变化/光标保持抓取）；点击过滤在 onClickRoot。
      const focusNow = focusWsRef.current
      let hovered: WzEntityRef | null = null
      if (mouseIn) {
        if (mode === 'cmd') {
          hovered = pickAt(mx, my)
        } else {
          const r = root.getBoundingClientRect()
          hovered = scene.pick((mx / Math.max(r.width, 1)) * 2 - 1, -(my / Math.max(r.height, 1)) * 2 + 1) as WzEntityRef | null
        }
        if (focusNow !== null && hovered !== null && hovered.kind === 'planet' && (hovered as WzPlanet).wsPath !== focusNow) hovered = null
      }
      // V18.4：聚焦建立/切换的瞬间，把钉住卡锚点冻结在当下悬停卡的位置
      //（光标 +18/+16）——「悬停卡被固定住」的体感；此后移动缩放镜头锚点不动。
      if (focusNow !== lastFocusWs) {
        lastFocusWs = focusNow
        pinnedAnchor = focusNow !== null ? { x: mx + 18, y: my + 16 } : null
      }
      // V17.4：星球悬停 → 父层高亮相关卡片族（与卡片悬停同路；变化沿才回调）。
      const planetWs = hovered !== null && hovered.kind === 'planet' ? (hovered as WzPlanet).wsPath : null
      if (planetWs !== hoverPlanetWs) {
        hoverPlanetWs = planetWs
        onPlanetHover?.(planetWs)
      }
      // V11.5c：围合中央自由区（灵动岛/任务舱/任务回报舱/命令坞之外）——雷达画进它，
      // V11.5f 起执行卡/名签钳进它（星球投影可能落在坞/舱底下，卡必须可达可点）；
      // V11.5g 起悬停信息卡也钳进它（舰长令：tooltip 不许被调度栏/浮舱遮住）。
      const rw = root.clientWidth, rh = root.clientHeight
      const rect = root.getBoundingClientRect()
      let x0 = 0, y0 = 0, x1 = rect.width, y1 = rect.height
      const isl = document.querySelector('.war-island')
      const tk = document.querySelector('.war-zone.war-tasks')
      const rp = document.querySelector('.war-zone.war-report')
      const dk = document.querySelector('.war-dispatch')
      if (isl !== null) y0 = Math.max(y0, isl.getBoundingClientRect().bottom - rect.top)
      if (tk !== null) x0 = Math.max(x0, tk.getBoundingClientRect().right - rect.left)
      if (rp !== null) x1 = Math.min(x1, rp.getBoundingClientRect().left - rect.left)
      if (dk !== null) y1 = Math.min(y1, dk.getBoundingClientRect().top - rect.top)
      // V18 critique A2：safe 带底部让出 foot（图例/操作行）高度——3D 执行卡
      // 车道避让不再压住最容易被盖的操作教学行。
      const safe = { x: x0, y: y0, w: Math.max(220, x1 - x0), h: Math.max(170, y1 - y0) - (mode === '3d' ? 46 : 0) }
      // 信息卡（内容变化或每 0.5s 刷新——兵力/状态实时变）。
      // V18.3 聚焦态总控（舰长令）：悬停优先，无悬停时回落钉住卡——聚焦星球
      // 的信息卡无需悬停常驻（锚星球投影下方），内嵌战线清单可点击进聚焦页；
      // 退出聚焦（点空/再点同星球）即回到纯悬停行为。
      const tip = tipRef.current
      if (tip !== null) {
        const focusWs = focusWsRef.current
        const hoveredWs = hovered !== null && hovered.kind === 'planet' ? (hovered as WzPlanet).wsPath : null
        const pinnedWs = hovered === null ? focusWs : null
        const tipPlanetWs = hoveredWs ?? pinnedWs
        // 内容键：悬停实体 / 钉住星球；0.5s 实时刷新两态共用。聚焦态入键——
        // 同星悬停下点星球要立刻刷出战线行（否则等 0.5s 定时器）。
        const key = hovered !== null ? hovered.kind + ('id' in hovered ? String(hovered.id) : '') + (hoveredWs !== null && hoveredWs === focusWs ? '#F' : '')
          : tipPlanetWs !== null ? 'pin:' + tipPlanetWs : ''
        if (key !== '') {
          ttTimer -= dt
          if (key !== hoverKey || ttTimer <= 0) {
            hoverKey = key; ttTimer = 0.5
            let html: string
            if (hovered !== null) {
              html = hovered.kind === 'hq' ? buildCard({ kind: 'hq' }, scene) : buildCard(hovered, scene)
              if (hoveredWs !== null && hoveredWs === focusWs) html += frontRowsHtml(hoveredWs, frontsRef.current)
            } else {
              const pin = scene.planets.find(q => q.wsPath === tipPlanetWs)
              html = pin !== undefined ? buildCard(pin, scene) + frontRowsHtml(tipPlanetWs!, frontsRef.current) : ''
            }
            tip.innerHTML = html
          }
          if (tip.innerHTML !== '') {
            tip.style.display = 'block'
            const w = tip.offsetWidth, h = tip.offsetHeight
            let x: number, y: number
            if (hovered !== null) {
              x = mx + 18; y = my + 16
              if (x + w > safe.x + safe.w - 8) x = mx - w - 16
              if (y + h > safe.y + safe.h - 8) y = my - h - 14
            } else {
              // 钉住态（V18.4 舰长令）：锚点=点击聚焦瞬间冻结的屏幕位置（悬停卡
              // 被固定住）——移动/缩放镜头锚点不动，不随星球投影漂移。
              const a = pinnedAnchor
              if (a === null) { tip.style.display = 'none'; hoverKey = '' }
              else { x = a.x; y = a.y }
            }
            if (tip.style.display === 'block') {
              x = Math.min(Math.max(x, safe.x + 8), Math.max(safe.x + 8, safe.x + safe.w - w - 8))
              y = Math.min(Math.max(y, safe.y + 8), Math.max(safe.y + 8, safe.y + safe.h - h - 8))
              tip.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`
              root.style.cursor = hovered !== null ? 'pointer' : 'default'
            }
          } else {
            tip.style.display = 'none'
            root.style.cursor = mode === '3d' ? 'grab' : 'default'
          }
        } else {
          tip.style.display = 'none'
          hoverKey = ''
          root.style.cursor = mode === '3d' ? 'grab' : 'default'
        }
      }
      // V11.5f 高亮集合（板卡悬停/聚焦 ∪ 执行卡悬停/拖拽）——变更时才重建轨迹线
      const hlList = hoverWsRef.current !== null ? [...new Set([...hlWsRef.current, hoverWsRef.current])] : [...hlWsRef.current]
      const hlSet = new Set(hlList)
      const hlKey = hlList.join('|')
      if (hlKey !== hlKeyRef.current) {
        hlKeyRef.current = hlKey
        scene.setHighlight(hlList)
        // V17 管网压暗：高亮族在场 → 星域其余内容 ×0.35（scene 逐帧读；2D 逐帧传入）。
        scene.setDim(hlList.length > 0)
      }
      // 分流渲染
      if (mode === '3d') {
        scene.render()
      } else {
        tac.setLegend(activeCopy().starfield.mapLegend)
        tac.draw(t, scene.planets, scene.squads, hits, safe, hlSet, hlList.length > 0, frontsRef.current)
      }
      // V11.5f 执行卡覆盖层：活体编队卡钉在星球屏幕位 + SVG 连线 + 高亮名签
      const cards = cardsRef.current
      const svg = svgRef.current
      if (cards !== null && svg !== null) {
        const stack = new Map<string, number>()
        const posOf = (ws: string): { x: number; y: number } | null => {
          if (mode === '3d') return scene.planetScreen(ws, rw, rh)
          const hit = hits.find(h => (h.ref as { kind?: string } | null)?.kind === 'planet' && (h.ref as WzPlanet).wsPath === ws)
          return hit === undefined ? null : { x: hit.x, y: hit.y }
        }
        // V16.4 critique P2-2：铭牌带禁区——星球名牌画在行星正下方（sprite 位于
        // -(radius+4.6)），带宽按 19px 目标高近似（30px 字号 × labelH 缩放）。
        // 活动卡群（中心星团尤其密）此前直接压在他星铭牌上——星球名恰在交战处不可读。
        const bands: Array<{ x: number; y: number; w: number; h: number }> = []
        for (const p of scene.planets) {
          const pos = posOf(p.wsPath)
          if (pos === null) continue
          const bw = Math.min(320, p.name.length * 11 + 20)
          bands.push({ x: pos.x - bw / 2, y: pos.y - 28, w: bw, h: 22 })  // V18.6：名签在星球上方，禁区随之上移
        }
        // 两段式落位：先各算基础位（拖过的卡自由摆放不动），再按 DOM 序做车道
        // 避让——横向挪位优先（线端点跟随 cx2/cy2，随时可挪），7 车道占满仍撞
        // 他星铭牌带才上抬。拖过的卡矩形也进禁区（不遮用户手动摆的位）。
        type Placement = { el: HTMLElement; line: SVGLineElement | null; pos: { x: number; y: number }; x: number; y: number; w: number; h: number; dragged: boolean }
        const placements: Placement[] = []
        for (const el of Array.from(cards.querySelectorAll<HTMLElement>('.war-wz-xcard'))) {
          const sid = el.dataset.wzSid ?? ''
          const sq = squadsRef.current.find(q => q.sessionId === sid)
          const line = svg.querySelector<SVGLineElement>(`line[data-wz-sid="${CSS.escape(sid)}"]`)
          if (sq === undefined) continue
          const k = stack.get(sq.wsPath) ?? 0
          stack.set(sq.wsPath, k + 1)
          const pos = posOf(sq.wsPath)
          if (pos === null) { el.style.visibility = 'hidden'; if (line !== null) line.style.visibility = 'hidden'; continue }
          // 未拖动的卡钳进围合安全区（星球投影可能在坞/舱底下——必须可达可点）；
          // V11.5g 2D 态拖过即自由摆放（舰长令），线仍指真实星球位。
          const hw = el.offsetWidth / 2 + 4
          const hh = el.offsetHeight + 6
          let cx2 = Math.min(Math.max(pos.x, safe.x + hw), safe.x + safe.w - hw)
          let cy2 = pos.y - 30 - k * 34
          if (cy2 - hh < safe.y) cy2 = safe.y + hh
          if (cy2 > safe.y + safe.h - 4) cy2 = safe.y + safe.h - 4
          const off = mode === 'cmd' ? cardOffRef.current.get(sid) : undefined
          if (off !== undefined) { cx2 += off.dx; cy2 += off.dy }
          placements.push({ el, line, pos, x: cx2, y: cy2, w: el.offsetWidth, h: el.offsetHeight, dragged: off !== undefined })
        }
        const hitsRect = (r: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }): boolean =>
          r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h
        const cardRect = (p: Placement, x: number, y: number): { x: number; y: number; w: number; h: number } =>
          ({ x: x - p.w / 2 - 4, y: y - 6 - p.h, w: p.w + 8, h: p.h + 6 })
        for (const pl of placements) {
          if (!pl.dragged) {
            const taken: Array<{ x: number; y: number; w: number; h: number }> = [...bands]
            for (const other of placements) {
              if (other === pl) continue
              taken.push(cardRect(other, other.x, other.y))
            }
            let picked = false
            for (const lane of [0, 1, -1, 2, -2, 3, -3]) {
              const nx = Math.min(Math.max(pl.pos.x + lane * (pl.w + 12), safe.x + pl.w / 2 + 4), safe.x + safe.w - pl.w / 2 - 4)
              if (lane !== 0 && Math.abs(nx - pl.pos.x) < Math.abs(lane) * (pl.w + 12) - 1) break // 钳边后车道重合，再扫也是撞
              if (!taken.some(o => hitsRect(cardRect(pl, nx, pl.y), o))) { pl.x = nx; picked = true; break }
            }
            if (!picked) {
              // 车道占满仍撞铭牌带：上抬到最高碰撞带的顶上（线仍指真实星球位）
              const r = cardRect(pl, pl.x, pl.y)
              const topHit = Math.min(...taken.filter(o => hitsRect(r, o)).map(o => o.y), pl.y)
              if (topHit < pl.y) pl.y = topHit - 6
            }
          }
          pl.el.style.visibility = ''
          pl.el.style.transform = `translate(-50%,-100%) translate(${pl.x.toFixed(1)}px,${(pl.y - 6).toFixed(1)}px)`
          if (pl.line !== null) {
            pl.line.style.visibility = ''
            pl.line.setAttribute('x1', String(pl.pos.x))
            pl.line.setAttribute('y1', String(pl.pos.y))
            pl.line.setAttribute('x2', String(pl.x))
            pl.line.setAttribute('y2', String(pl.y))
          }
        }
        // V18.7：高亮名签（war-wz-pname）退役——常驻弧形铭文恒显星球名，
        // 高亮的增量表达（压暗+轨迹线+卡片高亮）不依赖名签。
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // 尺寸随动（容器级）
    const ro = new ResizeObserver(() => {
      scene.resize(root.clientWidth, root.clientHeight)
      tac.resize(root.clientWidth, root.clientHeight)
    })
    ro.observe(root)
    tac.resize(root.clientWidth, root.clientHeight)
    // 调试句柄（探针断言用）+ V17 管网弦锚投影出口（PipeOverlay 经此取 HQ/星球屏幕位
    // ——2D 态 hits 是帧产物，读帧环最后一帧的缓存；坐标相对星域根，overlay 侧再对板差）。
    ;(window as unknown as Record<string, unknown>).__wz = {
      scene, mode: () => mode, setMode,
      hitList: (): Array<{ x: number; y: number; r: number }> => hits.map(h => ({ x: h.x, y: h.y, r: h.r })),
      planetScreen: (ws: string): { x: number; y: number } | null => {
        if (mode === '3d') return scene.planetScreen(ws, root.clientWidth, root.clientHeight)
        const h = hits.find(q => (q.ref as { wsPath?: string }).wsPath === ws)
        return h === undefined ? null : { x: h.x, y: h.y }
      },
      hqScreen: (): { x: number; y: number } | null =>
        mode === '3d' ? scene.hqScreen(root.clientWidth, root.clientHeight) : tac.hqPoint(),
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      themeObs.disconnect()
      root.removeEventListener('mousemove', onMove)
      root.removeEventListener('mouseleave', onLeave)
      root.removeEventListener('contextmenu', onCtx)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', onPointerUp)
      root.removeEventListener('pointercancel', onPointerUp)
      root.removeEventListener('mousedown', onMouseDownCam)
      root.removeEventListener('dblclick', onDbl)
      root.removeEventListener('pointerdown', onDownDist)
      root.removeEventListener('pointermove', onMoveDist)
      root.removeEventListener('click', onClickRoot)
      cardsEl?.removeEventListener('pointerdown', onCardDown)
      cardsEl?.removeEventListener('pointermove', onCardMove)
      cardsEl?.removeEventListener('pointerup', onCardUp)
      cardsEl?.removeEventListener('pointercancel', onCardUp)
      cardsEl?.removeEventListener('click', onCardClickCap, true)
      tipEl?.removeEventListener('click', onTipClick)
      window.removeEventListener('keydown', onKey)
      for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-wz-mode]'))) b.removeEventListener('click', onBtn)
      applyMode('3d')
      sceneRef.current = null
      delete (window as unknown as Record<string, unknown>).__wz
      scene.dispose()
    }
    // onUnavailable 属失败回调闭包，不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 数据面：板真值 → 引擎（星球谱/编队谱/日志/HQ 出航/战线航迹）+ 覆盖层引用。
  useEffect(() => {
    squadsRef.current = squads
    hlWsRef.current = highlightWs
    focusWsRef.current = focusWs
    frontsRef.current = fronts
    sceneRef.current?.syncBoard({ active, planets, squads, log, fronts })
  }, [active, planets, squads, log, fronts, highlightWs, focusWs])

  if (failed) return null
  return createElement('div', {
    ref: rootRef,
    className: 'war-starfield war-starfield3d war-wz',
    'data-war-view': 'map', 'data-war-3d': '1',
    role: 'group',
    'aria-label': ariaLabel,
  },
    createElement('canvas', { ref: c3dRef, className: 'war-wz-3d', 'aria-hidden': 'true' }),
    createElement('canvas', { ref: c2dRef, className: 'war-wz-tac', 'aria-hidden': 'true' }),
    createElement('div', { className: 'war-wz-vig', 'aria-hidden': 'true' }),
    // V11.5f 执行中卡片覆盖层：卡钉星球屏位 + SVG 连线 + 高亮名签（frame 循环摆位），
    // 点击跳源命令、悬停/聚焦联动星球高亮。
    createElement('svg', { ref: svgRef, className: 'war-wz-lines', 'aria-hidden': 'true' },
      ...squads.filter(s => s.live).map(s => createElement('line', { key: s.sessionId, 'data-wz-sid': s.sessionId, className: 'war-wz-xline' }))),
    createElement('div', { ref: cardsRef, className: 'war-wz-cards' },
      ...squads.filter(s => s.live).map(s => createElement('button', {
        key: s.sessionId, type: 'button', className: 'war-wz-xcard', 'data-wz-sid': s.sessionId,
        title: `${s.wsPath} · ${s.verb ?? orbIdleLabel}`,
        'aria-label': `${activeCopy().starfield.xcardPrefix}${s.verb ?? orbIdleLabel}${s.sourceLabel !== null ? `（${s.sourceLabel}）` : ''}，点击查看源命令`,
        onMouseEnter: () => { hoverWsRef.current = s.wsPath },
        onMouseLeave: () => { hoverWsRef.current = null },
        onFocus: () => { hoverWsRef.current = s.wsPath },
        onBlur: () => { hoverWsRef.current = null },
        onClick: () => { if (s.sourceCommandId !== null) onOpenCommand?.(s.sourceCommandId) },
      },
        createElement('span', { className: 'war-wz-xdot' }),
        createElement('span', { className: 'war-wz-xverb' }, s.verb ?? orbIdleLabel),
        s.sourceLabel !== null ? createElement('span', { className: 'war-wz-xsrc' }, s.sourceLabel) : null))),
    createElement('div', { className: 'war-wz-toggle', role: 'group', 'aria-label': activeCopy().starfield.toggleAria },
      createElement('button', { type: 'button', 'data-wz-mode': '3d', className: cmd ? '' : 'on' }, activeCopy().starfield.toggle3d),
      createElement('button', { type: 'button', 'data-wz-mode': 'cmd', className: cmd ? 'on' : '' }, activeCopy().starfield.toggle2d)),
    createElement('div', { className: 'war-wz-foot', 'aria-hidden': 'true' },
        createElement('div', { className: 'war-wz-foot-stat' }, activeCopy().starfield.footStat(squads.filter(q => q.live).length, planets.length, fronts.length)),  /* V16.4-R3 critique P2-3：中列失名——雷达常驻状态铭牌 */
      createElement('div', { className: 'war-wz-legend' },
        createElement('span', null, createElement('i', { className: 'lg-wait' }), activeCopy().starfield.legendWait),
        createElement('span', null, createElement('i', { className: 'lg-battle' }), activeCopy().starfield.legendBattle),
        createElement('span', null, createElement('i', { className: 'lg-held' }), activeCopy().starfield.legendHeld),
        createElement('span', null, createElement('i', { className: 'lg-hl' }), activeCopy().starfield.legendHl),
        createElement('span', null, createElement('i', { className: 'lg-front' }), activeCopy().starfield.legendFront)),
      createElement('div', { className: 'war-wz-hint' }, cmd
        ? activeCopy().starfield.hintCmd
        : activeCopy().starfield.hint3d)),
    createElement('div', { ref: tipRef, className: 'war-wz-tip' }),
    // V16.4-R2 critique P2：键盘镜像——行星→战线此前纯指针可达（canvas 拾取）。
    // 视觉隐藏的星球按钮列（Tab 顺序=轨道序，focus-visible 时显形）补齐键盘路径。
    // V18.3：bfpanel 退役——键盘直达改走与点击同路的粘性聚焦（钉住卡内嵌战线）。
    createElement('div', { className: 'war-wz-kbplanets', role: 'group', 'aria-label': activeCopy().starfield.kbGroupAria },
      ...planets.map(pl => {
        // V16.4-R8 critique B：桥接星球无 name 字段——此前渲染字面 undefined（B8 实证）；
        // 名取目录名，状态词走词典（一词一面）。
        const sf = activeCopy().starfield
        const stText = pl.status === '待进攻' ? sf.wzStWait : pl.status === '执行中' ? sf.wzStBattle : sf.wzStHeld
        return createElement('button', {
          key: pl.wsPath, type: 'button', className: 'war-wz-kbplanet',
          'data-wz-kb-ws': pl.wsPath,
          onClick: () => { onPlanetClick?.(pl.wsPath) },
        }, `${dirLabel(pl.wsPath)}（${stText}${pl.failing > 0 ? activeCopy().starfield.failSuffix(pl.failing) : ''}）`)
      })),
    /* V18.3：bfpanel 战线弹窗退役——战线清单并入聚焦态钉住悬停卡（frontRowsHtml） */
  )
}
