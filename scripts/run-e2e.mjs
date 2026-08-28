// verify:e2e —— 实弹考题回归门（真实 LLM 两代续接链，exam-v15 范式常驻化）。
// 前置（缺一即诚实 SKIP，promptfoo 门同款纪律）：
//   1. smoke 服已起（http://127.0.0.1:3080，cordis.smoke.yml，当前构建）；
//   2. 宿主模型可用（真 LLM——考题本身即探测：代 1 收不到即报）。
// 特性：tag 定位不动既有板面（可在操场直接跑，只追加两条 E2E 命令）；
//       证据落 .goal/evidence/e2e/（不入 git）；约 8-12 分钟。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, cpSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3080'
const PY = 'C:/Users/kaiji/AppData/Local/Microsoft/WindowsApps/python.exe'
const EV = '.goal/evidence/e2e'
const STAGES = ['issue', 'track1', 'issue2', 'track2', 'close']

const skip = (msg) => { console.log(`E2E-EXAM: SKIP — ${msg}`); process.exit(0) }

// 前置 1：板面可达
try {
  const r = await fetch(`${BASE}/warroom/api/board`)
  if (!r.ok) skip(`板面不可达（HTTP ${r.status}）——先按 AGENTS.md 本地起服节起 smoke 服`)
} catch { skip('板面不可达（连接失败）——先起 smoke 服（cordis.smoke.yml :3080）') }

// 证据目录重置（历史考题证据已冻结在 evidence/v15/，此处不覆盖）
rmSync(EV, { recursive: true, force: true })
mkdirSync(EV, { recursive: true })

// 考场工作区清旧（真实语义：【星球：】=选已存在目录，issue 段会预建）
rmSync('C:/Users/kaiji/vibecodingKJ/temp/e2e-exam-ws', { recursive: true, force: true })

console.log('E2E-EXAM: run（真实 LLM，约 8-12 分钟）…')
for (const stage of STAGES) {
  console.log(`--- stage: ${stage}`)
  const r = spawnSync(PY, ['scripts/exam-e2e.py', stage], { stdio: 'inherit', encoding: 'utf8' })
  if (r.status !== 0) { console.error(`E2E-EXAM: FAIL — 驱动段 ${stage} 失败（exit ${r.status}）`); process.exit(1) }
}

const a = spawnSync(PY, ['scripts/assert-e2e.py'], { stdio: 'inherit', encoding: 'utf8' })
if (a.status !== 0) { console.error('E2E-EXAM: FAIL — 机检判据未全过'); process.exit(1) }
console.log('E2E-EXAM: PASS — 两代续接全链真实 LLM 走通（证据 .goal/evidence/e2e/）')
