/**
 * V13 战线一等公民纯函数测试：frontsOf 血脉∩战场拆分（元首定案 2026-08-28——
 * 战线锚定Ⅰ代战场，后续代跨战场=新战线的Ⅰ；成形代继承父代战线）、跨代并集
 * （pivot 共享任务去重）、聚合态；wsKeyOf 合成沙盒判定。
 * @module dsh-plugin-warroom/tests/front
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { commandTasks, frontsOf, frontOfTaskMap, greedyRootHues, isSyntheticWs, wsKeyOf, UNGROUPED_WS_KEY } from '../src/client/front.ts'
import type { BoardCommand, BoardTask } from '../src/client/data.ts'

const cmd = (id: string, root: string, gen: number, taskId: string | null, createdAt: string, extra?: Partial<BoardCommand>): BoardCommand => ({
  commandId: id, text: `命令${id}`, createdAt, status: 'approved', staffSessionId: null, taskId,
  cancelledReason: null, grade: 'L0', gradeReason: null, gradeConfidence: 1, regrades: 0, plan: null, schedule: null,
  chain: { generation: gen, rootId: root, length: gen, hueSlot: gen % 8 }, continuation: null,
  ...extra,
})
const task = (id: string, status: BoardTask['status'], ws: string | null, deps: readonly string[] = [], ended: string | null = '2026-08-28T10:00:00Z'): BoardTask => ({
  taskId: id, title: `任务${id}`, brief: 'b', acceptance: 'a', priority: 'normal', status,
  workspacePath: ws, deps: [...deps], claimedBy: null, attempt: 1, attempts: 1, quotaPaused: false,
  startedAt: '2026-08-28T09:00:00Z',
  attemptLog: [{ id: 'a1', sessionId: 's1', startedAt: '2026-08-28T09:00:00Z', endedAt: ended, outcome: status === 'closed' ? 'succeeded' : status === 'failed' ? 'failed' : 'reported' }],
} as unknown as BoardTask)

test('front: 合成沙盒判定——.warroom 下 tasks/instances 归未分组，其余原样', () => {
  assert.equal(isSyntheticWs('C:/srv/.warroom/tasks/20260828-abc'), true)
  assert.equal(isSyntheticWs('C:/srv/.warroom/instances/20260828-abc-slug'), true)
  assert.equal(isSyntheticWs('D:/smoke/projC/deploy'), false)
  assert.equal(isSyntheticWs('D:/proj/tasks/subtask'), false, '无 .warroom 段的真实项目子目录不是沙盒')
  assert.equal(wsKeyOf(null), null)
  assert.equal(wsKeyOf(''), null)
  assert.equal(wsKeyOf('D:/p1'), 'D:/p1')
  assert.equal(wsKeyOf('C:/srv/.warroom/tasks/t1'), UNGROUPED_WS_KEY)
})

test('front: 血脉∩战场拆分——Ⅱ 代跨战场即新战线（锚=段首代），pivot 共享任务去重', () => {
  const commands = [
    cmd('c1', 'A', 1, 't1', '2026-08-27T09:00:00Z'), // Ⅰ 在 D:/p1
    cmd('c2', 'A', 2, 't2', '2026-08-27T15:00:00Z'), // Ⅱ 被发去合成沙盒 → 拆为新战线
    cmd('c3', 'A', 3, 't2', '2026-08-28T08:00:00Z'), // Ⅲ pivot：与 Ⅱ 共享任务 t2（同沙盒）
    cmd('c4', 'B', 1, 't3', '2026-08-26T09:30:00Z'), // 独立战线，同在 D:/p1（战场可容纳多条战线）
  ]
  const tasks = [
    task('t1', 'closed', 'D:/p1'),
    task('t2', 'in_progress', 'C:/srv/.warroom/tasks/t2'),
    task('t3', 'published', 'D:/p1'),
  ]
  const fronts = frontsOf(commands, tasks, tid => {
    if (tid === 't1') return 'c1'
    if (tid === 't2') return 'c2'
    if (tid === 't3') return 'c4'
    return null
  })
  assert.equal(fronts.length, 3, '血脉 A 拆两段 + 血脉 B')
  const a1 = fronts.find(f => f.generations[0]!.commandId === 'c1')!
  const a2 = fronts.find(f => f.generations[0]!.commandId === 'c2')!
  const b = fronts.find(f => f.generations[0]!.commandId === 'c4')!
  // 段 1：仅 c1，锚定 D:/p1，已收官
  assert.deepEqual(a1.generations.map(c => c.commandId), ['c1'])
  assert.equal(a1.battlefield, 'D:/p1')
  assert.equal(a1.agg.settled, true)
  assert.equal(a1.title, '命令c1')
  // 段 2：c2+c3（pivot 同沙盒不拆），锚=未分组，任务并集去重 [t2]
  assert.deepEqual(a2.generations.map(c => c.commandId), ['c2', 'c3'])
  assert.equal(a2.battlefield, UNGROUPED_WS_KEY)
  assert.deepEqual(a2.tasks.map(t => t.taskId), ['t2'], 'pivot 共享任务去重')
  assert.equal(a2.rootCommandId, 'c2', '跨战场段的锚=段首代（新战线的Ⅰ）')
  assert.equal(a2.agg.live, true)
  // 段 3：独立战线同战场——战场可容纳多条战线
  assert.equal(b.battlefield, 'D:/p1')
  assert.equal(b.agg.waiting, true, 'published 任务=等你')
  // 任务→战线归属（pivot 任务归段 2）
  const m = frontOfTaskMap(fronts)
  assert.equal(m.get('t2')!.rootCommandId, 'c2')
  assert.equal(m.get('t1')!.rootCommandId, 'c1')
})

test('front: Ⅳ 回原战场不回接（相对父代拆分）+ 成形代继承父战线', () => {
  const commands = [
    cmd('c1', 'A', 1, 't1', '2026-08-25T09:00:00Z'), // P
    cmd('c2', 'A', 2, 't2', '2026-08-25T12:00:00Z'), // Q → 拆
    cmd('c3', 'A', 3, 't3', '2026-08-25T15:00:00Z'), // 回 P —— 父代(c2)在 Q → 再拆（不回接段1）
    cmd('c4', 'A', 4, null, '2026-08-25T18:00:00Z', { status: 'received' }), // 成形代：无任务 → 继承父代(c3)所在段
  ]
  const tasks = [
    task('t1', 'closed', 'P'),
    task('t2', 'closed', 'Q'),
    task('t3', 'closed', 'P'),
  ]
  const fronts = frontsOf(commands, tasks, tid => (tid === 't1' ? 'c1' : tid === 't2' ? 'c2' : 'c3'))
  assert.equal(fronts.length, 3, '三段：[c1](P) / [c2](Q) / [c3+c4](P，成形继承)')
  const seg3 = fronts.find(f => f.generations[0]!.commandId === 'c3')!
  assert.deepEqual(seg3.generations.map(c => c.commandId), ['c3', 'c4'], '成形代 c4 归父代所在段')
  assert.equal(seg3.agg.live, true, '成形代在=战线未收官')
})

test('front: 全终局=settled；无任务链 battlefield=null（不上星域）', () => {
  const settledCmds = [cmd('c1', 'A', 1, 't1', '2026-08-27T09:00:00Z')]
  const f1 = frontsOf(settledCmds, [task('t1', 'closed', 'D:/p1')], () => 'c1')[0]!
  assert.equal(f1.agg.settled, true)
  assert.equal(f1.agg.live, false)
  const formingCmds = [cmd('c1', 'A', 1, null, '2026-08-27T09:00:00Z', { status: 'received' })]
  const f2 = frontsOf(formingCmds, [], () => null)[0]!
  assert.equal(f2.agg.live, true)
  assert.equal(f2.battlefield, null, '未锚定=航迹不上星域，但任务列分组照常')
})

test('front: commandTasks 迁移后行为不变（deps 闭包 + 依赖序）', () => {
  const c = cmd('c1', 'A', 1, 't1', '2026-08-27T09:00:00Z')
  const tasks = [
    task('t1', 'closed', 'D:/p1'),
    task('t2', 'in_progress', 'D:/p1', ['t1']),
    task('t9', 'published', 'D:/p2'),
  ]
  const got = commandTasks(c, tasks)
  assert.deepEqual(got.map(t => t.taskId), ['t1', 't2'], '闭包含后继、依赖序前驱在前、无关任务排除')
  assert.deepEqual(commandTasks({ ...c, taskId: null }, tasks), [])
})

test('front: 孤儿任务不造战线；cancelled 全取消链=settled', () => {
  const cmds = [cmd('c1', 'A', 1, null, '2026-08-27T09:00:00Z', { status: 'cancelled', cancelledReason: 'r' })]
  const f = frontsOf(cmds, [], () => null)[0]!
  assert.equal(f.agg.settled, true)
})

test('front: greedyRootHues 链色防撞——同屏活跃血脉互异、同血脉恒同色', () => {
  // 哈希撞槽无法直接构造（hueSlot 由 seed 定死）——用受控 hueSlot 直接验证贪心：
  // 三个血脉全给槽 7（演示板实况），重排后必互异且活跃优先保位。
  const mk = (id: string, root: string, slot: number, created: string) => cmd(id, root, 1, null, created, { chain: { generation: 1, rootId: root, length: 1, hueSlot: slot } })
  const cmds = [
    mk('x1', 'r1', 7, '2026-08-28T09:00:00Z'),
    mk('x2', 'r2', 7, '2026-08-28T08:00:00Z'),
    mk('x3', 'r3', 7, '2026-08-28T07:00:00Z'),
  ]
  const hues = greedyRootHues(cmds)
  assert.equal(hues.get('r1'), 7) // 最活跃保哈希槽
  const slots = [...hues.values()].sort()
  assert.equal(new Set(slots).size, 3, `三血脉应互异: ${slots}`)
  // 同血脉多段（拆分出的两段）恒同色
  const chain = [
    cmd('a1', 'root', 1, 't1', '2026-08-28T09:00:00Z', { chain: { generation: 1, rootId: 'root', length: 2, hueSlot: 3 } }),
    cmd('a2', 'root', 2, 't2', '2026-08-28T10:00:00Z', { chain: { generation: 2, rootId: 'root', length: 2, hueSlot: 3 } }),
  ]
  const hues2 = greedyRootHues(chain)
  assert.equal(hues2.get('root'), 3)
  // frontsOf 输出用重排槽（不是服务器原槽）
  const tasks = [task('t1', 'closed', 'C:/p/a'), task('t2', 'closed', 'C:/p/b')]
  const fs2 = frontsOf(chain, tasks, tid => (tid === 't1' ? 'a1' : 'a2'))
  assert.equal(new Set(fs2.map(f => f.hueSlot)).size, 1)
  assert.equal(fs2[0]!.hueSlot, 3)
})

test('front: 超过 8 条血脉时贪心回绕（不崩、槽位均衡）', () => {
  const cmds = Array.from({ length: 10 }, (_, i) =>
    cmd(`y${i}`, `r${i}`, 1, null, `2026-08-28T0${i}:00:00Z`, { chain: { generation: 1, rootId: `r${i}`, length: 1, hueSlot: 0 } }))
  const hues = greedyRootHues(cmds)
  assert.equal(hues.size, 10)
  const counts = new Array(8).fill(0)
  for (const v of hues.values()) counts[v]++
  assert.ok(counts.every(c => c <= 2), `10 血脉 8 槽应 ≤2/槽: ${counts}`)
})
