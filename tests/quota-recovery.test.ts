import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, loadCampaign, readEvents } from '../src/events.ts'
import { createQuotaFuse, isQuotaError, probeBackoffMs } from '../src/quota.ts'
import type { SessionsApiFace } from '../src/relay.ts'
import type { WarStore } from '../src/state.ts'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-quota-'))
}

function fakeStore(): WarStore & { _state: { version: 2; active: boolean; hqSessionId?: string; quotaBlocked?: { since: string; code: string } } } {
  const state = { version: 2 as const, active: true }
  return {
    _state: state,
    get: () => state,
    save: () => {},
  } as never
}

function fakeSessions(opts: { probeResult?: 'ok' | 'quota'; prompts: Array<{ sessionId: string; text: string }> }): SessionsApiFace {
  return {
    create: async () => ({ result: { ok: true, value: { sessionId: 'sess-probe' } } }),
    rename: async () => ({ result: { ok: true, value: null } }),
    prompt: async (request: { payload: { sessionId: string; content: Array<{ text: string }> } }) => {
      opts.prompts.push({ sessionId: request.payload.sessionId, text: request.payload.content[0]!.text })
      if (opts.probeResult === 'quota') return { result: { ok: false, error: { code: 'QUOTA_EXCEEDED', message: 'insufficient balance' } } }
      return { result: { ok: true, value: null } }
    },
  }
}

function seedInFlight(dir: string, id: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: id, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: id, workspacePath: 'C:/reg/ws' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: id, claimedBy: 'cmd-9', attemptId: 'tok', attempt: 1 })
}

test('isQuotaError：只认 code（QUOTA），绝不解析 message', () => {
  assert.equal(isQuotaError({ code: 'QUOTA' }), true)
  assert.equal(isQuotaError({ code: 'RATE_LIMIT' }), false)
  assert.equal(isQuotaError({ name: 'QUOTA' }), true)
  assert.equal(isQuotaError(new Error('insufficient quota balance')), false)
  assert.equal(isQuotaError(undefined), false)
})

test('熔断：markBlocked 全局标记 + 在役任务逐个 paused（不动 status/attempt）；幂等', async () => {
  const dir = tmpDir()
  try {
    seedInFlight(dir, 'c-1')
    seedInFlight(dir, 'c-2')
    const store = fakeStore()
    const prompts: Array<{ sessionId: string; text: string }> = []
    const fuse = createQuotaFuse({ stateDir: dir, store, sessions: () => fakeSessions({ prompts }), probeSessionId: () => 'sess-probe' })
    fuse.markBlocked('QUOTA')
    assert.equal(store.get().quotaBlocked!.code, 'QUOTA')
    // 两个在役任务都 paused；status/attempt 原样（红线：不烧次数不换令牌）。
    const t1 = loadCampaign(dir, 'c-1')
    assert.equal(t1.quotaPaused, true)
    assert.equal(t1.status, 'in_progress')
    assert.equal(t1.attempt!.id, 'tok')
    assert.ok(readEvents(dir, 'c-2').some(e => e.type === 'task_paused_quota'))
    // 幂等：重复 markBlocked 不重复入账。
    fuse.markBlocked('QUOTA')
    assert.equal(readEvents(dir, 'c-1').filter(e => e.type === 'task_paused_quota').length, 1)
    // 被动检测：agent/error 事件触发熔断。
    const dir2 = tmpDir()
    try {
      seedInFlight(dir2, 'c-3')
      const store2 = fakeStore()
      const fuse2 = createQuotaFuse({ stateDir: dir2, store: store2, sessions: () => fakeSessions({ prompts }), probeSessionId: () => 'sess-probe' })
      fuse2.onAgentError({ code: 'RATE_LIMIT' })
      assert.equal(fuse2.isBlocked(), false)
      fuse2.onAgentError({ code: 'QUOTA' })
      assert.equal(fuse2.isBlocked(), true)
      assert.equal(loadCampaign(dir2, 'c-3').quotaPaused, true)
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('恢复：探测通过 → resumed + 原会话续作提示（attempt/令牌原样）；探测 blocked/unknown 不动', async () => {
  const dir = tmpDir()
  try {
    seedInFlight(dir, 'c-r')
    const store = fakeStore()
    const prompts: Array<{ sessionId: string; text: string }> = []
    const face = fakeSessions({ prompts })
    const fuse = createQuotaFuse({ stateDir: dir, store, sessions: () => face, probeSessionId: () => 'sess-probe' })
    fuse.markBlocked('QUOTA')
    // 探测 blocked → 不恢复。
    ;(face.prompt as unknown as { result: { ok: boolean; error?: { code: string; message: string } } })
    let probeFace = fakeSessions({ prompts, probeResult: 'quota' })
    let probeFuse = createQuotaFuse({ stateDir: dir, store, sessions: () => probeFace, probeSessionId: () => 'sess-probe' })
    assert.equal(await probeFuse.probe(), 'blocked')
    assert.equal(fuse.isBlocked(), true)
    // 探测 open → 恢复：全局清 + resumed 事件 + 续作提示投给司令会话。
    probeFace = fakeSessions({ prompts, probeResult: 'ok' })
    probeFuse = createQuotaFuse({ stateDir: dir, store, sessions: () => probeFace, probeSessionId: () => 'sess-probe' })
    assert.equal(await probeFuse.probe(), 'open')
    await probeFuse.markResumed()
    assert.equal(store.get().quotaBlocked, undefined)
    const task = loadCampaign(dir, 'c-r')
    assert.equal(task.quotaPaused, false)
    assert.equal(task.status, 'in_progress')
    assert.equal(task.attempt!.id, 'tok')
    assert.ok(readEvents(dir, 'c-r').some(e => e.type === 'task_resumed_quota'))
    const resume = prompts.find(p => p.sessionId === 'cmd-9')
    assert.ok(resume !== undefined)
    assert.match(resume.text, /配额已恢复/)
    assert.match(resume.text, /勿重新 war_claim/)
    // 未熔断时 markResumed no-op。
    await probeFuse.markResumed()
    assert.equal(readEvents(dir, 'c-r').filter(e => e.type === 'task_resumed_quota').length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('probeBackoffMs：5min 起步 ×2 封顶 30min', () => {
  assert.equal(probeBackoffMs(0), 5 * 60_000)
  assert.equal(probeBackoffMs(1), 10 * 60_000)
  assert.equal(probeBackoffMs(2), 20 * 60_000)
  assert.equal(probeBackoffMs(10), 30 * 60_000)
})
