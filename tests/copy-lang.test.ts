/**
 * i18n 词典完备性（sd 回流自 stardeck，2026-09-02 定案「支持多语言」）：
 * EN 词典与中文源词典键形逐键对齐——缺键/多键/叶子类型不符（字符串 vs 函数）
 * 即 FAIL。这是 i18n 的完整性铁门：不许静默回落中文（那会出现半截语言界面而
 * 不自知）。另锁：语言切换换库行为 + EN trek 派生生效（词表命中至少一处）+
 * 语言键在场。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { warCopy, plainCopy, activeCopy, setLang, langId, setSkin } from '../src/client/copy.ts'
import { enWarCopy, enPlainCopy } from '../src/client/copy-en.ts'

/** 深走取键路径集合（数组按索引展开为路径段）。 */
function keyPaths(v: unknown, base: string): string[] {
  if (typeof v === 'function') return [`${base}()`]
  if (Array.isArray(v)) return v.flatMap((x, i) => keyPaths(x, `${base}[${i}]`))
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => keyPaths(x, base === '' ? k : `${base}.${k}`))
  return [base]
}

test('i18n 完备性：enWarCopy 与 warCopy 键形逐键对齐', () => {
  const zh = new Set(keyPaths(warCopy, ''))
  const en = new Set(keyPaths(enWarCopy, ''))
  const missing = [...zh].filter(k => !en.has(k))
  const extra = [...en].filter(k => !zh.has(k))
  assert.deepEqual(missing, [], `EN 军事典缺键：${missing.join(', ')}`)
  assert.deepEqual(extra, [], `EN 军事典多键：${extra.join(', ')}`)
})

test('i18n 完备性：enPlainCopy 与 plainCopy 键形逐键对齐', () => {
  const zh = new Set(keyPaths(plainCopy, ''))
  const en = new Set(keyPaths(enPlainCopy, ''))
  const missing = [...zh].filter(k => !en.has(k))
  const extra = [...en].filter(k => !zh.has(k))
  assert.deepEqual(missing, [], `EN 平话典缺键：${missing.join(', ')}`)
  assert.deepEqual(extra, [], `EN 平话典多键：${extra.join(', ')}`)
})

test('i18n 行为：setLang 换库、EN 文案与中文不同源、恢复 zh', () => {
  const zhTitle = activeCopy().head.title
  setLang('en')
  assert.equal(langId(), 'en')
  const enTitle = activeCopy().head.title
  assert.notEqual(enTitle, zhTitle)
  assert.ok(/[A-Za-z]/.test(enTitle), `EN 标题应含拉丁字母：${enTitle}`)
  setLang('zh')
  assert.equal(activeCopy().head.title, zhTitle)
})

test('i18n trek 派生：EN trek 皮肤 ≠ EN 军事皮肤（词表命中）', () => {
  setLang('en')
  setSkin('war')
  const warTitle = activeCopy().head.title
  setSkin('trek')
  const trekTitle = activeCopy().head.title
  setSkin('war')
  setLang('zh')
  assert.notEqual(trekTitle, warTitle, `EN trek 应从军事典派生出新词（${warTitle} → ?）`)
})

test('i18n 语言键：两份中文典与两份英典的 settings.lang* 四键齐备', () => {
  for (const [name, c] of [['warCopy', warCopy], ['plainCopy', plainCopy], ['enWarCopy', enWarCopy], ['enPlainCopy', enPlainCopy]] as const) {
    const s = c.settings
    assert.ok(s.langSection.length > 0, `${name}.settings.langSection 在场`)
    assert.ok(s.langZh.length > 0 && s.langEn.length > 0, `${name}.settings.langZh/langEn 在场`)
    assert.ok(s.langHint.length > 0, `${name}.settings.langHint 在场`)
  }
})

test('i18n 边界：中文典不夹英文正文（审计轮正典词面不被 EN 侵蚀）', () => {
  assert.equal(warCopy.head.title, '作战室')
  assert.equal(plainCopy.head.title, '工作台')
  assert.equal(enWarCopy.head.title, 'War Room')
  assert.equal(enPlainCopy.head.title, 'Workbench')
})
