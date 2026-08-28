/**
 * V11.4 星域=warzone demo 整体进驻（元首令「完全一比一」）。本组件只是挂载壳：
 * 3D 引擎与 2D 指挥室全在 warzone-scene.ts（demo 全要素 1:1）；壳负责——容器内
 * 鼠标追踪与拾取（3D 射线 / 2D 邻近）、悬停信息卡（HQ/星球/编队三卡，0.5s 实时
 * 刷新）、3D 视图/2D 视图切换（按钮+V 键，输入态守卫）、尺寸随动、WebGL
 * 失败回落 2D 星域（底线保留）、调试句柄 window.__wz（探针断言用）。
 * V11.5 起板真值驱动（星球=workspace/编队=执行会话/日志=真实事件）；V11.5f 增
 * 执行卡覆盖层（卡钉星球屏位+连线，点击跳源命令）与悬停/聚焦→星球高亮联动。
 * @module dsh-plugin-warroom/client/starfield3d
 */
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { hqStats, WarzoneScene, WarzoneTactical, type TacHit, type WzBridgePlanet, type WzBridgeSquad, type WzFrontNode, type WzLogEntry, type WzPlanet, type WzSquad } from './warzone-scene.ts'
import type { WzBridgeFrontLite } from './front.ts'

type WzEntityRef = { kind: 'hq' } | WzPlanet | WzSquad | WzFrontNode

const statusChip = (st: string): string =>
  `<span class="war-wz-chip ${st === '待进攻' ? 'st-wait' : st === '作战中' ? 'st-battle' : 'st-held'}">${st}</span>`

/** 信息卡（三卡结构承 demo，字段全为板面真值）。 */
function buildCard(ent: WzEntityRef, scene: WarzoneScene): string {
  if (ent.kind === 'hq') {
    const st = hqStats(scene.planets, scene.squads)
    return `<div class="tt-head"><span class="dot"></span>
      <span class="tt-name">HEADQUARTERS</span><span class="tt-tag">元首 · 指挥中枢</span></div>
      <div class="tt-desc">作战室旗舰「太空总部」——你的全部战场与执行编队由此投送调度。</div>
      <div class="tt-row"><span>战场</span><b>${scene.planets.length} 个</b></div>
      <div class="tt-row"><span>起飞编队</span><b>${st.inbound} 支</b></div>
      <div class="tt-row"><span>执行中编队</span><b>${st.battle} 支</b></div>
      <div class="tt-row"><span>驻泊编队</span><b>${st.deployed} 支</b></div>
      <div class="tt-row"><span>活跃会话</span><b>${st.ships} 个</b></div>
      <div class="tt-row"><span>累计凯旋</span><b>${st.garrison} 仗</b></div>`
  }
  if (ent.kind === 'front') {
    const state = ent.live ? '推进中' : '已收官'
    return `<div class="tt-head"><span class="dot chain war-chain-hue-${ent.hueSlot}"></span>
      <span class="tt-name">战线 · ${ent.gens} 代</span><span class="tt-tag">${state}</span></div>
      <div class="tt-desc">${ent.label}</div>
      <div class="tt-row"><span>世代</span><b>${ent.gens} 代</b></div>
      <div class="tt-row"><span>世代环</span><b class="tt-emph">点击查看这条战线</b></div>`
  }
  if (ent.kind === 'planet') {
    const clsName = ent.cls === 'large' ? '主力战场' : ent.cls === 'medium' ? '活跃战场' : '前沿战场'
    return `<div class="tt-head"><span class="dot" style="background:#${ent.baseGlow.getHexString()}"></span>
      <span class="tt-name">${ent.name}</span><span class="tt-tag">${clsName}</span></div>
      <div class="tt-desc">workspace 战场 · ${ent.wsPath}</div>
      <div class="tt-row"><span>战场等级</span><b>LV.${ent.level} · ${clsName}</b></div>
      <div class="tt-row"><span>活跃会话</span><b>${scene.squads.filter(q => q.target === ent && q.phase !== 'return').length} 个</b></div>
      <div class="tt-row"><span>待发命令</span><b>${ent.inbound} 条</b></div>
      <div class="tt-row"><span>凯旋 / 败</span><b>${ent.garrison} / ${ent.failing}</b></div>
      <div class="tt-row"><span>作战状态</span>${statusChip(ent.status)}</div>`
  }
  const s = ent as WzSquad
  const tgt = s.phase === 'return' ? '返航 → 母舰' : s.target.name
  const stTxt = s.phase === 'outbound' ? `出击 · 进度 ${Math.min(99, s.t * 100) | 0}%`
    : s.phase === 'battle' ? `执行中 · ${s.verb ?? '工作中'}`
    : s.phase === 'deployed' ? (s.paused ? '配额暂停 · 待命' : '待验收 · 驻泊巡护')
    : s.phase === 'holding' ? '集结 · 待起跑'
    : `返航 · 进度 ${Math.min(99, s.t * 100) | 0}%`
  return `<div class="tt-head"><span class="dot warm"></span>
    <span class="tt-name">${s.cname}</span><span class="tt-tag">执行编队 ${s.code}</span></div>
    <div class="tt-desc">执行会话 ${s.sessionId ?? ''}</div>
    <div class="tt-row"><span>源命令</span><b>${s.sourceLabel ?? '未溯源'}</b></div>
    <div class="tt-row"><span>目标战场</span><b>${tgt}</b></div>
    <div class="tt-row"><span>行军状态</span><b class="tt-emph">${stTxt}</b></div>`
}

export interface WarzoneProps {
  readonly ariaLabel: string
  /** V11.5 连线：板面真值（HQ 战时/星球谱/编队谱/日志）驱动引擎。 */
  readonly active: boolean
  readonly planets: ReadonlyArray<WzBridgePlanet>
  readonly squads: ReadonlyArray<WzBridgeSquad>
  readonly log: ReadonlyArray<WzLogEntry>
  /** V13 战线航迹：每条战线一条链色管道串起各代战场（含未分组键）。 */
  readonly fronts: ReadonlyArray<WzBridgeFrontLite>
  /** V11.5f：悬停/聚焦命令卡 → 高亮对应战区（星球名+HQ↔星球轨迹）。 */
  readonly highlightWs: ReadonlyArray<string>
  /** 执行卡点击 → 跳源命令聚焦页。 */
  readonly onOpenCommand?: (commandId: string) => void
  /** 执行卡动词兜底。 */
  readonly orbIdleLabel: string
  /** WebGL 不可用/初始化失败：父级整棵回落 2D 星域（底线）。 */
  readonly onUnavailable: () => void
}

export function Warzone(props: WarzoneProps): ReactNode {
  const { ariaLabel, active, planets, squads, log, fronts, highlightWs, onOpenCommand, orbIdleLabel, onUnavailable } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const c3dRef = useRef<HTMLCanvasElement | null>(null)
  const c2dRef = useRef<HTMLCanvasElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<WarzoneScene | null>(null)
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const nameRef = useRef<HTMLDivElement | null>(null)
  const squadsRef = useRef(squads)
  const hlWsRef = useRef(highlightWs)
  const hoverWsRef = useRef<string | null>(null)
  const hlKeyRef = useRef('')
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
    // V12（元首令·浅色范式=天空）：主题热切换——body[data-ds-dark-theme] 由宿主
    // theme-presenter 持有，MutationObserver 监听翻转（深空↔天空双皮即时生效）。
    const themeOf = (): boolean => document.body.hasAttribute('data-ds-dark-theme')
    const applyThemes = (): void => { const d = themeOf(); scene.setTheme(d); tac.setTheme(d) }
    applyThemes()
    const themeObs = new MutationObserver(applyThemes)
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    // V11.5 值班默认态=雷达（元首定：雷达值班+3D 战略）——V 键/按钮双向切换。
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
    // V11.5b 三键相机（元首定，仅 3D 态）：左键平移（即时跟手）/ 中键旋转（阻尼，
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
    const onClickRoot = (e: MouseEvent): void => {
      if (dragDist > 6) return
      if ((e.target as HTMLElement).closest('button') !== null) return
      const hit = scene.pick((e.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1, -((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1)
      if (hit !== null && hit.kind === 'front') onOpenCommand?.((hit as WzFrontNode).rootCommandId)
    }
    const rect = { get left() { return root.getBoundingClientRect().left }, get top() { return root.getBoundingClientRect().top }, get width() { return root.clientWidth }, get height() { return root.clientHeight } }
    const onMouseDownCam = (e: MouseEvent): void => { if (e.button === 1) e.preventDefault() }
    const onDbl = (): void => { if (mode === '3d') scene.resetCam() }
    // V11.5g（元首令）：2D 态执行卡可自由拖放——委托在卡容器上（React 重渲染不丢
    // 手柄），只记 offset；卡位=安全区锚+offset，实线索引线永连星球。拖拽期间点亮
    // 该战区高亮（与悬停同路）。3D 态卡钉星球投影不可拖（手势让位相机）。
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
    let ttTimer = 0
    const hits: TacHit[] = []
    const frame = (now: number): void => {
      const dt = reduce.matches ? 0 : Math.min((now - last) / 1000, 0.05)
      last = now
      t += dt
      scene.update(dt, t)
      // 悬停拾取
      let hovered: WzEntityRef | null = null
      if (mouseIn) {
        if (mode === 'cmd') {
          let best: WzEntityRef | null = null
          let bd = 1e9
          for (const h of hits) {
            const d = Math.hypot(h.x - mx, h.y - my)
            if (d < h.r + 6 && d < bd) { bd = d; best = h.ref as WzEntityRef }
          }
          hovered = best
        } else {
          const r = root.getBoundingClientRect()
          hovered = scene.pick((mx / Math.max(r.width, 1)) * 2 - 1, -(my / Math.max(r.height, 1)) * 2 + 1) as WzEntityRef | null
        }
      }
      // V11.5c：围合中央自由区（灵动岛/任务舱/战报舱/命令坞之外）——雷达画进它，
      // V11.5f 起执行卡/名签钳进它（星球投影可能落在坞/舱底下，卡必须可达可点）；
      // V11.5g 起悬停信息卡也钳进它（元首令：tooltip 不许被调度栏/浮舱遮住）。
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
      const safe = { x: x0, y: y0, w: Math.max(220, x1 - x0), h: Math.max(170, y1 - y0) }
      // 信息卡（内容变化或每 0.5s 刷新——兵力/状态实时变）
      const tip = tipRef.current
      if (tip !== null) {
        const key = hovered ? hovered.kind + ('id' in hovered ? String(hovered.id) : '') : ''
        if (hovered !== null && tip !== null) {
          ttTimer -= dt
          if (key !== hoverKey || ttTimer <= 0) {
            hoverKey = key; ttTimer = 0.5
            tip.innerHTML = hovered.kind === 'hq' ? buildCard({ kind: 'hq' }, scene) : buildCard(hovered, scene)
          }
          tip.style.display = 'block'
          const w = tip.offsetWidth, h = tip.offsetHeight
          let x = mx + 18, y = my + 16
          if (x + w > safe.x + safe.w - 8) x = mx - w - 16
          if (y + h > safe.y + safe.h - 8) y = my - h - 14
          x = Math.min(Math.max(x, safe.x + 8), Math.max(safe.x + 8, safe.x + safe.w - w - 8))
          y = Math.min(Math.max(y, safe.y + 8), Math.max(safe.y + 8, safe.y + safe.h - h - 8))
          tip.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`
          root.style.cursor = 'pointer'
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
      }
      // 分流渲染
      if (mode === '3d') {
        scene.render()
      } else {
        tac.draw(t, scene.planets, scene.squads, hits, safe, hlSet)
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
          // V11.5g 2D 态拖过即自由摆放（元首令），线仍指真实星球位。
          const hw = el.offsetWidth / 2 + 4
          const hh = el.offsetHeight + 6
          let cx2 = Math.min(Math.max(pos.x, safe.x + hw), safe.x + safe.w - hw)
          let cy2 = pos.y - 30 - k * 34
          if (cy2 - hh < safe.y) cy2 = safe.y + hh
          if (cy2 > safe.y + safe.h - 4) cy2 = safe.y + safe.h - 4
          const off = mode === 'cmd' ? cardOffRef.current.get(sid) : undefined
          if (off !== undefined) { cx2 += off.dx; cy2 += off.dy }
          el.style.visibility = ''
          el.style.transform = `translate(-50%,-100%) translate(${cx2.toFixed(1)}px,${(cy2 - 6).toFixed(1)}px)`
          if (line !== null) {
            line.style.visibility = ''
            line.setAttribute('x1', String(pos.x))
            line.setAttribute('y1', String(pos.y))
            line.setAttribute('x2', String(cx2))
            line.setAttribute('y2', String(cy2))
          }
        }
        // 高亮名签：第一颗高亮星球上方（同样钳进安全区）
        const nameEl = nameRef.current
        if (nameEl !== null) {
          const firstWs = hlList[0]
          const pos = firstWs !== undefined ? posOf(firstWs) : null
          if (pos !== null) {
            const p = scene.planets.find(q => q.wsPath === firstWs)
            nameEl.textContent = p?.name ?? ''
            const nhw = nameEl.offsetWidth / 2 + 4
            const nx = Math.min(Math.max(pos.x, safe.x + nhw), safe.x + safe.w - nhw)
            const ny = Math.min(pos.y + 16, safe.y + safe.h - 26)
            nameEl.style.visibility = ''
            nameEl.style.transform = `translate(-50%,0) translate(${nx.toFixed(1)}px,${ny.toFixed(1)}px)`
          } else {
            nameEl.style.visibility = 'hidden'
          }
        }
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
    // 调试句柄（探针断言用）
    ;(window as unknown as Record<string, unknown>).__wz = {
      scene, mode: () => mode, setMode,
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

  // 数据面：板真值 → 引擎（星球谱/编队谱/日志/HQ 战时/战线航迹）+ 覆盖层引用。
  useEffect(() => {
    squadsRef.current = squads
    hlWsRef.current = highlightWs
    sceneRef.current?.syncBoard({ active, planets, squads, log, fronts })
  }, [active, planets, squads, log, fronts, highlightWs])

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
        'aria-label': `执行中：${s.verb ?? orbIdleLabel}${s.sourceLabel !== null ? `（${s.sourceLabel}）` : ''}，点击查看源命令`,
        onMouseEnter: () => { hoverWsRef.current = s.wsPath },
        onMouseLeave: () => { hoverWsRef.current = null },
        onFocus: () => { hoverWsRef.current = s.wsPath },
        onBlur: () => { hoverWsRef.current = null },
        onClick: () => { if (s.sourceCommandId !== null) onOpenCommand?.(s.sourceCommandId) },
      },
        createElement('span', { className: 'war-wz-xdot' }),
        createElement('span', { className: 'war-wz-xverb' }, s.verb ?? orbIdleLabel),
        s.sourceLabel !== null ? createElement('span', { className: 'war-wz-xsrc' }, s.sourceLabel) : null))),
    createElement('div', { ref: nameRef, className: 'war-wz-pname', 'aria-hidden': 'true' }),
    createElement('div', { className: 'war-wz-toggle', role: 'group', 'aria-label': '视图切换' },
      createElement('button', { type: 'button', 'data-wz-mode': '3d', className: cmd ? '' : 'on' }, '3D 视图'),
      createElement('button', { type: 'button', 'data-wz-mode': 'cmd', className: cmd ? 'on' : '' }, '2D 视图')),
    createElement('div', { className: 'war-wz-foot', 'aria-hidden': 'true' },
      createElement('div', { className: 'war-wz-legend' },
        createElement('span', null, createElement('i', { className: 'lg-wait' }), '待进攻'),
        createElement('span', null, createElement('i', { className: 'lg-battle' }), '作战中'),
        createElement('span', null, createElement('i', { className: 'lg-held' }), '已占领'),
        createElement('span', null, createElement('i', { className: 'lg-hl' }), '聚焦轨迹'),
        createElement('span', null, createElement('i', { className: 'lg-front' }), '战线环（点=世代·同色=同血脉）')),
      createElement('div', { className: 'war-wz-hint' }, '左键 平移 · 中键 旋转 · 滚轮 缩放 · 双击/R 复位 · V 切换视图 · M 回列表')),
    createElement('div', { ref: tipRef, className: 'war-wz-tip' }),
  )
}
