import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, loadDirectives, readDirectiveEvents, type DirectiveEvent } from '../src/directives.ts'
import { directiveProjection, registerDashboard, type RouteRegistry } from '../src/dashboard.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'
import { applyGradeMarker } from '../src/client/preflight.ts'

/**
 * 取证回归（任务 20260825-184941-41e3）：起草器三档开关的 !!/?? 标记
 * 是否真的拼进发往 /warroom/api/commands 的命令文本，并一路生效到分诊档位。
 *
 * 证据链（全部确定性，node:test 可重跑）：
 *   客户端 pure 层 applyGradeMarker（src/client/preflight.ts:21-32）
 *   → 接线点 CommandComposer submit（src/client/views.tsx:311，bundle needle
 *     'applyGradeMarker' + 'createCommand' 由 scripts/verify.mjs 锚定）
 *   → POST /warroom/api/commands（src/dashboard.ts:261，trim + directive_created 原文落账）
 *   → war_triage 标记强制改档（src/tools.ts:1152，overrideMarkerOf host 侧强制）
 *   → 发布硬门只绑 L1/L2（src/tools.ts:425）：!!→L0 直发、??→L2 先计划后做。
 */

const FLAG_ON: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-triage,staff-plan' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-marker-e2e-'))
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

/** 起一个只挂 /warroom 路由的假 HTTP 面：POST 请求经真实 handler 落账。 */
function fakeServer(dir: string): { post: (url: string, body: unknown) => Promise<string>; dispose: () => void } {
  let h: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
  const reg: RouteRegistry = { register: route => { h = route.handler; return () => {} } }
  const dispose = registerDashboard(reg, {
    store: { get: () => ({ version: 2 as const, active: true }), save: () => {} } as never,
    stateDir: dir,
    roster: () => ({ units: [], errors: [] }) as never,
    warRoot: '/w',
    flags: FLAG_ON,
  } as never)
  const post = async (url: string, body: unknown): Promise<string> => {
    const text = JSON.stringify(body)
    const req = {
      method: 'POST', url,
      on(event: string, cb: (chunk?: unknown) => void) {
        if (event === 'data') queueMicrotask(() => cb(text))
        if (event === 'end') queueMicrotask(() => cb())
      },
    }
    const ended: string[] = []
    const res = { setHeader: () => {}, write: () => true, end: (b?: string) => { ended.push(b ?? '') } }
    await h!(req, res)
    return ended[ended.length - 1] ?? ''
  }
  return { post, dispose }
}

/** 断言某命令 id 的账本里出现指定类型事件（原始 JSONL，不经 fold）。 */
function rawEvent(dir: string, directiveId: string, type: DirectiveEvent['type']): DirectiveEvent {
  const hit = readDirectiveEvents(dir).find(e => e.directiveId === directiveId && e.type === type)
  assert.ok(hit !== undefined, `${type} event for ${directiveId} missing from directives.jsonl`)
  return hit
}

test('取证①：L0 档 → POST 文本以「!!直接做 」开头，原文落账，分诊强制 L0，免计划直发', async () => {
  const dir = tmpDir()
  const srv = fakeServer(dir)
  try {
    // 起草器 pure 层产出即客户端实际发送体（views.tsx:311 createCommand(applyGradeMarker(text, grade))）。
    const sent = applyGradeMarker('给工具箱加每日格言', 'L0')
    assert.ok(sent.startsWith('!!直接做 '), `sent=${sent}`)
    // 经服务端 POST 通道。
    const resp = JSON.parse(await srv.post('/warroom/api/commands', { text: sent })) as { ok: boolean; commandId: string }
    assert.equal(resp.ok, true)
    // 账本可见：directive_created 原文（含标记）verbatim 落 directives.jsonl。
    const created = rawEvent(dir, resp.commandId, 'directive_created') as Extract<DirectiveEvent, { type: 'directive_created' }>
    assert.equal(created.text, '!!直接做 给工具箱加每日格言')
    // 参谋接令 + 分诊：参谋建议 L1，标记 host 侧强制 L0（不信任模型自觉）。
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: resp.commandId, staffSessionId: 'sec-1' })
    const deps = makeDeps(dir, FLAG_ON)
    const tri = await execTool(deps, 'war_triage', { command_id: resp.commandId, grade: 'L1', reason: '涉及面广' }) as { grade: string; suggested: string; override?: string }
    assert.equal(tri.grade, 'L0')
    assert.equal(tri.suggested, 'L1')
    assert.equal(tri.override, '!!')
    // fold 后档位 L0；审计事件留 suggested/override 痕。
    assert.equal(loadDirectives(dir).find(d => d.id === resp.commandId)!.grade, 'L0')
    const triaged = rawEvent(dir, resp.commandId, 'directive_triaged') as Extract<DirectiveEvent, { type: 'directive_triaged' }>
    assert.equal(triaged.override, '!!')
    assert.equal(triaged.suggested, 'L1')
    // L0 直发：无任何计划，发布硬门（tools.ts:425 只绑 L1/L2）放行。
    const pub = await execTool(deps, 'war_publish', { title: '每日格言小工具', brief: '给工具箱加一句每日格言的轻任务书', acceptance: 'node motto.js today 退出码 0；两条不同日期出不同格言', commandId: resp.commandId }) as { commandApproved: boolean }
    assert.equal(pub.commandApproved, true)
    // 板投影可见：文本 + 档位都上 GET /warroom/api/board 的 commands 面。
    const proj = directiveProjection(dir).find(c => c.commandId === resp.commandId)
    assert.ok(proj !== undefined)
    assert.equal(proj.text, '!!直接做 给工具箱加每日格言')
    assert.equal(proj.grade, 'L0')
  } finally {
    srv.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('取证②：L2 档 → POST 文本以「??先看方案 」开头，分诊强制 L2，无计划发布被硬门拦', async () => {
  const dir = tmpDir()
  const srv = fakeServer(dir)
  try {
    const sent = applyGradeMarker('重构配置层', 'L2')
    assert.ok(sent.startsWith('??先看方案 '), `sent=${sent}`)
    const resp = JSON.parse(await srv.post('/warroom/api/commands', { text: sent })) as { ok: boolean; commandId: string }
    assert.equal(resp.ok, true)
    const created = rawEvent(dir, resp.commandId, 'directive_created') as Extract<DirectiveEvent, { type: 'directive_created' }>
    assert.equal(created.text, '??先看方案 重构配置层')
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: resp.commandId, staffSessionId: 'sec-1' })
    // 参谋建议 L0（想直发），标记强制 L2：澄清收敛后计划。
    const tri = await execTool(makeDeps(dir, FLAG_ON), 'war_triage', { command_id: resp.commandId, grade: 'L0', reason: '看着像小事' }) as { grade: string; suggested: string; override?: string }
    assert.equal(tri.grade, 'L2')
    assert.equal(tri.override, '??')
    assert.equal(loadDirectives(dir).find(d => d.id === resp.commandId)!.grade, 'L2')
    // L2 无计划发布 → 硬门拒绝（先计划后做，?? 的语义闭环）。
    await assert.rejects(
      execTool(makeDeps(dir, FLAG_ON), 'war_publish', { title: '重构配置', brief: '重构配置层的任务书正文', acceptance: '现有测试全绿；lint 无新告警', commandId: resp.commandId }),
      /先计划后做/,
    )
    const proj = directiveProjection(dir).find(c => c.commandId === resp.commandId)
    assert.equal(proj?.grade, 'L2')
  } finally {
    srv.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('取证③：auto 档 → 无前缀，账本文本即 trim 后原文', async () => {
  const dir = tmpDir()
  const srv = fakeServer(dir)
  try {
    const sent = applyGradeMarker('  做个记账小工具  ', 'auto')
    assert.equal(sent, '做个记账小工具')
    assert.ok(!sent.includes('!!直接做') && !sent.includes('??先看方案'))
    const resp = JSON.parse(await srv.post('/warroom/api/commands', { text: sent })) as { ok: boolean; commandId: string }
    assert.equal(resp.ok, true)
    const created = rawEvent(dir, resp.commandId, 'directive_created') as Extract<DirectiveEvent, { type: 'directive_created' }>
    assert.equal(created.text, '做个记账小工具')
  } finally {
    srv.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('取证④（缺陷①端到端回归）：手打 !! 再切 L0 档 → 全链只落一个标记', async () => {
  const dir = tmpDir()
  const srv = fakeServer(dir)
  try {
    const sent = applyGradeMarker('!!直接做 修CI', 'L0')
    assert.equal(sent, '!!直接做 修CI') // 修复后不再重复拼接
    const resp = JSON.parse(await srv.post('/warroom/api/commands', { text: sent })) as { ok: boolean; commandId: string }
    assert.equal(resp.ok, true)
    const created = rawEvent(dir, resp.commandId, 'directive_created') as Extract<DirectiveEvent, { type: 'directive_created' }>
    assert.equal(created.text, '!!直接做 修CI')
    assert.equal(created.text.split('!!直接做').length - 1, 1) // 恰好一处
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: resp.commandId, staffSessionId: 'sec-1' })
    const tri = await execTool(makeDeps(dir, FLAG_ON), 'war_triage', { command_id: resp.commandId, grade: 'L2', reason: 'CI 改动风险高' }) as { grade: string }
    assert.equal(tri.grade, 'L0') // 标记照常压过参谋建议
  } finally {
    srv.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('取证⑤：空文本防线——纯函数产空串、服务端 POST 400（UI 双守卫外的兜底）', async () => {
  const dir = tmpDir()
  const srv = fakeServer(dir)
  try {
    // 纯函数层：纯白空文绝不产出「只有标记没有命令」的文本。
    assert.equal(applyGradeMarker('   ', 'L0'), '')
    // 服务端层：空文本 POST 被拒（dashboard.ts:266-269）。
    // （UI 层双守卫：views.tsx:307 submit 早退 + :361 按钮 disabled——见代码锚。）
    const resp = JSON.parse(await srv.post('/warroom/api/commands', { text: '   ' })) as { ok: boolean; error: string }
    assert.equal(resp.ok, false)
    assert.match(resp.error, /命令内容为空/)
    // 账本未落任何事件。
    assert.equal(existsSync(join(dir, 'directives.jsonl')) ? readFileSync(join(dir, 'directives.jsonl'), 'utf8').trim() : '', '')
  } finally {
    srv.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})
