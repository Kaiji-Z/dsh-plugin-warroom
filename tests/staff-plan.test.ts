import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, foldDirectives, loadDirectives, type DirectiveEvent } from '../src/directives.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { RouteRegistry } from '../src/dashboard.ts'
import type { Roster } from '../src/units.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_PLAN: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-plan' })
const FLAG_PLAN_ON_ALL: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-triage,staff-plan' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-staff-plan-'))
}

function makeDeps(dir: string, flags: FeatureFlags): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  return {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: {} as SubagentsServiceFace,
    commander: { conscript: async () => ({ spawned: false }) },
    workspace: { materialize: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }), materializeInstance: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }) },
    warRoot: 'C:/reg',
    flags,
  }
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId = 'sec-1'): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal })
}

function seedCommand(dir: string, id: string, text: string): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: id, text })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: id, staffSessionId: 'sec-1' })
}

test('fold：plan_opened 覆盖待批；approved/rejected 改判；重呈回到 pending（多轮收敛）', () => {
  const events: DirectiveEvent[] = [
    { type: 'directive_created', ts: 't0', directiveId: 'c1', text: 'x' },
    { type: 'directive_plan_opened', ts: 't1', directiveId: 'c1', plan: '第一稿' },
    { type: 'directive_plan_rejected', ts: 't2', directiveId: 'c1', reason: '步子太大' },
    { type: 'directive_plan_opened', ts: 't3', directiveId: 'c1', plan: '第二稿（拆小）' },
    { type: 'directive_plan_approved', ts: 't4', directiveId: 'c1' },
    // 无 plan 时判定是 no-op（乱序/重放防御）。
    { type: 'directive_plan_approved', ts: 't5', directiveId: 'c1' },
  ]
  const [d] = foldDirectives(events)
  assert.equal(d!.plan!.text, '第二稿（拆小）')
  assert.equal(d!.plan!.status, 'approved')
  assert.equal(d!.plan!.decidedAt, 't4')
  // 终态守卫：approved（命令）后的 plan_opened 被忽略。
  const [d2] = foldDirectives([
    ...events,
    { type: 'directive_approved', ts: 't6', directiveId: 'c1', taskId: 't-9' },
    { type: 'directive_plan_opened', ts: 't7', directiveId: 'c1', plan: '迟到稿' },
  ])
  assert.equal(d2!.plan!.text, '第二稿（拆小）')
})

test('war_plan 工具：太短被拒；正常落 pending；旗关不注册', async () => {
  const dir = tmpDir()
  try {
    seedCommand(dir, 'cmd-p', '重构配置层')
    const deps = makeDeps(dir, FLAG_PLAN)
    await assert.rejects(execTool(deps, 'war_plan', { command_id: 'cmd-p', plan: '太短' }), /太短/)
    const out = await execTool(deps, 'war_plan', { command_id: 'cmd-p', plan: '目标：收敛配置。步骤：1 勘察 2 迁移 3 回归。工作区：主仓。风险：回滚用 git。' }) as { planStatus: string }
    assert.equal(out.planStatus, 'pending')
    assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-p')!.plan!.status, 'pending')
    assert.equal(warTools(makeDeps(dir, FLAG_OFF)).some(t => t.name === 'war_plan'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('war_publish 硬门：L1 无计划/待批/被驳均拒；批准后放行；L0 与旗关无门', async () => {
  const dir = tmpDir()
  try {
    seedCommand(dir, 'cmd-l1', '重构配置层')
    appendDirectiveEvent(dir, { type: 'directive_triaged', ts: 't2', directiveId: 'cmd-l1', grade: 'L1', reason: '复杂' })
    const depsGate = makeDeps(dir, FLAG_PLAN)
    const pub = { title: '重构配置', brief: 'b', acceptance: 'a', commandId: 'cmd-l1' }
    // 无计划 → 拒。
    await assert.rejects(execTool(depsGate, 'war_publish', pub), /尚未呈报计划/)
    // 计划待批 → 拒。
    appendDirectiveEvent(dir, { type: 'directive_plan_opened', ts: 't3', directiveId: 'cmd-l1', plan: '目标收敛配置，步骤一二三，工作区主仓，风险回滚 git。' })
    await assert.rejects(execTool(depsGate, 'war_publish', pub), /待舰长批准/)
    // 被驳 → 拒（提示修订重呈）。
    appendDirectiveEvent(dir, { type: 'directive_plan_rejected', ts: 't4', directiveId: 'cmd-l1', reason: '再拆小' })
    await assert.rejects(execTool(depsGate, 'war_publish', pub), /被驳回/)
    // 批准 → 放行（commandApproved true）。
    appendDirectiveEvent(dir, { type: 'directive_plan_opened', ts: 't5', directiveId: 'cmd-l1', plan: '修订稿：拆两步走。' })
    appendDirectiveEvent(dir, { type: 'directive_plan_approved', ts: 't6', directiveId: 'cmd-l1' })
    const ok = await execTool(depsGate, 'war_publish', pub) as { commandApproved: boolean }
    assert.equal(ok.commandApproved, true)
    // L0 无门：分诊 L0 直接发。
    const dir2 = tmpDir()
    try {
      seedCommand(dir2, 'cmd-l0', '记一笔账')
      appendDirectiveEvent(dir2, { type: 'directive_triaged', ts: 't2', directiveId: 'cmd-l0', grade: 'L0', reason: '简单' })
      const ok0 = await execTool(makeDeps(dir2, FLAG_PLAN_ON_ALL), 'war_publish', { title: '记账小工具', brief: '每天记一句的小工具一句任务书', acceptance: 'add 后 list 可见；退出码 0', commandId: 'cmd-l0' }) as { commandApproved: boolean }
      assert.equal(ok0.commandApproved, true)
      // 旗关 + L1 无计划 → 无门（现行行为）。
      const dir3 = tmpDir()
      try {
        seedCommand(dir3, 'cmd-l1-off', '重构')
        appendDirectiveEvent(dir3, { type: 'directive_triaged', ts: 't2', directiveId: 'cmd-l1-off', grade: 'L1', reason: '复杂' })
        const okOff = await execTool(makeDeps(dir3, FLAG_OFF), 'war_publish', { title: '旗关重构案', brief: '旗关时超短任务书也应放行通过', acceptance: '旗关无 lint 直接放行', commandId: 'cmd-l1-off' }) as { commandApproved: boolean }
        assert.equal(okOff.commandApproved, true)
      } finally {
        rmSync(dir3, { recursive: true, force: true })
      }
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('计划判定路由：旗关 404；approve/reject 落事件；无待批计划被拒；K17 判定回推', async () => {
  const dir = tmpDir()
  const { registerDashboard } = await import('../src/dashboard.ts')
  const pushes: Array<{ sessionId: string; text: string }> = []
  const mk = (flags: FeatureFlags) => {
    let h: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
    const reg: RouteRegistry = { register: route => { h = route.handler; return () => {} } }
    const dispose = registerDashboard(reg, { store: { get: () => ({ version: 2 as const, active: true }), save: () => {} } as never, stateDir: dir, roster: () => ({ units: [], errors: [] }) as never, warRoot: '/w', flags, pushToStaff: (sessionId: string, text: string) => { pushes.push({ sessionId, text }) } } as never)
    return { get h() { return h }, dispose }
  }
  const off = mk(FLAG_OFF)
  const on = mk(FLAG_PLAN)
  const post = (h: (req: unknown, res: unknown) => void | Promise<void>, body: unknown) => {
    const text = JSON.stringify({ commandId: 'cmd-d', ...(body as Record<string, unknown>) })
    return h({ method: 'POST', url: '/warroom/api/commands/plan', on(event: string, cb: (chunk?: unknown) => void) { if (event === 'data') queueMicrotask(() => cb(text)); if (event === 'end') queueMicrotask(() => cb()) } }, res)
  }
  const ended: string[] = []
  const res = { setHeader: () => {}, write: () => true, end: (b?: string) => { ended.push(b ?? '') } }
  try {
    seedCommand(dir, 'cmd-d', '待判计划的命令')
    // 旗关 → 404。
    await post(off.h!, { decision: 'approve' })
    assert.match(ended[ended.length - 1]!, /no such route/)
    // 无待批计划 → 400。
    await post(on.h!, { decision: 'approve' })
    assert.match(ended[ended.length - 1]!, /无待批计划/)
    // 呈计划 → approve 落事件 + K17 回推（批准文案投给大副会话）。
    appendDirectiveEvent(dir, { type: 'directive_plan_opened', ts: 't2', directiveId: 'cmd-d', plan: '目标步骤工作区风险四要素齐的一页纸计划。' })
    await post(on.h!, { decision: 'approve', note: '可以' })
    assert.match(ended[ended.length - 1]!, /"ok":true/)
    assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-d')!.plan!.status, 'approved')
    assert.equal(pushes.length, 1)
    assert.equal(pushes[0]!.sessionId, 'sec-1')
    assert.match(pushes[0]!.text, /已被批准/)
    assert.match(pushes[0]!.text, /war_publish/)
    // 已批再 approve → 400（无待批）——不再回推。
    await post(on.h!, { decision: 'approve' })
    assert.match(ended[ended.length - 1]!, /无待批计划/)
    // 重呈 → reject 落事件 + 回推驳回文案（修订重呈指引）。
    appendDirectiveEvent(dir, { type: 'directive_plan_opened', ts: 't3', directiveId: 'cmd-d', plan: '第二稿计划，重新待批。' })
    await post(on.h!, { decision: 'reject', note: '再改' })
    assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-d')!.plan!.status, 'rejected')
    assert.equal(pushes.length, 2)
    assert.match(pushes[1]!.text, /被驳回/)
    assert.match(pushes[1]!.text, /重新 war_plan/)
  } finally {
    off.dispose()
    on.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})
