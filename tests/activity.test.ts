import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ActivityTracker, activityLabel, classifyTool, reduceActivity, type AttemptActivity } from '../src/activity.ts'
import { boardRevision } from '../src/dashboard.ts'

const T0 = '2026-08-26T08:00:00.000Z'
const base: AttemptActivity = { verb: { kind: 'idle' }, ts: '' }

/** 宿主真实形状：SessionEvent = { type, seq, time, data }（2026-08-26 实测，
 * 与 api-proxy 消费侧 event.data 同源）。 */
const ev = (type: string, data: Record<string, unknown> = {}): unknown => ({ type, seq: 1, time: 0, data })

test('V9.11 R2 动词映射: 八态全覆盖（思考/探索/已探索/编辑/已编辑/运行/命令完成/待命）', () => {
  assert.equal(activityLabel({ kind: 'idle' }), '待命')
  assert.equal(activityLabel({ kind: 'thinking' }), '思考中')
  let a = reduceActivity(base, ev('step/start'), T0)
  assert.equal(activityLabel(a.verb), '思考中')
  a = reduceActivity(a, ev('tool/call', { callId: 'c1', name: 'read' }), T0)
  assert.equal(activityLabel(a.verb), '探索中')
  a = reduceActivity(a, ev('tool/result', { callId: 'c1' }), T0)
  assert.equal(activityLabel(a.verb), '已探索')
  a = reduceActivity(a, ev('tool/call', { callId: 'c2', name: 'Edit' }), T0)
  assert.equal(activityLabel(a.verb), '编辑中')
  a = reduceActivity(a, ev('tool/result', { message: { callId: 'c2' } }), T0)
  assert.equal(activityLabel(a.verb), '已编辑')
  a = reduceActivity(a, ev('tool/call', { callId: 'c3', name: 'bash' }), T0)
  assert.equal(activityLabel(a.verb), '运行命令')
  a = reduceActivity(a, ev('tool/result', { message: { source: { callId: 'c3' } } }), T0)
  assert.equal(activityLabel(a.verb), '命令完成')
  a = reduceActivity(a, ev('turn/end'), T0)
  assert.equal(activityLabel(a.verb), '待命')
})

test('V9.11 R2 嵌套/扁平两头兼容: data 缺席时退回顶层展开（形状漂移不炸）', () => {
  let a = reduceActivity(base, { type: 'tool/call', callId: 'f1', name: 'grep' }, T0)
  assert.equal(activityLabel(a.verb), '探索中')
  a = reduceActivity(a, { type: 'tool/result', callId: 'f1' }, T0)
  assert.equal(activityLabel(a.verb), '已探索')
  // 真实 tool/result 形状之一：callId 在 message.content 首块。
  a = reduceActivity(a, ev('tool/call', { callId: 'c9', name: 'bash' }), T0)
  a = reduceActivity(a, ev('tool/result', { message: { content: [{ callId: 'c9' }] } }), T0)
  assert.equal(activityLabel(a.verb), '命令完成')
})

test('V9.11 R2 动词映射: 未归类工具走 通用·工具名 兜底（进行/完成）', () => {
  assert.equal(activityLabel(classifyTool('war_deploy_unit')), '执行中·war_deploy_unit')
  let a = reduceActivity(base, ev('tool/call', { callId: 'c9', name: 'war_deploy_unit' }), T0)
  assert.equal(activityLabel(a.verb), '执行中·war_deploy_unit')
  a = reduceActivity(a, ev('tool/result', { callId: 'c9' }), T0)
  assert.equal(activityLabel(a.verb), 'war_deploy_unit·完成')
})

test('V9.11 R2 工具分类: 大小写不敏感 + 子串容忍（宿主工具名跨版本变形）', () => {
  assert.equal(classifyTool('Read').kind, 'exploring')
  assert.equal(classifyTool('WebSearch').kind, 'exploring')
  assert.equal(classifyTool('NOTEBOOKEEDIT').kind, 'editing')
  assert.equal(classifyTool('Bash').kind, 'running')
  assert.equal(classifyTool('shell_exec').kind, 'running')
  assert.equal(classifyTool('run').kind, 'running')
  // 未命中任何关键字的工具名落兜底（名字含 run 子串的 grunt 语义上也是跑命令）。
  assert.equal(classifyTool('trampoline').kind, 'tool')
})

test('V9.11 R2 callId 配对: 乱序 result 不改写当前动词；缺 callId 退化为最近完成', () => {
  let a = reduceActivity(base, ev('tool/call', { callId: 'c1', name: 'edit' }), T0)
  // 别的调用的 result 先到（并行调用乱序）——当前编辑中不许被翻成已编辑。
  a = reduceActivity(a, ev('tool/result', { callId: 'other' }), T0)
  assert.equal(activityLabel(a.verb), '编辑中')
  // 形状漂变拿不到 callId：顺序语义下按最近调用完成处理。
  a = reduceActivity(a, ev('tool/result', {}), T0)
  assert.equal(activityLabel(a.verb), '已编辑')
  // 非进行态上的野 result：原样不动。
  const before = a
  const after = reduceActivity(a, ev('tool/result', { callId: 'x' }), T0)
  assert.equal(after, before)
})

test('V9.11 R2 未知事件: 引用相等返回（调用方免写 Map）', () => {
  for (const e of [ev('user/message', { source: { kind: 'human' } }), ev('todo/write', { todos: [] }), ev('assistant/chunk'), {}, { type: 42 }, null]) {
    assert.equal(reduceActivity(base, e, T0), base)
  }
})

test('V9.11 R2 滚动表: snapshot 全量会话皆记；重启语义=无记录归 null', () => {
  const t = new ActivityTracker(() => T0)
  assert.equal(t.snapshot('sec-a'), null)
  t.handle('sec-a', ev('step/start'))
  assert.deepEqual(t.snapshot('sec-a'), { verb: 'thinking', label: '思考中', ts: T0 })
  // 非尝试会话也照记（板投影只取 live attempt 的 sessionId——全量记无副作用）。
  t.handle('sec-other', ev('tool/call', { callId: 'c', name: 'grep' }))
  assert.equal(t.snapshot('sec-other')?.label, '探索中')
})

test('V9.11 R2 revision 盐: 只随动词变化（同动词连发不空转 SSE）', () => {
  const t = new ActivityTracker(() => T0)
  const s0 = t.salt()
  t.handle('sec-a', ev('step/start'))
  assert.notEqual(t.salt(), s0)
  t.handle('sec-a', ev('tool/call', { callId: 'c1', name: 'read' }))
  const s2 = t.salt()
  // 连续多次 read（事件在走、动词不变）——盐必须稳定，SSE 不空转。
  for (let i = 2; i <= 10; i++) {
    t.handle('sec-a', ev('tool/call', { callId: `c${i}`, name: 'read' }))
  }
  assert.equal(t.salt(), s2)
  t.handle('sec-a', ev('tool/call', { callId: 'cx', name: 'edit' }))
  assert.notEqual(t.salt(), s2)
})

test('V9.11 R2 revision: 活动盐折叠进 boardRevision（动词变→revision 变；SSE 仍只发 rev）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-activity-rev-'))
  try {
    const bare = boardRevision(dir)
    assert.equal(boardRevision(dir), bare) // 无盐幂等
    const s1 = boardRevision(dir, 'aaa')
    const s2 = boardRevision(dir, 'bbb')
    assert.notEqual(s1, bare)
    assert.notEqual(s1, s2)
    assert.equal(boardRevision(dir, 'aaa'), s1) // 同盐幂等——SSE 不空转
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
