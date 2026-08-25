import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_ON_FLAGS, featureEnabled, readFeatureFlags, runtimeFlags, FEATURE_FLAGS_ENV } from '../src/flags.ts'

test('P0-3 flag：缺省全 off（off == 改前行为）', () => {
  assert.deepEqual(readFeatureFlags({}), {})
  assert.deepEqual(readFeatureFlags({ [FEATURE_FLAGS_ENV]: '' }), {})
  assert.equal(featureEnabled(readFeatureFlags({}), 'anything'), false)
})

test('P0-3 flag：逗号名表解析，空白与空段容忍，重复折叠', () => {
  const flags = readFeatureFlags({ [FEATURE_FLAGS_ENV]: ' thread-paging ,button-relay,, thread-paging ' })
  assert.deepEqual(flags, { 'thread-paging': true, 'button-relay': true })
  assert.equal(featureEnabled(flags, 'thread-paging'), true)
  assert.equal(featureEnabled(flags, 'button-relay'), true)
  assert.equal(featureEnabled(flags, 'unlisted'), false)
})

test('P0-3 flag：大小写敏感——flag 名是精确匹配，不做模糊启用', () => {
  const flags = readFeatureFlags({ [FEATURE_FLAGS_ENV]: 'Thread-Paging' })
  assert.equal(featureEnabled(flags, 'thread-paging'), false)
  assert.equal(featureEnabled(flags, 'Thread-Paging'), true)
})

test('开发期政策：runtimeFlags 默认全开（DEFAULT_ON），v5-spike 仍 opt-in，env 可覆盖开/关', () => {
  const flags = runtimeFlags({})
  // 全部已交付特性旗默认 on。
  for (const name of DEFAULT_ON_FLAGS) assert.equal(featureEnabled(flags, name), true)
  // 探针旗不是特性：默认 off，经 env 显式开。
  assert.equal(featureEnabled(flags, 'v5-spike'), false)
  const spiked = runtimeFlags({ [FEATURE_FLAGS_ENV]: 'v5-spike' })
  assert.equal(featureEnabled(spiked, 'v5-spike'), true)
  // !name 显式关（回归对照/临时熔断）；不影响其他旗。
  const off = runtimeFlags({ [FEATURE_FLAGS_ENV]: '!staff-plan, !quota-recovery' })
  assert.equal(featureEnabled(off, 'staff-plan'), false)
  assert.equal(featureEnabled(off, 'quota-recovery'), false)
  assert.equal(featureEnabled(off, 'staff-goal'), true)
})
