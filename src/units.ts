/**
 * 组员编制 (unit roster): four builtin unit types plus user extension via
 * TOML files (agent-definition shape). Project `.warroom/units/`
 * overrides personal `~/.dsh/warroom-plugin/units/` overrides builtins,
 * matched by name (layered precedence).
 *
 * sandbox_mode maps onto a dsh toolFilter DENY list (deny-based so new base
 * tools stay available; delegation tools are denied for every unit — the
 * max_depth=1 rule enforced by capability, not request).
 * @module dsh-plugin-warroom/units
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SandboxMode, UnitRoute, UnitSource, UnitSpec } from './types.ts'
import { parseToml } from './toml.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'

/** Tools every troop is denied: no delegation, no cross-turn messaging. */
const DELEGATION_TOOLS = ['subagent', 'subagent_fork', 'send_message']

/** Tools that mutate the workspace or spawn processes. */
const WRITE_TOOLS = ['write', 'edit', 'str_replace_editor', 'bash', 'pwsh', 'jobs']

/** The toolFilter deny list enforcing a sandbox mode. */
export function sandboxDeny(mode: SandboxMode): string[] {
  return mode === 'read-only' ? [...DELEGATION_TOOLS, ...WRITE_TOOLS] : [...DELEGATION_TOOLS]
}

export function sandboxWrites(mode: SandboxMode): boolean {
  return mode !== 'read-only'
}

/** The builtin 编制 — the classic explorer/worker pair plus two extensions. */
export const BUILTIN_UNITS: ReadonlyArray<UnitSpec> = [
  {
    name: 'recon',
    label: '侦察兵',
    description: '只读侦察：摸清陌生战区的结构、关键文件与风险，先敌情后行动',
    instructions: [
      '# 侦察兵条令',
      '你是侦察兵——舰桥的只读侦察单位。你的外勤小队派你摸清指定战区的地形。',
      '',
      '## 任务',
      '- 快速侦察战区：目录结构、关键文件（带路径）、与任务相关的模块/依赖/调用关系、潜在风险点。',
      '- 产出简明敌情报告：结构概览、关键发现（按重要性排序）、对后续作战的建议（从哪里动手、哪里危险）。',
      '',
      '## 纪律',
      '- 只读。禁止创建、修改、删除任何文件，禁止执行有副作用的命令。',
      '- 报告只写结论与路径，不整段粘贴文件内容。',
    ].join('\n'),
    sandboxMode: 'read-only',
    backend: 'in-process',
    source: 'builtin',
  },
  {
    name: 'engineer',
    label: '工程兵',
    description: '工程实现：在划定战区内写码、修缺陷、重构',
    instructions: [
      '# 工程兵条令',
      '你是工程兵——舰桥的工程实现单位。',
      '',
      '## 任务',
      '- 在你的战区（front 指定的目录边界）内完成明确的编码任务：实现功能、修复缺陷、重构。',
      '- 遵守战区内现有代码风格与模式；改动最小化；不顺手重构任务外的东西。',
      '- 完成后在可及范围内自检：逻辑通读、类型/语法核对。',
      '',
      '## 纪律',
      '- 不越界：只改动你战区内的文件。',
      '- 完成回报：完成摘要 + 改动文件清单 + 未尽事项；不粘贴大段代码。',
    ].join('\n'),
    sandboxMode: 'workspace-write',
    backend: 'in-process',
    source: 'builtin',
  },
  {
    name: 'medic',
    label: '卫生兵',
    description: '测试与修复：跑测试、诊断失败、修复问题',
    instructions: [
      '# 卫生兵条令',
      '你是卫生兵——舰桥的测试与修复单位。',
      '',
      '## 任务',
      '- 在你的战区内运行测试/检查，诊断失败原因，修复测试暴露的问题。',
      '- 优先修复根因而非绕过（不改断言、不跳过用例）。',
      '- 确实无法修复时，明确上报原因与建议，不硬凑。',
      '',
      '## 纪律',
      '- 回报：测试结果摘要（通过/失败数）+ 修复说明 + 改动文件清单。',
      '- 不粘贴完整测试日志，只报关键失败行。',
    ].join('\n'),
    sandboxMode: 'workspace-write',
    backend: 'in-process',
    source: 'builtin',
  },
  {
    name: 'scribe',
    label: '宣传兵',
    description: '文档：README、注释、使用说明、变更记录',
    instructions: [
      '# 宣传兵条令',
      '你是宣传兵——舰桥的文档单位。',
      '',
      '## 任务',
      '- 为你的战区撰写或更新文档：README、模块说明、使用指南、变更记录。',
      '- 语言与格式跟随项目现有文档（中文项目写中文，英文项目写英文）。',
      '',
      '## 纪律',
      '- 只写文档类文件（.md 为主），不改代码逻辑。',
      '- 回报：文档变更摘要 + 文件清单。',
    ].join('\n'),
    sandboxMode: 'workspace-write',
    backend: 'in-process',
    source: 'builtin',
  },
]

export type UnitParseResult = { ok: true; spec: UnitSpec } | { ok: false; errors: string[] }

/** Validate one parsed TOML table (or any record) as a unit spec. */
export function validateUnitSpec(raw: Record<string, unknown>, source: UnitSource, fileName: string): UnitParseResult {
  const errors: string[] = []
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  const instructions = typeof raw.developer_instructions === 'string' ? raw.developer_instructions.trim() : ''
  if (name === '') errors.push(`${fileName}: missing required string field 'name'`)
  else if (!/^[a-z][a-z0-9-]*$/.test(name)) errors.push(`${fileName}: 'name' must be lowercase kebab-case (got '${name}')`)
  if (description === '') errors.push(`${fileName}: missing required string field 'description'`)
  if (instructions === '') errors.push(`${fileName}: missing required string field 'developer_instructions'`)
  const sandboxRaw = raw.sandbox_mode
  let sandboxMode: SandboxMode | undefined
  if (sandboxRaw === undefined) {
    sandboxMode = 'workspace-write'
  } else if (sandboxRaw === 'read-only' || sandboxRaw === 'workspace-write' || sandboxRaw === 'danger-full-access') {
    sandboxMode = sandboxRaw
  } else {
    errors.push(`${fileName}: 'sandbox_mode' must be read-only | workspace-write | danger-full-access (got '${String(sandboxRaw)}')`)
  }
  const label = typeof raw.label === 'string' && raw.label.trim() !== '' ? raw.label.trim() : name
  const backendRaw = raw.backend
  if (backendRaw !== undefined && backendRaw !== 'in-process') {
    errors.push(`${fileName}: 'backend' reserved for future use; only 'in-process' is supported (got '${String(backendRaw)}')`)
  }
  // V4-R1 per-troop LLM route: complete pairs only (an
  // explicit provider requires an explicit model and vice versa).
  const provider = typeof raw.provider === 'string' && raw.provider.trim() !== '' ? raw.provider.trim() : undefined
  const model = typeof raw.model === 'string' && raw.model.trim() !== '' ? raw.model.trim() : undefined
  let route: UnitRoute | undefined
  if (provider !== undefined && model !== undefined) {
    route = { provider, model }
  } else if (provider !== undefined || model !== undefined) {
    errors.push(`${fileName}: a unit LLM route needs both fields — ${provider === undefined ? 'model requires a provider' : 'provider requires a model'} (use provider = \"...\" plus model = \"...\")`)
  }
  if (errors.length > 0 || sandboxMode === undefined || name === '') return { ok: false, errors }
  return {
    ok: true,
    spec: { name, label, description, instructions, sandboxMode, backend: 'in-process', ...(route !== undefined ? { route } : {}), source },
  }
}

/**
 * The agentOptions for one troop's spawn (V4-R1). Only when the
 * `troop-llm-routing` flag is ON and the unit carries a complete route —
 * anything less and the spawn stays byte-identical to the pre-V4 behavior.
 */
export function unitAgentOptions(unit: UnitSpec, flags: FeatureFlags): { provider: string; model: string } | undefined {
  if (!featureEnabled(flags, 'troop-llm-routing')) return undefined
  return unit.route === undefined ? undefined : { provider: unit.route.provider, model: unit.route.model }
}

/** Load *.toml unit files from one directory (missing dir → empty). */
export function loadUnitDir(dir: string, source: UnitSource): { specs: UnitSpec[]; errors: string[] } {
  const specs: UnitSpec[] = []
  const errors: string[] = []
  if (!existsSync(dir)) return { specs, errors }
  for (const file of readdirSync(dir).filter(f => f.endsWith('.toml')).sort()) {
    const path = join(dir, file)
    try {
      const tables = parseToml(readFileSync(path, 'utf8'))
      const root = tables.get('') ?? {}
      const unitTable = tables.get('unit')
      const raw = unitTable === undefined ? root : { ...root, ...unitTable }
      const result = validateUnitSpec(raw, source, file)
      if (result.ok) specs.push(result.spec)
      else errors.push(...result.errors)
    } catch (err) {
      errors.push(`${file}: ${(err instanceof Error ? err.message : String(err))}`)
    }
  }
  return { specs, errors }
}

export interface Roster {
  /** Ordered: builtins first (in declaration order), then customs in load order. */
  readonly units: ReadonlyArray<UnitSpec>
  /** Problems found in user unit files (loaded, not fatal). */
  readonly errors: ReadonlyArray<string>
}

/**
 * Assemble the full roster: builtin ← personal units dir ← project .warroom/units.
 * Later definitions replace earlier ones by name, keeping the earlier slot's
 * position so builtin ordering stays stable.
 */
export function loadRoster(personalUnitsDir: string, projectRoot: string | undefined): Roster {
  const errors: string[] = []
  const ordered: UnitSpec[] = [...BUILTIN_UNITS]
  const byName = new Map(ordered.map(u => [u.name, u]))
  const layers: ReadonlyArray<[string, UnitSource]> = [
    [personalUnitsDir, 'personal'],
    [projectRoot === undefined ? '' : join(projectRoot, '.warroom', 'units'), 'project'],
  ]
  for (const [dir, source] of layers) {
    if (dir === '') continue
    const { specs, errors: layerErrors } = loadUnitDir(dir, source)
    errors.push(...layerErrors)
    for (const spec of specs) {
      const existing = byName.get(spec.name)
      if (existing === undefined) {
        byName.set(spec.name, spec)
        ordered.push(spec)
      } else {
        byName.set(spec.name, spec)
        const idx = ordered.indexOf(existing)
        ordered[idx] = spec
      }
    }
  }
  return { units: ordered, errors }
}
