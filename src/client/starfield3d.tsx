/**
 * V11.4 星域=warzone demo 整体进驻（元首令「完全一比一」）。本组件只是挂载壳：
 * 3D 引擎与 2D 指挥室全在 warzone-scene.ts（demo 全要素 1:1）；壳负责——容器内
 * 鼠标追踪与拾取（3D 射线 / 2D 邻近）、悬停信息卡（HQ/星球/编队三卡，0.5s 实时
 * 刷新）、◉ 现实视图/▤ 指挥室切换（按钮+V 键，输入态守卫）、尺寸随动、WebGL
 * 失败回落 2D 星域（底线保留）、调试句柄 window.__wz（探针断言用）。
 * 板数据（workspace/attempts→星球/编队）的连线是下一阶段；当前世界为 demo 自驱。
 * @module dsh-plugin-warroom/client/starfield3d
 */
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { hqStats, WarzoneScene, WarzoneTactical, type TacHit, type WzBridgePlanet, type WzBridgeSquad, type WzLogEntry, type WzPlanet, type WzSquad } from './warzone-scene.ts'

type WzEntityRef = { kind: 'hq' } | WzPlanet | WzSquad

const statusChip = (st: string): string =>
  `<span class="war-wz-chip ${st === '待进攻' ? 'st-wait' : st === '作战中' ? 'st-battle' : 'st-held'}">${st}</span>`

/** 信息卡（三卡结构承 demo，字段全为板面真值）。 */
function buildCard(ent: WzEntityRef, scene: WarzoneScene): string {
  if (ent.kind === 'hq') {
    const st = hqStats(scene.planets, scene.squads)
    return `<div class="tt-head"><span class="dot" style="background:#6fe3ff"></span>
      <span class="tt-name">HEADQUARTERS</span><span class="tt-tag">元首 · 指挥中枢</span></div>
      <div class="tt-desc">作战室旗舰「太空总部」——你的全部战区与执行编队由此投送调度。</div>
      <div class="tt-row"><span>战区</span><b>${scene.planets.length} 个</b></div>
      <div class="tt-row"><span>起飞编队</span><b>${st.inbound} 支</b></div>
      <div class="tt-row"><span>执行中编队</span><b>${st.battle} 支</b></div>
      <div class="tt-row"><span>驻泊编队</span><b>${st.deployed} 支</b></div>
      <div class="tt-row"><span>活跃会话</span><b>${st.ships} 个</b></div>
      <div class="tt-row"><span>累计凯旋</span><b>${st.garrison} 仗</b></div>`
  }
  if (ent.kind === 'planet') {
    const clsName = ent.cls === 'large' ? '主力战区' : ent.cls === 'medium' ? '活跃战区' : '前沿战区'
    return `<div class="tt-head"><span class="dot" style="background:#${ent.baseGlow.getHexString()}"></span>
      <span class="tt-name">${ent.name}</span><span class="tt-tag">${clsName}</span></div>
      <div class="tt-desc">workspace 战区 · ${ent.wsPath}</div>
      <div class="tt-row"><span>战区等级</span><b>LV.${ent.level} · ${clsName}</b></div>
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
  return `<div class="tt-head"><span class="dot" style="background:#ffb35c"></span>
    <span class="tt-name">${s.cname}</span><span class="tt-tag">执行编队 ${s.code}</span></div>
    <div class="tt-desc">执行会话 ${s.sessionId ?? ''}</div>
    <div class="tt-row"><span>源命令</span><b>${s.sourceLabel ?? '未溯源'}</b></div>
    <div class="tt-row"><span>目标战区</span><b>${tgt}</b></div>
    <div class="tt-row"><span>行军状态</span><b style="color:#ffc98a">${stTxt}</b></div>`
}

export interface WarzoneProps {
  readonly ariaLabel: string
  /** V11.5 连线：板面真值（HQ 战时/星球谱/编队谱/日志）驱动引擎。 */
  readonly active: boolean
  readonly planets: ReadonlyArray<WzBridgePlanet>
  readonly squads: ReadonlyArray<WzBridgeSquad>
  readonly log: ReadonlyArray<WzLogEntry>
  /** WebGL 不可用/初始化失败：父级整棵回落 2D 星域（底线）。 */
  readonly onUnavailable: () => void
}

export function Warzone(props: WarzoneProps): ReactNode {
  const { ariaLabel, active, planets, squads, log, onUnavailable } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const c3dRef = useRef<HTMLCanvasElement | null>(null)
  const c2dRef = useRef<HTMLCanvasElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<WarzoneScene | null>(null)
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
      if (e.key !== 'v' && e.key !== 'V') return
      const t = e.target as HTMLElement | null
      if (t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      toggle()
    }
    const onBtn = (e: Event): void => {
      const m = (e.currentTarget as HTMLElement).dataset.wzMode
      if (m === '3d' || m === 'cmd') setMode(m)
    }
    const onWheel = (e: WheelEvent): void => { if (mode === 'cmd') tac.zoomBy(e.deltaY) }
    root.addEventListener('mousemove', onMove)
    root.addEventListener('mouseleave', onLeave)
    root.addEventListener('contextmenu', onCtx)
    root.addEventListener('wheel', onWheel, { passive: true })
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
      if (mode === '3d') scene.controls.update()
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
          if (x + w > root.clientWidth - 10) x = mx - w - 16
          if (y + h > root.clientHeight - 10) y = my - h - 14
          tip.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, y)}px)`
          root.style.cursor = 'pointer'
        } else {
          tip.style.display = 'none'
          hoverKey = ''
          root.style.cursor = mode === '3d' ? 'grab' : 'default'
        }
      }
      // 分流渲染
      if (mode === '3d') {
        scene.render()
      } else {
        tac.draw(t, dt, scene.planets, scene.squads, scene.log, hits)
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
      root.removeEventListener('mousemove', onMove)
      root.removeEventListener('mouseleave', onLeave)
      root.removeEventListener('contextmenu', onCtx)
      root.removeEventListener('wheel', onWheel)
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

  // 数据面：板真值 → 引擎（星球谱/编队谱/日志/HQ 战时）。
  useEffect(() => {
    sceneRef.current?.syncBoard({ active, planets, squads, log })
  }, [active, planets, squads, log])

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
    createElement('div', { className: 'war-wz-hud', 'aria-hidden': 'true' },
      createElement('h1', null, 'DEEP SPACE WARZONE'),
      createElement('p', null, '深空战区 · 第六舰队作战态势图')),
    createElement('div', { className: 'war-wz-toggle', role: 'group', 'aria-label': '视图切换' },
      createElement('button', { type: 'button', 'data-wz-mode': '3d', className: cmd ? '' : 'on' }, '◉ 现实视图'),
      createElement('button', { type: 'button', 'data-wz-mode': 'cmd', className: cmd ? 'on' : '' }, '▤ 指挥室')),
    createElement('div', { className: 'war-wz-foot', 'aria-hidden': 'true' },
      createElement('div', { className: 'war-wz-legend' },
        createElement('span', null, createElement('i', { style: { background: '#ffc24d' } }), '待进攻'),
        createElement('span', null, createElement('i', { style: { background: '#ff6a55' } }), '作战中'),
        createElement('span', null, createElement('i', { style: { background: '#66d4ff' } }), '已占领')),
      createElement('div', { className: 'war-wz-hint' }, '左键拖拽 旋转视角 · 滚轮 缩放远近 · 悬停单位 查看详情 · V 切换指挥室')),
    createElement('div', { ref: tipRef, className: 'war-wz-tip' }),
  )
}
