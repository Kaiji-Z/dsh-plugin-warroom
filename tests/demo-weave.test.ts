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
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-a': '参谋', bad: 3 }))
    assert.deepEqual(readManifest(dir), { 'sec-a': '参谋' })
    assert.equal(readManifest(join(dir, 'nope')), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V9.11 织换: 全流程——真会话建齐、三条 JSONL 重写、标记落盘、二次幂等跳过', async () => {
  const dir = tmpStateDir()
  try {
    writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({ 'sec-smoke-session': '参谋·演示', 'cmd-golf-session': '指挥官·分页修复' }))
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
    assert.deepEqual(renames, ['演示·参谋·演示', '演示·指挥官·分页修复'])
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
