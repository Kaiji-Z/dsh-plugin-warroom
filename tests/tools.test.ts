import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDeliverables, parseEvidence, parseWorkspaceArg, qualityOf } from '../src/tools.ts'
import type { SubmissionEvidence } from '../src/types.ts'

test('qualityOf normalizes unknown values to common', () => {
  assert.equal(qualityOf('epic'), 'epic')
  assert.equal(qualityOf(undefined), 'common')
  assert.equal(qualityOf('Epic'), 'common')
  assert.equal(qualityOf('神话'), 'common')
})

test('parseEvidence rejects self-certification without evidence', () => {
  const none = parseEvidence(undefined)
  assert.equal(none.ok, false)
  if (!none.ok) assert.match(none.reason, /没有证据/)
  const notObject = parseEvidence('全做完了')
  assert.equal(notObject.ok, false)
  if (!notObject.ok) assert.match(notObject.reason, /checks/)
})

test('parseEvidence rejects unfinished checks with the failed items named', () => {
  const partial = parseEvidence({ checks: [{ item: 'CLI 可运行', passed: true }, { item: '测试全绿', passed: false }] })
  assert.equal(partial.ok, false)
  if (!partial.ok) assert.match(partial.reason, /测试全绿/)
  if (!partial.ok) assert.match(partial.reason, /war_fail/)
})

test('parseEvidence rejects a failing test run (exit_code must be 0)', () => {
  const red = parseEvidence({ checks: [{ item: 'a', passed: true }], tests: { command: 'npm test', exit_code: 1, passed: 10, failed: 2 } })
  assert.equal(red.ok, false)
  if (!red.ok) assert.match(red.reason, /退出码 1/)
})

test('parseEvidence accepts a full green card and normalizes fields', () => {
  const ok = parseEvidence({
    checks: [{ item: 'add 可用', passed: true }, { item: 'list 可用', passed: true }],
    tests: { command: 'npm test', exit_code: 0, passed: 8, failed: 0 },
    diffstat: '2 files changed',
    files: ['cli.js', 'cli.test.js'],
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.evidence.checks.length, 2)
    assert.equal(ok.evidence.tests?.exitCode, 0)
    assert.deepEqual(ok.evidence.files, ['cli.js', 'cli.test.js'])
  }
})

test('v1.0 R8: evidence rides the JSON-TEXT channel (dsh drops type:json params)', () => {
  const asText = parseEvidence(JSON.stringify({
    checks: [{ item: 'add 写入', passed: true }],
    tests: { command: 'node test.ps1', exit_code: 0, passed: 19, failed: 0 },
  }))
  assert.equal(asText.ok, true)
  if (asText.ok) assert.equal(asText.evidence.tests?.passed, 19)
  const badJson = parseEvidence('not json at all')
  assert.equal(badJson.ok, false)
  if (!badJson.ok) assert.match(badJson.reason, /JSON/)
  const emptyText = parseEvidence('  ')
  assert.equal(emptyText.ok, false)
})

test('v1.0 R8: deliverables also accept the JSON-text channel', () => {
  const evidence: SubmissionEvidence = { checks: [{ item: 'a', passed: true }] }
  const parsed = parseDeliverables('[{"kind":"tests","summary":"19/19 全绿"}]', evidence, 'now')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]!.summary, '19/19 全绿')
})

test('parseDeliverables auto-collects loot from evidence when the commander listed none', () => {
  const evidence: SubmissionEvidence = {
    checks: [{ item: 'a', passed: true }],
    tests: { command: 'npm test', exitCode: 0, passed: 6, failed: 0 },
    diffstat: '3 files changed, 41 insertions(+)',
    files: ['a.js', 'b.js', 'c.js'],
  }
  const auto = parseDeliverables(undefined, evidence, 'now')
  assert.equal(auto.length, 3)
  assert.ok(auto.some(d => d.kind === 'tests' && d.summary.includes('npm test')))
  assert.ok(auto.some(d => d.kind === 'diffstat'))
  assert.ok(auto.some(d => d.kind === 'files' && d.summary.includes('3 个文件')))
  // 显式清单优先：同 kind 不重复自动补
  const explicit = parseDeliverables([{ kind: 'tests', summary: '自报：测试过了' }], evidence, 'now')
  assert.equal(explicit.filter(d => d.kind === 'tests').length, 1)
  assert.equal(explicit[0]!.summary, '自报：测试过了')
})

test('v2.0: parseWorkspaceArg routes bound / instance / auto', () => {
  assert.deepEqual(parseWorkspaceArg('D:/proj/kaijibot'), { kind: 'bound', path: 'D:/proj/kaijibot' })
  assert.deepEqual(parseWorkspaceArg('  @new:spider  '), { kind: 'instance', slug: 'spider' })
  assert.deepEqual(parseWorkspaceArg(undefined), { kind: 'auto' })
  assert.deepEqual(parseWorkspaceArg('   '), { kind: 'auto' })
  // '@new:' without a name degrades to auto (malformed param must not block).
  assert.deepEqual(parseWorkspaceArg('@new:'), { kind: 'auto' })
})
