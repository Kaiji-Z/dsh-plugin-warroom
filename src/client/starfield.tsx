/**
 * V10-R3a 星域战场底版（元首定案 B 方案 · 同心椭圆恒星系）：☀HQ 居中是全局战
 * 时开关的化身（board.active）；每 workspace 一颗星按创建序内老外新独占一圈椭圆
 * 轨道；执行中的部队光点挂在所属星的近地轨道上。**一切坐标确定性推导**（ID 哈希
 * /创建序）——SSE revision 更新绝不抖动；全 DOM/CSS，禁 WebGL（V10-BRIEF §3）。
 * 布局数学全是纯函数并单独出测（tests/starfield.test.ts）。
 * @module dsh-plugin-warroom/client/starfield
 */
import { createElement, type ReactNode } from 'react'
import type { BoardAttempt, BoardTask } from './data.ts'

/** FNV-1a → [0,1)：相位/角度种子的唯一来源（同输入恒同输出）。 */
export function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 2 ** 32
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 星球在本环上的方位角：黄金角步进——相邻环不叠轴，且与星球创建序绑定。 */
export function planetAngleDeg(ringIndex: number): number {
  return (((-90 + ringIndex * 137.508) % 360) + 360) % 360
}

export interface PlanetSpec {
  readonly wsPath: string
  /** 1 起：内环最老。 */
  readonly ring: number
  /** 容器百分比坐标（0-100）。 */
  readonly xPct: number
  readonly yPct: number
}

/**
 * 恒星系布局（纯）：第 k 个 workspace 占第 k 圈椭圆（rx 由圈序线性外扩、ry 压扁
 * 适配宽中庭），圈上方位按黄金角步进。坐标百分比化——容器任意尺寸等比缩放。
 */
export function galaxyLayout(wsPathsInCreationOrder: readonly string[], xLo = 24, xHi = 76): PlanetSpec[] {
  return wsPathsInCreationOrder.map((wsPath, k) => {
    const rx = 14 + k * 12
    const ang = (planetAngleDeg(k) * Math.PI) / 180
    return {
      wsPath,
      ring: k + 1,
      // X 压中央安全带：边界由调用方按浮舱实际宽度推（critique P2：固定 24/76 在
      // 中等视口被舱遮星——1720 擦边过、1280 重叠 114px）。
      xPct: +(clamp(50 + rx * 0.55 * Math.cos(ang), xLo, xHi)).toFixed(2),
      yPct: +(clamp(42 + rx * 0.62 * Math.sin(ang), 8, 90)).toFixed(2),
    }
  })
}

/** 部队光点在所属星近地轨道上的相位角（纯）：同会话恒同位。 */
export function moonAngleRad(sessionId: string): number {
  return hash01(sessionId) * Math.PI * 2
}

/** 近地轨道半径（百分比）。 */
const MOON_R_PCT = 4.6

export function moonPos(planet: PlanetSpec, sessionId: string, slotOffsetRad = 0): { xPct: number; yPct: number } {
  const a = moonAngleRad(sessionId) + slotOffsetRad
  return {
    xPct: +(planet.xPct + MOON_R_PCT * Math.cos(a)).toFixed(2),
    yPct: +(planet.yPct + MOON_R_PCT * 0.72 * Math.sin(a)).toFixed(2),
  }
}

/** workspace 创建序投影（纯）：按各 workspace 最早任务 startedAt 升序——board
 * 投影没有直接的 workspace 注册表，最早出场顺序是稳定且确定性的替身。 */
export function workspaceCreationOrder(tasks: ReadonlyArray<Pick<BoardTask, 'workspacePath' | 'startedAt'>>): string[] {
  const firstSeen = new Map<string, string>()
  for (const t of tasks) {
    if (t.workspacePath === null || t.workspacePath === '') continue
    const prev = firstSeen.get(t.workspacePath)
    if (prev === undefined || t.startedAt < prev) firstSeen.set(t.workspacePath, t.startedAt)
  }
  return [...firstSeen.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] === b[1] ? 0 : 1)).map(([p]) => p)
}

/** 一颗星的驻军切片：活跃 attempt 光点 + 凯旋印记数（已收官任务）+ 是否有活体。 */
export interface PlanetGarrison {
  readonly orbs: ReadonlyArray<{ sessionId: string; verbLabel: string | null; paused: boolean }>
  readonly triumphs: number
  /** V10.1 critique P1-2：行星升格战区仪表——待领令数（琥珀信号）与败数（红信号）。 */
  readonly awaiting: number
  readonly failing: number
}

export function garrisonOf(tasks: ReadonlyArray<BoardTask>, wsPath: string): PlanetGarrison {
  let triumphs = 0
  let awaiting = 0
  let failing = 0
  const orbs: Array<{ sessionId: string; verbLabel: string | null; paused: boolean }> = []
  for (const t of tasks) {
    if (t.workspacePath !== wsPath) continue
    if (t.status === 'closed') triumphs += 1
    if (t.status === 'published') awaiting += 1
    if (t.status === 'failed') failing += 1
    for (const a of t.attemptLog ?? []) {
      if (isLiveAttempt(a)) {
        orbs.push({ sessionId: a.sessionId, verbLabel: a.activity?.label ?? null, paused: t.quotaPaused === true })
      }
    }
  }
  return { orbs, triumphs, awaiting, failing }
}

function isLiveAttempt(a: BoardAttempt): boolean {
  return a.outcome === null && a.endedAt === null
}

/** 星域名：工作区路径取尾段展示（盘符长路径不进图）。 */
export function planetLabel(wsPath: string): string {
  const seg = wsPath.split(/[\\/]/).filter(Boolean)
  return seg[seg.length - 1] ?? wsPath
}

export interface StarfieldTroop {
  readonly sessionId: string
  readonly planet: PlanetSpec
  readonly xPct: number
  readonly yPct: number
  readonly verbLabel: string | null
  readonly paused: boolean
  /** 点击直跳源命令聚焦页（孤儿防御性置空则不可点）。 */
  readonly sourceCommandId: string | null
  /** aria 用命令摘要——读屏用户不该听会话号（critique A）。 */
  readonly sourceLabel: string | null
}

export interface StarfieldProps {
  readonly active: boolean
  readonly planets: ReadonlyArray<{ spec: PlanetSpec; garrison: PlanetGarrison }>
  readonly troops: ReadonlyArray<StarfieldTroop>
  readonly ariaLabel: string
  readonly hqTitleLit: string
  readonly hqTitleDark: string
  readonly onOpenCommand?: (commandId: string) => void
  /** V10-R4 族链联动：光点悬停→点亮其源命令全族（CardTrace 同一状态机）。 */
  readonly onOrbHover?: (sourceCommandId: string | null) => void
  /** V10.1 昔日阵地：hover 族链时已结算 attempts 的 ghost 光点（平时不留常驻位）。 */
  readonly ghosts?: ReadonlyArray<{ sessionId: string; xPct: number; yPct: number; outcome: 'failed' | 'reported' | 'succeeded' }>
  /** 光点无动词时的无障碍兜底标签。 */
  readonly orbIdleLabel?: string
  /** V10.1 critique P1-1：行星可达——点击/回车跳该战区最近的源命令聚焦页。 */
  readonly onPlanetOpen?: (wsPath: string) => void
  /** V10.1 critique P3：地图就地微图例（正式图例仍在设置抽屉）。 */
  readonly mapLegend?: string
}

/** 星域画布（真组件，createElement 挂载）：只有「现在」——活体光点、恒星开关、
 * 轨道与星；过去不留常驻位（凯旋印记走行星角标计数），追问看聚焦页族谱。 */
export function StarfieldMap(props: StarfieldProps): ReactNode {
  const { active, planets, troops, ariaLabel, hqTitleLit, hqTitleDark, onOpenCommand, onOrbHover, ghosts = [], orbIdleLabel = 'exec', onPlanetOpen, mapLegend } = props
  const maxRing = planets.reduce((m, p) => Math.max(m, p.spec.ring), 0)
  const orbits = []
  for (let r = 1; r <= maxRing; r++) {
    const wPct = 2 * (14 + (r - 1) * 12) + 6 // 与 galaxyLayout 的 rx 对齐再留球体余量
    orbits.push(createElement('div', {
      key: `orbit-${r}`,
      className: 'war-orbit',
      style: { width: `${Math.min(wPct, 96)}%`, height: `${Math.min(wPct * 0.62, 96)}%` },
    }))
  }
  return createElement('div', { className: 'war-starfield', role: 'group', 'aria-label': ariaLabel, 'data-war-view': 'map' },
    createElement('div', { className: 'war-stars', 'aria-hidden': 'true' }),
    ...orbits,
    mapLegend !== undefined
      ? createElement('div', { className: 'war-map-legend', 'aria-hidden': 'true' }, mapLegend)
      : null,
    createElement('div', {
      className: `war-hq${active ? ' lit' : ''}`,
      'data-active': String(active),
      title: active ? hqTitleLit : hqTitleDark,
    }, active ? '☀' : '☄'),
    ...planets.map(({ spec, garrison }) =>
      createElement('button', {
        key: spec.wsPath,
        type: 'button',
        className: `war-planet${garrison.orbs.length > 0 ? ' busy' : ''}`,
        'data-ws-index': String(spec.ring),
        'data-triumphs': String(garrison.triumphs),
        style: { left: `${spec.xPct}%`, top: `${spec.yPct}%` },
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
        key: t.sessionId,
        type: 'button',
        className: `war-orb${t.paused ? ' wait' : ''}${t.sourceCommandId !== null ? ' clickable' : ''}`,
        'data-session': t.sessionId,
        style: { left: `${t.xPct}%`, top: `${t.yPct}%` },
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
    troops.length > 0
      ? createElement('div', { className: 'war-live-bar', role: 'status', 'aria-live': 'polite', 'data-war-live': String(troops.length) },
          ...troops.slice(0, 3).map(t =>
            createElement('span', { key: `lb-${t.sessionId}`, className: 'war-live-item' },
              createElement('span', { className: 'war-live-verb' }, t.verbLabel ?? orbIdleLabel),
              createElement('span', { className: 'war-live-cmd' }, t.sourceLabel ?? t.sessionId.slice(0, 8)))))
      : null,
    troops.length > 3
      ? createElement('span', { key: 'lb-more', className: 'war-live-item' }, `+${troops.length - 3}`)
      : null,
    ...ghosts.map(g =>
      createElement('div', {
        key: `ghost-${g.sessionId}`,
        className: `war-orb-ghost${g.outcome === 'failed' ? ' fail' : ''}`,
        'data-ghost': g.outcome,
        style: { left: `${g.xPct}%`, top: `${g.yPct}%` },
        'aria-hidden': 'true',
      }),
    ),
  )
}
