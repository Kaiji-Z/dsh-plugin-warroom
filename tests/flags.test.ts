import assert from 'node:assert/strict'
import { test } from 'node:test'
import { featureEnabled, readFeatureFlags, FEATURE_FLAGS_ENV } from '../src/flags.ts'

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
