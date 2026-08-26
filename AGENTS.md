# AGENTS.md · dsh-plugin-warroom 迭代指引

本仓库是 dsh（DeepSeek Harness）插件「作战室」——**V5「参谋自动化（AFK）」已达标（2026-08-25 真实 LLM 全链考题，证据 `.goal/evidence/v5/`，机检 assert-v5 PASS）**：三档自主度 L0/L1/L2（`war_triage` + `!!直接做`/`??先看方案` 覆写 + 元首升降档）、计划态插件自建（`war_plan` 呈批 + 发布硬门，R1 定案宿主 plan-mode 不可达改道）、goal 代管（`{id,revision}` CAS 链、指挥官 armed/参谋 disarm 红线、`war_set_goal`）、KillCredit 全绿自动收官（越界一票否决）、分级推+去抖唤醒 + 板摘要注入 + 起草法内嵌（坑2 正解）、`lintPublish`、配额熔断（`agent/error` code 判据 + 原地暂停恢复）。**V6 增量已交付（2026-08-25，SPEC §8）**：K17 计划判定回推（pushToStaff）、皮肤系统（WarCopy 词典 + 军事/平话双皮肤 + 切换器）、命令拆解成链（`war_decompose`/`war_publish_chain`，flag staff-decompose）、goal 接力原子性补偿（`armMissingCommanderGoals` 60s 巡检）、**三区看板 + 命令全生命周期追踪**（指挥中心/战场/战报，命令卡四段生命条 + 链进展聚合 + 任务卡溯源 chip，零后端改动，`commandTasks` deps-闭包 BFS）、**flags 默认全开政策**（`DEFAULT_ON_FLAGS` + `!name` 关闭语法，开发期新功能不再设旗）。**V7「到访式工作流」已交付（2026-08-25，SPEC.md 现为 V7，证据 `.goal/evidence/v7/`）**：①等你发落收件箱（四类需元首动作纯客户端聚合）②到访摘要卡（last-seen 挂载快照 delta）③悬停族系高亮+聚焦模式（CardTrace 零几何）④起草器三档开关+夜间预检（`!!`/`??` 前缀拼文本 + 改直发走 regrade）⑤「为什么还没动」解释行（host 投影只读加料 queueAhead/quotaPaused）⑥空板首用引导。V4 归档 `.goal/SPEC-v4.md`。新会话在此迭代前先读这份文件，再按需深挖。

## 开局必读

1. **`.goal/SPEC.md`** 是唯一权威规格（现为 V7）：§0 定案（不重议）、§1 六件套、§2 验收、§3 红线、§4 坑录、§5 验收记录。历史规格：v1-v4 归档（`.goal/SPEC-v1.md`…`SPEC-v4.md`），v5 含 V6 增量（`.goal/SPEC-v5.md`，其坑录沿用）。动手前先过一遍坑录。
2. **§6 不变量是红线**：attemptId 令牌制、KillCredit 证据链、JSON-text 通道（dsh 丢 `type:'json'` 参数）、SSE revision-only、**板是读投影 + 唯一例外挂载**（浏览器端不提供改任务的写操作）、**用户输入只在指挥中心（左区）**。任何「优化」不得破坏它们。
3. 每轮收尾必须 `pnpm verify` PASS 并提交（tests + build + bundle 断言三段式，机器检查）。
4. 任何特性开发前先读根目录 **`VERIFICATION.md`**（协议正本，源自 stop-manual-testing skill，2026-08-24 诊断落档）并按其闭环 SOP 执行；P0 未清完前新特性必须带 flag + 回归。

## 源码地图（src/）

| 文件 | 职责 |
|---|---|
| `index.ts` | 插件入口：服务装配、指挥官征召器（conscriptor）、巡检 rescue（直接征召，无 LLM nudge）、引信生命周期 |
| `directives.ts` | 命令区事件流（directives.jsonl append-only + fold，五态生命周期 + 每命令会话绑定 + 终态守卫） |
| `relay.ts` | **每命令一会话** relay（pending 无会话即建 `参谋·<摘要>`）、命令引信（tickNow 秒级 + 15s 兜底）、征召令/转达文案 |
| `threads.ts` | 挂载外部会话事件流（threads.jsonl append-only：attach/detach + fold） |
| `tools.ts` | war_* 工具（publish/claim/submit/fail/close/conscript/comment/board/deploy_unit/plan/decompose/publish_chain…）+ 工作区互斥 + goal 接力补偿扫描（`armMissingCommanderGoals`） |
| `events.ts` | 战役事件 fold：attemptLog（尝试级会话卡）、结算转移（reported/succeeded/failed） |
| `rules.ts` | 工作区归一化/冲突检测、征召计划（同区排队跨区并行）、任务链依赖检查 |
| `workspace.ts` | 工作区物化、`@new:` 新副本（instances/） |
| `dossier.ts` | 指挥官履历档案（退任落盘、征召注入） |
| `dashboard.ts` | Host HTTP API（/warroom/api/*：board/commands/talking/events(SSE)/threads/threads/detach）+ 板投影 |
| `client/` | 看板前端：views.tsx（V9 三级布局：灵动岛 → **三列局势墙 任务/战场（进行中）/战报（成功+失败合并纯时间序）** → **底部命令调度条**（全部命令卡横滚，活跃优先）+ 命令卡唯一详情入口（上方卡点击经 lineage 路由到源命令 CommandDetail，孤儿卡降级旧详情；CommandDetail=全生命周期叙事 + 相关会话段（参谋讨论+各次执行）+ focusSegment 分段直达）+ 四段生命条 + 任务·会话卡 `↩ cmd` 溯源 chip；链成员 `commandTasks` deps-闭包 BFS 纯客户端）、copy.ts（**皮肤词典**：WarCopy 契约 + warCopy 军事/plainCopy 平话 + react-free 皮肤 store）、V7 到访件——inbox.ts（收件箱四类聚合+aging）、visit.ts（last-seen delta，挂载快照）、preflight.ts（夜间预检判定+档位标记）、waithint.ts（排队/待领/配额解释行）、views.tsx 悬停族系高亮+聚焦模式（CardTrace 注入，hover 优先于 focus，无 SVG 连线；自动滚动覆盖纵列+横滚调度条）与空板引导、styles.ts、data.ts、shell-entry.ts（回家键）、index.ts（SSE+关板水合守卫） |
| `skill.ts` | 参谋起草法（warroom-bounty-drafting，编程注册——**对 apiProxy 会话不可见**，靠 relay 内嵌要点兜底，见 SPEC §7） |
| `persona.ts` / `units.ts` / `toml.ts` | 指挥官 persona / 兵种 roster / TOML 加载 |
| `commands.ts` | `/war` 斜杠命令（host 侧入口）：激活先于提示落队（顺序保证） |
| `config.ts` | 插件配置 schema：编制/重试/指挥官上限、状态文件路径 |
| `schedule.ts` | 每日悬赏 cron：5 段表达式解析 + 下次运行计算（错过即跳过，不回填） |
| `state.ts` | 全局战时状态 JSON（激活 + HQ 绑定 + 当前战役指针；历史只在事件日志） |
| `types.ts` | 领域类型（兵种/战役事件/fold 状态），零 harness 依赖保持纯度 |

tests/ 与 src/ 一一对应（12 个文件，v3 增 threads.test.ts）；`scripts/verify.mjs` 是验收断言（含 bundle needle 检查），`scripts/seed-smoke.ts` 造演示板，`scripts/shoot-board.py`（Playwright 截图取证）、`scripts/exam-v3.py`（八步考题驱动）、`scripts/shoot-v7.py`（V7 到访件全套断言+截图；起服前清空的只有隔离 `.smoke-state`——**绝不能无参跑 `seed-smoke.ts`**，默认状态目录是真实数据）是浏览器侧工具。

## 架构铁律（改代码前默诵）

- **指挥官必须是顶层 apiProxy 会话**（`workspace.create` 按路径幂等 → `sessions.create({workspaceId})` → rename），不能是参谋的子代理——in-process continuable 子代理继承父会话 write root，写不进任务工作区。
- **maxDepth 限制的是子代自身 depth**：depth-2 部队需要 maxDepth≥2；部署级压到 1 会封死指挥官派兵。
- **apiProxy.prompt 不拦斜杠命令**：'/war' 经 apiProxy 只会当纯文本到达模型；激活必须代码侧 `activate()`（store 翻 active + surface.sync）。
- **cordis effect 是 setup-returns-cleanup**：清理函数必须双箭头 `() => () => stop()`。
- **浮层/卡片组件必须 `createElement` 挂载**，不可当普通函数调用（React #310：hooks 数量跨渲染必须稳定）。
- **输出 schema 必填字段无条件给全**（条件 spread 会漏）；schema `additionalProperties:false` 会剥未声明字段。
- 完整坑录与现场案例见 SPEC §9。

## 本地起服（验收/联调）

```bash
# 在 deepseek-harness checkout 内（V4/V5/拆解旗已默认全开，无需 WARROOM_FEATURES；
# 要关个别旗用 ! 语法，如 WARROOM_FEATURES='!staff-plan,!quota-recovery'；
# v5-spike 探针旗仍 opt-in：WARROOM_FEATURES=v5-spike）：
pnpm dsh --profile web --patch D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-warroom/cordis.dev.yml --port 3080 --no-open
# 旧实例先 netstat -ano | grep :3080 找 PID kill；日志惯例重定向到 ~/.dsh/warroom-plugin/server.log
```

插件经 junction 挂进 `~/.dsh/profiles/web/node_modules`（`pnpm add file:` 在本机装不进，junction + 手动依赖绕过）。改动 → `pnpm build` → 重启服务器生效。

overlay 变体（`cordis.*.yml`）：`dev` 常规联调；`dev-on` 强制战时激活启动；`smoke` 隔离 statePath 演示数据（配 `scripts/seed-smoke.ts`）；`exp` 仅实验用。overlay 里插件必须**按包名**引用——file:// URL 条目会被 client bundle 扫描器漏掉客户端半边。

## 迭代注意

- V5（SPEC.md §4）：R1 机制验证 spike（ctx.planMode/ctx.goals 可用性）→ R2 分诊+L0+自动收官（staff-triage/staff-auto-close）→ R3 计划态+goal 闭环（staff-plan/staff-goal）→ R4 唤醒+注入+配额自愈+lint（quota-recovery）→ R5 AFK 真实考题。已定案不重议：L0 全自动默认、维持征召制（常驻指挥官否决）、参谋 goal 永远 disarm、判定环用决策卡。**V6 增量（SPEC §8，2026-08-25）**：K17 计划判定回推（dashboard pushToStaff→参谋会话，ee21855）、皮肤系统（WarCopy+plainCopy+useSyncExternalStore 切换器，3a42b7c）、v5-spike 定案保留（2ffd12c）、命令拆解成链（staff-decompose：war_decompose 呈批复用计划卡 + war_publish_chain 顺序 deps 链级同工作区，38dbbfd）、goal 接力原子性补偿（60s goalRelayFuse 扫补武装 swept 入账，628e5b8）、三区看板+命令全生命周期（证据 `.goal/evidence/v6/`，设计录 `DESIGN.md`/`PRODUCT.md`）。后续候选：路由冷恢复桥、调度轮转优化、飞书遥控、worktree 隔离、战绩/声望、多参谋、npm 发布。**V7 增量（SPEC.md §1/§5，2026-08-25）**：到访式工作流六件套按 ①→②→③→④→⑥→⑤ 交付（98fca98/9047286/cff4b29/dcedb00/3eaeefe/fb9986f，各轮 verify PASS，终态 160 测）；实现决策录 `DESIGN.md` V7 节。板定位定为「一天到访两三次的指挥所」，非实时盯盘仪表盘。**V7.1 审查整改 + V8 hero 灵动岛（2026-08-25）**：V7.1=impeccable critique 全项修复（12px 底线、color-mix 对比度、品质 chip 单通道、actNote 失败 toast、键盘通道、图例浮层、agingLeader，DESIGN.md V7.1 节）；V8=顶部胶囊岛替代标题栏收编全部操作件（收件箱/摘要/聚焦/下达/挂载/图例/皮肤；hover 展开+点击钉住、浮层不推挤列区、聚焦=岛常驻形态）+ 三区升格视觉大容器（圆角+语义色带）+ 卡片保守瘦身（描述性字段挪详情）+ 悬停自动滚动（nearest+300ms 防抖），取证 shoot-v7.py 含岛断言，决策录 DESIGN.md V8 节（含 war-report 类名双身份坑）。**V9 命令调度中心（2026-08-25，元首定案）**：心智模型=五列是一个命令卡的五种形态 → 布局改三级（灵动岛 → 三列局势墙 任务/战场/战报 → **底部命令调度条** war-dispatch 单行横滚，Dispatch 调度中心隐喻）；**命令卡成唯一详情入口**（上方三列卡点击经 lineageMap 路由到源命令 CommandDetail，孤儿卡才降级旧 TaskDetail/SessionDetail）；CommandDetail 增「相关会话」段（参谋讨论会话+全部执行会话，war-cd-sessions）+ focusSegment 分段直达（plan/chain/report，收件箱路由升级）；战报合并成功+失败单列纯时间序（按天分组删除——单组组头是噪音）；悬停自动滚动扩域横轴（`.war-dispatch .war-rel-same`，漏横滚容器是真 bug，shoot 抓到）。战场游戏化=未来候选。决策录 DESIGN.md V9 节。**V9.2 岛改版+定时下达（2026-08-25，元首点单 + critique 23/40 全项修复）**：聚焦不弹岛（pill 中间聚焦 chip + 点空白退出）；岛只留 ⚙ 设置抽屉（皮肤/图例/行为开关/SSE 状态，localStorage 持久化；挂载入口退役、API 保留）；调度坞左端钉驻 [＋下达][铭牌]；起草器重设计（lead+档位/时机选项卡+cron 预设+下次触发预览+Ctrl+Enter）；**定时命令真闭环**（directive cron → 30s tick 补 dispatched → 引信常轨；`dueScheduledDirectives` 纯函数，schedule.ts 双端复用）；对比度 2.79→6.67:1 shoot 机检。决策录 DESIGN.md V9.2 节（含 styles.ts 双模板串坑 + python-heredoc 丢文件事故）。**V9.3 复评整改（2026-08-26，critique 23→27 后全项修）**：warn 行内文本对比度批修（shoot 四选择器机检 5.86-6.96:1）＋ 五弹窗 `useModalLayer`（dialog 语义/焦点移入归还/Tab 圈禁）＋ Esc 层协调器 `escLayers` 栈（只关最顶层——修复聚焦+弹窗叠加关错层）＋ approved 空链给中性「任务待发布」＋ 败因只挂最新失败尝试 ＋ 批准决策块（一键保留+后果一句话，元首定）＋ 非零收件箱岛染警示（元首定）。styles.ts 双模板串坑连踩两次——verify 永久针脚断言 querySelector 模板闭合完整。决策录 DESIGN.md V9.3 节。**V9.4-9.7 容器化 + critique 冲刺（2026-08-26，goal 驱动五轮）**：调度坞容器化（去铭牌/＋瓦片/track 轨道/动态渐隐）→ 统一命令卡点击（详情唯一叙事中心+进入对话 chip）→ 草稿持久化 + n 快捷键 + inbox 去重 → P0 keyActivate 嵌套劫持 + hover 竞态 + 语义色 token 回退 → ResizeObserver/图例对比度/war-report 双身份清账/词典正名。**critique 趋势 23→27→29→35/40**（双子代理五轮，快照 `.impeccable/critique/`）；shoot 增 drain guard（清盘后折叠缓存竞态）。CSS 追加锚点标记立入 styles.ts（双模板串坑共踩四次，针脚四次拦截）。决策录 DESIGN.md V9.4-9.7 节。**V9.8 命令详情重构（2026-08-26，元首三答：单列+阶段导航/决策带置顶/明细默认收起）**：标题=命令原话（ID 降副行）；「等你发落」决策带置顶常驻（与收件箱四类同源，无事给安神行）；①命令②任务③执行④战报四段竖排故事线（sticky 阶段导航=生命条放大，滚动高亮；段头写结论）；证据/分诊理由/改档折叠为摘要行（原生 details）。决策录 DESIGN.md V9.8 节。
- **flags 默认全开政策（元首定，2026-08-25）**：开发期所有功能旗默认 on（`src/flags.ts` DEFAULT_ON_FLAGS + `runtimeFlags`），新功能**不再设旗**直接默认开；`WARROOM_FEATURES` 仅用于 `!name` 关闭个别旗或 opt-in `v5-spike`。正式版发布后恢复「每能力一 flag」流程。单测仍用 `readFeatureFlags`（纯显式，确定性）。
- **v5-spike 探针定案保留**（2026-08-25，非一次性脚手架）：它是唯一能在运行时复检宿主面结构契约的工具（goals/sessions/agents 可达性、toolFilter 接受性、错误面 code）。flag 默认 off、路由缺省不注册（404）、off 时零成本——保留不碍事，删了就要靠考古 R1 证据。宿主 deepseek-harness 升级后：`WARROOM_FEATURES=v5-spike` 起服 + `GET /warroom/api/v5-spike` 一键复检（probe 会话/goal 用后即清，见 K15 残留自愈）。
- 考题残留可清：`C:/Users/kaiji/vibecodingKJ/temp/exam-wsA`、`exam-wsB`、`exam-v3-ws`；`scripts/seed-smoke.ts --clear` 可重置演示数据。
- **模拟作战室（playground）协议（2026-08-25 起，元首要常驻演示板）**：给元首把玩 UI/操作的演示板。必须**停服 → 播种 → 起服**三步：运行中的服务器会用内存旧态落盘覆盖种子（已实测：起服后播种，几分钟后 directives.jsonl 被清空、板变空）。播种命令 `python scripts/seed-playground.py`（只动隔离 `.smoke-state`，与 shoot-v7.py Phase 0+C 同源：全要素演示板 + L1 计划待批命令），然后按本地起服节重启 cordis.smoke.yml 服。验证：`GET /warroom/api/board` 应返回 commands 非空且 3 分钟不消失。
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
| Feature flag | **有（2026-08-25 起：默认全开）**——`WARROOM_FEATURES` + `DEFAULT_ON_FLAGS`/`runtimeFlags`（开发期缺省全 on，`!name` 关闭；v5-spike opt-in）；单测走 `readFeatureFlags` 纯显式 | `src/flags.ts`、`tests/flags.test.ts` |

### 验证 backlog
- ~~P0-1/2/3~~ **已清（2026-08-24 整改轮）**：监督层 `eval/` + `verify:eval` 门；八步回归 `tests/e2e-regression.test.ts`；flag `src/flags.ts`。
- P1：Playwright E2E（`scripts/shoot-board.py`/`exam-v3.py` 类，需活服务器 + 真实 LLM）收进独立 `verify:e2e` 门；决策卡应答 API 化评估（涉宿主，只读边界）；监督层首次接真网关跑通后回填实战阈值。
- P2：HTTP trace/attention 端点（SPEC §3 契约清单已挂账）。

### 项目参数（VERIFICATION.md §8，2026-08-24 填）
- 8.1 入口：宿主 CLI 起服（AGENTS.md 本地起服节）；触发 = `POST /warroom/api/commands`（`dashboard.ts:234`）与 `/war` 斜杠命令（`commands.ts:2-8`）；取 trace = `GET /warroom/api/board`（`:219`）+ 磁盘 JSONL 装载器，HTTP trace 端点 none-needed。
- 8.2 测试基建：回归命令 `pnpm verify`（`package.json:17`）；回归集 tests/（12 文件）；断言框架 node:test + node:assert/strict。
- 8.3 flag：`WARROOM_FEATURES`（2026-08-25 起开发期默认全开 + `!name` 关闭语法；2026-08-24 整改期为缺省全 off==改前行为）。
- 8.4 监督设计（元首定）：同模型 glm-5.2 + 隔离提示词；三维各≥7 + 越界一票否决；提示词禁含物见 P0-1。
- 8.5 验收基线（元首定）：SPEC §5 v3 五判据为 happy-path 基线 + 反验收三条（见 P0-2）。
- 8.7 评测工具链：promptfoo（**待安装**——未装完前 §3/§4 的 promptfoo API 位标注 pending tool readiness）。
