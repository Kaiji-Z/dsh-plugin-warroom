/**
 * V17 族系管网连线（舰长令：推翻 V7「零几何」定案）——板级 SVG overlay。
 * 水电管网隐喻：竖干走列间 gutter/板外缘管井，横支不穿卡体，圆角弯头；
 * 管色=战线链色（--chain-hue 八相）。淡管常显（12%）+ hover 增强（该族 100%
 * + 流动动画，其余压 5%）。方向性=生命条的横向展开：流动只跑到 now 段。
 * map 态（SPEC §B）：命令卡 → 任务舱 → HQ → 出航弦→星球 → 返航弦→HQ → 回报舱
 * ——弦段为直线（星域弦线语言），HQ/星球屏幕位经 __wz 投影出口取（2D=盘心/hits，
 * 3D=相机投影）；交接锚=任务舱右缘（朝 HQ 一侧）。
 * @module dsh-plugin-warroom/client/pipe-overlay
 */

import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'

export interface PipeStop {
  kind: 'cmd' | 'task' | 'exec' | 'report'
  /** 对应卡的 DOM 锚值。 */
  id: string
  /** task 站的成形卡变体：锚属性是 data-pipe-forming（任务书未落地的占位卡）。 */
  forming?: boolean
}

export interface PipeFamily {
  rootId: string
  hueSlot: number
  stops: PipeStop[]
  /** 生命条 now 段索引（0=命令 1=任务 2=执行 3=回报）。 */
  stage: number
  /** V17 map 态弦锚：战线绑定的星球 wsKey（首代任务工作区）——经 __wz 投影取屏幕位。 */
  wsKey?: string | null
}

const attrOf = (stop: PipeStop): string =>
  stop.forming === true ? 'data-pipe-forming'
    : stop.kind === 'cmd' ? 'data-pipe-cmd'
      : stop.kind === 'task' ? 'data-pipe-task'
        : 'data-pipe-sess'

interface Pt { x: number; y: number }

/** __wz 投影出口形状（starfield3d 挂载；map 态才有）。 */
interface WzProjector {
  planetScreen?: (ws: string) => Pt | null
  hqScreen?: () => Pt | null
}

function edgePort(el: Element, side: 'top' | 'left' | 'right', box: DOMRect, dy = 0): Pt | null {
  let r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  // 滚动容器裁剪：滚出列体的卡 rect 仍报全长位置——管只连「看得见」的卡，
  // 裁到不可见（空交）=站台缺席，跳过该站（不许拖一条死管穿坞而过）。
  let n = el.parentElement
  while (n !== null && n !== document.body) {
    const o = n.style.overflowY !== '' ? n.style.overflowY : getComputedStyle(n).overflowY
    if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
      const c = n.getBoundingClientRect()
      const top = Math.max(r.top, c.top)
      const bottom = Math.min(r.bottom, c.bottom)
      const left = Math.max(r.left, c.left)
      const right = Math.min(r.right, c.right)
      r = { top, bottom, left, right, width: right - left, height: bottom - top } as DOMRect
    }
    n = n.parentElement
  }
  if (r.width <= 0 || r.height <= 0) return null
  // 视界检查：视口外的站按缺席处理。
  const x = r.left - box.left
  const y = r.top - box.top
  const px = side === 'left' ? x : side === 'right' ? x + r.width : x + r.width / 2
  const py = (side === 'top' ? y : y + r.height / 2) + dy
  // 远出界（滚出列体可视区/视口外）按缺席处理；近界（±60px，布局瞬间的边缘锚）
  // 钳进板内——管不许画出板外（先算端口再钳：钳边再加半卡高会二次出界）。
  if (py < -60 || py > box.height + 60 || px < -60 || px > box.width + 60) return null
  return { x: Math.min(Math.max(px, 1), box.width - 1), y: Math.min(Math.max(py, 1), box.height - 1) }
}

/** 正交折线 → 圆角弯头 path（管件视觉）。 */
function elbowPath(pts: Pt[], r = 8): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]!, p1 = pts[i]!, p2 = pts[i + 1]!
    const v1 = { x: Math.sign(p1.x - p0.x), y: Math.sign(p1.y - p0.y) }
    const v2 = { x: Math.sign(p2.x - p1.x), y: Math.sign(p2.y - p1.y) }
    const rr = Math.min(r, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, Math.abs(p2.x - p1.x) / 2, Math.abs(p2.y - p1.y) / 2)
    d += ` L ${p1.x - v1.x * rr} ${p1.y - v1.y * rr} Q ${p1.x} ${p1.y} ${p1.x + v2.x * rr} ${p1.y + v2.y * rr}`
  }
  const last = pts[pts.length - 1]!
  d += ` L ${last.x} ${last.y}`
  return d
}

/** 命令坞→任务舱的竖干管段（列表/map 两态同款：横沟→竖干→舱缘）。 */
export function PipeOverlay(props: { families: PipeFamily[]; activeRootId: string | null; mapMode: boolean }): ReactNode {
  const { families, activeRootId, mapMode } = props
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [paths, setPaths] = useState<Array<{ key: string; d: string; dProg: string; hueSlot: number; active: boolean }>>([])
  const familiesRef = useRef(families)
  const activeRef = useRef(activeRootId)
  const lastSigRef = useRef('')
  familiesRef.current = families
  activeRef.current = activeRootId

  useEffect(() => {
    const svg = svgRef.current
    if (svg === null) return
    let raf = 0
    let last = 0
    const compute = (): void => {
      const box = svg.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      const out: Array<{ key: string; d: string; dProg: string; hueSlot: number; active: boolean }> = []
      for (const fam of familiesRef.current) {
        // 锚点按 kind+id 查卡；缺失的站跳过（无卡态不说谎，管只连在场的卡）。
        // 端口有向（V17.1 元首定）：命令=顶缘出（上行进板）；任务卡=右缘双端口
        // （入=下位 +10、出=上位 -10）；执行/回报卡=左缘入（进卡）——绝不穿卡体。
        const stops: Array<{ el: Element; kind: PipeStop['kind'] }> = []
        for (const stop of fam.stops) {
          const el = document.querySelector(`[${attrOf(stop)}="${CSS.escape(stop.id)}"]`)
          if (el === null) continue
          stops.push({ el, kind: stop.kind })
        }
        if (stops.length < 2) continue
        const entry = (i: number): Pt | null => {
          const k = stops[i]!.kind
          return edgePort(stops[i]!.el, k === 'cmd' ? 'top' : k === 'task' ? 'right' : 'left', box, k === 'task' ? 10 : 0)
        }
        const exit = (i: number): Pt | null => {
          const k = stops[i]!.kind
          return edgePort(stops[i]!.el, k === 'cmd' ? 'top' : 'right', box, k === 'task' ? -10 : 0)
        }
        // 一段管：from 站出口 → to 站入口。命令段=横沟→竖干（任务列右外沟槽）；
        // 卡间段=列间 gutter 中线（左列右缘 ↔ 右列左缘之间，必在空沟里）。
        const leg = (i: number): Pt[] => {
          const a = exit(i - 1), b = entry(i)
          if (a === null || b === null) return []
          if (stops[i - 1]!.kind === 'cmd') {
            // 横沟走「列区底 ↔ 坞卡顶」的夹缝中点（列卡矩形会被滚动容器裁掉、
            // 报告的 rect 偏大——贴 cmd 顶 -12 会撞进列卡下半截）。
            const ops = svg.parentElement?.querySelector('.war-ops')
            const opsBottom = ops !== null && ops !== undefined ? ops.getBoundingClientRect().bottom - box.top : a.y - 10
            const channelY = Math.max(opsBottom + 3, Math.min(a.y - 4, opsBottom + (a.y - opsBottom) / 2))
            const trunkX = b.x + 5
            return [{ x: a.x, y: channelY }, { x: trunkX, y: channelY }, { x: trunkX, y: b.y }]
          }
          const g = (a.x + b.x) / 2
          return [{ x: g, y: a.y }, { x: g, y: b.y }]
        }
        // map 态弦锚：HQ + 本战线星球屏幕位（__wz 投影出口；星域 inset:0 铺满板，
        // 正常与板同原点，仍按 rect 差换算防布局漂移）。
        let hq: Pt | null = null
        let planet: Pt | null = null
        if (mapMode) {
          const wz = (window as { __wz?: WzProjector }).__wz
          if (wz !== undefined && wz.hqScreen !== undefined) {
            let off = { x: 0, y: 0 }
            const star = svg.parentElement?.querySelector('.war-starfield')
            if (star !== null && star !== undefined) {
              const sr = star.getBoundingClientRect()
              off = { x: sr.left - box.left, y: sr.top - box.top }
            }
            const raw = wz.hqScreen()
            if (raw !== null) hq = { x: raw.x + off.x, y: raw.y + off.y }
            if (wz.planetScreen !== undefined && fam.wsKey) {
              const raw2 = wz.planetScreen(fam.wsKey)
              if (raw2 !== null) planet = { x: raw2.x + off.x, y: raw2.y + off.y }
            }
          }
        }
        // map 态总线（元首红线示意 2026-08-29：管线走板内边）——命令卡上缘出 →
        // 坞顶横沟向左 → 任务列右外竖干上行到任务卡**入端口**（下位）进卡即止；
        // 卡位段不画线（卡本身是导管），**出端口**（上位）再出来续行 → 板顶横沟
        // → HQ 竖直接点（星球弦挂 HQ，弦=直线）→ 顶沟续右 → 回报列左外下行 →
        // 战报卡左缘入。
        // 显式旗标而非站序数——无执行站时 report 索引前移，序数会漏画回报腿。
        const mapDraw = (toHq: boolean, toReport: boolean): string => {
          const e0 = entry(0), tIn = entry(1), tOut = exit(1)
          if (e0 === null || tIn === null || tOut === null) return ''
          const ops = svg.parentElement?.querySelector('.war-ops')
          const opsBottom = ops !== null && ops !== undefined ? ops.getBoundingClientRect().bottom - box.top : e0.y - 10
          const channelY = Math.max(opsBottom + 3, Math.min(e0.y - 4, opsBottom + (e0.y - opsBottom) / 2))
          const trunkX = tIn.x + 24
          const topY = 8
          // 下行段：坞 → 横沟 → 竖干上行 → 入端口进卡即止（子路径 M 会移当前点，
          // 各段独立显式 M 起笔——卡位段的断开就是「进卡再出来」的视觉本体）。
          let d = `M ${e0.x} ${e0.y} L ${e0.x} ${channelY} L ${trunkX} ${channelY} L ${trunkX} ${tIn.y} L ${tIn.x} ${tIn.y}`
          // 上行段：出端口出卡 → 竖干续行 → 顶沟 → HQ 接点 → (回报腿)。
          if (toHq && hq !== null) {
            d += ` M ${tOut.x} ${tOut.y} L ${trunkX} ${tOut.y} L ${trunkX} ${topY} L ${hq.x} ${topY} L ${hq.x} ${hq.y}`
            if (toReport) {
              const reportIdx = stops.findIndex(s => s.kind === 'report')
              if (reportIdx > 1) {
                const rp = entry(reportIdx)
                if (rp !== null) d += ` L ${hq.x} ${topY} L ${rp.x - 12} ${topY} L ${rp.x - 12} ${rp.y} L ${rp.x} ${rp.y}`
              }
            }
          }
          return d
        }
        // 全程路径 + 流动前缀（生命条 now 段之前的锚全部连上——流到当前战况位）。
        // 管件=多个子路径（卡是导管本体：缘口进出，中间不画线——画了必穿卡）。
        // map 态 base=全网络常显；prog 按 stage 显式驱动（站序数在无执行站时会
        // 压缩错位——回报腿漏接的根因）。
        const mapChord = (draw: boolean): string =>
          draw && hq !== null && planet !== null ? ` M ${hq.x} ${hq.y} L ${planet.x} ${planet.y}` : ''
        const buildD = (through: number): string => {
          if (mapMode) {
            if (through < 1) return ''
            return mapDraw(true, true) + mapChord(true)
          }
          const parts: string[] = []
          if (through >= 1) {
            const e0 = entry(0), e1 = entry(1)
            if (e0 !== null && e1 !== null) parts.push(elbowPath([e0, ...leg(1), e1]))
          }
          for (let i = 2; i <= through; i++) {
            const a = exit(i - 1), b = entry(i)
            if (a === null || b === null) continue
            parts.push(elbowPath([a, ...leg(i), b]))
          }
          return parts.join(' ')
        }
        const d = buildD(stops.length - 1)
        const dProg = mapMode
          ? (fam.stage < 1 ? '' : mapDraw(fam.stage >= 2, fam.stage >= 3) + mapChord(fam.stage >= 2))
          : buildD(Math.min(fam.stage, stops.length - 1))
        if (d === '') continue // 站位全缺（滚动出视界等）——不渲染空 path
        out.push({
          key: fam.rootId,
          d,
          dProg,
          hueSlot: fam.hueSlot,
          active: activeRef.current !== null && activeRef.current === fam.rootId,
        })
      }
      // 兜底重算（1s tick）大多无变化——序列化比对相同就不 setPaths，避免无谓
      // 子树重渲染（每秒换数组身份会把全板拖进持续重渲染，还放大点击竞态窗口）。
      const sig = out.map(p => `${p.key}|${p.d}|${p.dProg}|${p.active}`).join('\n')
      if (sig === lastSigRef.current) return
      lastSigRef.current = sig
      setPaths(out)
    }
    const schedule = (): void => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => { raf = 0; compute() })
    }
    const onScrollResize = (): void => {
      const now = performance.now()
      if (now - last < 120) { schedule(); return }
      last = now
      schedule()
    }
    compute()
    const ro = new ResizeObserver(onScrollResize)
    ro.observe(svg.parentElement ?? svg)
    window.addEventListener('resize', onScrollResize)
    document.addEventListener('scroll', onScrollResize, { capture: true, passive: true })
    const iv = window.setInterval(compute, 1000) // SSE 无布局变化时的兜底重算（2D 投影首帧在此补齐）
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onScrollResize)
      document.removeEventListener('scroll', onScrollResize, { capture: true } as EventListenerOptions)
      window.clearInterval(iv)
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [families, activeRootId, mapMode])

  const hasActive = paths.some(p => p.active)
  return createElement('svg', {
    ref: svgRef,
    className: `war-pipe-svg${hasActive ? ' has-active' : ''}${mapMode ? ' war-pipe-map' : ''}`,
    'aria-hidden': 'true',
  },
    ...paths.map(p => createElement('g', { key: p.key, className: `war-chain-hue-${p.hueSlot}${p.active ? ' on' : ''}` },
      createElement('path', { className: 'war-pipe-base', d: p.d }),
      createElement('path', { className: `war-pipe-prog${p.active ? ' war-pipe-flowing' : ''}`, d: p.active ? p.dProg : p.d }),
    )),
  )
}
