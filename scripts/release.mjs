/**
 * The one-command release (the fixed 发版 ritual): verify gate → version
 * bump → release commit → v* tag → push main + tag → CI (npm trusted
 * publishing) → poll the registry until the version is live. No human gate
 * by owner decision — the verify gate is the only quality barrier, and the
 * CI job re-runs it. Every step checks the child's exit code explicitly and
 * fails loud with its recovery hint; pushes are retriable (commit + tag stay
 * local until both pushes succeed).
 *
 * 版本方案（元首定 v0.x.y-N）：patch=刀（0.18.9-6 → 0.18.9-7）、
 * minor=迭代（→ 0.18.10，刀清零）、major=里程碑（→ 0.19.0）；也接受
 * 显式完整版本号。package.json 落地不带 v 前缀（semver 预发布段承载刀数）。
 *
 * Usage:
 *   node scripts/release.mjs <version|major|minor|patch> ["commit message"]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const OWNER_REPO = 'Kaiji-Z/dsh-plugin-warroom'
const NPM_NAME = 'dsh-plugin-warroom'
const POLL_MS = 15_000
const POLL_MAX_MS = 12 * 60_000

const [,, target, ...messageParts] = process.argv
if (target === undefined) {
  console.error('usage: node scripts/release.mjs <version|major|minor|patch> ["commit message"]')
  process.exit(1)
}

/** Run one child; stdio inherited; returns its exit code. */
function sh(command, args, shell) {
  const res = spawnSync(command, args, { stdio: 'inherit', shell })
  return res.status ?? 1
}

/** Bump a v0.x.y-N string per the milestone/iteration/knife scheme.
 * 位义（元首定）：0.里程碑.迭代-刀。关键词双轨——领域词
 * milestone/iteration/knife 为准，semver 词 major/minor/patch 按位就近映射：
 * major=里程碑（0.19.0）、minor=迭代（0.18.10，刀清零）、patch=刀（0.18.9-7）。 */
function bump(version, part) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/)
  if (m === null) return null
  const milestone = Number(m[1]), iteration = Number(m[2]), patch = Number(m[3])
  const knife = m[4] === undefined ? null : Number(m[4])
  if (part === 'major' || part === 'milestone') return `${milestone}.${iteration + 1}.0`
  if (part === 'minor' || part === 'iteration') return `${milestone}.${iteration}.${patch + 1}`
  if (part === 'patch' || part === 'knife') {
    return knife === null ? `${milestone}.${iteration}.${patch}-1` : `${milestone}.${iteration}.${patch}-${knife + 1}`
  }
  return null
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const current = pkg.version
const next = /^\d+\.\d+\.\d+(-\d+)?$/.test(target) ? target : bump(current, target)
if (next === null || next === current) {
  console.error(`release: cannot go from ${current} to ${JSON.stringify(target)}`)
  process.exit(1)
}
const tag = `v${next}`
const message = messageParts.join(' ') || `${tag}: release`

console.log(`RELEASE ${current} -> ${next} (${tag})`)

// GATE 0 — clean tree. This script commits ONLY package.json; every source
// change must already be committed or the tag ships a version bump over stale
// code (lookatstudy 的 0.11.0 前科：ritual 只提交 package.json，未提交的源码
// 上不了 tag，npm 上是旧代码新号)。
const dirty = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
if (dirty.status !== 0 || (dirty.stdout ?? '').trim() !== '') {
  console.error('release: working tree is dirty — commit your changes first')
  console.error('  (the release commit carries only the version bump; uncommitted code would NOT reach the tag)')
  process.exit(1)
}

// GATE 1 — the verify gate (same as local; CI re-runs it too).
// --config.verify-deps-before-run=false：本机 pnpm 偶发 registry 抖动会炸
// 依赖校验（已知环境坑），显式关掉这一层，verify 三段式照跑。
const verifyArgs = process.platform === 'win32'
  ? ['--config.verify-deps-before-run=false', 'run', 'verify']
  : ['run', 'verify']
if (sh('pnpm', verifyArgs, process.platform === 'win32') !== 0) {
  console.error('release: verify FAILED — nothing was written')
  process.exit(1)
}

// GATE 2 — bump + commit + tag (local only until the pushes land).
pkg.version = next
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
if (sh('git', ['add', 'package.json'], false) !== 0 || sh('git', ['commit', '-m', message], false) !== 0) {
  console.error('release: commit failed — fix and rerun (the version bump is written but uncommitted)')
  process.exit(1)
}
if (sh('git', ['tag', tag], false) !== 0) {
  console.error(`release: tag ${tag} already exists — delete it or pass a different version`)
  process.exit(1)
}

// GATE 3 — push main + tag; this tag push IS the publish trigger (trusted publishing).
if (sh('git', ['push', 'origin', 'main', tag], false) !== 0) {
  console.error(`release: push failed — rerun after fixing network: git push origin main ${tag} (commit and tag are already local)`)
  process.exit(1)
}
console.log(`PUSHED ${tag} — CI (Publish to npm) is running on ${OWNER_REPO}`)

// GATE 4 — poll the registry until the version is live.
const deadline = Date.now() + POLL_MAX_MS
for (;;) {
  await new Promise(resolve => setTimeout(resolve, POLL_MS))
  let versions = null
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_NAME}`)
    if (res.ok) versions = (await res.json()).versions
  } catch { /* transient network failure: keep polling */ }
  if (versions !== null && versions[next] !== undefined) {
    console.log(`RELEASED ${NPM_NAME}@${next} is live on npm`)
    console.log(`next: reinstall the web profile (edit ~/.dsh/profiles/web/package.json to @${next}, delete node_modules + pnpm-lock.yaml, corepack pnpm install from the harness root)`)
    process.exit(0)
  }
  if (Date.now() > deadline) {
    console.error(`release: ${NPM_NAME}@${next} did NOT appear on npm within ${POLL_MAX_MS / 60_000} min — check the Actions run on ${OWNER_REPO} (首发前须在 npmjs.com 预登记 pending publisher：包名 + ${OWNER_REPO} + publish.yml + environment 留空)`)
    process.exit(1)
  }
  console.log('waiting for CI publish…')
}
