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

function edgePort(el: Element, side: 'top' | 'left' | 'right', box: DOMRect, dy = 0): Pt | null {
  const raw = el.getBoundingClientRect()
  if (raw.width === 0 && raw.height === 0) return null
  let r = raw as DOMRect
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
  // 端口锚=卡体原位（不是裁剪缝中心）——大半滚出列体的卡只剩一条缝时，缝中心
  // 会把端口拖到幻影位（缝≠卡，V17.5）：端口点落在裁剪盒外=站台缺席，不接线。
  const px = (side === 'left' ? raw.left : side === 'right' ? raw.right : raw.left + raw.width / 2) - box.left
  const py = (side === 'top' ? raw.top : raw.top + raw.height / 2) + dy - box.top
  if (px < r.left - box.left - 1 || px > r.right - box.left + 1 ||
      py < r.top - box.top - 1 || py > r.bottom - box.top + 1) return null
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
        // map 态管线（V17.5 元首令修订：不绕 HQ、不挂星球弦，**顶沟保留**）——
        // 命令卡上缘出 → 坞顶横沟向左 → 任务列右外竖干上行到任务卡**入端口**
        // （下位）进卡即止；卡位段不画线（卡本身是导管），**出端口**（上位）
        // 出来续行竖干到**板顶横沟** → 右行 → 回报列左外下行 → 战报卡左缘入。
        // 星域内部的连线只有原装 HQ→星球虚线（高亮语言，见 warzone-scene hlLines）。
        // 锚按 kind 寻址而非站序——命令卡锚缺席（滚出调度条视界）时站序整体前移：
        // 任务端口顶替命令起笔、回报左缘顶替任务入端口，画出「任务端口→底沟→
        // 回报右侧竖爬」的穿空幽灵干线（V17.6 元首指认）。命令腿只在命令卡在场
        // 时画；任务→战报直连腿不依赖命令腿。
        const mapDraw = (toReport: boolean): string => {
          const ci = stops.findIndex(s => s.kind === 'cmd')
          const ti = stops.findIndex(s => s.kind === 'task')
          if (ti < 0) return ''
          const tIn = entry(ti), tOut = exit(ti)
          if (tIn === null || tOut === null) return ''
          // V17.8 舰长令：map 沟一律走**面板缘外 8px**——竖干=任务列右缘外、
          // 回报腿竖段=回报列左缘外、底沟=调度栏上缘外（顶沟 topY=8 沿用）。
          // 旧版竖干贴卡缘+24/底沟取坞卡中点——随卡宽卡高漂移，沟位不定。
          const EDGE = 8
          const zoneOf = (sel: string): DOMRect | null => {
            const el = svg.parentElement?.querySelector(sel)
            return el != null ? el.getBoundingClientRect() : null
          }
          const taskZone = zoneOf('.war-zone.war-tasks')
          const reportZone = zoneOf('.war-zone.war-report')
          const ops = zoneOf('.war-dispatch')
          const trunkX = taskZone !== null ? taskZone.right - box.left + EDGE : tIn.x + 24
          const topY = 8
          let d = ''
          const e0 = ci >= 0 ? entry(ci) : null
          if (e0 !== null) {
            const channelY = ops !== null ? ops.top - box.top - EDGE : e0.y - 10
            // 命令腿：坞 → 底沟向左 → 竖干上行 → 入端口进卡即止。
            d += `M ${e0.x} ${e0.y} L ${e0.x} ${channelY} L ${trunkX} ${channelY} L ${trunkX} ${tIn.y} L ${tIn.x} ${tIn.y}`
          }
          // 上行段（V17.6 舰长令：回报阶段才接出管）——出端口出卡 → 竖干续行 →
          // 板顶横沟右行 → 回报列左外竖段下行 → 战报卡左缘入。
          if (toReport) {
            d += ` M ${tOut.x} ${tOut.y} L ${trunkX} ${tOut.y} L ${trunkX} ${topY}`
            const ri = stops.findIndex(s => s.kind === 'report')
            if (ri > ti) {
              const rp = entry(ri)
              if (rp !== null) {
                const legX = reportZone !== null ? reportZone.left - box.left - EDGE : rp.x - 12
                d += ` L ${legX} ${topY} L ${legX} ${rp.y} L ${rp.x} ${rp.y}`
              }
            }
          }
          return d
        }
        // 全程路径 + 流动前缀（生命条 now 段之前的锚全部连上——流到当前战况位）。
        // 管件=多个子路径（卡是导管本体：缘口进出，中间不画线——画了必穿卡）。
        const buildD = (through: number): string => {
          if (mapMode) {
            if (through < 1) return ''
            return mapDraw(true)
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
        // 常显基管同样按 stage 截段（V17.6 舰长令：管线随战况生长——未到回报
        // 阶段的族不铺回报腿；链上前代遗留的已收官 attempt 不得让进行中命令
        // 提前亮出回报管）。列表态同理截段。
        const d = mapMode ? mapDraw(fam.stage >= 3) : buildD(Math.min(fam.stage, stops.length - 1))
        const dProg = mapMode
          ? (fam.stage < 1 ? '' : mapDraw(fam.stage >= 3))
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
