/**
 * The war_* tool surface v0.2 — the strategic operating system's verbs.
 *
 * Staff-side (runs in the 参谋部 conversation): war_publish materializes
 * a per-task workspace, appends the task to the board, and wakes the
 * commander; war_board lists the cross-workspace board; war_comment /
 * war_close_task carry the sovereign's review.
 *
 * Commander-side (runs in the spawned commander child): war_claim licenses
 * deployment (hard rule), war_submit reports back to the board; the troop
 * quartet (deploy/orders/recall/status/log_report) is unchanged in spirit —
 * fronts are now scoped inside the task's workspace, so cross-task write
 * isolation is physical.
 *
 * Structural slices of SubagentRuntime / ToolRunContext keep this module free
 * of host-only imports so its pure helpers stay unit-testable.
 * @module dsh-plugin-warroom/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { relative, resolve, isAbsolute } from 'node:path'
import { appendDirectiveEvent, loadDirectives, overrideMarkerOf, type DirectiveGrade } from './directives.ts'
import { appendDossierEntry, dossierEntryFor } from './dossier.ts'
import { appendEvent, isActiveUnit, listCampaignIds, loadCampaign } from './events.ts'
import { checkClaim, checkDeployment, conscriptPlan, depsUnsatisfied, normalizeFront, sameWorkspace, workspaceConflict } from './rules.ts'
import { loadRoster, sandboxDeny, sandboxWrites, unitAgentOptions, type Roster } from './units.ts'
import { commanderReportHint, mailboxDiscipline, schedulerDiscipline, troopBriefing, troopReportDiscipline } from './persona.ts'
import { newCampaignId, type WarStore } from './state.ts'
import { featureEnabled, type FeatureFlags } from './flags.ts'
import { armGoalForTask, openDisarmedGoalForDirective, settleGoalMentioning, type GoalsFace } from './goals.ts'
import { QUALITY_TIERS, type CampaignState, type Deliverable, type DescendantFace, type QualityTier, type SubmissionEvidence, type SubtaskRecord, type UnitRecord, type UnitSpec } from './types.ts'

/** Structural slice of `ctx.subagents` (SubagentRuntime) — the operations warroom uses. */
export interface SubagentsServiceFace {
  startContinuable(spec: {
    provider: string
    label: string
    request: {
      prompt: ReadonlyArray<{ type: 'text'; text: string }>
      parent: unknown
      persona?: string
      toolFilter?: { deny?: string[] }
      maxDepth?: number
      /** Per-child LLM route (V4-R1, behind the troop-llm-routing flag). */
      agentOptions?: { provider: string; model: string }
    }
    signal: AbortSignal
  }): Promise<{ childId: string; messageId: string }>
  followup(parent: unknown, childId: string, content: ReadonlyArray<{ type: 'text'; text: string }>, options: unknown): Promise<unknown>
  interrupt(targetSessionId: string, authority: unknown): void
  listDescendants(rootSessionId: string, signal?: AbortSignal): Promise<ReadonlyArray<DescendantFace>>
}

/** Structural slice of ToolRunContext — the fields the war tools consume. */
export interface WarToolExec {
  readonly agent?: { readonly id: string; followup(message: unknown): void }
  readonly signal: AbortSignal
}

/** Commander conscription operations (v2.0 征召制) implemented by the host
 * wiring (index.ts): the commander is a top-level session bound to the task
 * workspace via the host apiProxy (sandbox root + depth 0), gated on
 * workspace occupancy, global capacity, and a spawn-once-per-task guard. */
export interface CommanderOps {
  conscript(task: CampaignState, signal: AbortSignal): Promise<{ spawned: true; childId: string } | { spawned: false; reason: string }>
  /** Deliver a notice into one commander session (批注转达). */
  relayTo(sessionId: string, text: string): Promise<boolean>
}

/** Workspace materialization seam (injected for testability). */
export interface WorkspaceOps {
  materialize(warRoot: string, taskId: string, repo: string): { path: string; kind: 'worktree' | 'dir'; note?: string }
  /** 新副本: fresh git-initialized instance dir under `<warRoot>/instances/`. */
  materializeInstance(warRoot: string, taskId: string, slug: string): { path: string; kind: 'dir'; note?: string }
}

/**
 * v2.0 workspace binding resolution (pure): a real existing dir (`bound`), a
 * greenfield instance (`@new:<slug>`), or v1.0's auto-isolated dir (`auto`).
 */
export type WorkspaceBinding =
  | { readonly kind: 'bound'; readonly path: string }
  | { readonly kind: 'instance'; readonly slug: string }
  | { readonly kind: 'auto' }

export function parseWorkspaceArg(workspace: unknown): WorkspaceBinding {
  const ws = typeof workspace === 'string' ? workspace.trim() : ''
  if (ws.startsWith('@new:')) {
    const slug = ws.slice('@new:'.length).trim()
    // '@new:' without a name degrades to the auto path — the staff should
    // always name the instance, but a malformed param must not block.
    return slug !== '' ? { kind: 'instance', slug } : { kind: 'auto' }
  }
  if (ws !== '') return { kind: 'bound', path: ws }
  return { kind: 'auto' }
}

/** Wiring the tool factory needs from apply(). */
export interface WarToolsDeps {
  store: WarStore
  stateDir: string
  maxUnits: number
  /** Max attempts per bounty before `failed` (auto-requeue below this). */
  maxAttempts: number
  /** Roster read fresh per call so edited unit files apply to the next deploy. */
  roster(): Roster
  subagents: SubagentsServiceFace
  commander: CommanderOps
  workspace: WorkspaceOps
  warRoot: string
  /** Feature flags read once at plugin start (VERIFICATION.md §8.3). */
  flags: FeatureFlags
  /** V4-R2 (troop-mailbox): resolve a live agent by session id from the host
   * registry — lets a troop push a message to a sibling troop via the
   * commander as parent. Optional: absent → troop→troop messages
   * stay durable-pending instead of erroring. */
  resolveAgent?: (sessionId: string) => unknown
  /** V5-R3 (staff-goal): 惰性取宿主 goal 服务面（inject 捕获，可能缺席）。
   * 缺席 → goal 代管诚实降级（不武装/不结算，账本记不了就跳过）。 */
  goals?: () => GoalsFace | undefined
  /** V5-R4 (staff-wake)：结算点唤醒参谋（分级推+去抖在引擎侧）。旗关或
   * 未接线 → 无唤醒（行为等价）。 */
  wakeStaff?: (taskId: string, kind: 'reported' | 'failed', detail: string) => void
}

function requireAgent(exec: WarToolExec): { id: string } {
  if (exec.agent === undefined) {
    throw new Error('warroom 工具需要在 agent 上下文中执行（找不到调用方 agent）。')
  }
  return exec.agent
}

function requireTask(deps: WarToolsDeps, taskId: string): CampaignState {
  const state = loadCampaign(deps.stateDir, taskId)
  if (state.startedAt === '') {
    throw new Error(`任务 ${taskId} 不存在。用 war_board 查看任务栏。`)
  }
  return state
}

function findUnit(roster: Roster, name: string): UnitSpec | undefined {
  return roster.units.find(u => u.name === name)
}

/**
 * Spawn with a self-healing toolFilter: deny lists name tools by INTENT
 * (write/bash families vary per deployment), and tools.restrict() rejects
 * unknown names outright (live R8 catch: str_replace_editor/bash/jobs absent
 * here). On that exact failure, trim the deny list to the deployment's known
 * tools — parsed from the error's own roster — and retry once.
 */
async function startWithToolFilter(deps: WarToolsDeps, spec: {
  label: string
  prompt: ReadonlyArray<{ type: 'text'; text: string }>
  commander: { id: string }
  persona: string
  deny: string[]
  agentOptions?: { provider: string; model: string }
  signal: AbortSignal
}): Promise<{ childId: string }> {
  const base = {
    provider: 'spawn',
    label: spec.label,
    request: {
      prompt: spec.prompt,
      parent: spec.commander,
      persona: spec.persona,
      maxDepth: 2,
      ...(spec.agentOptions !== undefined ? { agentOptions: spec.agentOptions } : {}),
    },
    signal: spec.signal,
  }
  try {
    return await deps.subagents.startContinuable({ ...base, request: { ...base.request, toolFilter: { deny: spec.deny } } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const known = /known global tools: (.+)$/.exec(message)?.[1]
    if (known === undefined) throw err
    const knownSet = new Set(known.split(',').map(s => s.trim()))
    const trimmed = spec.deny.filter(name => knownSet.has(name))
    if (trimmed.length === spec.deny.length) throw err
    return await deps.subagents.startContinuable({ ...base, request: { ...base.request, toolFilter: { deny: trimmed } } })
  }
}

function boardOf(deps: WarToolsDeps): CampaignState[] {
  const order: Record<CampaignState['status'], number> = { published: 0, in_progress: 1, reported: 2, draft: 3, failed: 4, closed: 5 }
  return listCampaignIds(deps.stateDir)
    .map(id => loadCampaign(deps.stateDir, id))
    .filter(t => t.startedAt !== '')
    .sort((a, b) =>
      (order[a.status] - order[b.status])
      || ((b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
      || (a.startedAt < b.startedAt ? -1 : 1))
}

function taskSummary(task: CampaignState): Record<string, unknown> {
  const units = [...task.units.values()]
  return {
    taskId: task.campaignId,
    title: task.title ?? task.intent,
    status: task.status,
    priority: task.priority ?? 'normal',
    quality: task.quality ?? 'common',
    rounds: task.rounds,
    attempts: task.attempts,
    workspacePath: task.workspacePath,
    ...(task.deps !== undefined && task.deps.length > 0 ? { deps: task.deps } : {}),
    ...(task.lastError !== undefined ? { lastError: task.lastError } : {}),
    ...(task.claimedBy !== undefined ? { claimedBy: task.claimedBy } : {}),
    troops: units.map(u => ({ childId: u.childId, label: u.label, front: u.front })),
    deliverables: task.deliverables.map(d => ({ kind: d.kind, summary: d.summary })),
    latestReport: task.reports.length > 0 ? task.reports[task.reports.length - 1] : undefined,
  }
}

/** Status-of lookup over the whole board (for the dependency gate). */
function statusOfFactory(deps: WarToolsDeps): (campaignId: string) => CampaignState['status'] | undefined {
  const cache = new Map<string, CampaignState['status']>()
  for (const id of listCampaignIds(deps.stateDir)) {
    cache.set(id, loadCampaign(deps.stateDir, id).status)
  }
  return id => cache.get(id)
}

/** Archive a settled task into its workspace dossier (bound workspaces only —
 * auto-isolated dirs under the war root are one-shot and never revisited). */
function recordDossier(deps: WarToolsDeps, taskId: string): void {
  try {
    const task = loadCampaign(deps.stateDir, taskId)
    if (task.workspacePath === undefined || task.workspacePath.startsWith(deps.warRoot)) return
    appendDossierEntry(deps.stateDir, task.workspacePath, task.title ?? task.intent, dossierEntryFor(task), new Date().toISOString())
  } catch {
    // Dossier is an enrichment — never block the settling event's return.
  }
}

/**
 * V5-R2 KillCredit 机械全绿判据（flag staff-auto-close 的收官门槛）：
 * checks 非空且全部 passed + tests 存在且退出码 0 + files（若有）全部在
 * 任务工作区内（越界一票否决）。纯函数——系统核对，不靠自报。
 */
export function killCreditAllGreen(evidence: SubmissionEvidence, workspacePath: string | undefined): { green: boolean; why: string } {
  if (evidence.checks.length === 0) return { green: false, why: '无验收项核对记录' }
  const failed = evidence.checks.filter(c => !c.passed)
  if (failed.length > 0) return { green: false, why: `${failed.length} 项验收未过` }
  if (evidence.tests === undefined) return { green: false, why: '未附测试运行记录' }
  if (evidence.tests.exitCode !== 0) return { green: false, why: `测试退出码 ${evidence.tests.exitCode}` }
  if (evidence.files !== undefined && evidence.files.length > 0) {
    if (workspacePath === undefined) return { green: false, why: '任务无工作区绑定，无法核对越界' }
    const wsRoot = resolve(workspacePath)
    // 相对路径是指挥官在工作区内的自然报法（R5 考题实测抓到的判据 bug：
    // resolve 相对路径会落到插件进程 CWD——必须先锚定到工作区再判）。
    const outside = evidence.files.filter(f => {
      const abs = isAbsolute(f) ? resolve(f) : resolve(wsRoot, f)
      const rel = relative(wsRoot, abs)
      return rel === '' || rel.startsWith('..') || isAbsolute(rel)
    })
    if (outside.length > 0) return { green: false, why: `越界一票否决：${outside.length} 个文件在工作区外（${outside[0]}…）` }
  }
  return { green: true, why: `验收 ${evidence.checks.length} 项全过；${evidence.tests.command} 退出码 0；无越界` }
}

/** Shared close path (V5-R2 抽取)：落 task_closed + 归档 + goal 结算 + 同工作区接力征召。 */
async function closeTaskInternal(deps: WarToolsDeps, taskId: string, verdict: string, signal: AbortSignal): Promise<string | undefined> {
  appendEvent(deps.stateDir, { type: 'task_closed', ts: new Date().toISOString(), campaignId: taskId, verdict })
  recordDossier(deps, taskId)
  // V5-R3（flag staff-goal）：交防结算——指挥官 armed goal 随任务收官 complete
  // （CAS 链；agent 经注册表解析，缺席/失败 → 诚实降级不入账）。
  await settleCommanderGoal(deps, taskId, 'closed')
  let nextTaskId: string | undefined
  try {
    const task = loadCampaign(deps.stateDir, taskId)
    const next = conscriptPlan(boardOf(deps).map(t => ({ taskId: t.campaignId, status: t.status, workspacePath: t.workspacePath, priority: t.priority, startedAt: t.startedAt })))
      .find(t => sameWorkspace(t.workspacePath, task.workspacePath))
    if (next !== undefined) {
      const result = await deps.commander.conscript(loadCampaign(deps.stateDir, next.taskId), signal)
      if (result.spawned) nextTaskId = next.taskId
    }
  } catch {
    // 巡检保险丝会补
  }
  return nextTaskId
}

/** V5-R3: settle the claiming commander's armed goal on task settle paths
 * (close / fail). Best-effort — never blocks the main settlement. */
async function settleCommanderGoal(deps: WarToolsDeps, taskId: string, outcome: string): Promise<void> {
  try {
    if (!featureEnabled(deps.flags, 'staff-goal')) return
    const task = loadCampaign(deps.stateDir, taskId)
    if (task.claimedBy === undefined) return
    const agent = deps.resolveAgent?.(task.claimedBy)
    if (agent === undefined) return
    const goalId = await settleGoalMentioning(deps.goals?.(), agent, taskId)
    if (goalId !== undefined) {
      appendEvent(deps.stateDir, { type: 'commander_goal_settled', ts: new Date().toISOString(), campaignId: taskId, goalId, outcome })
    }
  } catch {
    // Goal 结算是增强——结算主路径绝不被拖垮。
  }
}

/**
 * V5-R4 确定性发布 lint（flag staff-triage）：验收非空可判——title/brief
 * 长度下限 + acceptance 必须是「可核对的结构」（分行或分隔符列举，或足够
 * 长的一句话陈述）。纯函数，系统拦不靠自觉。
 */
export function lintPublish(args: { title?: unknown; brief?: unknown; acceptance?: unknown }): { ok: boolean; reason: string } {
  const title = typeof args.title === 'string' ? args.title.trim() : ''
  const brief = typeof args.brief === 'string' ? args.brief.trim() : ''
  const acceptance = typeof args.acceptance === 'string' ? args.acceptance.trim() : ''
  if (title.length < 4) return { ok: false, reason: '标题太短（≥4 字）：一句话说清做什么。' }
  if (brief.length < 10) return { ok: false, reason: '任务书正文太短（≥10 字）：背景、执行指引、边界至少各一句。' }
  if (acceptance.length < 10) return { ok: false, reason: '验收标准太短（≥10 字）：指挥官提交时要逐项核对的。' }
  const listy = acceptance.includes('\n') || acceptance.includes('；') || acceptance.includes(';') || acceptance.includes('、')
  if (!listy && acceptance.length < 30) {
    return { ok: false, reason: '验收标准不可判定：用分行或「；、」列举可核对项（或写成 ≥30 字的明确完成定义）。' }
  }
  return { ok: true, reason: '' }
}

/** Build the v0.2 tool surface bound to live wiring. */
export function warTools(deps: WarToolsDeps) {
  const warPublish = defineTool({
    name: 'war_publish',
    description: '参谋发布任务：把任务书写上战略任务栏。自动建任务工作区（声明 repo 时尽力建 git worktree，跨任务物理隔离）并唤醒指挥官领取。元首批准任务书后调用。',
    parameters: {
      title: { type: 'string', required: true, description: '任务标题，一句话。' },
      brief: { type: 'string', required: true, description: '任务书正文（写给指挥官的专业 prompt）：背景与目标、执行指引、边界与注意事项。' },
      acceptance: { type: 'string', required: true, description: '验收标准：可判定的完成定义（检查项列表）——指挥官提交时必须逐项核对并附证据。' },
      priority: { type: 'string', description: 'normal（默认）| high（优先领取）。' },
      quality: { type: 'string', description: '悬赏品质（复杂度分档，任务栏显示对应颜色）：common 普通（默认）| fine 精良 | rare 稀有 | epic 史诗 | legendary 传说。' },
      deps: { type: 'array', items: { type: 'string' }, description: '前置任务 id 列表（任务链）：全部收官后本悬赏才解锁可领取。' },
      cron: { type: 'string', description: '日常悬赏的 cron 表达式（5 段，如 "0 9 * * *" 每天 9 点）：到点自动重开一轮；错过不补跑。' },
      repo: { type: 'string', description: '源码仓库路径（git checkout）；声明则任务工作区为其 worktree，省略则普通目录。仅当未指定 workspace 时生效。' },
      workspace: { type: 'string', description: '任务绑定的现有工作区绝对路径（同工作区任务排队执行、跨工作区并行作战）；或 "@new:<名字>" 新开一个带 git 的副本目录；省略则自动建隔离任务目录。' },
      commandId: { type: 'string', description: '本任务书来源的命令 id（命令区卡片编号）——发布后命令卡会标记已批准并链接到本任务。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskId: { type: 'string', required: true },
          workspacePath: { type: 'string', required: true },
          workspaceKind: { type: 'string', required: true },
          conscripted: { type: 'boolean', required: true },
          commandApproved: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `任务已上栏：${value.taskId} · 工作区 ${value.workspacePath}（${value.workspaceKind}）${value.commandApproved === true ? ' · 命令卡已标记批准' : ''}${value.note !== undefined ? ` · ${value.note}` : ''}。${value.conscripted ? '指挥官已应征到任，将自动领取' : '暂未征召（排队/满编），巡检保险丝会补征召'}。` },
      ],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const staff = requireAgent(exec)
      // V5-R4（flag staff-triage）确定性 lint：系统拦不可判定的任务书。
      if (featureEnabled(deps.flags, 'staff-triage')) {
        const lint = lintPublish(args)
        if (!lint.ok) throw new Error(`任务书不过 lint：${lint.reason}`)
      }
      const taskId = newCampaignId()
      const priority = args.priority === 'high' ? 'high' : 'normal'
      const quality = qualityOf(args.quality)
      // 任务链：未知前置编号直接拒发——打错字必须拦下来，不能静默放行。
      const depIds = args.deps ?? []
      if (depIds.length > 0) {
        const unknown = depIds.filter(id => loadCampaign(deps.stateDir, id).startedAt === '')
        if (unknown.length > 0) throw new Error(`前置任务编号不存在：${unknown.join('、')}。请用 war_board 核对任务编号后再发布。`)
      }
      // 命令溯源：本任务书若来自命令区，发布即把命令卡标记为已批准。
      let commandApproved = false
      const commandId = typeof args.commandId === 'string' ? args.commandId.trim() : ''
      if (commandId !== '') {
        const directive = loadDirectives(deps.stateDir).find(d => d.id === commandId)
        if (directive === undefined) throw new Error(`命令 ${commandId} 不存在。请核对命令区编号（命令卡上可见）。`)
        if (directive.status === 'approved') throw new Error(`命令 ${commandId} 已批准过任务 ${directive.taskId}，不要重复发布。`)
        if (directive.status === 'cancelled') throw new Error(`命令 ${commandId} 已取消，不能再发布任务。`)
        // V5-R3（flag staff-plan）发布硬门：L1/L2 档位必须先有元首批准的
        // 计划（plan.status==='approved'）；L0/未分诊无门（快书直发特性）。
        if (featureEnabled(deps.flags, 'staff-plan') && (directive.grade === 'L1' || directive.grade === 'L2') && directive.plan?.status !== 'approved') {
          throw new Error(`命令 ${commandId} 档位为 ${directive.grade}（先计划后做）：${directive.plan === undefined ? '尚未呈报计划——先勘察后用 war_plan 呈计划，元首批准后才能发布' : directive.plan.status === 'pending' ? '计划待元首批准（命令卡上批），批准后才能发布' : '计划被驳回——按元首意见修订计划重呈（war_plan）'}。`)
        }
        // V5-R3（flag staff-goal）发布点接力：参谋状态机 goal 随发布结算。
        if (featureEnabled(deps.flags, 'staff-goal')) {
          const face = deps.goals?.()
          if (face !== undefined && directive.staffSessionId !== undefined) {
            const staffAgent = deps.resolveAgent?.(directive.staffSessionId)
            if (staffAgent !== undefined) {
              const goalId = await settleGoalMentioning(face, staffAgent, commandId)
              if (goalId !== undefined) appendDirectiveEvent(deps.stateDir, { type: 'directive_goal_settled', ts: new Date().toISOString(), directiveId: commandId, goalId })
            }
          }
        }
        appendDirectiveEvent(deps.stateDir, { type: 'directive_approved', ts: new Date().toISOString(), directiveId: directive.id, taskId })
        commandApproved = true
      }
      // 工作区路由：绑定既有目录 > 新副本 > v1.0 自动隔离目录。
      const binding = parseWorkspaceArg(args.workspace)
      let ws: { path: string; kind: 'worktree' | 'dir'; note?: string }
      if (binding.kind === 'instance') {
        ws = deps.workspace.materializeInstance(deps.warRoot, taskId, binding.slug)
      } else if (binding.kind === 'bound') {
        const abs = resolve(binding.path)
        if (!existsSync(abs)) throw new Error(`工作区不存在：${abs}。请与元首核对路径（让元首在决策卡里选项目），或改用 @new:<名字> 新开副本。`)
        ws = { path: abs, kind: 'dir', note: '绑定既有工作区（同工作区任务排队执行）' }
      } else {
        ws = deps.workspace.materialize(deps.warRoot, taskId, args.repo ?? '')
      }
      appendEvent(deps.stateDir, {
        type: 'task_created', ts: new Date().toISOString(), campaignId: taskId, title: args.title, brief: args.brief, acceptance: args.acceptance, priority, publishedBy: staff.id,
        ...(quality !== 'common' ? { quality } : {}), ...(depIds.length > 0 ? { deps: depIds } : {}),
      })
      appendEvent(deps.stateDir, { type: 'task_published', ts: new Date().toISOString(), campaignId: taskId, workspacePath: ws.path, publishedBy: staff.id })
      if (args.cron !== undefined && args.cron.trim() !== '') {
        appendEvent(deps.stateDir, { type: 'task_scheduled', ts: new Date().toISOString(), campaignId: taskId, cron: args.cron.trim(), enabled: true })
      }
      const war = deps.store.get()
      if (!war.active) {
        war.active = true
        deps.store.save()
      }
      // 征召制：工作区空闲即为本任务征召一名指挥官（忙则排队，等收官接力或巡检补征）。
      let conscripted = false
      try {
        const fresh = loadCampaign(deps.stateDir, taskId)
        const result = await deps.commander.conscript(fresh, exec.signal)
        conscripted = result.spawned
      } catch {
        conscripted = false
      }
      return { taskId, workspacePath: ws.path, workspaceKind: ws.kind, conscripted, ...(commandApproved ? { commandApproved } : {}), ...(ws.note !== undefined ? { note: ws.note } : {}) }
    },
    presentCall: args => ({ card: 'generic', title: `发布任务：${args.title}` }),
  })

  const warBoard = defineTool({
    name: 'war_board',
    description: '战略任务栏：跨工作区查看全部任务（待领取/进行中/待翻阅/已收官）、任务书全文、工作区、部队与最新战报。参谋呈报前、指挥官领取前都先看板。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tasks: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                taskId: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'string', required: true },
                priority: { type: 'string', required: true },
                quality: { type: 'string', required: true },
                rounds: { type: 'number', required: true },
                attempts: { type: 'number', required: true },
                deps: { type: 'array', required: true, items: { type: 'string' } },
                lastError: { type: 'string' },
                workspacePath: { type: 'string' },
                brief: { type: 'string' },
                acceptance: { type: 'string' },
                troops: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
                deliverables: { type: 'array', required: true, items: { type: 'string' } },
                latestReportText: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: value.tasks.length === 0 ? '任务栏为空。' : value.tasks.map(t => `【${t.status}】${t.taskId} · ${t.title}${t.priority === 'high' ? '（高优先）' : ''}${t.workspacePath !== undefined ? ` · 工作区 ${t.workspacePath}` : ''}\n任务书：${t.brief ?? ''}\n验收：${t.acceptance ?? ''}${t.latestReportText !== undefined ? `\n最近汇报：${t.latestReportText.slice(0, 200)}` : ''}`).join('\n---\n') },
      ],
    },
    async execute() {
      const tasks = boardOf(deps).map(t => ({
        taskId: t.campaignId,
        title: t.title ?? t.intent,
        status: t.status,
        priority: t.priority ?? 'normal',
        quality: t.quality ?? 'common',
        rounds: t.rounds,
        attempts: t.attempts,
        deps: t.deps ?? [],
        ...(t.lastError !== undefined ? { lastError: t.lastError } : {}),
        ...(t.workspacePath !== undefined ? { workspacePath: t.workspacePath } : {}),
        ...(t.brief !== undefined ? { brief: t.brief } : {}),
        ...(t.acceptance !== undefined ? { acceptance: t.acceptance } : {}),
        troops: [...t.units.values()].map(u => ({ childId: u.childId, label: u.label, front: u.front })),
        deliverables: t.deliverables.map(d => `${d.summary}`),
        ...(t.reports.length > 0 ? { latestReportText: t.reports[t.reports.length - 1]!.text.slice(0, 400) } : {}),
      }))
      return { tasks }
    },
    presentCall: () => ({ card: 'generic', title: '查看任务栏' }),
  })

  const warClaim = defineTool({
    name: 'war_claim',
    description: '指挥官领取任务：把 published 任务置为 in_progress——只有领取后的任务才允许派兵（硬规则）。领取会发一张本次尝试的令牌（attempt_id），提交汇报时必须携带。前置任务未收官的悬赏处于锁定状态，不可领取。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id（war_board 可见）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskId: { type: 'string', required: true },
          attemptId: { type: 'string', required: true },
          attempt: { type: 'number', required: true },
          workspacePath: { type: 'string' },
          brief: { type: 'string' },
          acceptance: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `已领取 ${value.taskId}（第 ${value.attempt} 次尝试，令牌 ${value.attemptId.slice(0, 8)}…）。任务书与验收标准已附上；工作区：${value.workspacePath ?? '（未建）'}。开始作战。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const commander = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      const blocked = depsUnsatisfied(task.deps ?? [], statusOfFactory(deps))
      // 工作区互斥：同工作区已有在役任务 → 排队（v2.0 征召制的并发单位）。
      const busy = workspaceConflict(task.workspacePath, boardOf(deps).map(t => ({ taskId: t.campaignId, status: t.status, workspacePath: t.workspacePath })))
      const check = checkClaim(task, blocked, busy?.taskId)
      if (!check.ok) throw new Error(check.reason)
      const attemptId = randomUUID()
      const attempt = task.attempts + 1
      appendEvent(deps.stateDir, { type: 'task_claimed', ts: new Date().toISOString(), campaignId: args.task_id, claimedBy: commander.id, attemptId, attempt })
      // V5-R3（flag staff-goal）：领取即武装指挥官 goal——「任务 X 验收全过」
      // 交给宿主 round driver 驱动。残留 armed goal 先自愈（K15）；服务缺席
      // 或失败 → 诚实降级（无 goal 也不碍作战），账本只在成功时入账。
      if (featureEnabled(deps.flags, 'staff-goal')) {
        const face = deps.goals?.()
        const armed = await armGoalForTask(face, commander, args.task_id, { maxGoalRounds: 30, title: task.title ?? task.intent })
        if (armed !== undefined) {
          appendEvent(deps.stateDir, {
            type: 'commander_goal_armed', ts: new Date().toISOString(), campaignId: args.task_id,
            goalId: armed.goalId, sessionId: commander.id, ...(armed.healed !== undefined ? { healedGoalId: armed.healed } : {}),
          })
        }
      }
      return {
        taskId: args.task_id,
        attemptId,
        attempt,
        ...(task.workspacePath !== undefined ? { workspacePath: task.workspacePath } : {}),
        ...(task.brief !== undefined ? { brief: task.brief } : {}),
        ...(task.acceptance !== undefined ? { acceptance: task.acceptance } : {}),
      }
    },
    presentCall: args => ({ card: 'generic', title: `领取任务 ${args.task_id}` }),
  })

  const warSubmit = defineTool({
    name: 'war_submit',
    description: '指挥官提交汇报（KillCredit 制）：验收证据不全不给过——checks 必须覆盖验收标准且全部通过，tests 的退出码必须为 0。证据由系统核对，不靠自报。未全过就继续修，修不动就 war_fail。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      attempt_id: { type: 'string', required: true, description: '领取任务时发的令牌（war_claim 返回的 attemptId）。' },
      report: { type: 'string', required: true, description: '汇报正文（摘要式）。' },
      evidence: { type: 'string', required: true, description: '验收证据的 JSON 文本（必须是字符串，内容为 JSON）：{"checks":[{"item":"验收项","passed":true}],"tests":{"command":"npm test","exit_code":0,"passed":8,"failed":0},"diffstat":"3 files changed","files":["a.js"]}——checks 逐项核对验收标准且全部 passed；tests 是真实跑过的命令（exit_code 必须为 0）。' },
      deliverables: { type: 'string', description: '战利品清单的 JSON 文本（字符串）：[{"kind":"files|tests|diffstat|note","summary":"一句话"}]——显示在任务卡上，元首不进会话记录也能看到交付了什么。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, status: { type: 'string', required: true }, evidenceSummary: { type: 'string', required: true }, note: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: value.status === 'closed' ? `任务 ${value.taskId} 证据机械全绿，已自动收官（${value.evidenceSummary}）${value.note !== undefined ? `；${value.note}` : ''}。` : `任务 ${value.taskId} 已提交汇报（${value.evidenceSummary}），待元首翻阅。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const commander = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      if (task.status !== 'in_progress') {
        throw new Error(`任务 ${args.task_id} 状态为 ${task.status}，只有进行中任务可提交汇报。`)
      }
      if (task.attempt === undefined || args.attempt_id !== task.attempt.id) {
        throw new Error(`令牌不匹配：这不是任务 ${args.task_id} 当前尝试的令牌（任务可能已被重派或重新领取）。请重新 war_claim 领取并使用新令牌；若任务已不在进行中，用 war_board 查看状态。`)
      }
      const verdict = parseEvidence(args.evidence)
      if (!verdict.ok) throw new Error(verdict.reason)
      const deliverables = parseDeliverables(args.deliverables, verdict.evidence, new Date().toISOString())
      appendEvent(deps.stateDir, {
        type: 'task_submitted', ts: new Date().toISOString(), campaignId: args.task_id, report: args.report, from: commander.id,
        evidence: verdict.evidence, ...(deliverables.length > 0 ? { deliverables } : {}),
      })
      const e = verdict.evidence
      const parts = [`验收 ${e.checks.length} 项全过`]
      if (e.tests !== undefined) parts.push(`${e.tests.command} 退出码 ${e.tests.exitCode}（${e.tests.passed} 过 / ${e.tests.failed} 败）`)
      // V5-R2（flag staff-auto-close）：KillCredit 机械全绿 → 自动收官；
      // 任何一项不绿 → 维持 reported 呈批（待元首翻阅），绝不硬闯。
      if (featureEnabled(deps.flags, 'staff-auto-close')) {
        const green = killCreditAllGreen(e, task.workspacePath)
        if (green.green) {
          const nextTaskId = await closeTaskInternal(deps, args.task_id, `自动收官：KillCredit 机械全绿（${green.why}）`, exec.signal)
          return { taskId: args.task_id, status: 'closed', evidenceSummary: green.why, ...(nextTaskId !== undefined ? { note: `已为同工作区的 ${nextTaskId} 征召指挥官` } : {}) }
        }
      }
      // V5-R4（flag staff-wake）：待翻阅（非自动收官）才唤醒参谋——全绿
      // 自动收官已由系统了结，无需吵醒（分级推）。
      if (featureEnabled(deps.flags, 'staff-wake')) deps.wakeStaff?.(args.task_id, 'reported', `${parts.join('；')}；汇报：${args.report.slice(0, 160)}`)
      return { taskId: args.task_id, status: 'reported', evidenceSummary: parts.join('；') }
    },
    presentCall: args => ({ card: 'generic', title: `提交汇报 ${args.task_id}` }),
  })

  const warFail = defineTool({
    name: 'war_fail',
    description: '指挥官上报失败：本次尝试无法完成（附原因）。未到重试上限会自动重派回任务栏（重新领取发新令牌）；到上限则标记 failed 留给元首让参谋重新立案。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      attempt_id: { type: 'string', required: true, description: '当前尝试的令牌。' },
      reason: { type: 'string', required: true, description: '失败原因（一句话，写给元首看的人话）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, status: { type: 'string', required: true }, attempts: { type: 'number', required: true }, maxAttempts: { type: 'number', required: true }, next: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `任务 ${value.taskId} 第 ${value.attempts}/${value.maxAttempts} 次尝试失败：${value.status === 'published' ? '已自动重派回任务栏，请重新 war_claim 领取（换新令牌）' : '重试已用尽，已标记失败等元首处置' }。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const commander = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      if (task.status !== 'in_progress') {
        throw new Error(`任务 ${args.task_id} 状态为 ${task.status}，只有进行中任务可上报失败。`)
      }
      if (task.attempt === undefined || args.attempt_id !== task.attempt.id) {
        throw new Error('令牌不匹配：这不是当前尝试的令牌。请重新 war_claim 后再操作。')
      }
      const attempts = task.attempts
      appendEvent(deps.stateDir, { type: 'task_attempt_failed', ts: new Date().toISOString(), campaignId: args.task_id, reason: args.reason, from: commander.id })
      if (attempts < deps.maxAttempts) {
        appendEvent(deps.stateDir, { type: 'task_requeued', ts: new Date().toISOString(), campaignId: args.task_id, reason: `第 ${attempts} 次尝试失败：${args.reason}` })
        // 自动重试 = 立即为重派的任务征召新指挥官（新令牌新会话）。
        try {
          await deps.commander.conscript(loadCampaign(deps.stateDir, args.task_id), exec.signal)
        } catch {
          // 征召失败由巡检保险丝补
        }
        return { taskId: args.task_id, status: 'published', attempts, maxAttempts: deps.maxAttempts, next: `已自动重派回任务栏并征召新指挥官；新指挥官将重新 war_claim（新令牌）。` }
      }
      appendEvent(deps.stateDir, { type: 'task_failed', ts: new Date().toISOString(), campaignId: args.task_id, reason: `第 ${attempts} 次尝试失败：${args.reason}（重试上限 ${deps.maxAttempts} 已用尽）` })
      recordDossier(deps, args.task_id)
      // V5-R3：重试用尽交防——指挥官 goal 结算（failed）。
      await settleCommanderGoal(deps, args.task_id, 'failed')
      // V5-R4（flag staff-wake）：失败（用尽）唤醒参谋重新立案；requeue 路径
      // 系统自动征召，无需唤醒（分级推）。
      if (featureEnabled(deps.flags, 'staff-wake')) deps.wakeStaff?.(args.task_id, 'failed', args.reason.slice(0, 200))
      return { taskId: args.task_id, status: 'failed', attempts, maxAttempts: deps.maxAttempts, next: '重试已用尽。请向元首说明，由参谋重新立案（建议拆小一点再发）。' }
    },
    presentCall: args => ({ card: 'generic', title: `上报失败 ${args.task_id}` }),
  })

  const warAbandonCommand = defineTool({
    name: 'war_abandon_command',
    description: '参谋废弃命令：意图无法成案（元首放弃、无法澄清）时，把命令区的命令卡标记为已取消。已批准出任务的命令不能废弃（任务已上栏，如需撤销请与元首商议收官作废）。',
    parameters: {
      command_id: { type: 'string', required: true, description: '命令 id（命令区卡片编号，cmd- 开头）。' },
      reason: { type: 'string', required: true, description: '取消原因（一句话，写给元首看的人话）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { commandId: { type: 'string', required: true }, status: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `命令 ${value.commandId} 已取消（命令卡已标记，元首可点开看原因）。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      requireAgent(exec)
      const directive = loadDirectives(deps.stateDir).find(d => d.id === args.command_id)
      if (directive === undefined) throw new Error(`命令 ${args.command_id} 不存在。请核对命令区编号。`)
      if (directive.status === 'approved') throw new Error(`命令 ${args.command_id} 已批准为任务 ${directive.taskId}，不能取消；如需撤销请与元首商议后作废任务。`)
      if (directive.status === 'cancelled') return { commandId: directive.id, status: 'cancelled' }
      appendDirectiveEvent(deps.stateDir, { type: 'directive_cancelled', ts: new Date().toISOString(), directiveId: directive.id, reason: args.reason })
      return { commandId: directive.id, status: 'cancelled' }
    },
    presentCall: args => ({ card: 'generic', title: `废弃命令 ${args.command_id}` }),
  })

  const warConscript = defineTool({
    name: 'war_conscript',
    description: '参谋征召：为一张已发布且工作区空闲的悬赏征召一名指挥官。发布/收官/重派时系统会自动征召；此工具用于巡检提示后的补漏（任务无人认领、征召曾失败）。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, childId: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `指挥官已应征 ${value.taskId}（会话 ${value.childId}），将自动 war_claim 领取作战。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      const busy = workspaceConflict(task.workspacePath, boardOf(deps).map(t => ({ taskId: t.campaignId, status: t.status, workspacePath: t.workspacePath })))
      const check = checkClaim(task, depsUnsatisfied(task.deps ?? [], statusOfFactory(deps)), busy?.taskId)
      if (!check.ok) throw new Error(check.reason)
      const result = await deps.commander.conscript(task, exec.signal)
      if (!result.spawned) throw new Error(`征召未成：${result.reason}`)
      return { taskId: args.task_id, childId: result.childId }
    },
    presentCall: args => ({ card: 'generic', title: `征召指挥官 ${args.task_id}` }),
  })

  const warComment = defineTool({
    name: 'war_comment',
    description: '元首批注：把元首对任务的指示/评语记上任务栏（参谋代笔）。进行中的任务，批示会转达指挥官。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      comment: { type: 'string', required: true, description: '批注内容。' },
      relay: { type: 'boolean', description: 'true 且任务进行中时，把批注转达给指挥官（默认 true）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, relayed: { type: 'boolean' } } },
      render: (_args, value) => [{ type: 'text', text: `批注已上栏${value.relayed === true ? '并已转达指挥官' : ''}。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const staff = requireAgent(exec)
      requireTask(deps, args.task_id)
      appendEvent(deps.stateDir, { type: 'task_commented', ts: new Date().toISOString(), campaignId: args.task_id, comment: args.comment, from: staff.id })
      let relayed: boolean | undefined
      if (args.relay !== false) {
        const task = loadCampaign(deps.stateDir, args.task_id)
        // v2.0 征召制：批注经 apiProxy 转达给当前持有该任务的指挥官会话（领取者）。
        if (task.status === 'in_progress' && task.claimedBy !== undefined) {
          relayed = await deps.commander.relayTo(task.claimedBy, `【元首批注】任务 ${args.task_id}：${args.comment}`)
        }
      }
      return { taskId: args.task_id, ...(relayed !== undefined ? { relayed } : {}) }
    },
    presentCall: args => ({ card: 'generic', title: `批注 ${args.task_id}` }),
  })

  const warCloseTask = defineTool({
    name: 'war_close_task',
    description: '收官：元首翻阅汇报后，由参谋记录判定收官任务（通过/打回/作废）。打回的任务指挥官可重新领取（需参谋重新发布说明）。收官后工作区空出，系统自动为同工作区排队的下一张悬赏征召指挥官。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      verdict: { type: 'string', required: true, description: '判定：通过收官 / 打回（附原因）/ 作废（附原因）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, status: { type: 'string', required: true }, nextTaskId: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: `任务 ${value.taskId} 已收官：${value.status === 'closed' ? '判定已记录' : ''}${value.nextTaskId !== undefined ? `；已为同工作区的 ${value.nextTaskId} 征召指挥官` : ''}。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      requireAgent(exec) // 参谋侧动词：必须在参谋会话里调
      const task = requireTask(deps, args.task_id)
      if (task.status === 'closed') throw new Error(`任务 ${args.task_id} 已收官。`)
      const nextTaskId = await closeTaskInternal(deps, args.task_id, args.verdict, exec.signal)
      return { taskId: args.task_id, status: 'closed', ...(nextTaskId !== undefined ? { nextTaskId } : {}) }
    },
    presentCall: args => ({ card: 'generic', title: `收官 ${args.task_id}` }),
  })

  const warDeployUnit = defineTool({
    name: 'war_deploy_unit',
    description: '派兵：按兵种派一支部队到任务工作区内的指定战区执行任务（后台 continuable 子代理）。硬规则：任务已领取、编制未满、有写权限部队战区不得重叠。front 写任务工作区内的相对路径。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      unit: { type: 'string', required: true, description: '兵种代号：recon / engineer / medic / scribe（或自定义兵种）。' },
      mission: { type: 'string', required: true, description: '这支部队的明确任务，一段话。' },
      front: { type: 'string', required: true, description: '战区：任务工作区内的目录前缀（如 src/api）。"." 表示整个任务工作区。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          childId: { type: 'string', required: true },
          unit: { type: 'string', required: true },
          label: { type: 'string', required: true },
          front: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.label}（${value.unit}）已出动 → 战区 ${value.front}，部队编号 ${value.childId}。战报与收队通知将自动到达。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const commander = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      const roster = deps.roster()
      const spec = findUnit(roster, args.unit)
      // Fronts live inside the task workspace; cross-task isolation is physical.
      const front = taskWorkspaceFront(task, args.front)
      const writes = spec !== undefined ? sandboxWrites(spec.sandboxMode) : false
      const check = checkDeployment(task, { unitKnown: spec !== undefined, writes, front, maxUnits: deps.maxUnits })
      if (!check.ok) throw new Error(check.reason)
      const started = await startWithToolFilter(deps, {
        label: `${spec.label}·${front}`,
        prompt: [{ type: 'text', text: troopBriefing({ label: spec.label, front, mission: args.mission, intent: taskBriefIntent(task) }) }],
        commander,
        persona: `${spec.instructions}${troopReportDiscipline()}${mailboxDiscipline(deps.flags)}${schedulerDiscipline(deps.flags)}`,
        deny: sandboxDeny(spec.sandboxMode),
        agentOptions: unitAgentOptions(spec, deps.flags),
        signal: exec.signal,
      })
      appendEvent(deps.stateDir, {
        type: 'unit_deployed', ts: new Date().toISOString(), campaignId: args.task_id,
        childId: started.childId, unitName: spec.name, label: spec.label, mission: args.mission, front, writes,
      })
      return { childId: started.childId, unit: spec.name, label: spec.label, front }
    },
    presentCall: args => ({ card: 'generic', title: `派兵：${args.unit} → ${args.front}` }),
  })

  const warOrders = defineTool({
    name: 'war_orders',
    description: '追加命令：向一支在役部队追加作战命令（增援、改令、补充要求）。已收队/撤编的部队不可追加。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      child_id: { type: 'string', required: true, description: '部队编号（war_deploy_unit 返回的 childId）。' },
      order: { type: 'string', required: true, description: '追加的命令内容。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { childId: { type: 'string', required: true }, order: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `命令已下达 ${value.childId}：${value.order.slice(0, 120)}` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const commander = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      const unit = task.units.get(args.child_id)
      if (unit === undefined) throw new Error(`任务 ${args.task_id} 中没有部队 ${args.child_id}。可用 war_status 查部队树。`)
      if (unit.recalled !== undefined) throw new Error(`${unit.label} ${args.child_id} 已撤编，无法追加命令；请重新派兵。`)
      if (unit.settled !== undefined) throw new Error(`${unit.label} ${args.child_id} 已收队，无法追加命令；如需续战请重新派兵。`)
      await deps.subagents.followup(commander, args.child_id, [{ type: 'text', text: args.order }], {
        source: { kind: 'coordinator', form: 'relay', senderSessionId: commander.id },
        signal: exec.signal,
      })
      appendEvent(deps.stateDir, { type: 'order_sent', ts: new Date().toISOString(), campaignId: args.task_id, childId: args.child_id, order: args.order })
      return { childId: args.child_id, order: args.order }
    },
    presentCall: args => ({ card: 'generic', title: `追加命令 → ${args.child_id}` }),
  })

  const warRecall = defineTool({
    name: 'war_recall',
    description: '撤退：中断并撤编一支部队。幂等：已撤编/已收队的部队直接确认。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      child_id: { type: 'string', required: true, description: '部队编号。' },
      reason: { type: 'string', description: '撤退原因（记入任务日志）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { childId: { type: 'string', required: true }, status: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `${value.childId}：${value.status}` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const commander = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      const unit = task.units.get(args.child_id)
      if (unit === undefined) throw new Error(`任务 ${args.task_id} 中没有部队 ${args.child_id}。`)
      if (unit.recalled !== undefined) return { childId: args.child_id, status: '已撤编（幂等确认）' }
      if (unit.settled !== undefined) return { childId: args.child_id, status: '已收队，无需撤退' }
      deps.subagents.interrupt(args.child_id, { kind: 'ancestor', agent: commander })
      appendEvent(deps.stateDir, { type: 'unit_recalled', ts: new Date().toISOString(), campaignId: args.task_id, childId: args.child_id, reason: args.reason ?? '' })
      // V4-R4 (troop-park): an interrupted troop KEEPS its open subtask —
      // parked with the same token, resumable by re-messaging the troop.
      // Rotation is explicit (war_troop_reassign); the 30s fuse cold-recovers
      // only when the owner is gone from the fold (recalled/settled).
      if (featureEnabled(deps.flags, 'troop-park')) {
        for (const s of loadCampaign(deps.stateDir, args.task_id).subtasks.values()) {
          if (s.status === 'in_progress' && s.claimedBy === args.child_id) {
            appendEvent(deps.stateDir, { type: 'subtask_parked', ts: new Date().toISOString(), campaignId: args.task_id, subtaskId: s.subtaskId, reason: `部队撤退：${args.reason ?? ''}` })
          }
        }
      }
      return { childId: args.child_id, status: '已撤退撤编' }
    },
    presentCall: args => ({ card: 'generic', title: `撤退 ${args.child_id}` }),
  })

  const warStatus = defineTool({
    name: 'war_status',
    description: '战况：单任务详情——任务书、部队的兵种/战区/状态（行动中/待命/已收队/已收编）与最近战报，或省略 task_id 查看全局任务栏摘要。',
    parameters: {
      task_id: { type: 'string', description: '任务 id；省略则返回任务栏摘要。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskId: { type: 'string' },
          intent: { type: 'string' },
          units: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                childId: { type: 'string', required: true },
                label: { type: 'string', required: true },
                unit: { type: 'string', required: true },
                front: { type: 'string', required: true },
                status: { type: 'string', required: true },
                lastReport: { type: 'string' },
              },
            },
          },
          counts: {
            type: 'object', additionalProperties: false,
            properties: { active: { type: 'number', required: true }, total: { type: 'number', required: true } },
          },
          board: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
          // V4-R2 (troop-mailbox): present only when the flag is ON.
          messages: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                messageId: { type: 'string', required: true },
                from: { type: 'string', required: true },
                to: { type: 'string', required: true },
                text: { type: 'string', required: true },
                delivered: { type: 'boolean' },
              },
            },
          },
          // V4-R3 (troop-scheduler): present only when the flag is ON.
          subtasks: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                subtaskId: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'string', required: true },
                claimedBy: { type: 'string' },
                deps: { type: 'array', items: { type: 'string' }, required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: value.taskId !== undefined ? `任务「${value.intent}」（${value.taskId}）\n${value.units.map(u => `- ${u.label} ${u.childId} [${u.status}] 战区 ${u.front}${u.lastReport !== undefined ? ` · 最近战报：${u.lastReport.slice(0, 100)}` : ''}`).join('\n')}\n在役 ${value.counts.active}/${value.counts.total}。` : `任务栏：\n${value.board.map(t => `- ${String(t.status)} ${String(t.taskId)} ${String(t.title)}`).join('\n')}` },
      ],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const id = args.task_id
      if (id === undefined || id === '') {
        return { units: [], counts: { active: 0, total: 0 }, board: boardOf(deps).map(taskSummary) }
      }
      const task = requireTask(deps, id)
      let activity = new Map<string, string | undefined>()
      const root = task.hqSessionId ?? task.claimedBy ?? exec.agent?.id
      if (root !== undefined) {
        try {
          for (const entry of await deps.subagents.listDescendants(root, exec.signal)) {
            activity.set(entry.id, entry.activity)
          }
        } catch {
          // Best-effort listing; folded state still renders.
        }
      }
      const units = [...task.units.values()].map(u => ({
        childId: u.childId,
        label: u.label,
        unit: u.unitName,
        front: u.front,
        status: unitStatusLabel(u, activity.get(u.childId)),
        ...(u.lastReport !== undefined ? { lastReport: u.lastReport } : {}),
      }))
      return {
        taskId: task.campaignId,
        intent: task.title ?? task.intent,
        units,
        counts: { active: [...task.units.values()].filter(isActiveUnit).length, total: task.units.size },
        board: [],
        // V4-R2: recent direct messages ride war_status only under the flag —
        // OFF keeps the output shape byte-identical to v3.
        ...(featureEnabled(deps.flags, 'troop-mailbox')
          ? { messages: task.messages.slice(-5).map(m => ({
              messageId: m.messageId, from: m.from, to: m.to, text: m.text.slice(0, 200),
              ...(m.delivered !== undefined ? { delivered: m.delivered } : {}),
            })) }
          : {}),
        // V4-R3: the intra-task subtask graph rides war_status under its flag.
        ...(featureEnabled(deps.flags, 'troop-scheduler')
          ? { subtasks: [...task.subtasks.values()].map(s => ({
              subtaskId: s.subtaskId, title: s.title, status: s.status,
              ...(s.claimedBy !== undefined ? { claimedBy: s.claimedBy } : {}),
              deps: [...s.deps],
            })) }
          : {}),
      }
    },
    presentCall: () => ({ card: 'generic', title: '战况查询' }),
  })

  const warLogReport = defineTool({
    name: 'war_log_report',
    description: '战报登记：指挥官消化部队回报后，把摘要写入任务日志（供任务栏与复盘）。只写摘要。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      child_id: { type: 'string', required: true, description: '回报部队的编号。' },
      summary: { type: 'string', required: true, description: '战报摘要：结论/改动文件/风险。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { logged: { type: 'boolean', required: true } } },
      render: () => [{ type: 'text', text: commanderReportHint() }],
    },
    async execute(args) {
      const task = requireTask(deps, args.task_id)
      if (!task.units.has(args.child_id)) throw new Error(`任务 ${args.task_id} 中没有部队 ${args.child_id}。`)
      appendEvent(deps.stateDir, { type: 'report_received', ts: new Date().toISOString(), campaignId: args.task_id, childId: args.child_id, summary: args.summary })
      return { logged: true }
    },
    presentCall: args => ({ card: 'generic', title: `战报登记 ← ${args.child_id}` }),
  })

  // V4-R2 (troop-mailbox): the sanctioned direct-message channel. The host's
  // own send_message stays denied for troops in BOTH flag states — war_message
  // is the only path, so every word lands in the campaign ledger first.
  const warMessage = defineTool({
    name: 'war_message',
    description: '战地直讯（troop-mailbox）：参战方互发消息。指挥官→部队即时唤起（新回合直达）；部队→部队经指挥官通道即时唤起；部队→指挥官入账待阅（指挥官用 war_status 查看 messages）。消息先进战役账本再投递，投递失败不丢信（待重试/指挥官转发）。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      to: { type: 'string', required: true, description: '收信方：部队编号 childId、兵种名（须唯一）或 "commander"。' },
      text: { type: 'string', required: true, description: '消息正文，一段话（≤2000 字）。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          messageId: { type: 'string', required: true },
          to: { type: 'string', required: true },
          delivered: { type: 'boolean', required: true },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.delivered ? `直讯已送达 ${value.to}（${value.messageId}）。` : `直讯已入账待投递 → ${value.to}（${value.messageId}）${value.note !== undefined ? `：${value.note}` : ''}` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const caller = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      const text = args.text.trim()
      if (text === '') throw new Error('直讯内容为空。')
      if (text.length > 2000) throw new Error('直讯太长（>2000 字）：拆成多条发送。')
      const commanderSession = task.claimedBy
      const callerIsCommander = commanderSession !== undefined && caller.id === commanderSession
      const callerIsTroop = task.units.has(caller.id)
      if (!callerIsCommander && !callerIsTroop) throw new Error('只有本任务参战方（指挥官或在役部队）能发战地直讯。')
      // Addressing: commander | exact childId | unique unit name.
      let target: 'commander' | { childId: string }
      if (args.to === 'commander') {
        target = 'commander'
      } else if (task.units.has(args.to)) {
        target = { childId: args.to }
      } else {
        const byName = [...task.units.values()].filter(u => u.unitName === args.to)
        if (byName.length === 1) target = { childId: byName[0]!.childId }
        else if (byName.length > 1) throw new Error(`兵种 ${args.to} 有 ${byName.length} 支在役部队，请用 war_deploy_unit 返回的 childId 点名。`)
        else throw new Error(`收信方不存在：${args.to}（用 childId、唯一兵种名或 "commander"）。`)
      }
      const messageId = `msg-${randomUUID().slice(0, 8)}`
      const toId = typeof target === 'string' ? target : target.childId
      appendEvent(deps.stateDir, { type: 'message_logged', ts: new Date().toISOString(), campaignId: args.task_id, messageId, from: caller.id, to: toId, text })
      // Durable-first delivery: a troop target gets a fresh turn via followup
      // (parent = the commander: the caller itself, or registry-resolved when
      // a troop sends). The commander target has no push path from a child —
      // the message waits in war_status's 待阅 queue.
      if (typeof target !== 'string') {
        const parent = callerIsCommander ? caller : (commanderSession !== undefined ? deps.resolveAgent?.(commanderSession) : undefined)
        if (parent !== undefined) {
          try {
            await deps.subagents.followup(parent, target.childId, [{ type: 'text', text: `【战地直讯】${text}` }], {
              source: { kind: 'coordinator', form: 'relay', senderSessionId: caller.id },
              signal: exec.signal,
            })
            appendEvent(deps.stateDir, { type: 'message_delivered', ts: new Date().toISOString(), campaignId: args.task_id, messageId })
            return { messageId, to: toId, delivered: true }
          } catch {
            // Delivery failed — the message stays durable-pending, retriable.
          }
        }
        return { messageId, to: toId, delivered: false, note: parent === undefined ? '指挥官活体未解析（agents 注册表未接入），信已入账；稍后重试或由指挥官 war_message 转发' : '投递暂未成功，信已入账，不丢' }
      }
      return { messageId, to: 'commander', delivered: false, note: '指挥官收信走 war_status 待阅队列（子会话无父向推信通道）' }
    },
    presentCall: args => ({ card: 'generic', title: `直讯 → ${args.to}` }),
  })

  const warTriage = defineTool({
    name: 'war_triage',
    description: 'V5 分诊（flag staff-triage）：参谋接令第一轮报档位。L0=简单轻任务书直发（无需元首批准）；L1=复杂，呈任务书经元首批准后发布；L2=不明确，先提问卡片澄清。元首文本标记（!!直接做/??先看方案）强制改档，以改后为准。每命令只分诊一次，升降档由元首走命令卡。',
    parameters: {
      command_id: { type: 'string', required: true, description: '命令 id（cmd- 开头，命令区卡片编号）。' },
      grade: { type: 'string', required: true, description: '参谋建议档位：L0 | L1 | L2。' },
      reason: { type: 'string', required: true, description: '分诊理由（一句话，写给元首看的人话）。' },
      confidence: { type: 'number', description: '置信度 0-1（默认 0.5）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { commandId: { type: 'string', required: true }, grade: { type: 'string', required: true }, suggested: { type: 'string', required: true }, override: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: `命令 ${value.commandId} 分诊入账：生效档位 ${value.grade}${value.suggested !== value.grade ? `（元首标记强制改档，参谋原建议 ${value.suggested}）` : ''}。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const staff = requireAgent(exec) // 参谋侧动词
      const directive = loadDirectives(deps.stateDir).find(d => d.id === args.command_id)
      if (directive === undefined) throw new Error(`命令 ${args.command_id} 不存在。请核对命令区编号。`)
      if (directive.status === 'approved' || directive.status === 'cancelled') throw new Error(`命令 ${args.command_id} 已${directive.status === 'approved' ? '批准出任务' : '取消'}，无需分诊。`)
      if (directive.grade !== undefined) throw new Error(`命令 ${args.command_id} 已分诊为 ${directive.grade}（理由：${directive.gradeReason ?? ''}）。升降档由元首在命令卡上操作。`)
      const suggested = (['L0', 'L1', 'L2'] as const).includes(args.grade as DirectiveGrade) ? args.grade as DirectiveGrade : 'L1'
      // 元首覆写标记优先（host 侧强制，不信任模型自觉）——被改档时建议与生效都入账。
      const marker = overrideMarkerOf(directive.text)
      const effective = marker?.grade ?? suggested
      const confidence = typeof args.confidence === 'number' && args.confidence >= 0 && args.confidence <= 1 ? args.confidence : 0.5
      appendDirectiveEvent(deps.stateDir, {
        type: 'directive_triaged', ts: new Date().toISOString(), directiveId: directive.id,
        grade: effective, reason: args.reason,
        ...(confidence !== 0.5 ? { confidence } : {}),
        ...(marker !== undefined && marker.grade !== suggested ? { suggested, override: marker.marker } : {}),
      })
      // V5-R3（flag staff-goal）：L2 澄清期开参谋状态机 goal——create 后立即
      // disarm（红线：参谋 goal 永远 disarm，round driver 不驱动参谋）。
      if (featureEnabled(deps.flags, 'staff-goal') && effective === 'L2') {
        const goalId = await openDisarmedGoalForDirective(deps.goals?.(), staff, directive.id)
        if (goalId !== undefined) {
          appendDirectiveEvent(deps.stateDir, { type: 'directive_goal_opened', ts: new Date().toISOString(), directiveId: directive.id, goalId, disarmed: true })
        }
      }
      return {
        commandId: directive.id, grade: effective, suggested,
        ...(marker !== undefined && marker.grade !== suggested ? { override: marker.marker } : {}),
      }
    },
    presentCall: args => ({ card: 'generic', title: `分诊 ${args.command_id} → ${args.grade}` }),
  })

  const warPlan = defineTool({
    name: 'war_plan',
    description: 'V5 计划呈批（flag staff-plan）：L1/L2 档位参谋勘察后呈计划草案，元首在命令卡上批准/驳回；批准前 war_publish 会被硬门拦下。驳回后修订重呈即回到待批（多轮收敛）。',
    parameters: {
      command_id: { type: 'string', required: true, description: '命令 id（cmd- 开头）。' },
      plan: { type: 'string', required: true, description: '计划正文：目标、步骤（≤5 步）、涉及工作区、风险与回退。写给元首审的一页纸。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { commandId: { type: 'string', required: true }, planStatus: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `计划已呈报（${value.commandId}，${value.planStatus}）——元首在命令卡上批准后才能发布任务。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      requireAgent(exec) // 参谋侧动词
      const directive = loadDirectives(deps.stateDir).find(d => d.id === args.command_id)
      if (directive === undefined) throw new Error(`命令 ${args.command_id} 不存在。请核对命令区编号。`)
      if (directive.status === 'approved' || directive.status === 'cancelled') throw new Error(`命令 ${args.command_id} 已${directive.status === 'approved' ? '批准出任务' : '取消'}，无需再呈计划。`)
      const plan = typeof args.plan === 'string' ? args.plan.trim() : ''
      if (plan.length < 10) throw new Error('计划太短（≥10 字）：目标、步骤、工作区、风险四要素至少各一句。')
      appendDirectiveEvent(deps.stateDir, { type: 'directive_plan_opened', ts: new Date().toISOString(), directiveId: directive.id, plan })
      return { commandId: directive.id, planStatus: 'pending' }
    },
    presentCall: args => ({ card: 'generic', title: `呈计划 ${args.command_id}` }),
  })

  // V6 命令拆解（flag staff-decompose）：大命令 → 结构化子任务链。呈批复用
  // 计划态（decomposed 存机器可读子任务书 + plan_opened 存人读计划稿），
  // 批准走既有决策路由——元首侧零新增 UI。
  const warDecompose = defineTool({
    name: 'war_decompose',
    description: 'V6 命令拆解呈批（flag staff-decompose）：一步做不完的大命令拆成 ≥2 个顺序子任务。呈一页纸总计划 + 子任务书列表（逐个过发布 lint），元首在命令卡上批准后用 war_publish_chain 成链发布。',
    parameters: {
      command_id: { type: 'string', required: true, description: '命令 id（cmd- 开头）。' },
      plan: { type: 'string', required: true, description: '总计划正文：目标、步骤、涉及工作区、风险与回退（写给元首审的一页纸）。' },
      tasks: {
        type: 'array', required: true, description: '子任务书列表（≥2 个，顺序执行）：每项 { title, brief, acceptance }——逐个过发布 lint，验收必须可判定。',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string', description: '子任务标题（一句话）。' },
            brief: { type: 'string', description: '子任务书正文（背景、执行指引、边界）。' },
            acceptance: { type: 'string', description: '验收标准（可判定的完成定义）。' },
          },
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { commandId: { type: 'string', required: true }, chainLength: { type: 'number', required: true }, planStatus: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `拆解已呈报（${value.commandId}，${value.chainLength} 个顺序子任务，${value.planStatus}）——元首在命令卡上批准后用 war_publish_chain 成链发布。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      requireAgent(exec) // 参谋侧动词
      const directive = loadDirectives(deps.stateDir).find(d => d.id === args.command_id)
      if (directive === undefined) throw new Error(`命令 ${args.command_id} 不存在。请核对命令区编号。`)
      if (directive.status === 'approved' || directive.status === 'cancelled') throw new Error(`命令 ${args.command_id} 已${directive.status === 'approved' ? '批准出任务' : '取消'}，无需再呈拆解。`)
      const plan = typeof args.plan === 'string' ? args.plan.trim() : ''
      if (plan.length < 10) throw new Error('总计划太短（≥10 字）：目标、步骤、工作区、风险四要素至少各一句。')
      const specs: Array<{ title: string; brief: string; acceptance: string }> = []
      if (Array.isArray(args.tasks)) {
        for (const raw of args.tasks) {
          const t = raw as { title?: unknown; brief?: unknown; acceptance?: unknown }
          specs.push({ title: typeof t.title === 'string' ? t.title : '', brief: typeof t.brief === 'string' ? t.brief : '', acceptance: typeof t.acceptance === 'string' ? t.acceptance : '' })
        }
      }
      if (specs.length < 2) throw new Error('拆解至少 2 个子任务——一步能做完的不必拆（直接走 war_plan/war_publish）。')
      // 子任务书逐个过发布 lint——链上最弱的一环也要可判定，系统拦不靠自觉。
      specs.forEach((s, i) => {
        const lint = lintPublish(s)
        if (!lint.ok) throw new Error(`子任务 ${i + 1} 不过 lint：${lint.reason}`)
      })
      appendDirectiveEvent(deps.stateDir, { type: 'directive_decomposed', ts: new Date().toISOString(), directiveId: directive.id, plan, tasks: specs })
      // 计划稿带拆解概要（元首在既有计划卡上看到链全貌），批准走既有决策路由。
      const outline = specs.map((s, i) => `${i + 1}. ${s.title} —— 验收：${s.acceptance.split('\n')[0]}`).join('\n')
      appendDirectiveEvent(deps.stateDir, { type: 'directive_plan_opened', ts: new Date().toISOString(), directiveId: directive.id, plan: `${plan}\n\n【拆解 · ${specs.length} 个顺序子任务，同工作区接力】\n${outline}` })
      return { commandId: directive.id, chainLength: specs.length, planStatus: 'pending' }
    },
    presentCall: args => ({ card: 'generic', title: `呈拆解 ${args.command_id}` }),
  })

  // V6 成链发布（flag staff-decompose）：按已批拆解逐个落任务——顺序 deps 链
  // （task i 依赖 task i-1）+ 链级同一工作区（收官接力自动续链）；命令卡链接
  // 链头任务。硬门：拆解在场 + 计划已批，缺一即拒。
  const warPublishChain = defineTool({
    name: 'war_publish_chain',
    description: 'V6 成链发布（flag staff-decompose）：把元首已批准的拆解落成顺序任务链（子任务逐个 deps 前驱、共用同一工作区，链头收官即接力解锁下一个）。前置：war_decompose 呈批 + 元首在命令卡上批准。',
    parameters: {
      command_id: { type: 'string', required: true, description: '命令 id（cmd- 开头）。' },
      workspace: { type: 'string', description: '链级工作区（整条链共用一片地顺序推进）：现有工作区绝对路径 / "@new:<名字>" 新副本；省略则自动建隔离目录。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          commandId: { type: 'string', required: true },
          headTaskId: { type: 'string', required: true },
          taskIds: { type: 'array', required: true, items: { type: 'string' } },
          workspacePath: { type: 'string', required: true },
          workspaceKind: { type: 'string', required: true },
          conscripted: { type: 'boolean', required: true },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `任务链已上栏：${value.taskIds.join(' → ')}（共 ${value.taskIds.length} 环，链头 ${value.headTaskId}）· 工作区 ${value.workspacePath}（${value.workspaceKind}）——链头收官自动解锁下一环。${value.conscripted ? '指挥官已应征到任' : '暂未征召，巡检保险丝会补'}。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const staff = requireAgent(exec)
      const directive = loadDirectives(deps.stateDir).find(d => d.id === args.command_id)
      if (directive === undefined) throw new Error(`命令 ${args.command_id} 不存在。请核对命令区编号。`)
      if (directive.status === 'approved') throw new Error(`命令 ${args.command_id} 已批准过任务 ${directive.taskId}，不要重复发布。`)
      if (directive.status === 'cancelled') throw new Error(`命令 ${args.command_id} 已取消，不能再发布任务。`)
      if (directive.decomposition === undefined) throw new Error(`命令 ${args.command_id} 无拆解方案——先 war_decompose 呈拆解，元首批准后才能成链发布。`)
      if (directive.plan?.status !== 'approved') throw new Error(`命令 ${args.command_id} 的拆解计划${directive.plan === undefined ? '未呈报' : directive.plan.status === 'pending' ? '待元首批准（命令卡上批）' : '被驳回（修订重呈）'}——批准后才能成链发布。`)
      const specs = directive.decomposition.tasks
      // 发布点接力（staff-goal 旗）：参谋状态机 goal 随成链发布结算——与 war_publish 同构。
      if (featureEnabled(deps.flags, 'staff-goal')) {
        const face = deps.goals?.()
        if (face !== undefined && directive.staffSessionId !== undefined) {
          const staffAgent = deps.resolveAgent?.(directive.staffSessionId)
          if (staffAgent !== undefined) {
            const goalId = await settleGoalMentioning(face, staffAgent, directive.id)
            if (goalId !== undefined) appendDirectiveEvent(deps.stateDir, { type: 'directive_goal_settled', ts: new Date().toISOString(), directiveId: directive.id, goalId })
          }
        }
      }
      // 链级工作区：整条链一片地（bound > instance > 自动隔离），链头名分。
      const ids = specs.map(() => newCampaignId())
      const binding = parseWorkspaceArg(args.workspace)
      let ws: { path: string; kind: 'worktree' | 'dir'; note?: string }
      if (binding.kind === 'instance') {
        ws = deps.workspace.materializeInstance(deps.warRoot, ids[0]!, binding.slug)
      } else if (binding.kind === 'bound') {
        const abs = resolve(binding.path)
        if (!existsSync(abs)) throw new Error(`工作区不存在：${abs}。请与元首核对路径，或改用 @new:<名字> 新开副本。`)
        ws = { path: abs, kind: 'dir', note: '绑定既有工作区（链内同区顺序接力）' }
      } else {
        ws = deps.workspace.materialize(deps.warRoot, ids[0]!, '')
      }
      // 逐环落任务：task i deps [task i-1]（顺序链），全部共用链级工作区。
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i]!
        appendEvent(deps.stateDir, {
          type: 'task_created', ts: new Date().toISOString(), campaignId: ids[i]!, title: spec.title, brief: spec.brief, acceptance: spec.acceptance, priority: 'normal', publishedBy: staff.id,
          ...(i > 0 ? { deps: [ids[i - 1]!] } : {}),
        })
        appendEvent(deps.stateDir, { type: 'task_published', ts: new Date().toISOString(), campaignId: ids[i]!, workspacePath: ws.path, publishedBy: staff.id })
      }
      // 命令卡链接链头（approved）；链尾收官即整条命令完成。
      appendDirectiveEvent(deps.stateDir, { type: 'directive_approved', ts: new Date().toISOString(), directiveId: directive.id, taskId: ids[0]! })
      const war = deps.store.get()
      if (!war.active) {
        war.active = true
        deps.store.save()
      }
      // 只为链头征召——后续环由收官接力（同区）自动续链。
      let conscripted = false
      try {
        const fresh = loadCampaign(deps.stateDir, ids[0]!)
        const result = await deps.commander.conscript(fresh, exec.signal)
        conscripted = result.spawned
      } catch {
        conscripted = false
      }
      return { commandId: directive.id, headTaskId: ids[0]!, taskIds: ids, workspacePath: ws.path, workspaceKind: ws.kind, conscripted, ...(ws.note !== undefined ? { note: ws.note } : {}) }
    },
    presentCall: args => ({ card: 'generic', title: `成链发布 ${args.command_id}` }),
  })

  const warSetGoal = defineTool({
    name: 'war_set_goal',
    description: 'V5 goal 代管（flag staff-goal）：参谋为在役指挥官的当前任务换发 armed goal（插件中介——只许指向 in_progress 任务，objective 强制绑定任务 id，防串台）。常规流程无需手动调（war_claim 自动武装）。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id（须为 in_progress）。' },
      objective_extra: { type: 'string', description: '附加目标说明（一句话，拼进 objective）。' },
      max_goal_rounds: { type: 'number', description: '轮次上限（默认 30）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, goalId: { type: 'string', required: true }, disarmed: { type: 'boolean' } } },
      render: (_args, value) => [{ type: 'text', text: `任务 ${value.taskId} 的指挥官 goal 已换发（${value.goalId}）。` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      requireAgent(exec) // 参谋侧动词
      const task = requireTask(deps, args.task_id)
      if (task.status !== 'in_progress') throw new Error(`任务 ${args.task_id} 状态为 ${task.status}，只有进行中任务可换发 goal。`)
      if (task.claimedBy === undefined) throw new Error(`任务 ${args.task_id} 无在役指挥官（未被领取）。`)
      const face = deps.goals?.()
      if (face === undefined) throw new Error('goal 服务不可用（宿主面未注入）——换发降级为不可用，作战不受影响。')
      const agent = deps.resolveAgent?.(task.claimedBy)
      if (agent === undefined) throw new Error(`指挥官会话 ${task.claimedBy} 无活体 agent（可能已离线）——请稍后重试。`)
      const extra = typeof args.objective_extra === 'string' && args.objective_extra.trim() !== '' ? `；附加：${args.objective_extra.trim()}` : ''
      const armed = await armGoalForTask(face, agent, args.task_id, { maxGoalRounds: typeof args.max_goal_rounds === 'number' && args.max_goal_rounds > 0 ? args.max_goal_rounds : 30, title: `${task.title ?? task.intent}${extra}` })
      if (armed === undefined) throw new Error('goal 服务调用失败（武装未成）——任务作战不受影响，可稍后重试。')
      appendEvent(deps.stateDir, {
        type: 'commander_goal_armed', ts: new Date().toISOString(), campaignId: args.task_id,
        goalId: armed.goalId, sessionId: task.claimedBy, ...(armed.healed !== undefined ? { healedGoalId: armed.healed } : {}),
      })
      return { taskId: args.task_id, goalId: armed.goalId, disarmed: false }
    },
    presentCall: args => ({ card: 'generic', title: `换发 goal ${args.task_id}` }),
  })

  const tools: ReturnType<typeof defineTool>[] = [warPublish, warBoard, warClaim, warSubmit, warFail, warAbandonCommand, warConscript, warComment, warCloseTask, warDeployUnit, warOrders, warRecall, warStatus, warLogReport]
  let surface = tools
  if (featureEnabled(deps.flags, 'troop-mailbox')) surface = [...surface, warMessage]
  if (featureEnabled(deps.flags, 'troop-scheduler')) surface = [...surface, ...warTroopTools(deps)]
  if (featureEnabled(deps.flags, 'troop-park')) surface = [...surface, warTroopReassignTool(deps)]
  // V5-R2: 参谋分诊动词（staff-triage）。
  if (featureEnabled(deps.flags, 'staff-triage')) surface = [...surface, warTriage]
  // V5-R3: 计划呈批动词（staff-plan）+ goal 代管动词（staff-goal）。
  if (featureEnabled(deps.flags, 'staff-plan')) surface = [...surface, warPlan]
  if (featureEnabled(deps.flags, 'staff-goal')) surface = [...surface, warSetGoal]
  // V6 命令拆解（staff-decompose）：拆解呈批 + 成链发布。
  if (featureEnabled(deps.flags, 'staff-decompose')) surface = [...surface, warDecompose, warPublishChain]
  return surface
}

/** V4-R3: subtasks whose deps are all completed (the claimable pool). */
function readySubtasks(task: CampaignState): SubtaskRecord[] {
  return [...task.subtasks.values()].filter(s =>
    s.status === 'open' && s.deps.every(d => task.subtasks.get(d)?.status === 'completed'))
}

/** V4-R3: is this caller a participant (commander or deployed troop) of the task? */
export function isParticipant(task: CampaignState, callerId: string): boolean {
  return (task.claimedBy !== undefined && task.claimedBy === callerId) || task.units.has(callerId)
}

/**
 * V4-R3 scheduler kick: pair IDLE troops with READY subtasks — one atomic
 * claim each (fresh state read per pairing), then wake the troop with a
 * 【队内调度】 turn. A failed wake self-heals: the claim is rolled back to
 * the open pool via a `blocked` event (账本无回滚，只有对冲事件).
 * Returns how many subtasks were dispatched. Flag OFF → 0 (no-op).
 * Called from the troop tools (mutation kick) and the 30s fuse in index.ts.
 */
export async function kickIdleTroops(deps: WarToolsDeps, campaignId: string, signal?: AbortSignal, parentOverride?: unknown, exclude?: string): Promise<number> {
  if (!featureEnabled(deps.flags, 'troop-scheduler')) return 0
  const task = loadCampaign(deps.stateDir, campaignId)
  const commanderSession = task.claimedBy
  if (commanderSession === undefined) return 0
  const parent = parentOverride ?? deps.resolveAgent?.(commanderSession)
  if (parent === undefined) return 0
  let descendants: DescendantFace[] = []
  try {
    descendants = await deps.subagents.listDescendants(commanderSession, signal)
  } catch {
    return 0
  }
  let dispatched = 0
  // V4-R4 cold recovery (fold-authoritative, no registry flakiness): an
  // in_progress subtask whose owner unit is recalled/settled can never be
  // updated again — return it to the pool; the pairing loop below re-reads
  // fresh state and redispatches it to a live troop.
  if (featureEnabled(deps.flags, 'troop-park')) {
    for (const s of task.subtasks.values()) {
      if (s.status !== 'in_progress' || s.claimedBy === undefined || s.attempt === undefined) continue
      const owner = task.units.get(s.claimedBy)
      if (owner === undefined || (owner.recalled === undefined && owner.settled === undefined)) continue
      appendEvent(deps.stateDir, { type: 'subtask_updated', ts: new Date().toISOString(), campaignId, subtaskId: s.subtaskId, attemptId: s.attempt.id, status: 'blocked', note: `冷恢复：owner ${s.claimedBy} 已撤编/收队，回池转派` })
    }
  }
  for (const d of descendants) {
    if (d.activity === 'running') continue
    if (exclude !== undefined && d.id === exclude) continue
    if (!task.units.has(d.id)) continue
    const fresh = loadCampaign(deps.stateDir, campaignId)
    // One open subtask per owner — a troop mid-subtask is not idle-for-work.
    if ([...fresh.subtasks.values()].some(s => s.status === 'in_progress' && s.claimedBy === d.id)) continue
    const ready = readySubtasks(fresh)[0]
    if (ready === undefined) break
    const attempt = ready.attempts + 1
    const attemptId = `st-${randomUUID().slice(0, 8)}-${attempt}`
    appendEvent(deps.stateDir, { type: 'subtask_claimed', ts: new Date().toISOString(), campaignId, subtaskId: ready.subtaskId, claimedBy: d.id, attemptId, attempt })
    const brief = [
      `【队内调度】你已自动认领队内子任务 ${ready.subtaskId}「${ready.title}」${ready.detail !== undefined ? `：${ready.detail}` : ''}`,
      `直接开工（战区边界照旧）；完成或受阻用 war_troop_update 回报（subtask_id=${ready.subtaskId}，attempt_id=${attemptId}，status=completed/blocked）。`,
      '陈旧令牌报错 = 所有权已变，停止该子任务。',
    ].join('\n')
    try {
      await deps.subagents.followup(parent, d.id, [{ type: 'text', text: brief }], {
        source: { kind: 'coordinator', form: 'relay', senderSessionId: commanderSession },
        ...(signal !== undefined ? { signal } : {}),
      })
      dispatched += 1
    } catch {
      // Wake failed: return the subtask to the pool so another troop can take it.
      appendEvent(deps.stateDir, { type: 'subtask_updated', ts: new Date().toISOString(), campaignId, subtaskId: ready.subtaskId, attemptId, status: 'blocked', note: '自动唤起失败，回池待领' })
    }
  }
  return dispatched
}

/** V4-R3 tool family, closed over the shared deps (troop-scheduler flag). */
function warTroopTools(deps: WarToolsDeps) {
const warTroopTask = defineTool({
  name: 'war_troop_task',
  description: '（troop-scheduler）队内拆题：指挥官把当前任务拆成带依赖的子任务（st- 编号）。创建即尝试调度——闲置且无在役子任务的部队会被自动认领并唤起。deps 填其他子任务 id，前置完成后才可被认领。',
  parameters: {
    task_id: { type: 'string', required: true, description: '任务 id。' },
    title: { type: 'string', required: true, description: '子任务一句话标题。' },
    detail: { type: 'string', description: '执行细节（可选）：边界、产出要求。' },
    deps: { type: 'array', items: { type: 'string' }, description: '前置子任务 id 列表（可选）。' },
  },
  output: {
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        subtaskId: { type: 'string', required: true },
        dispatched: { type: 'number', required: true },
        note: { type: 'string' },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `子任务 ${v.subtaskId} 已立案。${v.dispatched > 0 ? `已自动派发 ${v.dispatched} 支闲置部队。` : '暂无闲置部队可派——子任务在池，部队可 war_troop_claim 自领。'}` }],
  },
  async execute(args, rawExec) {
    const exec = rawExec as unknown as WarToolExec
    const caller = requireAgent(exec)
    const task = requireTask(deps, args.task_id)
    if (task.claimedBy === undefined || caller.id !== task.claimedBy) throw new Error('只有本任务指挥官可拆队内子任务。')
    const depIds = (args.deps ?? []).map(String)
    for (const d of depIds) {
      if (!task.subtasks.has(d)) throw new Error(`前置子任务 ${d} 不存在（用 war_troop_task 返回的 st- 编号）。`)
    }
    const subtaskId = `st-${randomUUID().slice(0, 8)}`
    appendEvent(deps.stateDir, { type: 'subtask_created', ts: new Date().toISOString(), campaignId: args.task_id, subtaskId, title: args.title, ...(args.detail !== undefined ? { detail: args.detail } : {}), deps: depIds })
    const dispatched = await kickIdleTroops(deps, args.task_id, exec.signal, caller)
    return { subtaskId, dispatched }
  },
  presentCall: args => ({ card: 'generic', title: `队内拆题：${args.title}` }),
})

const warTroopClaim = defineTool({
  name: 'war_troop_claim',
  description: '（troop-scheduler）自主认领：参战方认领一个 open 且前置已完成的队内子任务，领取 attempt 令牌。一次只持有一个在役子任务。',
  parameters: {
    task_id: { type: 'string', required: true, description: '任务 id。' },
    subtask_id: { type: 'string', required: true, description: '子任务 id（st- 开头）。' },
  },
  output: {
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        subtaskId: { type: 'string', required: true },
        attemptId: { type: 'string', required: true },
        attempt: { type: 'number', required: true },
        title: { type: 'string', required: true },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `已认领子任务「${v.title}」（${v.subtaskId}，第 ${v.attempt} 次尝试，令牌 ${v.attemptId}）。开工吧。` }],
  },
  async execute(args, rawExec) {
    const exec = rawExec as unknown as WarToolExec
    const caller = requireAgent(exec)
    const task = requireTask(deps, args.task_id)
    if (!isParticipant(task, caller.id)) throw new Error('只有本任务参战方（指挥官或在役部队）可认领队内子任务。')
    const s = task.subtasks.get(args.subtask_id)
    if (s === undefined) throw new Error(`子任务 ${args.subtask_id} 不存在。`)
    if (s.status !== 'open') throw new Error(`子任务 ${args.subtask_id} 当前 ${s.status === 'in_progress' ? '已被认领（在役）' : '已完成'}，不可认领。`)
    const missing = s.deps.filter(d => task.subtasks.get(d)?.status !== 'completed')
    if (missing.length > 0) throw new Error(`前置未完成：${missing.join('、')}。等它们 completed 后再认领。`)
    if ([...task.subtasks.values()].some(x => x.status === 'in_progress' && x.claimedBy === caller.id)) throw new Error('你已有一个在役子任务——先 war_troop_update 收尾（completed/blocked）再领下一个。')
    const attempt = s.attempts + 1
    const attemptId = `st-${randomUUID().slice(0, 8)}-${attempt}`
    appendEvent(deps.stateDir, { type: 'subtask_claimed', ts: new Date().toISOString(), campaignId: args.task_id, subtaskId: args.subtask_id, claimedBy: caller.id, attemptId, attempt })
    return { subtaskId: args.subtask_id, attemptId, attempt, title: s.title }
  },
  presentCall: args => ({ card: 'generic', title: `认领子任务 ${args.subtask_id}` }),
})

const warTroopUpdate = defineTool({
  name: 'war_troop_update',
  description: '（troop-scheduler）子任务回报：持有人用当前 attempt 令牌更新状态。completed=完成；blocked=受阻回池（写明原因，其他部队可接手）；in_progress=进展备注。陈旧令牌 = 所有权已变，停止操作。',
  parameters: {
    task_id: { type: 'string', required: true, description: '任务 id。' },
    subtask_id: { type: 'string', required: true, description: '子任务 id。' },
    attempt_id: { type: 'string', required: true, description: '认领时领取的令牌。' },
    status: { type: 'string', required: true, description: 'completed | blocked | in_progress。' },
    note: { type: 'string', description: '结论/产出/受阻原因（可选）。' },
  },
  output: {
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        subtaskId: { type: 'string', required: true },
        status: { type: 'string', required: true },
        dispatched: { type: 'number', required: true },
      },
    },
    render: (_a, v) => [{ type: 'text', text: `子任务 ${v.subtaskId} → ${v.status}。${v.dispatched > 0 ? `调度器已续派 ${v.dispatched} 支部队。` : ''}` }],
  },
  async execute(args, rawExec) {
    const exec = rawExec as unknown as WarToolExec
    const caller = requireAgent(exec)
    const task = requireTask(deps, args.task_id)
    if (!isParticipant(task, caller.id)) throw new Error('只有本任务参战方可更新队内子任务。')
    if (args.status !== 'completed' && args.status !== 'blocked' && args.status !== 'in_progress') throw new Error('status 只能是 completed | blocked | in_progress。')
    const s = task.subtasks.get(args.subtask_id)
    if (s === undefined) throw new Error(`子任务 ${args.subtask_id} 不存在。`)
    if (s.attempt === undefined || s.attempt.id !== args.attempt_id) throw new Error('令牌陈旧：该子任务所有权已变（可能已回池被他方认领）。停止操作，等新指令或重新 war_troop_claim。')
    if (s.claimedBy !== caller.id) throw new Error('只有当前持有人可更新该子任务。')
    appendEvent(deps.stateDir, { type: 'subtask_updated', ts: new Date().toISOString(), campaignId: args.task_id, subtaskId: args.subtask_id, attemptId: args.attempt_id, status: args.status, ...(args.note !== undefined ? { note: args.note } : {}) })
    // Mutation kick: a completion may unlock dependents; a blocked return
    // reopens pool work — either way idle troops get their next unit. The
    // blocker is excluded so it cannot immediately re-receive what it gave
    // up (single-troop livelock guard); other idle troops may take it.
    const dispatched = args.status === 'in_progress'
      ? 0
      : await kickIdleTroops(deps, args.task_id, exec.signal, undefined, args.status === 'blocked' ? caller.id : undefined)
    return { subtaskId: args.subtask_id, status: args.status, dispatched }
  },
  presentCall: args => ({ card: 'generic', title: `子任务回报 ${args.subtask_id} → ${args.status}` }),
})
return [warTroopTask, warTroopClaim, warTroopUpdate]
}

/** V4-R4 (troop-park): explicit rotation — the commander revokes the open
 * attempt (park ≠ revoke; THIS is the revoke), returns the subtask to the
 * pool and kicks, excluding the old owner. A stale-token update from the old
 * owner is then rejected by the token gate. */
function warTroopReassignTool(deps: WarToolsDeps) {
  return defineTool({
    name: 'war_troop_reassign',
    description: '（troop-park）显式换手：指挥官吊销某在役子任务的当前令牌（含 parked 状态），回池并立即转派——kick 排除原主。原主持旧令牌的更新将被陈旧拒绝。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id。' },
      subtask_id: { type: 'string', required: true, description: '子任务 id。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          subtaskId: { type: 'string', required: true },
          status: { type: 'string', required: true },
          dispatched: { type: 'number', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `子任务 ${v.subtaskId} 已吊销回池。${v.dispatched > 0 ? `已转派 ${v.dispatched} 支部队。` : '暂无可派部队，子任务在池。'}` }],
    },
    async execute(args, rawExec) {
      const exec = rawExec as unknown as WarToolExec
      const caller = requireAgent(exec)
      const task = requireTask(deps, args.task_id)
      if (task.claimedBy === undefined || caller.id !== task.claimedBy) throw new Error('只有本任务指挥官可换手子任务。')
      const s = task.subtasks.get(args.subtask_id)
      if (s === undefined) throw new Error(`子任务 ${args.subtask_id} 不存在。`)
      if (s.status !== 'in_progress' || s.attempt === undefined) throw new Error(`子任务 ${args.subtask_id} 不在役（${s.status}），无需换手。`)
      const oldOwner = s.claimedBy
      appendEvent(deps.stateDir, { type: 'subtask_updated', ts: new Date().toISOString(), campaignId: args.task_id, subtaskId: args.subtask_id, attemptId: s.attempt.id, status: 'blocked', note: '指挥官改派：吊销回池' })
      const dispatched = await kickIdleTroops(deps, args.task_id, exec.signal, undefined, oldOwner)
      return { subtaskId: args.subtask_id, status: 'open', dispatched }
    },
    presentCall: args => ({ card: 'generic', title: `换手 ${args.subtask_id}` }),
  })
}

/** Normalize a quality param to a valid tier (unknown → common). */
export function qualityOf(raw: unknown): QualityTier {
  const found = QUALITY_TIERS.find(q => q.tier === raw)
  return found === undefined ? 'common' : found.tier
}

/**
 * KillCredit verdict: parse and gate the commander's submission evidence.
 * Accepts the JSON TEXT channel (the reliable one — dsh dropped type:'json'
 * params whole, live R8 catch) and, defensively, an already-parsed object.
 * Pure.
 */
export type EvidenceVerdict = { ok: true; evidence: SubmissionEvidence } | { ok: false; reason: string }

export function parseEvidence(raw: unknown): EvidenceVerdict {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text === '') {
      return { ok: false, reason: '验收证据（evidence）是空字符串：提交必须附上 checks/tests/diffstat/files 的 JSON 文本——没有证据不算完成，系统不收自报。' }
    }
    try {
      obj = JSON.parse(text)
    } catch {
      return { ok: false, reason: 'evidence 不是合法 JSON 文本。请贴 {"checks":[{"item":"…","passed":true}],"tests":{…}} 形式的 JSON 字符串。' }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { ok: false, reason: '缺少验收证据（evidence）：提交必须附上 { checks, tests, diffstat, files } 的 JSON 文本——没有证据不算完成，系统不收自报。' }
  }
  const rec = obj as Record<string, unknown>
  if (!Array.isArray(rec.checks) || rec.checks.length === 0) {
    return { ok: false, reason: '验收证据缺少 checks：必须逐项核对验收标准（[{ item, passed }]），至少一项。' }
  }
  const checks: Array<{ item: string; passed: boolean }> = []
  for (const c of rec.checks) {
    if (typeof c !== 'object' || c === null) return { ok: false, reason: 'checks 项格式不对：每项必须是 { item: 文字, passed: true/false }。' }
    const rec = c as Record<string, unknown>
    if (typeof rec.item !== 'string' || typeof rec.passed !== 'boolean') {
      return { ok: false, reason: 'checks 项格式不对：每项必须是 { item: 文字, passed: true/false }。' }
    }
    checks.push({ item: rec.item, passed: rec.passed })
  }
  const failedItems = checks.filter(c => !c.passed).map(c => c.item)
  if (failedItems.length > 0) {
    return { ok: false, reason: `验收未全过（未通过：${failedItems.join('、')}）。没过就继续修——修不动用 war_fail 上报失败，不要带病提交。` }
  }
  let tests: SubmissionEvidence['tests'] | undefined
  if (rec.tests !== undefined) {
    const t = rec.tests as Record<string, unknown>
    if (typeof t.command !== 'string' || typeof t.exit_code !== 'number' || typeof t.passed !== 'number' || typeof t.failed !== 'number') {
      return { ok: false, reason: 'tests 格式不对：必须是 { command, exit_code, passed, failed }（真实跑过的测试命令与结果）。' }
    }
    if (t.exit_code !== 0) {
      return { ok: false, reason: `测试没过不能提交：${t.command} 退出码 ${t.exit_code}。先修到退出码 0；确实修不动就 war_fail 上报失败。` }
    }
    tests = { command: t.command, exitCode: t.exit_code, passed: t.passed, failed: t.failed }
  }
  const evidence: SubmissionEvidence = {
    checks,
    ...(tests !== undefined ? { tests } : {}),
    ...(typeof rec.diffstat === 'string' ? { diffstat: rec.diffstat } : {}),
    ...(Array.isArray(rec.files) && rec.files.every(f => typeof f === 'string') ? { files: rec.files as string[] } : {}),
  }
  return { ok: true, evidence }
}

/** Collect loot for the board card; auto-derives entries from evidence when the
 * commander didn't list any (KillCredit autofill). Accepts JSON text (the
 * reliable channel) or a parsed array. Pure. */
export function parseDeliverables(raw: unknown, evidence: SubmissionEvidence, now: string): Deliverable[] {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      list = JSON.parse(raw)
    } catch {
      list = undefined
    }
  }
  const out: Deliverable[] = []
  if (Array.isArray(list)) {
    for (const d of list) {
      if (typeof d === 'object' && d !== null) {
        const rec = d as Record<string, unknown>
        if (typeof rec.summary === 'string') {
          const kind = rec.kind === 'files' || rec.kind === 'tests' || rec.kind === 'diffstat' ? rec.kind : 'note'
          out.push({ kind, summary: rec.summary, ...(typeof rec.detail === 'string' ? { detail: rec.detail } : {}), ts: now })
        }
      }
    }
  }
  if (evidence.tests !== undefined && !out.some(d => d.kind === 'tests')) {
    out.push({ kind: 'tests', summary: `${evidence.tests.command} ${evidence.tests.passed}/${evidence.tests.passed + evidence.tests.failed} 全绿`, ts: now })
  }
  if (evidence.diffstat !== undefined && !out.some(d => d.kind === 'diffstat')) {
    out.push({ kind: 'diffstat', summary: evidence.diffstat, ts: now })
  }
  if (evidence.files !== undefined && evidence.files.length > 0 && !out.some(d => d.kind === 'files')) {
    out.push({ kind: 'files', summary: `${evidence.files.length} 个文件改动`, detail: evidence.files.join(', '), ts: now })
  }
  return out
}

/** The troop's front, scoped inside the task workspace (relative to server cwd when possible). */
export function taskWorkspaceFront(task: CampaignState, front: string): string {
  if (task.workspacePath === undefined) return normalizeFront(front)
  const rel = relativeMaybe(process.cwd(), task.workspacePath)
  return normalizeFront(`${rel}/${normalizeFront(front)}`)
}

function relativeMaybe(from: string, to: string): string {
  const rel = relative(from, to)
  return rel.startsWith('..') ? to.replaceAll('\\', '/') : rel.replaceAll('\\', '/')
}

function taskBriefIntent(task: CampaignState): string {
  const title = task.title ?? task.intent
  const acceptance = task.acceptance ?? ''
  return acceptance === '' ? title : `${title}（验收：${acceptance}）`
}

function unitStatusLabel(unit: UnitRecord, activity: string | undefined): string {
  if (unit.recalled !== undefined) return '已撤编'
  if (unit.settled !== undefined) return '已收队'
  return activity === 'running' ? '行动中' : '待命'
}
