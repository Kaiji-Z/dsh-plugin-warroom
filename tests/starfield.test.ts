import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chainHueSlot, deriveContinuation, foldChains, foldDirectives, type Directive } from '../src/directives.ts'
// 星域布局纯函数——坐标确定性是 V10 的视觉红线（SSE 零抖动）。
import { galaxyLayout, garrisonOf, hash01, moonPos, planetAngleDeg, planetLabel, workspaceCreationOrder } from '../src/client/starfield.tsx'

function chainsFor(dirs: readonly Directive[]) {
  return foldChains(dirs)
}

test('星域布局：workspace 创建序=内老外新，黄金角方位，坐标百分比且稳定', () => {
  const a = galaxyLayout(['/ws/Alpha', '/ws/Beta', '/ws/Gamma'])
  assert.equal(a.length, 3)
  assert.deepEqual(a.map(p => p.ring), [1, 2, 3], '创建序即圈序')
  assert.equal(planetAngleDeg(0), 270, '第 0 环朝正上方起锚')
  assert.ok(planetAngleDeg(1) !== planetAngleDeg(2) && planetAngleDeg(9) >= 0 && planetAngleDeg(9) < 360)
  // 径向随圈外扩（椭圆 rx=14+k*12）：同方位角下距心单调增没法直接比（角不同），
  // 改验椭圆参数口径——ring 与坐标都在 0-100 域内且两次调用逐位相等。
  for (const p of [...a]) {
    assert.ok(p.xPct >= 0 && p.xPct <= 100 && p.yPct >= 0 && p.yPct <= 100)
    assert.deepEqual(galaxyLayout(['/ws/Alpha', '/ws/Beta', '/ws/Gamma'])[p.ring - 1], p, '确定性：重算逐位相等')
  }
})

test('星域布局：空输入与超量 workspaces 不炸不越界', () => {
  assert.deepEqual(galaxyLayout([]), [])
  const many = Array.from({ length: 20 }, (_, i) => `/ws/w${i}`)
  const laid = galaxyLayout(many)
  assert.equal(laid.length, 20)
  for (const p of laid) {
    assert.ok(p.xPct >= 9 - 0.01 && p.xPct <= 91 + 0.01, 'X 被夹紧')
    assert.ok(p.yPct >= 8 - 0.01 && p.yPct <= 90 + 0.01, 'Y 被夹紧')
  }
})

test('光点相位：同会话恒同位；不同会话散布；moonPos 挂在行星近旁', () => {
  const spec = galaxyLayout(['/only'])[0]!
  const m1 = moonPos(spec, 'sess-fixed')
  assert.deepEqual(m1, moonPos(spec, 'sess-fixed'), '零抖动契约')
  assert.notDeepEqual(moonPos(spec, 'a'), moonPos(spec, 'b'))
  assert.ok(Math.abs(m1.xPct - spec.xPct) <= 4.61 && Math.abs(m1.yPct - spec.yPct) <= 4.61 * 0.72 + 0.01, '近地轨道半径内')
  const h = hash01('any-id')
  assert.ok(h >= 0 && h < 1)
  assert.equal(hash01('same'), hash01('same'))
})

test('workspace 创建序：按最早任务出场顺序升序，空路径不入册', () => {
  const order = workspaceCreationOrder([
    { workspacePath: '/ws/B', startedAt: 't3' },
    { workspacePath: null, startedAt: 't0' },
    { workspacePath: '/ws/A', startedAt: 't5' },
    { workspacePath: '/ws/B', startedAt: 't1' },
    { workspacePath: '', startedAt: 't2' },
  ])
  // 各 workspace 取最早任务时刻比较：B 首次出场 t1 早于 A 的 t5。
  assert.deepEqual(order, ['/ws/B', '/ws/A'])
})

test('驻军切片：活体 attempt 光点 + closed 达成计数；非本星任务不串门', () => {
  const base = { priority: 'normal' as const, quality: 'common' as const, rounds: 1, attempts: 1, deps: [] as string[], lastError: null, claimedBy: null, brief: '', acceptance: '', schedule: null, troops: [], deliverables: [], reports: [], comments: [], closedVerdict: null }
  const tasks = [
    { ...base, taskId: 'T1', title: 't1', status: 'in_progress' as const, startedAt: 't0', workspacePath: '/ws/A',
      attemptLog: [{ id: 'a1', n: 1, sessionId: 'live-1', startedAt: 't1', endedAt: null, outcome: null }] },
    { ...base, taskId: 'T2', title: 't2', status: 'closed' as const, startedAt: 't0', workspacePath: '/ws/A',
      attemptLog: [{ id: 'a2', n: 1, sessionId: 'done-1', startedAt: 't1', endedAt: 't9', outcome: 'succeeded' as const }] },
    { ...base, taskId: 'T3', title: 't3', status: 'failed' as const, startedAt: 't0', workspacePath: '/ws/B',
      attemptLog: [{ id: 'a3', n: 1, sessionId: 'x', startedAt: 't1', endedAt: 't9', outcome: 'failed' as const }] },
  ]
  const g = garrisonOf(tasks as never, '/ws/A')
  assert.deepEqual(g.orbs.map(o => o.sessionId), ['live-1'], '只收活体')
  assert.equal(g.triumphs, 1)
  assert.deepEqual(garrisonOf(tasks as never, '/ws/None').orbs, [])
})

test('星域名与旧链路回归：尾段截取；directives fold 链色槽仍在域内（跨模块联动冒烟）', () => {
  assert.equal(planetLabel('C:\\repos\\deep\\工具甲'), '工具甲')
  assert.equal(planetLabel('/home/u/beta'), 'beta')
  const dirs = foldDirectives([{ type: 'directive_created', ts: 't', directiveId: 'r', text: 'root' }])
  const chains = chainsFor(dirs)
  assert.ok(chainHueSlot(chains.rootByCommand.get('r')!) < 8)
  assert.match((deriveContinuation({ status: 'draft' }, undefined) as { error: string }).error, /大副对话/)
})
