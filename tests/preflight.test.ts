import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyGradeMarker, stalledOnUserPlan } from '../src/client/preflight.ts'
import type { BoardCommand } from '../src/client/data.ts'

/** V7-④ 夜间预检 + 起草器档位——纯函数层，node 直测。
 * 夜间的真敌人是「卡在等人」：L1/L2 未获批计划的命令夜里会停整晚。 */

function cmd(p: { grade?: BoardCommand['grade']; status?: BoardCommand['status']; plan?: BoardCommand['plan'] }): BoardCommand {
  return {
    commandId: 'c', text: 'x', createdAt: new Date().toISOString(), status: p.status ?? 'received',
    staffSessionId: null, taskId: null, cancelledReason: null,
    grade: p.grade ?? null, gradeReason: null, gradeConfidence: null, regrades: 0, plan: p.plan ?? null,
  }
}

test('stalledOnUserPlan：L1/L2 且计划未获批 → 会停在等人', () => {
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L1' })), true) // 计划还没呈报（迟早停）
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L2', plan: { text: 'p', status: 'pending', decidedAt: null } })), true)
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L1', plan: { text: 'p', status: 'rejected', decidedAt: 'x' } })), true) // 重呈中，下一站还是等用户
})

test('stalledOnUserPlan：L0/未分诊/计划已批/终态 → 不停', () => {
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L0' })), false)
  assert.equal(stalledOnUserPlan(cmd({})), false)
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L1', plan: { text: 'p', status: 'approved', decidedAt: 'x' } })), false)
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L1', status: 'approved', plan: { text: 'p', status: 'approved', decidedAt: 'x' } })), false)
  assert.equal(stalledOnUserPlan(cmd({ grade: 'L1', status: 'cancelled' })), false)
})

test('applyGradeMarker：档位拼入既有覆写标记，auto 不加', () => {
  assert.equal(applyGradeMarker('做记账工具', 'auto'), '做记账工具')
  assert.equal(applyGradeMarker('  做记账工具  ', 'L0'), '!!直接做 做记账工具')
  assert.equal(applyGradeMarker('重构 CI', 'L2'), '??先看方案 重构 CI')
})

test('applyGradeMarker：幂等——正文已手打同标记不再重复拼（取证 41e3 缺陷①回归）', () => {
  // 手打标记 + 再切同档：原文即已是目标形态，绝不产生 !!直接做 !!直接做 …
  assert.equal(applyGradeMarker('!!直接做 修CI', 'L0'), '!!直接做 修CI')
  assert.equal(applyGradeMarker('!!直接做修CI', 'L0'), '!!直接做修CI') // 手打无空格也算已标记
  assert.equal(applyGradeMarker('??先看方案 重构配置层', 'L2'), '??先看方案 重构配置层')
  // 手打带前后空白：trim 后判定幂等，输出无重复前缀。
  assert.equal(applyGradeMarker('  !!直接做 修CI  ', 'L0'), '!!直接做 修CI')
  // 跨档不吞用户手打标记（SPEC §0：文本标记最高优先，?? 在 overrideMarkerOf 先查）：
  // 拼上 L0 标记后 ?? 仍胜出——这是设计语义，测试锚定而非改动。
  assert.equal(applyGradeMarker('??先看方案 X', 'L0'), '!!直接做 ??先看方案 X')
})

test('applyGradeMarker：纯空白正文返回空串——不产只有标记没有命令的文本（缺陷②硬化）', () => {
  assert.equal(applyGradeMarker('   ', 'L0'), '')
  assert.equal(applyGradeMarker('\t\n', 'L2'), '')
  assert.equal(applyGradeMarker('', 'auto'), '')
})
