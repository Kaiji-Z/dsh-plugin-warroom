import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { validateUnitSpec, loadUnitDir, unitAgentOptions, type Roster } from '../src/units.ts'
import type { UnitSpec } from '../src/types.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import { appendEvent } from '../src/events.ts'

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_ON: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'troop-llm-routing' })

/** A unit carrying a complete LLM route. */
const routedUnit: UnitSpec = {
  name: 'recon',
  label: '侦察兵',
  description: 'cheap eyes',
  instructions: '你是侦察兵。',
  sandboxMode: 'workspace-write',
  backend: 'in-process',
  source: 'project',
  route: { provider: 'glm', model: 'glm-5.2-air' },
}

function bareUnit(): UnitSpec {
  return { ...routedUnit, route: undefined }
}

test('V4-R1 路由解析：provider+model 成对解析进 spec.route', () => {
  const ok = validateUnitSpec(
    { name: 'recon', description: 'd', developer_instructions: 'i', provider: 'glm', model: 'glm-5.2-air' },
    'project', 'recon.toml',
  )
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.spec.route, { provider: 'glm', model: 'glm-5.2-air' })
  // 无路由字段 = 老行为（spec 无 route 键）。
  const plain = validateUnitSpec({ name: 'recon', description: 'd', developer_instructions: 'i' }, 'project', 'recon.toml')
  assert.equal(plain.ok, true)
  if (plain.ok) assert.equal(plain.spec.route, undefined)
})

test('V4-R1 路由解析：缺半边即 roster 错误（provider 必须带 model，反之亦然）', () => {
  for (const [raw, needle] of [
    [{ name: 'recon', description: 'd', developer_instructions: 'i', provider: 'glm' }, 'provider requires'],
    [{ name: 'recon', description: 'd', developer_instructions: 'i', model: 'glm-5.2-air' }, 'model requires'],
    [{ name: 'recon', description: 'd', developer_instructions: 'i', provider: '', model: 'm' }, 'model requires'],
  ] as const) {
    const bad = validateUnitSpec(raw as Record<string, unknown>, 'project', 'recon.toml')
    assert.equal(bad.ok, false)
    if (!bad.ok) assert.ok(bad.errors.some(e => e.includes(needle)), JSON.stringify(bad.errors))
  }
})

test('V4-R1 flag 门：unitAgentOptions 只在 flag ON 且路由完整时给出 agentOptions', () => {
  // off == 改前行为：即使组员带了路由，也不透传（字节等价的老加派组员）。
  assert.equal(unitAgentOptions(routedUnit, FLAG_OFF), undefined)
  assert.equal(unitAgentOptions(bareUnit(), FLAG_ON), undefined)
  assert.deepEqual(unitAgentOptions(routedUnit, FLAG_ON), { provider: 'glm', model: 'glm-5.2-air' })
})

/** Fake subagents capturing every startContinuable spec. */
function fakeSubagents(): { face: SubagentsServiceFace; starts: Array<{ request: { agentOptions?: { provider: string; model: string } } }> } {
  const starts: Array<{ request: { agentOptions?: { provider: string; model: string } } }> = []
  return {
    starts,
    face: {
      async startContinuable(spec) {
        starts.push(spec as { request: { agentOptions?: { provider: string; model: string } } })
        return { childId: `child-${starts.length}`, messageId: 'm1' }
      },
      async followup() { return {} },
      interrupt() {},
      async listDescendants() { return [] },
    },
  }
}

function taskDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-routing-'))
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: '路由考题', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: 'C:/reg/w' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd-1', attemptId: 'tok-1', attempt: 1 })
  return dir
}

async function deployOnce(dir: string, unit: UnitSpec, flags: FeatureFlags, front: string): Promise<{ request: { agentOptions?: { provider: string; model: string } } }> {
  const sub = fakeSubagents()
  const roster: Roster = { units: [unit], errors: [] }
  const deps = {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: sub.face,
    commander: {},
    workspace: {},
    warRoot: 'C:/reg',
    flags,
  }
  const tool = warTools(deps as Parameters<typeof warTools>[0]).find(t => t.name === 'war_deploy_unit')
  assert.ok(tool !== undefined)
  await tool.execute({ task_id: 'c1', unit: unit.name, mission: '去侦察', front }, { agent: { id: 'cmd-1' }, signal: new AbortController().signal })
  assert.equal(sub.starts.length, 1)
  return sub.starts[0]!
}

test('V4-R1 回归：war_deploy_unit 透传 agentOptions 仅当 flag ON 且组员带路由', async () => {
  const dir = taskDir()
  try {
    // 三次加派组员各占一条战线——同任务写权限战区互斥是铁律，测试不得绕。
    const off = await deployOnce(dir, routedUnit, FLAG_OFF, 'src')
    assert.equal(off.request.agentOptions, undefined, 'flag off 必须与改前字节等价（无 agentOptions）')
    const on = await deployOnce(dir, routedUnit, FLAG_ON, 'docs')
    assert.deepEqual(on.request.agentOptions, { provider: 'glm', model: 'glm-5.2-air' })
    const onBare = await deployOnce(dir, bareUnit(), FLAG_ON, 'tests')
    assert.equal(onBare.request.agentOptions, undefined, 'flag on 但组员无路由也不得造路由')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4-R1 TOML 落盘路由能被 loadUnitDir 读回', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-routing-roster-'))
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'scout.toml'), [
      'name = "scout"',
      'description = "cheap eyes"',
      'developer_instructions = "你是侦察兵。"',
      'sandbox_mode = "read-only"',
      'provider = "glm"',
      'model = "glm-5.2-air"',
      '',
    ].join('\n'), 'utf8')
    const { specs, errors } = loadUnitDir(dir, 'project')
    assert.deepEqual(errors, [])
    assert.equal(specs.length, 1)
    assert.deepEqual(specs[0]!.route, { provider: 'glm', model: 'glm-5.2-air' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
