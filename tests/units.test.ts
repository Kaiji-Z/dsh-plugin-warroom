import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { BUILTIN_UNITS, loadRoster, sandboxDeny, sandboxWrites, validateUnitSpec } from '../src/units.ts'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-units-'))
}

test('builtin roster carries four units with correct sandboxes', () => {
  assert.deepEqual(BUILTIN_UNITS.map(u => u.name), ['recon', 'engineer', 'medic', 'scribe'])
  const recon = BUILTIN_UNITS.find(u => u.name === 'recon')!
  assert.equal(recon.sandboxMode, 'read-only')
  assert.equal(sandboxWrites(recon.sandboxMode), false)
  const deny = sandboxDeny('read-only')
  for (const tool of ['write', 'edit', 'bash', 'pwsh', 'subagent', 'send_message']) {
    assert.ok(deny.includes(tool), `read-only deny must include ${tool}`)
  }
  assert.ok(!sandboxDeny('workspace-write').includes('bash'))
  for (const unit of BUILTIN_UNITS) {
    assert.ok(sandboxDeny(unit.sandboxMode).includes('subagent'), `${unit.name} must deny delegation`)
  }
})

test('validateUnitSpec accepts agent-toml-shaped files and fills defaults', () => {
  const result = validateUnitSpec({
    name: 'artillery',
    description: 'heavy refactor',
    developer_instructions: 'go big',
    sandbox_mode: 'workspace-write',
  }, 'project', 'a.toml')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.spec.label, 'artillery')
    assert.equal(result.spec.backend, 'in-process')
    assert.equal(result.spec.source, 'project')
  }
  // sandbox_mode defaults to workspace-write.
  const def = validateUnitSpec({ name: 'x', description: 'd', developer_instructions: 'i' }, 'personal', 'b.toml')
  assert.equal(def.ok && def.spec.sandboxMode, 'workspace-write')
})

test('validateUnitSpec rejects bad names, missing fields, bad enums, bad backend', () => {
  assert.equal(validateUnitSpec({ description: 'd', developer_instructions: 'i' }, 'project', 'a.toml').ok, false)
  assert.equal(validateUnitSpec({ name: 'Bad_Name', description: 'd', developer_instructions: 'i' }, 'project', 'a.toml').ok, false)
  assert.equal(validateUnitSpec({ name: 'ok', description: '', developer_instructions: 'i' }, 'project', 'a.toml').ok, false)
  const badMode = validateUnitSpec({ name: 'ok', description: 'd', developer_instructions: 'i', sandbox_mode: 'root' }, 'project', 'a.toml')
  assert.equal(badMode.ok, false)
  if (!badMode.ok) assert.ok(badMode.errors.some(e => e.includes('sandbox_mode')))
  const badBackend = validateUnitSpec({ name: 'ok', description: 'd', developer_instructions: 'i', backend: 'remote' }, 'project', 'a.toml')
  assert.equal(badBackend.ok, false)
})

test('loadRoster: project overrides personal overrides builtin by name, keeping order', () => {
  const personal = tmpDir()
  const project = tmpDir()
  try {
    mkdirSync(join(personal, 'units'), { recursive: true })
    mkdirSync(join(project, '.warroom', 'units'), { recursive: true })
    writeFileSync(join(personal, 'units', 'recon.toml'), [
      "name = 'recon'",
      'description = "personal recon override"',
      'developer_instructions = "personalized"',
    ].join('\n'))
    writeFileSync(join(personal, 'units', 'sniper.toml'), [
      "name = 'sniper'",
      "label = '狙击手'",
      'description = "one file, one shot"',
      'developer_instructions = "surgical edits"',
      "sandbox_mode = 'read-only'",
    ].join('\n'))
    writeFileSync(join(project, '.warroom', 'units', 'recon.toml'), [
      "name = 'recon'",
      'description = "project recon override"',
      'developer_instructions = "project-flavored"',
    ].join('\n'))
    writeFileSync(join(project, '.warroom', 'units', 'broken.toml'), 'name = = broken')
    const roster = loadRoster(join(personal, 'units'), project)
    const names = roster.units.map(u => u.name)
    assert.deepEqual(names, ['recon', 'engineer', 'medic', 'scribe', 'sniper'])
    const recon = roster.units.find(u => u.name === 'recon')!
    assert.equal(recon.description, 'project recon override')
    assert.equal(recon.instructions, 'project-flavored')
    const sniper = roster.units.find(u => u.name === 'sniper')!
    assert.equal(sniper.label, '狙击手')
    assert.equal(sniper.source, 'personal')
    assert.ok(roster.errors.some(e => e.includes('broken.toml')), 'parse errors are reported, not fatal')
  } finally {
    rmSync(personal, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
