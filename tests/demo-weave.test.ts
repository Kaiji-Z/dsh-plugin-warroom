import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readManifest, swapIdsInText, weaveDemoSessions } from '../src/demo-weave.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-demo-weave-'))
}

test('V9.11 织换: swapIdsInText 全量子串置换（假会话号只作字符串值出现）', () => {
  const mapping = { 'sec-smoke-session': 'session-aaa', 'cmd-golf-session': 'session-bbb' }
  const line = '{"staffSessionId":"sec-smoke-session","claimedBy":"cmd-golf-session"}'
  assert.equal(swapIdsInText(line, mapping), '{"staffSessionId":"session-aaa","claimedBy":"session-bbb"}')
  assert.equal(swapIdsInText('nothing here', mapping), 'nothing here')
})

test('V9.11 织换: manifest 解析容错（坏 JSON/空对象/非字符串值 → null）', () => {
  const dir = tmpStateDir()
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), '{bad json')
    assert.equal(readManifest(dir), null)
    writeFileSync(join(dir, '.demo-sessions.json'), '{}')
    assert.equal(readManifest(dir), null)
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-a': '大副', bad: 3 }))
    assert.deepEqual(readManifest(dir), { 'sec-a': '大副' })
    assert.equal(readManifest(join(dir, 'nope')), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V9.11 织换: 全流程——真会话建齐、三条 JSONL 重写、标记落盘、二次幂等跳过', async () => {
  const dir = tmpStateDir()
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-smoke-session': '大副·演示', 'cmd-golf-session': '外勤·分页修复' }))
    mkdirSync(join(dir, 'campaigns'))
    writeFileSync(join(dir, 'campaigns', 'a.jsonl'), '{"claimedBy":"cmd-golf-session"}\n{"claimedBy":"cmd-golf-session"}\n')
    writeFileSync(join(dir, 'directives.jsonl'), '{"staffSessionId":"sec-smoke-session"}\n')
    writeFileSync(join(dir, 'threads.jsonl'), '{"sessionId":"sec-smoke-session"}\n')

    let n = 0
    const renames: string[] = []
    const faces = {
      currentRoot: 'D:/current/ws',
      sessions: {
        create: async () => { n += 1; return { result: { ok: true as const, value: { sessionId: `session-real-${n}` } } } },
        rename: async (req: { payload: { title: string } }) => { renames.push(req.payload.title); return { result: { ok: true as const, value: undefined } } },
      },
    }
    assert.equal(await weaveDemoSessions(dir, faces), true, 'first boot should weave')
    assert.equal(readFileSync(join(dir, 'campaigns', 'a.jsonl'), 'utf8'), '{"claimedBy":"session-real-2"}\n{"claimedBy":"session-real-2"}\n')
    assert.equal(readFileSync(join(dir, 'directives.jsonl'), 'utf8'), '{"staffSessionId":"session-real-1"}\n')
    assert.equal(readFileSync(join(dir, 'threads.jsonl'), 'utf8'), '{"sessionId":"session-real-1"}\n')
    assert.deepEqual(renames, ['演示·大副·演示', '演示·外勤·分页修复'])
    const marker = JSON.parse(readFileSync(join(dir, '.demo-woven.json'), 'utf8')) as { mapping: Record<string, string> }
    assert.equal(marker.mapping['sec-smoke-session'], 'session-real-1')
    // 幂等：标记在即跳过（不再建会话）。
    assert.equal(await weaveDemoSessions(dir, faces), false)
    assert.equal(n, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V9.11 织换: 会话创建失败 → 整体放弃不写标记（半织换状态不允许上板）', async () => {
  const dir = tmpStateDir()
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-a': 'x' }))
    const faces = {
      currentRoot: 'D:/current/ws',
      sessions: {
        create: async () => ({ result: { ok: false as const, error: { code: 'E_DEMO', message: 'nope' } } }),
        rename: async () => ({ result: { ok: true as const, value: undefined } }),
      },
    }
    assert.equal(await weaveDemoSessions(dir, faces), false)
    let markerPresent = true
    try { readFileSync(join(dir, '.demo-woven.json')) } catch { markerPresent = false }
    assert.equal(markerPresent, false, 'no marker may be written on a failed weave')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V9.12 ③ 会话复用: 宿主已有同名「演示·」会话 → 零新建（二次重建不泄漏）', async () => {
  const dir = tmpStateDir()
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-a': '大副·甲', 'sec-b': '大副·乙' }))
    let created = 0
    const faces = {
      currentRoot: 'D:/current/ws',
      sessions: {
        list: async () => ({
          result: {
            ok: true as const,
            value: {
              items: [
                { id: 'host-1', title: '演示·大副·甲', displayTitle: '演示·大副·甲' },
                { id: 'host-2', displayTitle: '演示·大副·乙' }, // 无 durable title，靠 displayTitle 命中
                { id: 'host-3', title: '普通会话', displayTitle: '普通会话' },
                { id: 'host-4', displayTitle: '演示·' }, // 空名不算可复用条目（manifest 值非空）
              ],
            },
          },
        }),
        create: async () => { created += 1; return { result: { ok: true as const, value: { sessionId: `new-${created}` } } } },
        rename: async () => ({ result: { ok: true as const, value: undefined } }),
      },
    }
    assert.equal(await weaveDemoSessions(dir, faces), true)
    assert.equal(created, 0, 'existing demo sessions must be reused, not re-created')
    const marker = JSON.parse(readFileSync(join(dir, '.demo-woven.json'), 'utf8')) as { mapping: Record<string, string> }
    assert.equal(marker.mapping['sec-a'], 'host-1')
    assert.equal(marker.mapping['sec-b'], 'host-2')
    // 列举失败且无持久映射（真·冷重建）→ 退回全新建（复用是优化不是正确性依赖）。
    rmSync(join(dir, '.demo-woven.json'))
    rmSync(join(dir, '.demo-real-map.json'))
    const faces2 = { ...faces, sessions: { ...faces.sessions, list: async () => { throw new Error('rpc dead') } } }
    assert.equal(await weaveDemoSessions(dir, faces2 as typeof faces), true)
    assert.equal(created, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V9.12 ③ 真号映射复用: .demo-real-map.json 持久档（重播幸存）→ 无 list 面也零新建', async () => {
  const dir = tmpStateDir()
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-a': '大副·甲', 'sec-b': '大副·乙' }))
    // 上次织换留下的持久映射：sec-a 已有真号（重播清了 woven 标记但没清这档）。
    writeFileSync(join(dir, '.demo-real-map.json'), JSON.stringify({ 'sec-a': 'host-keep-1' }))
    let created = 0
    const faces = {
      currentRoot: 'D:/current/ws',
      sessions: {
        create: async () => { created += 1; return { result: { ok: true as const, value: { sessionId: `new-${created}` } } } },
        rename: async () => ({ result: { ok: true as const, value: undefined } }),
        // 注意：故意不给 list 面——映射复用不许依赖宿主列举时机。
      },
    }
    assert.equal(await weaveDemoSessions(dir, faces), true)
    assert.equal(created, 1, 'only the unmapped entry may create a host session')
    const marker = JSON.parse(readFileSync(join(dir, '.demo-woven.json'), 'utf8')) as { mapping: Record<string, string> }
    assert.equal(marker.mapping['sec-a'], 'host-keep-1')
    assert.equal(marker.mapping['sec-b'], 'new-1')
    // 持久映射合并落盘：旧档保住 + 新条目入账——下一轮全员复用。
    const realMap = JSON.parse(readFileSync(join(dir, '.demo-real-map.json'), 'utf8')) as Record<string, string>
    assert.equal(realMap['sec-a'], 'host-keep-1')
    assert.equal(realMap['sec-b'], 'new-1')
    // 二次重建（清 woven 标记模拟重播）→ 零新建。
    rmSync(join(dir, '.demo-woven.json'))
    assert.equal(await weaveDemoSessions(dir, faces), true)
    assert.equal(created, 1, 'second rebuild must add ZERO host sessions')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V9.12 ⑦ 真实目录守卫: stateDir 解析为默认真实数据目录 → 拒绝织换（零副作用）', async () => {
  const dir = tmpStateDir()
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-a': 'x' }))
    let created = 0
    const faces = {
      currentRoot: 'D:/current/ws',
      sessions: {
        create: async () => { created += 1; return { result: { ok: true as const, value: { sessionId: 'nope' } } } },
        rename: async () => ({ result: { ok: true as const, value: undefined } }),
      },
    }
    // 默认真实目录 = join(DSH_HOME, 'warroom-plugin')——正是要拒绝的那一格。
    assert.equal(await weaveDemoSessions(join(dir, 'warroom-plugin'), faces), false)
    assert.equal(created, 0)
    let markerPresent = true
    try { readFileSync(join(dir, 'warroom-plugin', '.demo-woven.json')) } catch { markerPresent = false }
    assert.equal(markerPresent, false)
    // 隔离目录（.smoke-state 场景）不受守卫影响。
    mkdirSync(join(dir, '.smoke-state'))
    writeFileSync(join(dir, '.smoke-state', '.demo-sessions.json'), JSON.stringify({ 'sec-a': 'x' }))
    assert.equal(await weaveDemoSessions(join(dir, '.smoke-state'), faces), true)
    assert.equal(created, 1)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
    rmSync(dir, { recursive: true, force: true })
  }
})
