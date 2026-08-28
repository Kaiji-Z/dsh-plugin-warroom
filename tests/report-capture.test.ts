import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseUnitReportEvent } from '../src/report-capture.ts'

/** 宿主真实形状：SessionEvent = { type, seq, time, data }（2026-08-26 实测）。 */
const nested = (data: Record<string, unknown>): unknown => ({ type: 'user/message', seq: 7, time: 0, data })

const REPORT_TEXT = 'Background subagent unit-42 汇报：已修复 README 里的链接并验证。'
const SETTLED_TEXT = 'Background subagent unit-42 settled: completed'

test('V9.12 R1 嵌套形状（真实宿主）: report/settled 都能解析出 kind+childId+text', () => {
  const r = parseUnitReportEvent(nested({ source: { kind: 'subagent-report' }, content: [{ type: 'text', text: REPORT_TEXT }] }))
  assert.deepEqual(r, { kind: 'subagent-report', childId: 'unit-42', text: REPORT_TEXT })
  const s = parseUnitReportEvent(nested({ source: { kind: 'subagent-settled' }, content: [{ type: 'text', text: SETTLED_TEXT }] }))
  assert.deepEqual(s, { kind: 'subagent-settled', childId: 'unit-42', text: SETTLED_TEXT })
})

test('V9.12 R1 嵌套形状: 多 text 块拼行；非 text 块（图/工具）跳过', () => {
  const r = parseUnitReportEvent(nested({
    source: { kind: 'subagent-report' },
    content: [
      { type: 'image', url: 'x' },
      { type: 'text', text: 'Background subagent unit-7 起报' },
      { type: 'text', text: '第二行' },
    ],
  }))
  assert.equal(r?.childId, 'unit-7')
  assert.equal(r?.text, 'Background subagent unit-7 起报\n第二行')
})

test('V9.12 R1 扁平退回: 无 data 包裹的旧形状同样可解析（两头兼容）', () => {
  const r = parseUnitReportEvent({ type: 'user/message', source: { kind: 'subagent-report' }, content: [{ type: 'text', text: REPORT_TEXT }] })
  assert.deepEqual(r, { kind: 'subagent-report', childId: 'unit-42', text: REPORT_TEXT })
})

test('V9.12 R1 畸形防御: 一切不符形状返 null，绝不抛', () => {
  const nulls: unknown[] = [
    null,
    undefined,
    42,
    'user/message',
    {},
    { type: 'assistant/chunk' },
    { type: 'user/message' }, // 无 source
    nested({ source: { kind: 'human' }, content: [{ type: 'text', text: 'hi' }] }), // 人话非任务回报
    nested({ source: { kind: 'subagent-report' }, content: [{ type: 'text', text: '没有子代理 id' }] }), // 文本无 id
    nested({ source: { kind: 'subagent-report' } }), // 无 content
    nested({ source: { kind: 'subagent-report' }, content: '不是数组' }),
    nested({ source: { kind: 'subagent-report' }, content: [{ type: 'text' }] }), // text 块无 text 字段 → 无 id
    { type: 'user/message', data: 42 }, // data 非对象
  ]
  for (const e of nulls) assert.equal(parseUnitReportEvent(e), null)
})

test('V9.12 R1 首行语义: settled 的 stopReason 取首行（调用方 text.split 约定不破）', () => {
  const s = parseUnitReportEvent(nested({ source: { kind: 'subagent-settled' }, content: [{ type: 'text', text: `${SETTLED_TEXT}\n后续行不该进 stopReason` }] }))
  assert.equal(s?.text.split('\n')[0], SETTLED_TEXT)
})
