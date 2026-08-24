/**
 * The secretary's bounty-drafting skill — registered programmatically via
 * ctx.skills.register() (the runtime provider), so no filesystem writes and
 * no install step: the drafting craft ships with the plugin. The persona
 * carries identity; this skill carries the craft (起草方法论 + 对照示例).
 * @module dsh-plugin-warroom/skill
 */

/** Structural slice of the runtime skills registry. */
export interface SkillsServiceFace {
  register(skill: { name: string; description: string; whenToUse?: string; content: string }): () => void
}

export const BOUNTY_DRAFTING_SKILL_NAME = 'warroom-bounty-drafting'

/** The skill body (SKILL.md form, markdown after frontmatter). */
export function bountyDraftingSkillContent(): string {
  return `# 悬赏令起草法（warroom 参谋专用）

把元首的大白话翻译成司令可直接执行、系统可验收的任务书。核心信条：**验收标准是任务书的灵魂**——司令提交时必须逐项附证据核对（KillCredit 制），写得含糊验收就瘫。

## 一、意图澄清（只在模糊时问，最多三问）

意图清晰就直接成书（快车道）。模糊/重大/高风险时，只问这三个里缺的：
1. **给谁用、解决什么痛点**（背景）
2. **做成什么样算成了**（验收的种子——元首嘴里的"成了"往往就是验收标准第一条）
3. **明确不做什么**（边界，防跑偏）

不问能自己查到的；不问实现细节（那是司令的事）。

## 二、任务书六要素

| 要素 | 写法 | 反例 |
|---|---|---|
| 标题 | 一句话动词开头 | 「优化一下」（含糊）→「给博客加留言板并过滤垃圾」 |
| 背景与目标 | 给谁用、为什么、上下文 | 只写"如题" |
| 执行指引 | 关键路径/技术约束/提示，不写死每一步 | 事无巨细的伪代码 |
| **验收标准** | **可判定清单，用「；」分隔。每条=可检查的事实**（命令能跑/文件存在/行为发生） | "做好""体验好""代码质量高" |
| 品质分级 | common 小改动 / fine 单模块多步 / rare 跨模块 / epic 多模块+测试+文档 / legendary 架构级 | 全标 epic |
| 可选：deps / cron | 任务链前置 id / 日常悬赏表达式 | — |

## 三、验收标准改写术

把愿望句改成检查句：
- 「好用了」→「npm test 退出码 0；页面刷新后留言仍在」
- 「能记一句话」→「add "今日晴" 后 list 输出包含"今日晴"与当天日期」
- 「快了」→「常用路径耗时 < 500ms（附测量命令与数字）」

## 四、对照示例（大白话 → 任务书）

元首原话：「我想要一个命令行小工具，每天记一句话，能翻回去看以前记的。」

任务书：
- 标题：做一个「每日一句」命令行小工具
- 背景：元首想在终端随手记当日一句（想法/心情/摘要），并能翻看历史。
- 执行指引：Node 单包小工具；数据存本地 JSON；命令 add <文字> 与 list [--all]；不引重框架。
- 验收标准：node cli.js add "今日晴" 退出码 0 且文件写入；node cli.js list 输出含"今日晴"与当天日期；npm test 退出码 0；README 含用法两行示例。
- 品质：fine（单模块多步）。

## 五、工作区路由（发布前必答）

任务落在哪个工作区？判定顺序：
1. **元首在命令里点名的**（"给 kaijibot 加……"→ 该项目目录）
2. 元首没点名 → **最近用过的工作区**（本会话刚发布过任务的地方）
3. 还定不了 → **当前打开的工作区**，或出决策卡让元首选（选项显示**项目名**，不显示路径——元首不需要知道什么叫路径）
4. 全新无归属的项目（"帮我做个爬虫脚本"）→ 用「@new:<名字>」新开副本目录，发布时系统自动建好

同工作区任务排队执行、跨工作区并行作战——把互不相干的任务分到不同工作区，部队才能多线开团。

## 六、发布要点（war_publish）

acceptance 一律用「；」分隔检查项（司令会逐项变成 evidence.checks）；complexity 估不准就降一档（宁可小事办好）；跨天重复要做的挂 cron（错过不补跑，防烧钱）；有前置顺序的拆两条用 deps 串；来源是命令区的命令务必带 commandId（命令卡自动标记批准并链接到任务）。
`
}

/** The registration object handed to ctx.skills.register(). */
export function bountyDraftingSkill(): { name: string; description: string; whenToUse: string; content: string } {
  return {
    name: BOUNTY_DRAFTING_SKILL_NAME,
    description: '作战室参谋的悬赏令起草法：把元首大白话翻译成带可判定验收标准的任务书（war_publish 发布）。',
    whenToUse: '起草/修订任务书时；元首意图模糊需要澄清时；为任务定品质分级、任务链或日常悬赏时。',
    content: bountyDraftingSkillContent(),
  }
}
