/**
 * Seed the board with representative v2.0 rows so the 五分区悬赏板 has every
 * element to render: command cards in all five statuses, an epic bounty
 * awaiting claim (！) queued behind a LIVE in_progress session card, a
 * reported card with KillCredit evidence + loot (？), a succeeded closed
 * session, a locked dep-chain task, a failed card with two failed session
 * cards, and a cron daily. Idempotent: wipes and reseeds.
 *
 * Usage: node --import tsx scripts/seed-smoke.ts [stateDir]
 * (default: the real board's state dir — clear with `--clear` before the
 * live acceptance run.)
 */
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { appendEvent } from '../src/events.ts'
import { appendDirectiveEvent } from '../src/directives.ts'

const flag = process.argv[2]
const dir = flag !== undefined && flag !== '--clear'
  ? flag
  : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'warroom-plugin')
rmSync(`${dir}/campaigns`, { recursive: true, force: true })
rmSync(`${dir}/directives.jsonl`, { force: true })
if (flag === '--clear') {
  console.log(`cleared ${dir}/campaigns + directives`)
  process.exit(0)
}
mkdirSync(`${dir}/campaigns`, { recursive: true })
const ts = (i: number): string => new Date(Date.now() - (60 - i) * 60_000).toISOString()
const t0 = '20260823-alpha', t1 = '20260823-bravo', t2 = '20260823-charlie', t3 = '20260823-delta', t4 = '20260823-echo', t5 = '20260823-foxtrot', t6 = '20260823-golf'
const WS_A = 'D:/smoke/projA', WS_B = 'D:/smoke/projB'

// t5：进行中的作战会话（进行中区会话卡）——projA 被它占着
appendEvent(dir, { type: 'task_created', ts: ts(55), campaignId: t5, title: '给 projA 加健康检查端点', brief: '背景：运维需要探活。执行指引：加 /healthz 返回 JSON。', acceptance: 'curl /healthz 返回 200；npm test 退出码 0', priority: 'normal', quality: 'rare', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(55), campaignId: t5, workspacePath: WS_A, publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_claimed', ts: ts(54), campaignId: t5, claimedBy: 'cmd-foxtrot-session', attemptId: 'b7c8d9e0-f1a2-3456-7890abcdef123456', attempt: 1 })
appendEvent(dir, { type: 'unit_deployed', ts: ts(53), campaignId: t5, childId: 'u-smoke-5', unitName: 'engineer', label: '工程兵', mission: '实现 /healthz', front: `${WS_A}/src`, writes: true })

// t0：史诗悬赏待领取（！+ 品质色）——同一工作区 projA，排在 t5 后面（互斥演示）
appendEvent(dir, { type: 'task_created', ts: ts(50), campaignId: t0, title: '重构认证模块为插件化架构', brief: '背景：现有认证硬编码……执行指引：先侦察再动工，保持对外行为不变。', acceptance: '全部现有测试退出码 0；新架构有插件接口文档；迁移清单写入 README', priority: 'high', quality: 'epic', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(50), campaignId: t0, workspacePath: WS_A, publishedBy: 'sec-smoke' })

// t1：已提交带证据与战利品（？+ 证据块 + 战利品行；已完成区的「待元首翻阅」会话卡）
appendEvent(dir, { type: 'task_created', ts: ts(40), campaignId: t1, title: '做一个「每日一句」CLI 小工具', brief: 'Node 单包小工具；数据存本地 JSON；命令 add/list。', acceptance: 'add "今日晴" 退出码 0 且写入；list 输出含"今日晴"与当天日期；npm test 退出码 0', priority: 'normal', quality: 'fine', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(40), campaignId: t1, workspacePath: `${WS_B}/daily`, publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_claimed', ts: ts(39), campaignId: t1, claimedBy: 'cmd-bravo-session', attemptId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', attempt: 1 })
appendEvent(dir, { type: 'unit_deployed', ts: ts(38), campaignId: t1, childId: 'u-smoke-1', unitName: 'engineer', label: '工程兵', mission: '实现 CLI', front: `${WS_B}/daily`, writes: true })
appendEvent(dir, { type: 'task_submitted', ts: ts(30), campaignId: t1, report: '战报：CLI 完成，验收全过。改动 cli.js 与测试；遗留：无。', from: 'cmd-bravo-session',
  evidence: {
    checks: [{ item: 'add "今日晴" 退出码 0 且写入', passed: true }, { item: 'list 输出含"今日晴"与当天日期', passed: true }, { item: 'npm test 退出码 0', passed: true }],
    tests: { command: 'npm test', exitCode: 0, passed: 8, failed: 0 },
    diffstat: '3 files changed, 120 insertions(+), 8 deletions(-)',
    files: ['cli.js', 'cli.test.js', 'README.md'],
  },
  deliverables: [{ kind: 'tests', summary: 'npm test 8/8 全绿', ts: ts(30) }, { kind: 'files', summary: '3 个文件改动', detail: 'cli.js, cli.test.js, README.md', ts: ts(30) }],
})

// t6：打赢收官的会话（已完成区「打赢了」会话卡）
appendEvent(dir, { type: 'task_created', ts: ts(35), campaignId: t6, title: '修复分页参数 off-by-one', brief: '第二页重复第一条。', acceptance: '翻页用例全绿', priority: 'normal', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(35), campaignId: t6, workspacePath: `${WS_B}/pager`, publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_claimed', ts: ts(34), campaignId: t6, claimedBy: 'cmd-golf-session', attemptId: 'c3d4e5f6-a7b8-9012-3456789abcdef0', attempt: 1 })
appendEvent(dir, { type: 'task_submitted', ts: ts(33), campaignId: t6, report: '一行修复，用例全绿。', from: 'cmd-golf-session', evidence: { checks: [{ item: '翻页用例全绿', passed: true }], tests: { command: 'npm test', exitCode: 0, passed: 5, failed: 0 } } })
appendEvent(dir, { type: 'task_closed', ts: ts(32), campaignId: t6, verdict: '通过收官' })

// t2：依赖链锁定（🔒 前置 t0 未收官）
appendEvent(dir, { type: 'task_created', ts: ts(20), campaignId: t2, title: '为新认证架构写迁移指南', brief: '依赖重构完成后的文档任务。', acceptance: '指南覆盖三种迁移路径；示例可运行', priority: 'normal', deps: [t0], publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(20), campaignId: t2, workspacePath: 'D:/smoke/war/t2', publishedBy: 'sec-smoke' })

// t3：重试用尽的失败卡（败因 + 已失败区两张会话卡）
appendEvent(dir, { type: 'task_created', ts: ts(15), campaignId: t3, title: '修复 Flaky 的登录重定向测试', brief: '间歇失败，需要根因分析。', acceptance: '该用例连跑 20 次全绿', priority: 'normal', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(15), campaignId: t3, workspacePath: 'D:/smoke/war/t3', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_claimed', ts: ts(14), campaignId: t3, claimedBy: 'cmd-delta-1-session', attemptId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890', attempt: 1 })
appendEvent(dir, { type: 'task_attempt_failed', ts: ts(10), campaignId: t3, reason: '竞态根因在第三方库内部', from: 'cmd-delta-1-session' })
appendEvent(dir, { type: 'task_requeued', ts: ts(10), campaignId: t3, reason: '第 1 次尝试失败：竞态根因在第三方库内部' })
appendEvent(dir, { type: 'task_claimed', ts: ts(8), campaignId: t3, claimedBy: 'cmd-delta-2-session', attemptId: 'aa11bb22-cc33-4455-6677-8899aabbccdd', attempt: 2 })
appendEvent(dir, { type: 'task_attempt_failed', ts: ts(5), campaignId: t3, reason: '换思路后仍无法稳定复现', from: 'cmd-delta-2-session' })
appendEvent(dir, { type: 'task_failed', ts: ts(5), campaignId: t3, reason: '第 2 次尝试失败：换思路后仍无法稳定复现（重试上限 2 已用尽）' })

// t4：日常悬赏（cron 徽章）
appendEvent(dir, { type: 'task_created', ts: ts(3), campaignId: t4, title: '每日依赖安全巡检', brief: '跑 npm audit，有高危就汇报。', acceptance: '巡检结果上栏（无论是否有高危）', priority: 'normal', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(3), campaignId: t4, workspacePath: 'D:/smoke/war/t4', publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_scheduled', ts: ts(3), campaignId: t4, cron: '0 9 * * *', enabled: true })

// 命令区五状态各一张：draft / received(呼吸提醒) / talking / approved(链到 t1) / cancelled
const d0 = 'cmd-20260823-0900-aa01', d1 = 'cmd-20260823-0910-bb02', d2 = 'cmd-20260823-0920-cc03', d3 = 'cmd-20260823-0905-dd04', d4 = 'cmd-20260823-0850-ee05'
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(58), directiveId: d0, text: '等下帮我把 projA 的依赖全部升到最新' })
// d0 直接种 received（带假会话号→织换成真）：停在「成形中」稳定态。不种的话
// 引信 15s 内会真转达它（状态翻页+真 LLM 分诊），演示板和 shoot 都会竞态。
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(57.5), directiveId: d0, staffSessionId: 'sec-d0' })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(52), directiveId: d1, text: 'projB 的那个小工具，能翻回去看以前记的吗？我想每天记一句' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(51), directiveId: d1, staffSessionId: 'sec-d1' })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(48), directiveId: d2, text: '顺便给小工具加个导出 csv' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(47), directiveId: d2, staffSessionId: 'sec-d2' })
appendDirectiveEvent(dir, { type: 'directive_talking', ts: ts(45), directiveId: d2 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(41), directiveId: d3, text: '要一个能记每日一句的命令行小工具' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(40.5), directiveId: d3, staffSessionId: 'sec-d3' })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(40), directiveId: d3, taskId: t1 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(59), directiveId: d4, text: '算了，先不要动 CI' })
appendDirectiveEvent(dir, { type: 'directive_cancelled', ts: ts(57), directiveId: d4, reason: '元首改主意，CI 保持现状' })

// V9.11 demo 全状态补全（元首定案「所有状态都覆盖」）：批准待发布（任务书
// 未挂出——juliet 只在命令上挂账）/ 命令级失败重试（t3 归属 d7，决策带+收件箱
// 有「决重试」）/ 定时待发（cron 12 月 1 日——远期不到点）/ 多任务链第二环（india deps t1）。
const d6 = 'cmd-20260823-0940-ab06', d7 = 'cmd-20260823-0945-cd07', d8 = 'cmd-20260823-0950-ef08'
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(43), directiveId: d6, text: '给 projB 小工具的 README 补一页英文版' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(42.5), directiveId: d6, staffSessionId: 'sec-d6' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(42), directiveId: d6, grade: 'L2', reason: '对外文案，先看方案再动', confidence: 0.75 })
appendDirectiveEvent(dir, { type: 'directive_plan_opened', ts: ts(41), directiveId: d6, plan: '1) 通读现有 README\n2) 英文版保持结构一致\n3) 术语与代码示例对齐' })
appendDirectiveEvent(dir, { type: 'directive_plan_approved', ts: ts(40), directiveId: d6 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(39.5), directiveId: d6, taskId: '20260823-juliet' })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(37), directiveId: d7, text: '查清楚登录重定向测试为什么老挂' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(36.5), directiveId: d7, staffSessionId: 'sec-d7' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(36), directiveId: d7, grade: 'L0', reason: '排查类，直接做', confidence: 0.9 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(35.5), directiveId: d7, taskId: t3 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(33), directiveId: d8, text: '12 月 1 日早上 9 点把上月战报整理成一段摘要发我', cron: '0 9 1 12 *' })
// V9.11 demo 全点击可达：孤儿任务卡（无源命令）的点击走「直跳会话」，而宿主
// 会话目录只收打开过的会话——道具会话首跳不切。给 t0/t2/t4/t5/t6 各补一条源命令
// （生产语义：任务书都来自某道命令），全部卡点击统一走聚焦页。
const d9 = 'cmd-20260823-0955-a909', d10 = 'cmd-20260823-1000-b910', d11 = 'cmd-20260823-0830-c911', d12 = 'cmd-20260823-0820-d912', d13 = 'cmd-20260823-0810-e913'
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(56), directiveId: d9, text: '把认证模块重构成插件化架构，对外行为不变' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(55.5), directiveId: d9, staffSessionId: 'sec-d9' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(55), directiveId: d9, grade: 'L1', reason: '架构级改动，先出方案', confidence: 0.88 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(54), directiveId: d9, taskId: t0 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(24), directiveId: d10, text: '认证重构完成后写一份迁移指南' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(23.5), directiveId: d10, staffSessionId: 'sec-d10' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(23), directiveId: d10, grade: 'L0', reason: '文档任务，直接做', confidence: 0.9 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(22), directiveId: d10, taskId: t2 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(56.5), directiveId: d11, text: '给 projA 加一个健康检查端点' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(56), directiveId: d11, staffSessionId: 'sec-d11' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(55.5), directiveId: d11, grade: 'L0', reason: '小改动，直接做', confidence: 0.95 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(55), directiveId: d11, taskId: t5 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(37), directiveId: d12, text: '修一下列表第二页重复第一条的问题' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(36.5), directiveId: d12, staffSessionId: 'sec-d12' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(36), directiveId: d12, grade: 'L0', reason: '明确 bug，直接修', confidence: 0.92 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(35), directiveId: d12, taskId: t6 })
appendDirectiveEvent(dir, { type: 'directive_created', ts: ts(4), directiveId: d13, text: '每天早上跑一遍依赖安全巡检，有高危就报' })
appendDirectiveEvent(dir, { type: 'directive_received', ts: ts(3.5), directiveId: d13, staffSessionId: 'sec-d13' })
appendDirectiveEvent(dir, { type: 'directive_triaged', ts: ts(3), directiveId: d13, grade: 'L1', reason: '例行巡检，先出方案', confidence: 0.85 })
appendDirectiveEvent(dir, { type: 'directive_approved', ts: ts(3), directiveId: d13, taskId: t4 })
appendEvent(dir, { type: 'task_created', ts: ts(28), campaignId: '20260823-india', title: '给每日一句加 export 命令', brief: 't1 的后续：把记下的句子导出为 csv。', acceptance: 'export 输出含全部已记句子', priority: 'normal', deps: [t1], publishedBy: 'sec-smoke' })
appendEvent(dir, { type: 'task_published', ts: ts(28), campaignId: '20260823-india', workspacePath: `${WS_B}/daily-export`, publishedBy: 'sec-smoke' })

// 演示会话 manifest（demo-weave 开机按此把假会话号换成宿主真会话——演示板
// 所有「直跳原生会话」的点击才有真实落点；smoke overlay demoWeave=true）。
writeFileSync(join(dir, '.demo-sessions.json'), JSON.stringify({
  'sec-d0': '参谋·依赖升级',
  'sec-d1': '参谋·每日一句查询',
  'sec-d2': '参谋·csv 导出',
  'sec-d3': '参谋·每日一句工具',
  'sec-d6': '参谋·英文 README',
  'sec-d7': '参谋·登录重定向排查',
  'sec-d9': '参谋·认证重构',
  'sec-d10': '参谋·迁移指南',
  'sec-d11': '参谋·健康检查',
  'sec-d12': '参谋·分页 bug',
  'sec-d13': '参谋·依赖巡检',
  'cmd-bravo-session': '指挥官·每日一句',
  'cmd-foxtrot-session': '指挥官·健康检查',
  'cmd-delta-1-session': '指挥官·flaky 一次',
  'cmd-delta-2-session': '指挥官·flaky 二次',
  'cmd-golf-session': '指挥官·分页修复',
}, null, 2))

console.log(`seeded 7 smoke tasks + 5 command cards into ${dir}`)
