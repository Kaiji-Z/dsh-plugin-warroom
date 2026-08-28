/**
 * V12.2 语义令牌机检：三层架构的结构性不变量。
 *  1) 令牌闭合：WAR_CSS 里被引用的每个 var(--war-*) 都有定义（防「改了引用
 *     忘了定义」的静默塌黑——styles.ts:530 的 --war-canvas-bg 未定义 var 旧案
 *     就是这一类）。
 *  2) 组件区纯净：非令牌定义块的规则里不许出现 var(--dsw-*) 直穿（皮肤缝
 *     完整性——组件规则必须只经 --war-* 语义层）与裸 hex（允许四类美术豁免：
 *     mask 黑、星球镜面高光、中性 #000 阴影混、var() 回退值）。
 *  3) 回退哨兵：war-tokens.ts 的 TAC_FALLBACK_* / 日志回退与 CSS 令牌块
 *     双向锁值——CSS 改值不同步回退 = 红，drift 不可能静默发生。
 * @module dsh-plugin-warroom/tests/war-tokens
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { WAR_CSS } from '../src/client/styles.ts'
import { readTacPalette, warLogColors, readChainHue, CHAIN_HUE_FALLBACK, TAC_FALLBACK_DARK, TAC_FALLBACK_LIGHT, type WzLogKind } from '../src/client/war-tokens.ts'

/** JS 运行时注入的动态变量（带回退引用，无静态定义） */
const RUNTIME_VARS = new Set(['--war-panel-rows'])

const DEFINITION_SELECTORS = new Set<string>([
  '.war-root',
  'body[data-ds-dark-theme] .war-root',
])
for (let i = 0; i < 8; i++) {
  DEFINITION_SELECTORS.add(`.war-chain-hue-${i}`)
  DEFINITION_SELECTORS.add(`body[data-ds-dark-theme] .war-root .war-chain-hue-${i}`)
}

interface Segment { readonly selector: string; readonly body: string }

/** 把 WAR_CSS 切成 selector+body 段（先剥注释；本项目 CSS 无嵌套规则；keyframes
 * 的嵌套段会被切成无害碎片，其内无 hex/dsw，判定不受影响）。 */
function segments(css: string): Segment[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Segment[] = []
  let cursor = 0
  while (cursor < stripped.length) {
    const open = stripped.indexOf('{', cursor)
    if (open < 0) break
    const close = stripped.indexOf('}', open)
    if (close < 0) break
    const head = stripped.slice(cursor, open)
    const selector = head.slice(Math.max(head.lastIndexOf('}') + 1, head.lastIndexOf(';') + 1)).trim()
    out.push({ selector, body: stripped.slice(open + 1, close) })
    cursor = close + 1
  }
  return out
}

test('war-tokens: 令牌闭合——每个被引用的 --war-* 都有静态定义', () => {
  const defined = new Set<string>()
  for (const m of WAR_CSS.matchAll(/--war-[a-z0-9-]+\s*:/g)) defined.add(m[0].replace(/\s*:/, ''))
  assert.ok(defined.size > 40, `令牌定义数量异常: ${defined.size}`)
  const referenced = new Set<string>()
  for (const m of WAR_CSS.matchAll(/var\(--war-[a-z0-9-]+/g)) referenced.add(m[0].slice('var('.length))
  const missing = [...referenced].filter(n => !defined.has(n) && !RUNTIME_VARS.has(n))
  assert.deepEqual(missing, [], `引用了未定义的 --war-* 令牌（旧案 --war-canvas-bg 就是这么炸的）`)
})

test('war-tokens: 组件区纯净——无 dsw 直穿、无裸 hex（豁免清单外）', () => {
  const segs = segments(WAR_CSS)
  assert.ok(segs.length > 60, `CSS 段数异常: ${segs.length}`)
  const offenders: string[] = []
  for (const { selector, body } of segs) {
    // 令牌定义块 = 基元层；宿主铬层（war-sidebar-* 挂 .war-root 之外的宿主侧栏）
    // 刻意保留 dsw 直引——两者都不是组件区。
    if (DEFINITION_SELECTORS.has(selector) || selector.startsWith('.war-sidebar-row')) continue
    if (body.includes('var(--dsw-')) offenders.push(`dsw 直穿 @ ${selector}`)
    for (const line of body.split('\n')) {
      if (!/#[0-9a-fA-F]{3,8}\b/.test(line)) continue
      if (line.includes('mask-image')) continue // mask 需字面黑
      if (line.includes('#fff 28%')) continue // 星球镜面高光（美术）
      if (/#000\b/.test(line)) continue // 中性阴影混（阴影令牌之外的定制投影）
      if (/var\(--[a-z-]+,\s*#/.test(line)) continue // var() 回退值
      offenders.push(`裸 hex @ ${selector}: ${line.trim().slice(0, 80)}`)
    }
  }
  assert.deepEqual(offenders, [], '组件规则出现了未令牌化的色值')
})

test('war-tokens: 皮肤钩子与场景令牌组在场', () => {
  assert.ok(WAR_CSS.includes('data-war-skin'), '皮肤钩子注释/选择器应在场')
  assert.ok(WAR_CSS.includes('.war-root{') || WAR_CSS.includes('.war-root {'), '浅色令牌块在场')
  for (const tok of ['--war-text-1', '--war-text-2', '--war-text-3', '--war-border', '--war-border-soft', '--war-font', '--war-font-code',
    '--war-run-border', '--war-wait-border', '--war-done-border', '--war-fail-border',
    '--war-band-task', '--war-band-field', '--war-band-report',
    '--war-wz-wait', '--war-wz-battle', '--war-wz-held', '--war-wz-hl', '--war-wz-line',
    '--war-tac-bg0', '--war-tac-hq', '--war-log-order', '--war-log-retreat',
    '--war-sky-bg', '--war-sky-vig', '--war-chart-bg', '--war-sun']) {
    assert.ok(WAR_CSS.includes(`${tok}:`), `语义令牌 ${tok} 缺定义`)
  }
})

/** 从令牌块里抓单值定义（浅色块=第一个匹配，深色块=带 body 前缀选择器的匹配） */
function tokenValue(css: string, token: string, dark: boolean): string | null {
  const pattern = dark
    ? new RegExp(`body\\[data-ds-dark-theme\\] \\.war-root\\{[\\s\\S]*?${token}:\\s*([^;]+);`)
    : new RegExp(`\\.war-root\\{[\\s\\S]*?${token}:\\s*([^;]+);`)
  const m = css.match(pattern)
  return m === null ? null : m[1]!.trim()
}

test('war-tokens: 回退哨兵——TAC_FALLBACK 与 CSS 令牌双向锁值', () => {
  const pairs: ReadonlyArray<readonly [string, keyof typeof TAC_FALLBACK_DARK, string]> = [
    ['--war-wz-wait', 'wait', '#'],
    ['--war-wz-battle', 'battle', '#'],
    ['--war-wz-held', 'held', '#'],
    ['--war-wz-hl', 'hl', '#'],
    ['--war-tac-bg0', 'bg0', '#'],
    ['--war-tac-hq', 'hq', '#'],
    ['--war-tac-corner', 'corner', 'r'],
  ]
  for (const [tok, key] of pairs) {
    assert.equal(tokenValue(WAR_CSS, tok, false), TAC_FALLBACK_LIGHT[key], `浅色回退与 CSS 漂移: ${tok}`)
    assert.equal(tokenValue(WAR_CSS, tok, true), TAC_FALLBACK_DARK[key], `深色回退与 CSS 漂移: ${tok}`)
  }
  // 环境守卫：无 DOM 时按参数回退（headless 与 probe 强转场景的正确基线）
  assert.equal(readTacPalette(false), TAC_FALLBACK_LIGHT)
  assert.equal(readTacPalette(true), TAC_FALLBACK_DARK)
})

test('war-tokens: 日志色 kind 化——回退与 CSS 令牌双向锁值', () => {
  const kinds: WzLogKind[] = ['order', 'engage', 'triumph', 'retreat', 'return', 'review']
  for (const k of kinds) {
    assert.equal(tokenValue(WAR_CSS, `--war-log-${k}`, false), warLogColors(false)[k], `浅色日志回退漂移: ${k}`)
    assert.equal(tokenValue(WAR_CSS, `--war-log-${k}`, true), warLogColors(true)[k], `深色日志回退漂移: ${k}`)
  }
})

test('war-tokens: 链色回退哨兵——CHAIN_HUE_FALLBACK 与 CSS 八相槽双向锁值（V13）', () => {
  const chainHue = (slot: number, dark: boolean): string | null => {
    const re = dark
      ? new RegExp(`body\\[data-ds-dark-theme\\] \\.war-root \\.war-chain-hue-${slot}\\{--chain-hue:([^;}]+)`)
      : new RegExp(`(?<!dark-theme\\] \\.war-root )\\.war-chain-hue-${slot}\\{--chain-hue:([^;}]+)`)
    const m = WAR_CSS.match(re)
    return m === null ? null : m[1]!.trim()
  }
  for (let slot = 0; slot < 8; slot++) {
    assert.equal(chainHue(slot, false), CHAIN_HUE_FALLBACK[slot]!.light, `浅色链槽 ${slot} 回退漂移`)
    assert.equal(chainHue(slot, true), CHAIN_HUE_FALLBACK[slot]!.dark, `深色链槽 ${slot} 回退漂移`)
  }
  // headless 环境守卫：无 DOM 时按宿主主题回退（浅）
  assert.equal(readChainHue(0), CHAIN_HUE_FALLBACK[0]!.light)
})
