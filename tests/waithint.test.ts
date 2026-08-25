import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitKindOf } from '../src/client/waithint.ts'
import type { BoardTask } from '../src/client/data.ts'

/** V7-⑤「为什么还没动」——解释类别判定（纯函数），node 直测。 */

function task(p: { status?: BoardTask['status']; deps?: string[]; queueAhead?: number | null; quotaPaused?: boolean }): BoardTask {
  return {
    taskId: 'T', title: 't', status: p.status ?? 'published', priority: 'normal', quality: 'common',
    rounds: 1, attempts: 1, deps: p.deps ?? [], lastError: null, workspacePath: 'D:/ws', claimedBy: null,
    startedAt: '2026-08-25T10:00:00Z', brief: '', acceptance: '', schedule: null,
    attemptLog: [], troops: [], deliverables: [], reports: [], comments: [], closedVerdict: null,
    queueAhead: p.queueAhead, quotaPaused: p.quotaPaused,
  }
}

const statuses = new Map<string, BoardTask['status']>([['T-dep', 'closed'], ['T-block', 'published']])

test('published：排队位次>0 → queued；位次 0 → awaitingClaim；前置未解锁 → null（depLock 已解释）', () => {
  assert.equal(waitKindOf(task({ queueAhead: 2 }), statuses), 'queued')
  assert.equal(waitKindOf(task({ queueAhead: 0 }), statuses), 'awaitingClaim')
  assert.equal(waitKindOf(task({ deps: ['T-block'] }), statuses), null)
  // queueAhead 缺失（旧投影）：published 的常态就是等领取，awaitingClaim 兜底仍诚实。
  assert.equal(waitKindOf(task({ queueAhead: undefined }), statuses), 'awaitingClaim')
})

test('in_progress：配额暂停 → quotaPaused；否则 null；其他状态不解释', () => {
  assert.equal(waitKindOf(task({ status: 'in_progress', quotaPaused: true }), statuses), 'quotaPaused')
  assert.equal(waitKindOf(task({ status: 'in_progress' }), statuses), null)
  assert.equal(waitKindOf(task({ status: 'reported' }), statuses), null)
})
