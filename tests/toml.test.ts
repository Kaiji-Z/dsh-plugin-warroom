import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseToml, TomlError } from '../src/toml.ts'

test('parses comments, tables, and scalar values', () => {
  const doc = [
    '# a custom unit',
    "name = 'recon-x'",
    'description = "extended recon #1"',
    'read_only = false',
    '',
    '[unit]',
    'developer_instructions = "scope: deep recon only"',
  ].join('\n')
  const tables = parseToml(doc)
  assert.equal(tables.get('')?.name, 'recon-x')
  assert.equal(tables.get('')?.description, 'extended recon #1')
  assert.equal(tables.get('')?.read_only, false)
  assert.equal(tables.get('unit')?.developer_instructions, 'scope: deep recon only')
})

test('basic string escapes decode; literal strings stay raw', () => {
  const doc = 'a = "line1\\nline2 \\u4e2d"\nb = \'raw \\n stays\''
  const tables = parseToml(doc)
  assert.equal(tables.get('')?.a, 'line1\nline2 中')
  assert.equal(tables.get('')?.b, 'raw \\n stays')
})

test('hash inside quotes is not a comment', () => {
  const tables = parseToml('a = "value # not comment"')
  assert.equal(tables.get('')?.a, 'value # not comment')
})

test('malformed lines throw with line numbers', () => {
  assert.throws(() => parseToml('no equals sign here'), TomlError)
  assert.throws(() => parseToml('a = "unterminated'), TomlError)
  assert.throws(() => parseToml('[]'), TomlError)
  assert.throws(() => parseToml('= novalue'), TomlError)
})

test('booleans and bare tokens', () => {
  const tables = parseToml('t = true\nf = false\nn = 42')
  assert.equal(tables.get('')?.t, true)
  assert.equal(tables.get('')?.f, false)
  assert.equal(tables.get('')?.n, '42')
})
