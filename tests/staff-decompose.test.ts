import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, foldDirectives, loadDirectives, type DirectiveEvent } from '../src/directives.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import { relayPromptFor } from '../src/relay.ts'
import type { Roster } from '../src/units.ts'

/** V6 命令拆解（flag staff-decompose）：war_decompose 呈批（复用计划卡）+
 *  war_publish_chain 成链（顺序 deps + 链级同工作区 + 命令卡链接链头）。 */

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_ON: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-decompose' })
const FLAG_ON_ALL: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-triage,staff-plan,staff-goal,staff-decompose' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-decompose-'))
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

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: 'sec-1' }, signal: new AbortController().signal })
}

function seedCommand(dir: string, id: string, text: string): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: id, text })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: id, staffSessionId: 'sec-1' })
}

const SPECS = [
  { title: '勘察现有配置层', brief: '梳理配置读取路径与调用方，产出迁移清单附在汇报里。', acceptance: '清单覆盖全部调用方；退出码 0' },
  { title: '迁移并回归', brief: '按清单迁移配置层，跑通全部回归后提交。', acceptance: '全部测试通过；退出码 0' },
]

test('fold：decomposed 落结构化拆解；重呈覆盖；终态守卫沿用', () => {
  const events: DirectiveEvent[] = [
    { type: 'directive_created', ts: 't0', directiveId: 'c1', text: '大重构' },
    { type: 'directive_decomposed', ts: 't1', directiveId: 'c1', plan: '第一稿总计划', tasks: [{ title: '甲', brief: '第一步的书', acceptance: '验收一；退出码 0' }] },
    { type: 'directive_decomposed', ts: 't2', directiveId: 'c1', plan: '第二稿总计划', tasks: SPECS },
    // approved 后迟到稿被终态守卫忽略。
    { type: 'directive_approved', ts: 't3', directiveId: 'c1', taskId: 't-9' },
    { type: 'directive_decomposed', ts: 't4', directiveId: 'c1', plan: '迟到稿', tasks: [{ title: '迟到', brief: '终态后不应生效的书', acceptance: '不应出现；退出码 0' }] },
  ]
  const [d] = foldDirectives(events)
  assert.equal(d!.decomposition!.plan, '第二稿总计划')
  assert.equal(d!.decomposition!.tasks.length, 2)
  assert.equal(d!.decomposition!.tasks[1]!.title, '迁移并回归')
})

test('war_decompose：旗关不注册；<2 子任务/子任务不过 lint/总计划太短均拒；正常落 decomposed + plan_opened', async () => {
  const dir = tmpDir()
  try {
    seedCommand(dir, 'cmd-d', '把配置层重构成声明式')
    assert.equal(warTools(makeDeps(dir, FLAG_OFF)).some(t => t.name === 'war_decompose'), false)
    assert.equal(warTools(makeDeps(dir, FLAG_OFF)).some(t => t.name === 'war_publish_chain'), false)
    const deps = makeDeps(dir, FLAG_ON)
    // 太短总计划。
    await assert.rejects(execTool(deps, 'war_decompose', { command_id: 'cmd-d', plan: '太短', tasks: SPECS }), /总计划太短/)
    // 只有一个子任务（不必拆）。
    await assert.rejects(execTool(deps, 'war_decompose', { command_id: 'cmd-d', plan: '目标迁移配置层，步骤一二三，工作区主仓，风险回滚 git。', tasks: [SPECS[0]] }), /至少 2 个子任务/)
    // 子任务验收不可判定 → lint 拦。
    await assert.rejects(execTool(deps, 'war_decompose', {
      command_id: 'cmd-d',
      plan: '目标迁移配置层，步骤一二三，工作区主仓，风险回滚 git。',
      tasks: [{ title: '甲步骤', brief: '第一段工作说明书至少十个字', acceptance: '做好' }, SPECS[1]!],
    }), /子任务 1 不过 lint/)
    // 正常呈批：decomposed（结构化）+ plan_opened（含拆解概要，走既有计划卡）。
    const out = await execTool(deps, 'war_decompose', { command_id: 'cmd-d', plan: '目标迁移配置层，步骤一二三，工作区主仓，风险回滚 git。', tasks: SPECS }) as { chainLength: number; planStatus: string }
    assert.equal(out.chainLength, 2)
    assert.equal(out.planStatus, 'pending')
    const d = loadDirectives(dir).find(x => x.id === 'cmd-d')!
    assert.equal(d.decomposition!.tasks.length, 2)
    assert.equal(d.plan!.status, 'pending')
    assert.match(d.plan!.text, /【拆解 · 2 个顺序子任务/)
    assert.match(d.plan!.text, /勘察现有配置层/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('war_publish_chain 硬门与成链：无拆解/未批均拒；批准后顺序 deps + 同工作区 + 命令卡链接链头；重复发布拒', async () => {
  const dir = tmpDir()
  try {
    seedCommand(dir, 'cmd-c', '把配置层重构成声明式')
    const deps = makeDeps(dir, FLAG_ON_ALL)
    // 无拆解 → 拒。
    await assert.rejects(execTool(deps, 'war_publish_chain', { command_id: 'cmd-c' }), /无拆解方案/)
    // 呈拆解但计划待批 → 拒。
    await execTool(deps, 'war_decompose', { command_id: 'cmd-c', plan: '目标迁移配置层，步骤一二三，工作区主仓，风险回滚 git。', tasks: SPECS })
    await assert.rejects(execTool(deps, 'war_publish_chain', { command_id: 'cmd-c' }), /待元首批准/)
    // 驳回 → 拒（修订重呈指引）。
    appendDirectiveEvent(dir, { type: 'directive_plan_rejected', ts: 't2', directiveId: 'cmd-c', reason: '验收太虚' })
    await assert.rejects(execTool(deps, 'war_publish_chain', { command_id: 'cmd-c' }), /被驳回/)
    // 修订重呈 + 批准 → 成链放行。
    await execTool(deps, 'war_decompose', { command_id: 'cmd-c', plan: '修订稿：目标迁移配置层，步骤勘察后迁移再回归，工作区主仓，风险回滚 git。', tasks: SPECS })
    appendDirectiveEvent(dir, { type: 'directive_plan_approved', ts: 't3', directiveId: 'cmd-c' })
    const out = await execTool(deps, 'war_publish_chain', { command_id: 'cmd-c' }) as { headTaskId: string; taskIds: string[]; workspacePath: string }
    assert.equal(out.taskIds.length, 2)
    assert.equal(out.headTaskId, out.taskIds[0])
    // 账本核验：顺序 deps（环 2 依赖环 1）+ 链级同一工作区 + 命令卡 approved 链接链头。
    const readLog = (id: string): Array<Record<string, unknown>> =>
      readFileSync(join(dir, 'campaigns', `${id}.jsonl`), 'utf8').split('\n').filter(l => l.trim() !== '').map(l => JSON.parse(l) as Record<string, unknown>)
    const head = readLog(out.taskIds[0]!)
    const tail = readLog(out.taskIds[1]!)
    assert.equal(head.filter(l => l.type === 'task_created').length, 1)
    assert.equal('deps' in head.find(l => l.type === 'task_created')!, false)
    assert.deepEqual(tail.find(l => l.type === 'task_created')!.deps, [out.taskIds[0]])
    assert.equal(head.find(l => l.type === 'task_published')!.workspacePath, tail.find(l => l.type === 'task_published')!.workspacePath)
    const d = loadDirectives(dir).find(x => x.id === 'cmd-c')!
    assert.equal(d.status, 'approved')
    assert.equal(d.taskId, out.headTaskId)
    // 重复成链 → 拒。
    await assert.rejects(execTool(deps, 'war_publish_chain', { command_id: 'cmd-c' }), /不要重复发布/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('relay：拆链纪律骑分诊块（staff-triage + staff-decompose 同开）；decompose 单开不进 base（off == 改前字节等价）', () => {
  const directive = { id: 'cmd-x', text: 'x', createdAt: 't', status: 'draft' as const }
  // 拆链纪律在【V5 分诊】块内——需要 staff-triage 同开才可见（拆解本身就是分诊后的路线）。
  const withFlag = relayPromptFor(directive, FLAG_ON_ALL)
  assert.match(withFlag, /war_decompose/)
  assert.match(withFlag, /war_publish_chain/)
  assert.match(withFlag, /同工作区顺序接力/)
  // decompose 单开（无 triage）：分诊块缺席 = base 原文，与改前字节等价。
  assert.equal(relayPromptFor(directive, FLAG_ON).includes('war_decompose'), false)
  assert.equal(relayPromptFor(directive, FLAG_OFF).includes('war_decompose'), false)
})
