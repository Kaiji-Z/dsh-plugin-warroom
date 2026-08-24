# AGENTS.md · dsh-plugin-warroom 迭代指引

本仓库是 dsh（DeepSeek Harness）插件「作战室」——**V5「参谋自动化（AFK）」已达标（2026-08-25 真实 LLM 全链考题，证据 `.goal/evidence/v5/`，机检 assert-v5 PASS）**：三档自主度 L0/L1/L2（`war_triage` + `!!直接做`/`??先看方案` 覆写 + 元首升降档）、计划态插件自建（`war_plan` 呈批 + 发布硬门，R1 定案宿主 plan-mode 不可达改道）、goal 代管（`{id,revision}` CAS 链、司令 armed/参谋 disarm 红线、`war_set_goal`）、KillCredit 全绿自动收官（越界一票否决）、分级推+去抖唤醒 + 板摘要注入 + 起草法内嵌（坑2 正解）、`lintPublish`、配额熔断（`agent/error` code 判据 + 原地暂停恢复）。V4 归档 `.goal/SPEC-v4.md`。V6 候选见 SPEC §8（计划批准回推 K17、命令拆解等）。新会话在此迭代前先读这份文件，再按需深挖。

## 开局必读

1. **`.goal/SPEC.md`** 是唯一权威规格（现为 V3）：§0-1 两区布局、§2 交互决策定案（执行期不重议）、§3 R2 后端适应 + API 契约清单、§5 验收、§6 禁区与不变量（重写版）、§7 坑录（v1/v2 旧坑见 `.goal/SPEC-v2.md` §9，动手前先过一遍）。历史规格：`.goal/SPEC-v1.md`、`.goal/SPEC-v2.md`。
2. **§6 不变量是红线**：attemptId 令牌制、KillCredit 证据链、JSON-text 通道（dsh 丢 `type:'json'` 参数）、SSE revision-only、**板是读投影 + 唯一例外挂载**（浏览器端不提供改任务的写操作）、**用户输入只在指挥中心（左区）**。任何「优化」不得破坏它们。
3. 每轮收尾必须 `pnpm verify` PASS 并提交（tests + build + bundle 断言三段式，机器检查）。
4. 任何特性开发前先读根目录 **`VERIFICATION.md`**（协议正本，源自 stop-manual-testing skill，2026-08-24 诊断落档）并按其闭环 SOP 执行；P0 未清完前新特性必须带 flag + 回归。

## 源码地图（src/）

| 文件 | 职责 |
|---|---|
| `index.ts` | 插件入口：服务装配、司令征召器（conscriptor）、巡检 rescue（直接征召，无 LLM nudge）、引信生命周期 |
| `directives.ts` | 命令区事件流（directives.jsonl append-only + fold，五态生命周期 + 每命令会话绑定 + 终态守卫） |
| `relay.ts` | **每命令一会话** relay（pending 无会话即建 `参谋·<摘要>`）、命令引信（tickNow 秒级 + 15s 兜底）、征召令/转达文案 |
| `threads.ts` | 挂载外部会话事件流（threads.jsonl append-only：attach/detach + fold） |
| `tools.ts` | 14 个 war_* 工具（publish/claim/submit/fail/close/conscript/comment/board/deploy_unit…）+ 工作区互斥 |
| `events.ts` | 战役事件 fold：attemptLog（尝试级会话卡）、结算转移（reported/succeeded/failed） |
| `rules.ts` | 工作区归一化/冲突检测、征召计划（同区排队跨区并行）、任务链依赖检查 |
| `workspace.ts` | 工作区物化、`@new:` 新副本（instances/） |
| `dossier.ts` | 司令履历档案（退任落盘、征召注入） |
| `dashboard.ts` | Host HTTP API（/warroom/api/*：board/commands/talking/events(SSE)/threads/threads/detach）+ 板投影 |
| `client/` | 看板前端：views.tsx（**两区：指挥中心/战场** + 详情浮层 + 挂载）、styles.ts、data.ts、shell-entry.ts（回家键）、index.ts（SSE+关板水合守卫） |
| `skill.ts` | 参谋起草法（warroom-bounty-drafting，编程注册——**对 apiProxy 会话不可见**，靠 relay 内嵌要点兜底，见 SPEC §7） |
| `persona.ts` / `units.ts` / `toml.ts` | 司令 persona / 兵种 roster / TOML 加载 |
| `commands.ts` | `/war` 斜杠命令（host 侧入口）：激活先于提示落队（顺序保证） |
| `config.ts` | 插件配置 schema：编制/重试/司令上限、状态文件路径 |
| `schedule.ts` | 每日悬赏 cron：5 段表达式解析 + 下次运行计算（错过即跳过，不回填） |
| `state.ts` | 全局战时状态 JSON（激活 + HQ 绑定 + 当前战役指针；历史只在事件日志） |
| `types.ts` | 领域类型（兵种/战役事件/fold 状态），零 harness 依赖保持纯度 |

tests/ 与 src/ 一一对应（12 个文件，v3 增 threads.test.ts）；`scripts/verify.mjs` 是验收断言（含 bundle needle 检查），`scripts/seed-smoke.ts` 造演示板，`scripts/shoot-board.py`（Playwright 截图取证）与 `scripts/exam-v3.py`（八步考题驱动）是浏览器侧工具。

## 架构铁律（改代码前默诵）

- **司令必须是顶层 apiProxy 会话**（`workspace.create` 按路径幂等 → `sessions.create({workspaceId})` → rename），不能是参谋的子代理——in-process continuable 子代理继承父会话 write root，写不进任务工作区。
- **maxDepth 限制的是子代自身 depth**：depth-2 部队需要 maxDepth≥2；部署级压到 1 会封死司令派兵。
- **apiProxy.prompt 不拦斜杠命令**：'/war' 经 apiProxy 只会当纯文本到达模型；激活必须代码侧 `activate()`（store 翻 active + surface.sync）。
- **cordis effect 是 setup-returns-cleanup**：清理函数必须双箭头 `() => () => stop()`。
- **浮层/卡片组件必须 `createElement` 挂载**，不可当普通函数调用（React #310：hooks 数量跨渲染必须稳定）。
- **输出 schema 必填字段无条件给全**（条件 spread 会漏）；schema `additionalProperties:false` 会剥未声明字段。
- 完整坑录与现场案例见 SPEC §9。

## 本地起服（验收/联调）

```bash
# 在 deepseek-harness checkout 内（V4 四旗 + V5 六旗默认带上；v5-spike 探针旗按需另加）：
WARROOM_FEATURES=troop-llm-routing,troop-mailbox,troop-scheduler,troop-park,staff-triage,staff-auto-close,staff-plan,staff-goal,staff-wake,quota-recovery \
  pnpm dsh --profile web --patch D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-warroom/cordis.dev.yml --port 3080 --no-open
# 旧实例先 netstat -ano | grep :3080 找 PID kill；日志惯例重定向到 ~/.dsh/warroom-plugin/server.log
```

插件经 junction 挂进 `~/.dsh/profiles/web/node_modules`（`pnpm add file:` 在本机装不进，junction + 手动依赖绕过）。改动 → `pnpm build` → 重启服务器生效。

overlay 变体（`cordis.*.yml`）：`dev` 常规联调；`dev-on` 强制战时激活启动；`smoke` 隔离 statePath 演示数据（配 `scripts/seed-smoke.ts`）；`exp` 仅实验用。overlay 里插件必须**按包名**引用——file:// URL 条目会被 client bundle 扫描器漏掉客户端半边。

## 迭代注意

- V5（现行 goal，SPEC.md §4）：R1 机制验证 spike（ctx.planMode/ctx.goals 可用性）→ R2 分诊+L0+自动收官（staff-triage/staff-auto-close）→ R3 计划态+goal 闭环（staff-plan/staff-goal）→ R4 唤醒+注入+配额自愈+lint（quota-recovery）→ R5 AFK 真实考题。已定案不重议：L0 全自动默认、维持征召制（常驻司令否决）、参谋 goal 永远 disarm、判定环用决策卡。后续候选：命令拆解（V6）、路由冷恢复桥、调度轮转优化、飞书遥控、worktree 隔离、战绩/声望、多参谋、npm 发布。
- 考题残留可清：`C:/Users/kaiji/vibecodingKJ/temp/exam-wsA`、`exam-wsB`、`exam-v3-ws`；`scripts/seed-smoke.ts --clear` 可重置演示数据。
- git-bash curl POST 中文 JSON 会乱码入账——API 抽查一律走浏览器 fetch 或 node fetch。
- 浏览器自动化一律 Playwright（domcontentloaded + 选择器等待，SSE 挡住 networkidle）；dsh 决策卡是分页提问卡，卡等待期聊天不推进，必须点按钮。

## 验证体系（stop-manual-testing 诊断 2026-08-24）

**强制协议**：开发任何特性或改代码前，按根目录 `VERIFICATION.md`（协议正本 + 本项目 §8 参数）走「两层判定 + 回归 + flag」闭环。违反其 §7 红线的产出无效：自当裁判、无回归宣称完成、跳过验收先写码、体感收敛、验证只活在 UI、改非确定组件不跑全量回归、猜填 must-ask、有评测工具还自造轮子、擅自装依赖。

### ACI 审计结论（三项全过）
- **2.1 无 UI 可跑**：宿主 CLI 起服后 `POST /warroom/api/commands` 即触发全链（`src/dashboard.ts:234`）；R2 冒烟全 headless 闭环在案（`.goal/evidence/v3/r2-api-smoke.md`）。
- **2.2 中间态落账**：campaigns / directives / threads 三条 append-only JSONL + fold 装载器（`src/events.ts:20/26`、`src/directives.ts:50/56`、`src/threads.ts:32/38`）。
- **2.3 程序化接口**：`GET /warroom/api/board` 状态投影（`src/dashboard.ts:219`）；HTTP trace 端点缺位（已挂 SPEC §3 契约清单）。

### 现状与缺口
| 层 | 状态 | 证据 |
|---|---|---|
| 确定性断言 | 有——node:test + assert/strict，tests/ 14 文件（fold/规则级 + 八步链路回归 + flag） | `tests/relay.test.ts:1,5` |
| 回归命令 | 有——`pnpm verify` 三段式（tests+build+bundle 针脚含负断言） | `package.json` scripts、`scripts/verify.mjs` |
| 端到端回归（确定性层） | **有（2026-08-24 整改）**——`tests/e2e-regression.test.ts`：八步事件链 fold 终态 + 终态守卫 + 幽灵提交反验收，进 verify 闭环 | `tests/e2e-regression.test.ts` |
| LLM 监督层 | **有（2026-08-24 整改）**——promptfoo（`eval/`，裁判 glm-5.2+隔离提示词，三维≥7+一票否决）；门命令 `pnpm verify:eval`，无网关环境变量时**显式 SKIP** | `eval/README.md`、`scripts/run-eval.mjs` |
| Feature flag | **有（2026-08-24 整改）**——`WARROOM_FEATURES` 环境变量，缺省全 off，off==改前行为；包 API 出口 | `src/flags.ts`、`tests/flags.test.ts` |

### 验证 backlog
- ~~P0-1/2/3~~ **已清（2026-08-24 整改轮）**：监督层 `eval/` + `verify:eval` 门；八步回归 `tests/e2e-regression.test.ts`；flag `src/flags.ts`。
- P1：Playwright E2E（`scripts/shoot-board.py`/`exam-v3.py` 类，需活服务器 + 真实 LLM）收进独立 `verify:e2e` 门；决策卡应答 API 化评估（涉宿主，只读边界）；监督层首次接真网关跑通后回填实战阈值。
- P2：HTTP trace/attention 端点（SPEC §3 契约清单已挂账）。

### 项目参数（VERIFICATION.md §8，2026-08-24 填）
- 8.1 入口：宿主 CLI 起服（AGENTS.md 本地起服节）；触发 = `POST /warroom/api/commands`（`dashboard.ts:234`）与 `/war` 斜杠命令（`commands.ts:2-8`）；取 trace = `GET /warroom/api/board`（`:219`）+ 磁盘 JSONL 装载器，HTTP trace 端点 none-needed。
- 8.2 测试基建：回归命令 `pnpm verify`（`package.json:17`）；回归集 tests/（12 文件）；断言框架 node:test + node:assert/strict。
- 8.3 flag：none（整改期设计）。
- 8.4 监督设计（元首定）：同模型 glm-5.2 + 隔离提示词；三维各≥7 + 越界一票否决；提示词禁含物见 P0-1。
- 8.5 验收基线（元首定）：SPEC §5 v3 五判据为 happy-path 基线 + 反验收三条（见 P0-2）。
- 8.7 评测工具链：promptfoo（**待安装**——未装完前 §3/§4 的 promptfoo API 位标注 pending tool readiness）。
