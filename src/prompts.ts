/**
 * B1-件① 宿主侧提示词单一资产源。此前征召令/转达/征召简报的模板正文散在
 * relay.ts 与 index.ts 的字面量里（无单一源、无版本、改词无门禁）——本模块
 * 收拢全部「发往 LLM 会话的文本模板」，配 tests/prompts-snapshot.test.ts 快照
 * 门：任何改词必须显式更新快照才能过 verify（改提示词=高风险变更，与代码同级
 * 回归；GLM 网关可用时另跑 verify:eval 监督层）。
 *
 * 出口协议段（war_claim 令牌 / war_submit 证据 / war_fail / KillCredit）是不可
 * 裁剪内容——快照测试单独点名断言，任何「瘦身」动了即 FAIL。
 * persona.ts / skill.ts / chain-note.ts 仍是各自资产模块（本就单一源），经本
 * 模块汇出供一处取用。
 * @module dsh-plugin-warroom/prompts
 */

import { featureEnabled, type FeatureFlags } from './flags.ts'
import type { Directive } from './directives.ts'
import { bountyDraftingSkillContent } from './skill.ts'
import { commanderPersonaText, conscriptBriefing } from './persona.ts'
import type { TaskStatus } from './types.ts'

export { staffPersonaText, commanderPersonaText, conscriptBriefing, troopReportDiscipline, troopBriefing, mailboxDiscipline, schedulerDiscipline, warKickoffPrompt, wakeCommanderPrompt, commanderReportHint, planApprovedNotice, planRejectedNotice } from './persona.ts'
export { bountyDraftingSkillContent, bountyDraftingSkill, BOUNTY_DRAFTING_SKILL_NAME } from './skill.ts'
export { buildChainNote, buildCommanderChainBrief, pivotChainSlice } from './chain-note.ts'

/**
 * The relay text delivered into the staff conversation for one command.
 * Pure — the drafting instructions ride the text because the persona layer
 * alone doesn't know the board's command flow. V5-R2: with the staff-triage
 * flag the triage discipline rides the text too (flag off = byte-identical).
 */
export function relayPromptFor(directive: Directive, flags?: FeatureFlags): string {
  const base = `【命令区】新命令 ${directive.id}
${directive.text}

大副：这是舰长从舰桥命令区下达的命令。按 warroom-bounty-drafting（任务令令起草法）处理：
- 听懂意图；需要澄清就用提问卡片问舰长——舰长看到命令卡亮起后会点进本会话来回答。
- 能定案就呈任务书，经舰长批准后 war_publish 发布，务必携带参数 commandId=${directive.id}（发布后命令卡自动标记「已批准」并链接到任务）。
- 发布前按起草法定好工作区路由（舰长点名 > 最近用过 > 当前打开 > 决策卡让舰长选项目名）；全新无归属项目用 @new:<名字> 新开副本。
- 确实无法成案（舰长放弃/无法澄清）就 war_abandon_command 说明原因。`
  if (flags === undefined || !featureEnabled(flags, 'staff-triage')) return base
  // V5-R3（staff-plan 旗）：L1/L2 走计划态——勘察后 war_plan 呈批，舰长
  // 批准后 war_publish 才放行（发布硬门在工具侧拦）。旗关时维持 R2 的
  // 现行呈批（完整任务书经舰长批准）。
  const planDiscipline = featureEnabled(flags, 'staff-plan')
    ? `- L1 复杂：先勘察（读相关工作区/依赖），再用 war_plan 呈一页纸计划（command_id=${directive.id}：目标、≤5 步骤、涉及工作区、风险与回退）；舰长在命令卡上批准后才能 war_publish——没批前发布会被硬门拦下。驳回就按意见修订重呈。
- L2 不明确：先用提问卡片向舰长澄清收敛，能定案后按复杂度走 L0 或 L1。`
    : `- L1 复杂：走现行呈批——完整任务书经舰长批准后 war_publish。
- L2 不明确：先用提问卡片向舰长澄清收敛，能定案后再按复杂度走 L0/L1。`
  // V5-R4（坑2 正解）：apiProxy 会话看不到编程注册技能——起草法全文内嵌
  // 提示词（单一事实源：与 skill.ts 同一函数）。板摘要注入在 relayPending
  // _Commands 侧拼（staff-wake 旗）——本函数保持纯。
  const craft = bountyDraftingSkillContent()
  // V6 命令拆解（staff-decompose 旗）：大命令拆链纪律——呈批复用计划卡，
  // 成链发布落顺序 deps + 链级同一工作区。
  const decomposeDiscipline = featureEnabled(flags, 'staff-decompose')
    ? `\n- 一步做不完的大命令：先勘察，再 war_decompose 呈拆解（command_id=${directive.id}：一页纸总计划 + ≥2 个子任务书，逐个过 lint）；舰长在命令卡上批准后 war_publish_chain 成链发布（子任务同工作区顺序接力），不要再拆成多个独立命令。`
    : ''
  return `${base}

【V5 分诊】接令第一轮先用 war_triage 报档位（command_id=${directive.id}，grade=L0/L1/L2，reason 一句话，confidence 0-1），再按档位走流程：
- L0 简单【默认优先】：轻任务书直发——标题一句话、brief 两三句、验收 ≤3 条可判定项，直接 war_publish（带 commandId），无需舰长批准。
${planDiscipline}${decomposeDiscipline}
- 舰长文本标记优先：命令含「!!直接做」强制 L0、含「??先看方案」强制 L2（工具会强制改档，照办即可）。
- 发布前过系统 lint：标题 ≥4 字、正文 ≥10 字、验收用「；/、」列举或 ≥30 字明确完成定义——不可判定会被拦。

【起草法全文】（内嵌——本会话看不到技能库）
${craft}`
}

/** 罗马代际标签（服务端侧小实现——客户端视图层的 GEN_ROMAN 不跨端复用）。 */
function romanGen(n: number): string {
  const numerals = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']
  return numerals[n] ?? `第${n}代`
}

function brief(text: string, w: number): string {
  return text.length > w ? `${text.slice(0, w)}…` : text
}

/** V10 战线档案条目（纯）：一代旧令的一行战况，深挖兜底写「战况不详」。 */
export interface ChainStepFace {
  readonly generation: number
  readonly text: string
  readonly outcome?: string
}

export function chainDigest(steps: ReadonlyArray<ChainStepFace>): string {
  return steps
    .map(s => `- ${romanGen(s.generation)} 代「${brief(s.text, 18)}」→ ${s.outcome ?? '战况不详（任务账本缺失）'}`)
    .join('\n')
}

/** V15 战线档案注入段（纯包装）：relay 侧 chainNoteFor 的模板正文。 */
export function chainArchiveSection(gen: number, note: string): string {
  return `\n\n【战线档案 · ${romanGen(gen)} 代续战令】此前各代战况（勿重蹈覆辙）：\n${note}\n工作区纪律：本令任务默认发布到父代任务的工作区（战线跟着星球走）；仅当命令明确要求换地点才换。`
}

/** 从挂链任务折出一行战况（纯；结构性切片，deepen/retry 的征召注入用）。 */
export function chainOutcomeOf(task?: { status: TaskStatus; lastError?: string; closedVerdict?: string }): string {
  if (task === undefined) return '未成形（尚未发布成任务）'
  if (task.status === 'closed') return `已收官：${task.closedVerdict ?? '验收通过'}`
  if (task.status === 'failed') return `败退${task.lastError !== undefined && task.lastError !== '' ? `——败因：${task.lastError}` : ''}`
  switch (task.status) {
    case 'reported': return '已交稿，待舰长验收'
    case 'in_progress': return '执行进行中'
    case 'published': return '已发布，待外勤小队领令'
    default: return '草稿中'
  }
}

/** V10 pivot 转达文本（纯）：不进大副对话——指令直插执行会话队列。
 * V15：可选父代速览（chain-note pivotChainSlice）——插播也带上代战况与产物。 */
export function pivotPromptFor(parentText: string, directiveId: string, text: string, chainSlice = ''): string {
  return `【续战令·转向】${directiveId}（续自「${brief(parentText, 16)}」）
${chainSlice === '' ? '' : `\n${chainSlice}\n`}
外勤小队：舰长在执行进行中插播指令——

${text}

按队列在本回合结束后送达；与本任务既定路线冲突时，以本条为准修订方向。确实无法转向就照常收束，由大副另案处理。`
}

/**
 * B1-件① 外勤征召令全文（纯组装，自 index.ts 征召器迁入）：外勤小队条令 +
 * 外勤任务简报 + 可选战线前情 + 写权限指引。出口协议（war_claim 令牌 →
 * war_submit 证据 → war_fail）由条令与简报承载——不可裁剪（快照点名断言）。
 */
export function commanderOrderFor(args: {
  maxUnits: number
  taskId: string
  title: string
  workspacePath?: string
  acceptance: string
  dossier: string
  /** V15 续接链摘要（buildCommanderChainBrief 产物）；空串=非续接令。 */
  chainBrief?: string
}): string {
  return [
    commanderPersonaText(args.maxUnits),
    '',
    conscriptBriefing({ taskId: args.taskId, title: args.title, workspacePath: args.workspacePath, acceptance: args.acceptance, dossier: args.dossier }),
    ...(args.chainBrief !== undefined && args.chainBrief !== '' ? ['', `【战线前情】本任务续接既有战线——此前各代战况与产物（续接而非重做，先看懂再动手）：\n${args.chainBrief}`] : []),
    '',
    '你的写权限根就在本会话绑定的工作区——直接动手即可；确需加派组员时用 war_deploy_unit（星域写工作区内相对路径）。',
    // V16.5②（仅续接令）：e2e 体检实锤外勤会去翻宿主会话记录/服务日志/全盘文件
    // 「求证」上代上下文——前情里产物路径+关键值都在，点明直接读工作区文件。
    ...(args.chainBrief !== undefined && args.chainBrief !== '' ? ['前情点名的上代产物（相对路径）就在本工作区内——直接读文件，不要去检索宿主会话记录、服务日志或工作区之外的任何文件。'] : []),
  ].join('\n')
}
