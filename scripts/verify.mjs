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
    [host, 'war_publish', 'staff publish tool'],
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
    [host, '贴身参谋条令', 'staff persona rides the host bundle'],
    [host, '指挥官条令', 'commander persona rides the host bundle'],
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
    // 皮肤切换器：平话皮肤 + 渲染期词典 + 订阅重渲染。
    [client, 'plainCopy', 'plain-language skin bundled'],
    [client, 'subscribeSkin', 'skin store subscription'],
    [client, 'useSyncExternalStore', 'skin switch re-renders the board'],
    [client, 'war-skin-opt', 'settings-drawer skin option buttons (V9.2 moved from island)'],
    // V6 三区 + 命令全生命周期（impeccable 重设计轮）。
    [client, 'war-report', 'third zone (战报) container'],
    [client, 'war-life', 'command lifecycle strip on every command card'],
    [client, 'commandTasks', 'command→chain deps closure (lifecycle tracing core)'],
    [client, 'war-lineage', 'task/session lineage chip back to source command'],
    [client, 'war-tour-cards', 'focus tour: per-stage card stack (main-UI cards pulled in)'],
    // V7-① 等你发落收件箱（到访式工作流）。
    [client, 'collectInbox', 'inbox four-kind aggregation (pure)'],
    [client, 'war-inbox', 'inbox strip styles + container'],
    // V7-② 到访摘要（自上次看过以来的增量横幅）。
    [client, 'visitDelta', 'visit delta calculator (pure)'],
    [client, 'war-visit', 'visit digest banner styles + container'],
    // V7-③ 族系追踪（悬停高亮 + 聚焦压暗 + 聚焦条）。
    [client, 'war-rel-same', 'family highlight class'],
    [client, 'war-rel-dim', 'non-family dim class'],
    [client, 'war-island-focus', 'focus chip in island pill (no auto-expand)'],
    // V7-④ 夜间预检 + 起草器档位/最近命令。
    [client, 'stalledOnUserPlan', 'night preflight predicate (pure)'],
    [client, 'applyGradeMarker', 'composer grade marker (pure)'],
    [client, 'war-preflight', 'preflight row on command cards'],
    [client, 'war-grade-card', 'composer autonomy option cards'],
    // V7-⑥ 空板首用引导。
    [client, 'war-onboard', 'empty-board onboarding panel'],
    // V7-⑤「为什么还没动」host 只读投影 + 客户端解释行。
    [host, 'queuePositionOf', 'conscription queue position (read-only projection)'],
    [host, 'quotaPaused', 'quota pause flag rides the board projection'],
    [client, 'waitKindOf', 'wait-hint kind selector (pure)'],
    [client, 'war-waithint', 'wait explanation row on task cards'],
    // V7.1 审查整改（impeccable critique 2026-08-25）。
    [client, 'agingLeader', 'inbox err-tier leader marker (aging inflation fix)'],
    [client, 'failToast', 'decision-action failure toast copy (silent-failure fix)'],
    [client, 'war-actionerr', 'decision-action failure strip'],
    [client, 'war-legend-rows', 'legend rows (now inside settings drawer)'],
    [client, 'war-subdetail', 'focus tour: inline sub-detail panel beneath clicked card'],
    [client, 'focus-visible', 'keyboard focus outline'],
    [client, 'keyActivate', 'card keyboard activation (Enter/Space)'],
    [client, "tabIndex: 0", 'cards are focusable buttons'],
    [client, 'aria-label', 'screen-reader labels on cards'],
    // V8 hero 灵动岛 + 三区大容器 + 卡片保守瘦身 + 悬停自动滚动。
    [client, 'WarIsland', 'hero dynamic-island component'],
    [client, 'war-island-pill', 'island collapsed meter pill'],
    [client, 'war-island-panel', 'island expanded overlay panel (non-pushing)'],
    [client, 'visitMini', 'island visit mini digest copy (both skins)'],
    [client, 'scrollIntoView', 'hover family auto-scroll to highlighted cards'],
    [host, 'runtimeFlags', 'dev-phase default-on flag policy'],
    [host, 'warroom-bounty-drafting', 'staff drafting skill registered'],
    [host, '悬赏令起草法', 'drafting craft body rides the bundle'],
    [host, '大白话 → 任务书', 'plain-speech-to-brief worked example'],
    [host, 'skills.register', 'runtime skill provider path'],
    // v2.0 R1: directive feed (命令区), workspace mutex, instance workspaces.
    // directive_created/received needles land with the R3 fuse + HTTP route.
    [host, 'war_abandon_command', 'staff command-abandon tool'],
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
    [host, 'relayPromptFor', 'staff relay prompt (pure)'],
    [host, 'createCommandFuse', 'host 15s command fuse'],
    [host, 'apiProxy', 'host session relay via apiProxy'],
    [host, 'attemptLog', 'per-attempt session cards on the fold'],
    // v2.0 R4: conscription (征召制), dossier, patrol rescue.
    [host, 'war_conscript', 'staff rescue-conscription tool'],
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
    // V9 迁移：三区五列 → 三列局势墙 + 底部命令调度条（Dispatch 调度中心）。
    [client, '作战室', 'war map title (V9.4: 指挥中心 zone retired, title follows)'],
    [client, 'war-ops', 'three-column ops wall grid (dispatch is its sibling)'],
    [client, 'war-dispatch', 'bottom command dispatch strip'],
    [client, 'war-dispatch-track', 'dispatch scrollable card track (placard retired, V9.4 containerized)'],
    [client, 'can-scroll', 'dynamic right-edge fade only while more to scroll'],
    [client, 'war-tasks', 'tasks zone container (open tasks)'],
    [client, 'war-field', 'battlefield zone container'],
    [client, 'war-tour-jumps', 'focus tour: bottom dual session-jump buttons'],
    // V9.2：岛只留 ⚙（设置抽屉收编图例/皮肤/行为开关）；聚焦不弹岛；调度坞左端
    // 常驻 ＋ 下达；起草器选项卡化 + cron 定时（后端 directive cron 一次性发令）。
    [client, 'war-island-gear', 'island settings gear button'],
    [client, 'war-settings-drawer', 'settings drawer (skin/legend/toggles/conn)'],
    [client, 'war-switch', 'settings toggle switches (persist localStorage)'],
    [client, 'war-dispatch-add', 'dispatch-dock compose button (sticky lead)'],
    [client, 'war-sched-card', 'composer schedule option cards'],
    [client, 'war-cron-input', 'composer cron input + presets'],
    [client, 'cronPresets', 'cron preset lexicon (both skins)'],
    [host, 'directive_dispatched', 'scheduled command dispatch event'],
    [host, 'dueScheduledDirectives', 'scheduled command due calculator'],
    // V9.3（复评 27/40 整改）：Esc 层协调器 + 弹窗 dialog 语义/焦点圈禁 +
    // warn 文本对比度 + 批准视觉隔离 + 非零收件箱胶囊染警示。
    [client, 'useModalLayer', 'modal dialog semantics + focus trap + Esc coordination'],
    [client, 'has-inbox', 'island pill warn tint when inbox non-empty'],
    [client, 'war-cd-band', 'focus page decision band (top-pinned, inbox-aligned)'],
    [client, 'war-tour-hint', 'state-split gray hints (scheduled/relaying/cancelled/battle)'],
    [client, 'war-fold', 'collapsed receipts (evidence/loot/grade-reason details)'],
    [client, 'approvedAwaitingPublish', 'approved-empty-chain lifecycle status (no contradiction)'],
    [client, 'attemptFailedNeutral', 'older failed attempts get neutral copy, not latest error'],
    // styles.ts 双模板串坑（连踩两次）：CSS 误插 querySelector 模板会炸宿主入口。
    // 断言该模板在 bundle 里保持「开-闭完整」形态。
    [client, 'style[${STYLE_ID}]`) !== null) return', 'ensureWarStyles querySelector template intact (CSS not leaked into it)'],
    [client, '任务会话', 'focus tour: staff-session jump button (both skins)'],
    [client, '执行会话', 'focus tour: commander-session jump button (both skins)'],
    [client, 'war-tour-ghost', 'planning ghost card (task-forming workshop entry)'],
    [client, '去处理', 'reported/failed staff-jump button'],
    // V9.10 聚焦页状态机补全：ghost 提前到已接令/等你答问、配置改档、任务书/验收、战利品/历次作战。
    [client, '进入对话回答', 'talking ghost: answer-in-dialog action (both skins)'],
    [client, 'war-btn-warn', 'warn-styled primary for the talking answer action'],
    [client, 'taskScheduledHint', 'scheduled-not-dispatched task hint (state-split copy key)'],
    [client, 'taskBrief', 'task panel: per-ring brief row copy key'],
    [client, 'war-sub-btns', 'config expansion: regrade button row'],
    [client, 'war-sub-attempts', 'report expansion: per-attempt session list (click to jump)'],
    // V9.11 R1 卡位模型：任务列=参谋侧台账（成形卡 + 任务书卡全量常驻）+ 生命条上报即进战报段。
    [client, 'formingVariantOf', 'forming-variant derivation shared by focus ghost & ledger card'],
    [client, 'war-forming', 'ledger forming card class'],
    [client, '成形中', 'forming drafting chip copy (both skins)'],
    [client, 'war-card.settled', 'settled task cards stay in ledger, dimmed'],
    [client, 'warroom-open-request', 'dock pill home event'],
    // v3 R2: per-command staff sessions, instant relay, thread attach API.
    [host, 'directive_session_opened', 'per-command staff session event'],
    [host, '参谋·', 'per-command staff session title'],
    [host, 'onCommandCreated', 'POST commands → tickNow instant relay'],
    [host, 'thread_attached', 'thread attach event (append-only)'],
    [host, 'thread_detached', 'thread detach event (append-only)'],
    [host, '/warroom/api/threads', 'thread attach HTTP route'],
    [client, '外部', 'external thread badge'],
    [client, '挂载会话', 'attach copy block (badge/detach still used; modal retired)'],
    [client, 'conversation.composer.dock', 'composer dock pill'],
    // v2.0 R6: five-zone board, command cards, session cards, modals.
    [client, 'war-board', 'five-zone board grid'],
    [client, 'war-col', 'zone columns'],
    [client, 'war-session-card', 'attempt-level session cards'],
    [client, 'war-modal-backdrop', 'in-board detail/composer modals'],
    [client, 'createCommand', '命令区 + button POST channel'],
    [client, 'markTalking', 'entering the staff conversation flips the card'],
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
    // V6 命令拆解（staff-decompose）：拆解呈批 + 成链发布。
    [host, 'staff-decompose', 'V6 decompose flag gate'],
    [host, 'war_decompose', 'staff decompose tool'],
    [host, 'war_publish_chain', 'chain publish tool'],
    [host, 'directive_decomposed', 'structured decomposition ledger event'],
    // V6 goal 接力原子性补偿（staff-goal 旗内）：领取未武装缺口巡检补武装。
    [host, 'armMissingCommanderGoals', 'goal relay sweep repair'],
    [host, 'goalRelayFuse', '60s goal relay sweep fuse'],
    [host, 'swept', 'sweep-repair ledger marker'],
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
    // v5 R3: plan state + goal relay (staff-plan + staff-goal flags).
    [host, 'staff-plan', 'V5-R3 plan-state flag gate'],
    [host, 'staff-goal', 'V5-R3 goal-relay flag gate'],
    [host, 'directive_plan_opened', 'plan ledger event (append-only)'],
    [host, 'directive_plan_approved', 'plan approval ledger event'],
    [host, 'war_plan', 'staff plan submission tool'],
    [host, 'war_set_goal', 'staff goal mediation tool'],
    [host, 'commander_goal_armed', 'commander goal arming ledger event'],
    [host, 'commander_goal_settled', 'commander goal settlement ledger event'],
    [host, 'openDisarmedGoalForDirective', 'staff disarm-goal state machine (red line)'],
    [host, '/warroom/api/commands/plan', 'plan decision HTTP route'],
    [client, 'decidePlan', 'client plan decision channel'],
    // v5 R4: graded wake + context injection + quota self-heal + publish lint.
    [host, 'staff-wake', 'V5-R4 wake pipeline flag gate'],
    [host, 'quota-recovery', 'V5-R4 quota self-heal flag gate'],
    [host, 'createWakeEngine', 'graded wake engine (debounce + sweep)'],
    [host, 'staff_woken', 'wake delivery ledger event'],
    [host, 'boardDigest', 'board digest context injection'],
    [host, 'createQuotaFuse', 'quota circuit-breaker fuse'],
    [host, 'task_paused_quota', 'in-place pause event (no attempt burn)'],
    [host, 'task_resumed_quota', 'in-place resume event (same token)'],
    [host, 'isQuotaError', 'code-only quota classifier (R1 ④)'],
    [host, 'lintPublish', 'deterministic publish lint'],
    [host, 'bountyDraftingSkillContent', 'drafting craft embedded in relay (坑2)'],
    // 皮肤基础与语气降温（2026-08-25）。
    [client, 'warCopy', 'skin foundation: centralized copy lexicon'],
    [host, 'toneRule', 'explicit engineer-plain tone rule (no cosplay)'],
    [host, '工程师式简洁', 'tone rule keyword in personas'],
  ]
  const checks = [
    ...required.map(([src, needle, label]) => ({ ok: src.includes(needle), label: `${src === host ? 'host' : 'client'} bundle contains ${label}` })),
    // v3 negative face: the HQ-create button is gone from the client bundle.
    { ok: !client.includes('开设参谋部'), label: 'client bundle no longer carries the HQ-create button copy' },
    // V9.2 negative face: retired island buttons/modals must stay gone.
    { ok: !client.includes('AttachThreadModal') && !client.includes('war-attach-input'), label: 'V9.2: attach modal stays retired (no re-entry)' },
    { ok: !client.includes('LegendModal') && !client.includes('war-focusbar'), label: 'V9.2: legend modal + focus bar stay retired (drawer/island-chip own them)' },
    // V9.9 negative face：任务/会话详情模态裁撤——详情面只剩聚焦页。
    { ok: !client.includes('查看任务'), label: 'V9.9: view-task footer button stays retired (jumps own navigation)' },
    { ok: !client.includes('进入会话复盘'), label: 'V9.9: session-detail modal stays retired (focus page owns details)' },
    // V9.10 negative face：1234 阶段跳转导航钮退役（段头只剩静态标签）。
    { ok: !client.includes('war-cd-step'), label: 'V9.10: stage jump-nav buttons stay retired (no war-cd-step anywhere)' },
    // 生命条状态行只描述状态；进对话动作归卡上 chip/聚焦页 ghost，点卡指示不许回流。
    { ok: !client.includes('点卡进对话'), label: 'V9.10: lifecycle status stays instruction-free (no 点卡进对话)' },
    // V9.11 R1 negative face：任务列不再按终局过滤（台账全量在列）。
    { ok: !client.includes('openTasks'), label: 'V9.11: task ledger is no longer filtered to open tasks' },
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
