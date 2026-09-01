/**
 * The staff's bounty-drafting skill — registered programmatically via
 * ctx.skills.register() (the runtime provider), so no filesystem writes and
 * no install step: the drafting craft ships with the plugin. The persona
 * carries identity; this skill carries the craft (起草方法论 + 对照示例).
 * @module dsh-plugin-stardeck/skill
 */

/** Structural slice of the runtime skills registry. */
export interface SkillsServiceFace {
  register(skill: { name: string; description: string; whenToUse?: string; content: string }): () => void
}

export const BOUNTY_DRAFTING_SKILL_NAME = 'warroom-bounty-drafting'

/** The skill body (SKILL.md form, markdown after frontmatter)。
 * B2 最小充分审查（2026-08-31）：全文收紧 ~28%——反例并入写法、示例压半、
 * 措辞去脂；六要素/验收改写术/工作区路由（锁：路由顺序、【星球：】标记、
 * @new: 语法、战线跟着星球走）/发布要点全部行为约束原样保留。 */
export function bountyDraftingSkillContent(): string {
  return `# 任务令令起草法（warroom 大副专用）

把舰长的大白话翻译成外勤小队可直接执行、系统可验收的任务书。核心信条：**验收标准是任务书的灵魂**——外勤小队提交时必须逐项附证据核对（KillCredit 制），写得含糊验收就瘫。

## 一、意图澄清（只在模糊时问，最多三问）

意图清晰直接成书（快车道）。模糊/重大/高风险时只问缺的：给谁用解决什么痛点（背景）、做成什么样算成了（验收的种子——舰长嘴里的"成了"往往就是验收标准第一条）、明确不做什么（边界）。不问能自己查到的，不问实现细节（那是外勤小队的事）。

## 二、任务书六要素

| 要素 | 写法 |
|---|---|
| 标题 | 一句话动词开头（「优化一下」不行；「给博客加留言板并过滤垃圾」行） |
| 背景与目标 | 给谁用、为什么、上下文 |
| 执行指引 | 关键路径/技术约束/提示，不写死每一步 |
| **验收标准** | **可判定清单，「；」分隔，每条=可检查的事实**（命令能跑/文件存在/行为发生）；「做好」「体验好」这类会被拦 |
| 品质分级 | common 小改动 / fine 单模块多步 / rare 跨模块 / epic 多模块+测试+文档 / legendary 架构级 |
| 可选 deps / cron | 前置任务 id（全部收官才解锁）/ 日常任务令表达式 |

## 三、验收改写术（愿望句→检查句）

- 「好用了」→「npm test 退出码 0；页面刷新后留言仍在」
- 「能记一句话」→「add "今日晴" 后 list 输出包含"今日晴"与当天日期」
- 「快了」→「常用路径耗时 < 500ms（附测量命令与数字）」

## 四、对照示例（大白话 → 任务书）

舰长原话：「我想要一个命令行小工具，每天记一句话，能翻回去看以前记的。」
→ 标题「做一个『每日一句』命令行小工具」；指引：Node 单包、数据本地 JSON、命令 add/list、不引重框架；验收：add "今日晴" 退出码 0 且落盘、list 输出含当日句与日期、npm test 退出码 0、README 两行用法；品质 fine（单模块多步）。

## 五、工作区路由（发布前必答）

判定顺序：
1. 命令带星球标记行【星球：<路径>】（舰长显式选定；旧令的【战场：<路径>】同效）→ 无条件用该工作区，不许改道
2. **续接命令（deepen/retry/pivot）→ 默认发布到父代任务的工作区——战线跟着星球走**，续接跨星球=另起一条新战线；只有命令明确要求换地点（如"在干净的复现仓里试"）才换，换了在发布说明里点明
3. 舰长正文点名的项目（"给 kaijibot 加……"）→ 该项目目录
4. 没点名 → **最近用过的工作区**；还定不了 → 当前打开的，或出决策卡让舰长选（选项显示**项目名**，不显示路径）
5. 全新无归属的项目 → 「@new:<名字>」新开副本目录，发布时系统自动建

同工作区任务排队、跨工作区并行——互不相干的任务分到不同工作区，外勤组员才能多线开团。

## 六、发布要点（war_publish）

acceptance 一律用「；」分隔检查项（外勤小队会逐项变成 evidence.checks）；complexity 估不准就降一档（宁可小事办好）；跨天重复要做的挂 cron（错过不补跑，防烧钱）；有前置顺序的拆两条用 deps 串；续接命令的 brief 点名链档案给出的上代关键产物路径（「基于 deploy/run.ps1 补 healthcheck」），让外勤小队续在成果上而不是重做；来源是命令区的命令务必带 commandId（命令卡自动标记批准并链接到任务）。
`
}

/** The registration object handed to ctx.skills.register(). */
export function bountyDraftingSkill(): { name: string; description: string; whenToUse: string; content: string } {
  return {
    name: BOUNTY_DRAFTING_SKILL_NAME,
    description: '舰桥大副的任务令令起草法：把舰长大白话翻译成带可判定验收标准的任务书（war_publish 发布）。',
    whenToUse: '起草/修订任务书时；舰长意图模糊需要澄清时；为任务定品质分级、任务链或日常任务令时。',
    content: bountyDraftingSkillContent(),
  }
}
