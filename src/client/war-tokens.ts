/**
 * War 语义令牌 TS 侧唯一入口（V12.2 语义 token 化）。
 *
 * 架构：CSS（styles.ts WAR_CSS 的 --war-* 令牌层）是色值正本；本模块在
 * 运行时从 .war-root 的 computed style 读解析值，供 canvas 2D 战术盘与
 * three.js 语义状态色消费——换肤/换主题只改 CSS 一处，TS 侧自动跟随。
 * 读取有布局成本，只在构造与 setTheme/applyTheme 时调用，勿进帧循环。
 *
 * 回退基线（TAC_FALLBACK_* / LOG_FALLBACK_*）：与 CSS 令牌同值的纯值副本，
 * 覆盖两类环境——headless 测试（无 DOM），以及 body 主题属性与请求主题
 * 不一致的场景（probe 强制深色而宿主 body 未挂属性）。哨兵由
 * tests/war-tokens.test.ts 与 WAR_CSS 字符串双向锁死：CSS 改值不同步回退
 * = 测试红，drift 不可能静默发生。
 *
 * 语义边界：只有「状态语义色」（等你的琥珀/交战橙红/占领蓝/高亮青/日志
 * 六类）与 2D 战术盘整皮走令牌；three.js 的美术资产（NASA 星球贴图、浮空
 * 岛岩石/草顶、舰体合金、HDR 自发光、灯光雾色）是场景工厂数据，继续由
 * applyTheme 双皮管理——那是皮肤的另一半缝，不进 CSS。
 * @module dsh-plugin-stardeck/client/war-tokens
 */

/** 速报/WAR LOG 语义类（color 字段的 kind 化：值由令牌解析，不再散写 hex） */
export type WzLogKind = 'order' | 'engage' | 'triumph' | 'retreat' | 'return' | 'review'

/** 2D 战术盘调色板：蓝图（浅）/雷达（深）双皮，字段与 CSS 令牌一一对应 */
export interface WarTacPalette {
  readonly bg0: string; readonly bg1: string; readonly bg2: string
  readonly grid: string; readonly ring: string; readonly ringTxt: string
  readonly cross: string; readonly tick: string; readonly bearing: string
  readonly hqPulse: string; readonly hqFill: string; readonly hq: string
  readonly hqCore: string; readonly hqLabel: string
  readonly wait: string; readonly battle: string; readonly held: string; readonly hl: string
  readonly active: string; readonly settled: string; readonly failed: string
  readonly hlLine: string; readonly battlePulse: string
  readonly garrison: string; readonly name: string; readonly nameHl: string
  readonly sqBattle: string; readonly sqRet: string; readonly sqDep: string; readonly sqHold: string
  readonly corner: string
}

/** 调色板字段 → CSS 令牌名映射（闭包由 tests/war-tokens.test.ts 锁死） */
const TAC_TOKEN_MAP: ReadonlyArray<readonly [keyof WarTacPalette, string]> = [
  ['bg0', '--war-tac-bg0'], ['bg1', '--war-tac-bg1'], ['bg2', '--war-tac-bg2'],
  ['grid', '--war-tac-grid'], ['ring', '--war-tac-ring'], ['ringTxt', '--war-tac-ring-txt'],
  ['cross', '--war-tac-cross'], ['tick', '--war-tac-tick'], ['bearing', '--war-tac-bearing'],
  ['hqPulse', '--war-tac-hq-pulse'], ['hqFill', '--war-tac-hq-fill'], ['hq', '--war-tac-hq'],
  ['hqCore', '--war-tac-hq-core'], ['hqLabel', '--war-tac-hq-label'],
  ['wait', '--war-wz-wait'], ['battle', '--war-wz-battle'], ['held', '--war-wz-held'], ['hl', '--war-wz-hl'],
  ['active', '--war-wz-active'], ['settled', '--war-wz-settled'], ['failed', '--war-wz-failed'],
  ['hlLine', '--war-wz-hl-line'], ['battlePulse', '--war-wz-battle-pulse'],
  ['garrison', '--war-tac-garrison'], ['name', '--war-tac-name'], ['nameHl', '--war-tac-name-hl'],
  ['sqBattle', '--war-tac-sq-battle'], ['sqRet', '--war-tac-sq-ret'], ['sqDep', '--war-tac-sq-dep'], ['sqHold', '--war-tac-sq-hold'],
  ['corner', '--war-tac-corner'],
]

/** 雷达皮回退（深）——与 body[data-ds-dark-theme] 令牌块同值 */
export const TAC_FALLBACK_DARK: WarTacPalette = {
  bg0: '#04101f', bg1: '#020812', bg2: '#010409', grid: 'rgba(60,120,190,.07)',
  ring: 'rgba(80,160,230,.2)', ringTxt: 'rgba(110,180,240,.4)', cross: 'rgba(80,160,230,.15)',
  tick: 'rgba(90,170,240,.35)', bearing: 'rgba(120,190,250,.5)', hqPulse: '111,227,255',
  hqFill: 'rgba(20,50,90,.92)', hq: '#9fdcff', hqCore: '#cfeeff', hqLabel: '#bfe6ff',
  wait: '#ffc24d', battle: '#ff6a55', held: '#66d4ff', hl: '#6fe3ff',
  active: '#5aa9ff', settled: '#4cd98e', failed: '#ff5f56',
  hlLine: 'rgba(111,227,255,.55)', battlePulse: '255,90,60',
  garrison: 'rgba(95,196,255,.7)', name: 'rgba(200,225,250,.85)', nameHl: '#bfefff',
  sqBattle: '#ff7755', sqRet: '#9a86ff', sqDep: '#5fc4ff', sqHold: '#ffc98a',
  corner: 'rgba(111,227,255,.5)',
}

/** 蓝图纸面皮回退（浅）——与 .war-root 缺省令牌块同值 */
export const TAC_FALLBACK_LIGHT: WarTacPalette = {
  bg0: '#f8fbfe', bg1: '#eef4fa', bg2: '#e3edf7', grid: 'rgba(70,110,160,.12)',
  ring: 'rgba(90,130,180,.55)', ringTxt: 'rgba(80,120,170,.6)', cross: 'rgba(90,130,180,.32)',
  tick: 'rgba(90,130,180,.45)', bearing: 'rgba(70,105,150,.65)', hqPulse: '28,78,128',
  hqFill: 'rgba(214,232,248,.95)', hq: '#1c4e80', hqCore: '#2d6ca6', hqLabel: '#1c4e80',
  wait: '#b07800', battle: '#d9480f', held: '#1971c2', hl: '#0e7490',
  active: '#1971c2', settled: '#2f9e44', failed: '#c92a2a',
  hlLine: 'rgba(14,116,144,.55)', battlePulse: '217,72,15',
  garrison: 'rgba(25,113,194,.75)', name: 'rgba(40,70,110,.9)', nameHl: '#0b3a53',
  sqBattle: '#d9480f', sqRet: '#6741d9', sqDep: '#1971c2', sqHold: '#b07800',
  corner: 'rgba(28,78,128,.5)',
}

/** 速报日志色回退——浅色压深（白蓝图上 ≥4.5:1），深色原亮值 */
const LOG_FALLBACK: Record<WzLogKind, { readonly light: string; readonly dark: string }> = {
  order: { light: '#8a5f00', dark: '#ffc98a' },
  engage: { light: '#c2410c', dark: '#ff7755' },
  triumph: { light: '#1971c2', dark: '#5fc4ff' },
  retreat: { light: '#b3261e', dark: '#ff5a5a' },
  return: { light: '#6741d9', dark: '#9a86ff' },
  review: { light: '#b07800', dark: '#ffc24d' },
}

const LOG_TOKEN: Record<WzLogKind, string> = {
  order: '--war-log-order', engage: '--war-log-engage', triumph: '--war-log-triumph',
  retreat: '--war-log-retreat', return: '--war-log-return', review: '--war-log-review',
}

function warRootEl(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>('.war-root')
}

function hostThemeIsDark(): boolean {
  return typeof document !== 'undefined' && document.body.matches('[data-ds-dark-theme]')
}

/** 读 2D 战术盘调色板：CSS 令牌优先，环境不符（headless/主题错位）走回退。 */
export function readTacPalette(dark: boolean): WarTacPalette {
  const base = dark ? TAC_FALLBACK_DARK : TAC_FALLBACK_LIGHT
  const el = warRootEl()
  // 主题错位守卫：CSS 只能解析出当前 body 态的值——probe 强制深色而宿主未挂
  // 属性时读到的会是浅色值，宁可回退也不穿错皮。
  if (el === null || hostThemeIsDark() !== dark) return base
  const cs = getComputedStyle(el)
  const out: Record<string, string> = { ...base }
  for (const [key, token] of TAC_TOKEN_MAP) {
    const v = cs.getPropertyValue(token).trim()
    if (v !== '') out[key] = v
  }
  return out as WarTacPalette
}

/** 读单枚语义令牌的解析值；环境不符给 null（调用方自行回退）。 */
export function readWarToken(name: string): string | null {
  const el = warRootEl()
  if (el === null) return null
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v === '' ? null : v
}

/** 速报日志语义色：按当前宿主主题解析（浅压深/深原亮），环境不符走回退。 */
export function warLogKindColor(kind: WzLogKind): string {
  const el = warRootEl()
  if (el !== null) {
    const v = getComputedStyle(el).getPropertyValue(LOG_TOKEN[kind]).trim()
    if (v !== '') return v
  }
  return hostThemeIsDark() ? LOG_FALLBACK[kind].dark : LOG_FALLBACK[kind].light
}

/** 全量日志色（场景侧参数显式版：applyTheme/setTheme 时按目标主题取整组）。 */
export function warLogColors(dark: boolean): Readonly<Record<WzLogKind, string>> {
  const el = warRootEl()
  if (el !== null && hostThemeIsDark() === dark) {
    const cs = getComputedStyle(el)
    const out = {} as Record<WzLogKind, string>
    let ok = true
    for (const kind of Object.keys(LOG_TOKEN) as WzLogKind[]) {
      const v = cs.getPropertyValue(LOG_TOKEN[kind]).trim()
      if (v === '') { ok = false; break }
      out[kind] = v
    }
    if (ok) return out
  }
  const out = {} as Record<WzLogKind, string>
  for (const kind of Object.keys(LOG_FALLBACK) as WzLogKind[]) out[kind] = dark ? LOG_FALLBACK[kind].dark : LOG_FALLBACK[kind].light
  return out
}

/** 链八相回退（与 styles.ts .war-chain-hue-N 令牌同值；哨兵双向锁死）——
 * V13 战线航迹的 3D 侧色源（CSS 读取优先，headless/主题错位走此回退）。 */
export const CHAIN_HUE_FALLBACK: Readonly<Record<number, { readonly light: string; readonly dark: string }>> = {
  0: { light: '#6f5bd6', dark: '#ab9df2' }, 1: { light: '#0e7f76', dark: '#63d8cd' },
  2: { light: '#4c8f3f', dark: '#93d47f' }, 3: { light: '#9a6b1f', dark: '#e3b566' },
  4: { light: '#b04a3c', dark: '#ef9083' }, 5: { light: '#a83d84', dark: '#eb97d5' },
  6: { light: '#3465b8', dark: '#8fb2f2' }, 7: { light: '#5d6b7a', dark: '#adc0d1' },
}

/** 战线链色（V13）：按槽位从 CSS --chain-hue（.war-chain-hue-N 类持有）解析。
 * 用探针元素读 computed（类选择器任意元素可挂）；环境不符走同值回退。 */
export function readChainHue(slot: number): string {
  const el = warRootEl()
  if (el !== null && typeof document !== 'undefined') {
    const probe = document.createElement('div')
    probe.className = `war-chain-hue-${((slot % 8) + 8) % 8}`
    probe.style.display = 'none'
    el.appendChild(probe)
    try {
      const v = getComputedStyle(probe).getPropertyValue('--chain-hue').trim()
      if (v !== '') return v
    } finally {
      el.removeChild(probe)
    }
  }
  const fb = CHAIN_HUE_FALLBACK[((slot % 8) + 8) % 8]!
  return hostThemeIsDark() ? fb.dark : fb.light
}
