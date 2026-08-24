/**
 * The one-command verification gate. Every step checks the child's exit code
 * explicitly and asserts the built artifacts exist; prints a GATE line per
 * step; any failure exits 1.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const failed = []

function gate(name, run) {
  const evidence = run()
  const ok = evidence.exit === 0 && evidence.checks.every(c => c.ok)
  console.log(`GATE ${name}: ${ok ? 'DONE' : 'FAILED'}`)
  console.log(`- exit: ${evidence.exit}`)
  for (const check of evidence.checks) console.log(`- ${check.ok ? 'ok' : 'FAIL'}: ${check.label}`)
  if (!ok) failed.push(name)
  return ok
}

function sh(command, args) {
  const res = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  return res.status ?? 1
}

gate('tests', () => ({
  exit: sh('node', ['--import', 'tsx', '--test', 'tests/*.test.ts']),
  checks: [{ ok: true, label: 'node:test suite (glob quoted for git-bash)' }],
}))

gate('build', () => ({
  exit: sh('pnpm', ['run', 'build']),
  checks: [
    { ok: existsSync('lib/index.mjs'), label: 'lib/index.mjs exists' },
    { ok: existsSync('lib/client.js'), label: 'lib/client.js exists' },
  ],
}))

gate('bundle', () => {
  const host = existsSync('lib/index.mjs') ? readFileSync('lib/index.mjs', 'utf8') : ''
  const client = existsSync('lib/client.js') ? readFileSync('lib/client.js', 'utf8') : ''
  const required = [
    [host, 'war_publish', 'secretary publish tool'],
    [host, 'war_board', 'strategic board tool'],
    [host, 'war_claim', 'commander claim tool'],
    [host, 'war_submit', 'commander submit tool'],
    [host, 'war_comment', 'sovereign comment tool'],
    [host, 'war_close_task', 'task close tool'],
    [host, 'war_deploy_unit', 'troop deployment tool'],
    [host, 'war_orders', 'order follow-up tool'],
    [host, 'war_recall', 'recall tool'],
    [host, 'war_status', 'status tool'],
    [host, 'war_log_report', 'report logging tool'],
    [host, 'startContinuable', 'commander+troops spawn via the native subagent runtime'],
    [host, 'checkDeployment', 'hard rules gate every deploy'],
    [host, '贴身参谋条令', 'secretary persona rides the host bundle'],
    [host, '司令条令', 'commander persona rides the host bundle'],
    [host, 'materializeTaskWorkspace', 'per-task workspace materialization'],
    [host, 'patrolNow', 'patrol fuse wakes the commander'],
    [host, 'registerWarCommand', '/war slash command'],
    [host, 'registerPeaceCommand', '/peace slash command'],
    [host, 'campaigns', 'append-only task log directory'],
    [host, '/warroom/api/board', 'board HTTP route'],
    // v1.0 R1 model layer: token rotation, auto-requeue, terminal failure,
    // cron bounty rounds, failure cause, loot accumulation. depsUnsatisfied/
    // QUALITY_TIERS needles land with their R2/R5 wiring commits.
    [host, 'attemptId', 'capability token (attempt rotation)'],
    [host, 'task_requeued', 'failure auto-requeue event'],
    [host, 'task_failed', 'terminal failure state'],
    [host, 'task_schedule_triggered', 'cron bounty rounds'],
    [host, 'lastError', 'failure cause rides the fold'],
    [host, 'deliverables', 'loot accumulation on the fold'],
    [host, 'war_fail', 'commander failure report tool'],
    [host, 'parseEvidence', 'KillCredit evidence gate (pure)'],
    [host, 'depsUnsatisfied', 'dependency chain gate (now wired via war_claim)'],
    [host, 'attempt_id', 'token-carrying submit parameter'],
    [host, 'dueBounties', 'cron bounty tick (missed = skip, never backfill)'],
    [host, 'nextRunOf', 'field-set next-run calculator'],
    [host, 'bountyFuse', 'host 30s bounty fuse'],
    [host, 'boardRevision', 'cheap board revision signature'],
    [host, '/warroom/api/events', 'SSE channel (revision-only frames)'],
    [client, '/warroom/api/events', 'client listens on the SSE channel'],
    [client, 'SAFETY_POLL_MS', 'fallback poll pacing'],
    [client, 'QUALITY_TIERS', 'rarity tiers shared from the domain model'],
    [client, '战利品', 'loot row on the card'],
    [client, '前置未解锁', 'dependency-chain lock badge'],
    [client, '败因', 'failure cause on the card'],
    [client, 'war-mark', '！/？ map-mark status language'],
    [client, '退出码', 'KillCredit evidence block (tests exit code shown)'],
    [host, 'warroom-bounty-drafting', 'secretary drafting skill registered'],
    [host, '悬赏令起草法', 'drafting craft body rides the bundle'],
    [host, '大白话 → 任务书', 'plain-speech-to-brief worked example'],
    [host, 'skills.register', 'runtime skill provider path'],
    // v2.0 R1: directive feed (命令区), workspace mutex, instance workspaces.
    // directive_created/received needles land with the R3 fuse + HTTP route.
    [host, 'war_abandon_command', 'secretary command-abandon tool'],
    [host, 'directive_approved', 'command → task linkage event'],
    [host, 'directive_cancelled', 'command cancellation event'],
    [host, 'parseWorkspaceArg', 'workspace binding resolver (bound/@new/auto)'],
    [host, 'workspaceConflict', 'same-workspace claim mutex'],
    [host, 'materializeInstanceWorkspace', '新副本 instance dir at publish time'],
    // v2.0 R3: command fuse relay, POST channel, attempt session cards.
    [host, 'directive_created', 'board POST creates the command card'],
    [host, 'directive_received', 'command fuse flips the card to received'],
    [host, 'directive_talking', 'client-opened talking transition'],
    [host, '/warroom/api/commands', 'command creation HTTP route'],
    [host, 'relayPromptFor', 'secretary relay prompt (pure)'],
    [host, 'createCommandFuse', 'host 15s command fuse'],
    [host, 'apiProxy', 'host session relay via apiProxy'],
    [host, 'attemptLog', 'per-attempt session cards on the fold'],
    // v2.0 R4: conscription (征召制), dossier, patrol rescue.
    [host, 'war_conscript', 'secretary rescue-conscription tool'],
    [host, 'conscriptPlan', 'per-workspace conscription planner (pure)'],
    [host, 'conscriptBriefing', '征召令 with workspace + dossier'],
    [host, 'readDossier', 'workspace dossier rides conscription'],
    [host, 'maxCommanders', 'global commander capacity gate'],
    [host, 'bindRelay', 'patrol rescue channel via apiProxy'],
    [host, 'recordDossier', 'settled tasks archive into dossiers'],
    // v2.0 R7: drafting craft gains the workspace-routing question.
    [host, '工作区路由', 'drafting skill routes tasks to workspaces'],
    [host, '@new:', 'greenfield instance syntax in the craft'],
    [client, 'mountWarroomShell', 'shell entry: sidebar row + center-column takeover'],
    [client, 'data-dsh-warroom-view', 'injected cross-workspace board view'],
    [client, 'war-sidebar-row', 'sidebar entry row'],
    [client, 'dsh-panel-activate', 'sibling-panel mutual exclusion event'],
    [client, 'react-dom/client', 'board tree via react-dom createRoot'],
    // v3 R1: two-zone command center, detail-first battlefield, dock home.
    [client, '作战室 · 指挥中心', 'v3 war map title'],
    [client, 'war-hq', 'command-center zone container'],
    [client, 'war-field', 'battlefield zone container'],
    [client, 'war-zone-head', 'zone headers'],
    [client, '进入会话复盘', 'session detail jump button'],
    [client, '去处理', 'reported/failed staff-jump button'],
    [client, 'warroom-open-request', 'dock pill home event'],
    [client, 'war-day-group', 'done-zone day grouping'],
    // v3 R2: per-command staff sessions, instant relay, thread attach API.
    [host, 'directive_session_opened', 'per-command staff session event'],
    [host, '参谋·', 'per-command staff session title'],
    [host, 'onCommandCreated', 'POST commands → tickNow instant relay'],
    [host, 'thread_attached', 'thread attach event (append-only)'],
    [host, 'thread_detached', 'thread detach event (append-only)'],
    [host, '/warroom/api/threads', 'thread attach HTTP route'],
    [client, '外部', 'external thread badge'],
    [client, '挂载会话', 'attach modal'],
    [client, 'conversation.composer.dock', 'composer dock pill'],
    // v2.0 R6: five-zone board, command cards, session cards, modals.
    [client, 'war-board', 'five-zone board grid'],
    [client, 'war-col', 'zone columns'],
    [client, 'war-session-card', 'attempt-level session cards'],
    [client, 'war-modal-backdrop', 'in-board detail/composer modals'],
    [client, 'createCommand', '命令区 + button POST channel'],
    [client, 'markTalking', 'entering the secretary conversation flips the card'],
    [client, '点 + 下达第一道命令', 'command-zone empty state'],
    [client, '点击进入对话', 'received-card invitation'],
    [client, '打赢了', 'winning-session outcome language'],
    [client, '待元首翻阅', 'reported-session outcome language'],
    [client, 'lastCurrent', 'session navigation closes the board'],
    // v3 P0 整改（VERIFICATION.md）：flag 机制 + 监督层门文件面。
    [host, 'WARROOM_FEATURES', 'feature flag env switch (default all-off)'],
    [host, 'featureEnabled', 'flag read helper rides the package API'],
    [host, 'readFeatureFlags', 'flag parser rides the package API'],
    // v4 R1: per-troop LLM routing behind the troop-llm-routing flag.
    [host, 'troop-llm-routing', 'V4-R1 troop LLM routing flag gate'],
    [host, 'agentOptions', 'per-troop LLM route passthrough (startContinuable)'],
    // v4 R2: direct messaging with a durable-first ledger (troop-mailbox flag).
    [host, 'troop-mailbox', 'V4-R2 direct-message flag gate'],
    [host, 'war_message', 'the sanctioned direct-message tool'],
    [host, 'message_logged', 'durable-first message event (append-only)'],
    [host, 'message_delivered', 'delivery marker event'],
    // v4 R3: intra-task subtask graph + scheduler (troop-scheduler flag).
    [host, 'troop-scheduler', 'V4-R3 subtask scheduler flag gate'],
    [host, 'war_troop_task', 'commander work-breakdown tool'],
    [host, 'war_troop_claim', 'subtask self-claim tool (attempt tokens)'],
    [host, 'war_troop_update', 'subtask token-gated update tool'],
    [host, 'subtask_created', 'subtask graph event (append-only)'],
    [host, 'kickIdleTroops', 'mutation kick + 30s fallback fuse entry'],
    // v4 R4: park / cold recovery (troop-park flag).
    [host, 'troop-park', 'V4-R4 park flag gate'],
    [host, 'subtask_parked', 'park event (attempt kept, not revoked)'],
    [host, 'war_troop_reassign', 'explicit rotation tool (token revocation)'],
    // v5 R1: mechanism-verification spike (v5-spike flag).
    [host, 'v5-spike', 'V5-R1 spike flag gate'],
    [host, '/warroom/api/v5-spike', 'spike probe HTTP route'],
    [host, 'goals.create', 'goal structural-slice probe verb'],
    [host, 'toolFilter', 'sessions.create toolFilter probe (staff restriction)'],
    // v5 R2: triage + L0 auto-close (staff-triage + staff-auto-close flags).
    [host, 'staff-triage', 'V5-R2 triage flag gate'],
    [host, 'staff-auto-close', 'V5-R2 auto-close flag gate'],
    [host, 'directive_triaged', 'triage ledger event (append-only)'],
    [host, 'directive_regraded', 'sovereign regrade ledger event'],
    [host, 'war_triage', 'staff triage tool'],
    [host, 'killCreditAllGreen', 'mechanical all-green predicate'],
    [host, '/warroom/api/commands/regrade', 'regrade HTTP route'],
    [client, 'gr-L0', 'grade chip styles + badge'],
    [client, 'regradeCommand', 'client regrade channel'],
  ]
  const checks = [
    ...required.map(([src, needle, label]) => ({ ok: src.includes(needle), label: `${src === host ? 'host' : 'client'} bundle contains ${label}` })),
    // v3 negative face: the HQ-create button is gone from the client bundle.
    { ok: !client.includes('开设参谋部'), label: 'client bundle no longer carries the HQ-create button copy' },
    (() => {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
      const decl = pkg.dsh?.client ?? {}
      return {
        ok: decl.immediately === true && Array.isArray(decl.inject) && decl.inject.includes('slots'),
        label: 'dsh.client manifest: immediately:true + slots inject edge',
      }
    })(),
    // P0-1/P0-2: the supervisor layer's eval config + gate script exist on disk
    // (the judge itself runs behind `pnpm verify:eval` with honest SKIP).
    { ok: existsSync('eval/promptfooconfig.yaml') && existsSync('eval/prompts/supervisor.txt') && existsSync('eval/tests.yaml'), label: 'supervisor layer: promptfoo config/prompt/tests exist' },
    { ok: existsSync('scripts/run-eval.mjs') && existsSync('tests/e2e-regression.test.ts'), label: 'verify:eval gate script + eight-step regression exist' },
  ]
  return { exit: 0, checks }
})

if (failed.length > 0) {
  console.log(`\nVERIFY: FAILED at ${failed.join(', ')}`)
  process.exit(1)
}
console.log('\nVERIFY: PASS — tests, build, and bundle assertions all green (machine-checked).')
