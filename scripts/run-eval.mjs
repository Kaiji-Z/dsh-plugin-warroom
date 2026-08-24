/**
 * verify:eval gate — the supervisor layer door (VERIFICATION.md §8.4/§8.7, P0-1).
 *
 * Honest-skip contract: when the judge endpoint env (OPENAI_BASE_URL /
 * OPENAI_API_KEY) or the promptfoo binary is missing, print an explicit
 * `VERIFY:EVAL SKIP` line with the reasons and exit 0 — "pending tool
 * readiness" per VERIFICATION.md §8.7, never a silent pass. When everything
 * is present, run the promptfoo eval and propagate its exit code.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const missing = []
if (!process.env.OPENAI_BASE_URL) missing.push('OPENAI_BASE_URL (GLM OpenAI-compatible gateway)')
if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY (judge key)')
const promptfooMain = 'node_modules/promptfoo/dist/src/main.js'
if (!existsSync(promptfooMain)) missing.push('promptfoo (pnpm install)')

if (missing.length > 0) {
  console.log('VERIFY:EVAL SKIP — pending tool readiness:')
  for (const m of missing) console.log(`  - ${m}`)
  console.log('  (supervisor layer NOT verified this run; see eval/README.md)')
  process.exit(0)
}

const res = spawnSync(process.execPath, [promptfooMain, 'eval', '-c', 'eval/promptfooconfig.yaml'], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(res.status ?? 1)
