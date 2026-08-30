# AGENTS.md · dsh-plugin-warroom 迭代指引

本仓库是 dsh（DeepSeek Harness）插件「舰桥」——**当前版本 V16（2026-08-29 星际迷航语义统一：舰长—大副—外勤小队三角色+全套词表随皮肤派生；V10-V15 历史详见 DESIGN.md 各节与 git log；SPEC 现为 v9，README 版本史=总索引）**：V7 到访式工作流 → V8 灵动岛 → V9 命令调度中心/聚焦页（12 态状态机）→ V9.11 卡位模型+实时活动 → V9.12 审查整改 → V9.13 明暗双主题色彩系统（`--war-*` 语义令牌层单开关跟随宿主 / 容器海拔四级 / 状态四档语义 蓝=机器在动·琥珀=等你·绿=善终·红=败 / 选项卡选中态三通道 / 插件子树 border-box 复位；终态 203 测 + shoot-v7 全绿 + shoot-theme 双主题对比 20/20）→ V12.2 语义 token 化全项目重铸（三层令牌 + war-tokens.ts 唯一色源 + critique 35/40）。历史里程碑——**V5「参谋自动化（AFK）」已达标（2026-08-25 真实 LLM 全链考题，证据 `.goal/evidence/v5/`，机检 assert-v5 PASS）**：三档自主度 L0/L1/L2（`war_triage` + `!!直接做`/`??先看方案` 覆写 + 元首升降档）、计划态插件自建（`war_plan` 呈批 + 发布硬门，R1 定案宿主 plan-mode 不可达改道）、goal 代管（`{id,revision}` CAS 链、指挥官 armed/参谋 disarm 红线、`war_set_goal`）、KillCredit 全绿自动收官（越界一票否决）、分级推+去抖唤醒 + 板摘要注入 + 起草法内嵌（坑2 正解）、`lintPublish`、配额熔断（`agent/error` code 判据 + 原地暂停恢复）。**V6 增量已交付（2026-08-25，SPEC §8）**：K17 计划判定回推（pushToStaff）、皮肤系统（WarCopy 词典 + 军事/平话双皮肤 + 切换器）、命令拆解成链（`war_decompose`/`war_publish_chain`，flag staff-decompose）、goal 接力原子性补偿（`armMissingCommanderGoals` 60s 巡检）、**三区看板 + 命令全生命周期追踪**（指挥中心/战场/战报，命令卡四段生命条 + 链进展聚合 + 任务卡溯源 chip，零后端改动，`commandTasks` deps-闭包 BFS）、**flags 默认全开政策**（`DEFAULT_ON_FLAGS` + `!name` 关闭语法，开发期新功能不再设旗）。**V7「到访式工作流」已交付（2026-08-25，SPEC.md 现为 V7，证据 `.goal/evidence/v7/`）**：①等你发落收件箱（四类需元首动作纯客户端聚合）②到访摘要卡（last-seen 挂载快照 delta）③悬停族系高亮+聚焦模式（CardTrace 零几何）④起草器三档开关+夜间预检（`!!`/`??` 前缀拼文本 + 改直发走 regrade）⑤「为什么还没动」解释行（host 投影只读加料 queueAhead/quotaPaused）⑥空板首用引导。V4 归档 `.goal/SPEC-v4.md`。新会话在此迭代前先读这份文件，再按需深挖。

> **V15 续接闭环+战场正名+战线命名（2026-08-28，元首批准计划，已交付）**：①**chainNoteFor 知识连续性**（V13.1 收尾）——`src/chain-note.ts` 纯模块三档（buildChainNote 最近 3 代详情 cap 1500 / buildCommanderChainBrief cap 600 / pivotChainSlice cap 400；数据源=上代 CampaignState 的 reports[].text + evidence.files + diffstat + closedVerdict + lastError）；relay 链档案/pivot 父代速览接线 + **征召令【战线前情】**（conscriptTask 内 taskId→loadDirectives 反查续接命令→foldChains 祖先——publish/收官接力/补征四入口一处覆盖）；skill 教 brief 点名上代产物路径（续在成果上不重做）。②**workspaceKind 投影**——task_published 可选字段（bound/bound-worktree/instance/auto-worktree/auto-dir），写侧 composeWorkspaceKind（`.git` 是文件=worktree 指针探测；war_publish+拆解链两发布点），客户端 wsKeyOf kind 感知（auto worktree-of-P 归未分组治误判；旧任务回落路径启发式，append-only 无回填）。③**战线命名**——composer「战线名（可选）」≤24 字 → POST name → directive_created.name（cron 先例）→ frontsOf title=name??原文；定案三问：元首下达时可选/本轮不可改（directive_named 挂账）/显示 name??原文。验证 verify+六针脚 + shoot-v13 L5 命名断言 + 板 API 冒烟（kind 双态并存/named 回显）+ 五 shooter 全绿。决策录 DESIGN.md V15 节。

> **V16 星际迷航语义统一（2026-08-29，元首定案，已交付）**：角色 **舰长（Captain）—大副（XO）—外勤小队（Away-Team）**（原元首—参谋—指挥官）；全套词表：作战室→舰桥、战场→星球、悬赏→任务令、战报→任务回报、战利品→任务产出、凯旋→达成、征召令→外勤任务简报、母舰/HQ→星舰、战时/停战→出航/入坞、部队/兵种→外勤组员、协议标记【战场：】→【星球：】（解析双兼容）；**维持**：战线/星域/编队/命令/任务/世代（元首四问定案）。**皮肤机制**：copy.ts 军事词典为单一源，TREK_LEXICON 运行时词表派生 trekCopy（默认皮肤）——术语随皮肤变化是结构性保证（改一处词典三皮肤同步）；军事/平话皮肤保留可切（settings 三按钮）；shell-entry 侧栏标签订阅皮肤即时换词（V6 以来两皮肤同名的隐性 bug 顺带修复）。**坑**：trekCopy 是运行时派生——bundle 里只有军事源串+变换代码，**静态 needle 不能断言 trek 字面量**（词典类针脚指军事源串+TREK_LEXICON 机制针脚）；war-tokens 哨兵不认含数字令牌名的 var() 回退（--war-text-2 别带回退值）。host 侧（persona/tools/skill/relay）用 trek 正典（LLM 与 UI 同词）；会话标题前缀 大副·/外勤·（旧会话 append-only 不动）。验证 verify + shoot-v13/v7/theme 全绿。**V16.1 收尾**：宿主侧栏收起只留图标（`[class*="_collapsed"]` 后缀稳定选择器）；trek 扩表 7 词（作战→执行/战区→星域/折戟→挫败/收菜→收获/善终→圆满/发落→定夺/退役→休眠）；plainCopy 正名 64 处（工作台/助理/干员/项目/任务单/汇报办公语系）；**坑：trekifyCopy 函数字段（计数模板串）纯字符串遍历漏派生——函数包返回值过词表**。决策录 DESIGN.md V16/V16.1 节。

> **V15.1 实弹考题轮（2026-08-28，元首令「做1」，已交付）**：两代续接链真实 LLM 全链考题（assert-v15 15/15 PASS，正本 `.goal/evidence/v15/r15-exam.md`）——代1指挥官现场随机生成 token 落 manifest，代2 deepen 续接产出 summary 逐字引用，归因锁=token 不在命令原文、下游出现唯一通道是 V15 链档案注入（参谋任务书+指挥官战报双通道实证）。考题抓出三真 bug 全修：①**war_publish 悬空批准死锁**（先落 approved 再绑区，绑定失败即死锁——第一轮考题参谋真的去改账本被元首叫停；修=工作区路由前置零写入失败）；②**引信双开竞态**（立即 tickNow×15s tick 撞车双读到 draft，一代双参谋；修=fuse 在途守卫）；③**参谋会话绑 warRoot 工作区**（元首定案选项2：星域语义不变 warRoot 本就是未分组行星，宿主侧栏从幽灵变居民；relay 改 workspace.create 幂等+workspaceId 与指挥官同构）+jumpSession try/catch 接 select 抛错走警示。**勘误**：初判「宿主冷会话列表失效」系误诊——真相是冷列表**起服后首次扫描慢**（约 10-15s），采样过早所致（元首肉眼反证+复测实锤：t+15s 老会话齐现、war 组 4 条参谋行可见、跳转就绪后正常）。决策录 DESIGN.md V15.1 节。

> **V14 战线范式收口（2026-08-28，元首定案，已交付）**：**血脉除名**——战线=命令的聚合，绑定一个 workspace（战场）；层级 **战场⊃战线⊃命令**，workspace 承担溯源（原血脉职能）。落点：①聚焦页本地计代（锚=本地Ⅰ）+ origin 溯源 chip「续接自 源战场·源战线」（跨场痕迹=一条可点的事实）；②链色绑战线（兄弟段天然异色，`boardFrontByCmd` 单例）；③composer 显式战场选择器（续接自动带父战场、改选=宣告新战线、提交拼协议标记 `【战场：<路径>】`）；④点战场看战线清单（3D/2D `war-wz-bfpanel`）；⑤写侧 skill/relay 引导（战场标记无条件遵守+续接绑父工作区）。**坑**：composer 闭包变量名≠props 名→pageerror（注入代码必须 live 验证）；className.includes('on') 命中 continue 子串（用 classList.contains）；**color-mix 混 transparent 产出 oklab() 计算值**（对比度解析器要带 oklab→sRGB 分支）；宿主 theme-presenter 异步写回 dark（对比度测量同 tick 摘 attr+读值）。验证 239 测 + V14 七针脚 + 五 shooter 全绿（v7 含 oklab 修复）。critique 未跑（元首令，后续一起审）。决策录 DESIGN.md V14 节。

> **V13 战线一等公民（2026-08-28，元首范式升格，已交付）**：视觉理解一等公民从「会话」换成「战线」。**血脉 ≠ 战线**——血脉（chain 族谱层）永不拆分（聚焦页族谱/hover 高亮不变）；**战线 = 血脉 ∩ 战场**（`src/client/front.ts` frontsOf 父相对 run 拆分：续代跨战场=新 Ⅰ 命令=新战线，Ⅳ 不并回，成形代继承父段，同 rootId 多段同链色）；战场=workspace=真实项目文件夹，warRoot 合成沙盒（tasks/instances 路径启发式）聚合「未分组」行星。视图四落点：任务列战线分组（war-front-head 链色组头）/调度坞按段分组（组键 rootId/段头）/星域**世代环**（单战场锚定 torus+世代标记末代发光，readChainHue CSS 运行时读色；2D 回退 SVG 同源）/收件箱战线分组头。纯前端零后端。**V13.1 升格配套必需**：写侧续接绑父 workspace 引导 + chainNoteFor 知识连续性（否则战线无谓拆分成常态）。**坑**：TDZ 第三案（调用点前移踩声明滞后 openTaskVia 整板白屏——views.tsx const 声明序审查项）；pick() 返回实体本身非 {kind,ref} 包装；深色 .war-fail 4.25→4.86:1（红基色暗，深色 75% 混白）入 theme 机检对。验证 235 测 + shoot-v13 12 断言（拆段双证）+ probe 40/40 + theme 11×2。决策录 DESIGN.md V13 节。

> **V12.2 语义 token 化（2026-08-28，元首令，已交付）**：styles.ts v5.0 三层令牌架构（L1 基元/L2 语义 `--war-*`/L3 场景开关——组件规则 dsw 直穿与裸色清零；`[data-war-skin]` 皮肤钩子随文案皮肤落属性）；`src/client/war-tokens.ts` = TS 侧唯一色源入口（CSS 令牌运行时读取 + headless/主题错位同值回退，**回退哨兵 tests/war-tokens.test.ts 双向锁死**——令牌闭合/组件区纯净/值互锁，防 styles.ts:530 未定义 var 旧案复发）；2D 战术盘双皮调色板/速报日志色 kind 化（浅压深修白蓝图对比 latent bug）/3D 语义状态色全迁令牌族；critique 三轮 36→33→32→**35/40 达标**（双子代理 + 父级勘误 2 条误报；整改：调度分段铭牌/窄窗单列/12px 底线清除/败局红终局 `war-life-bar.err`/m 快捷键/hint 对比 5.81-6.63:1 等）。**坑**：块注释内禁写 `--xxx-*/` 通配（`*/` 提前终止注释炸 esbuild）；critique 多轮落盘须隔秒（同秒同名覆盖）。决策录 DESIGN.md V12.2 节。

> **V10 进行中（2026-08-26，goal 驱动）**：战线续接（continuesFrom 三模式+世代徽标+族谱面包屑+战线档案征召注入+pivot 直插执行队列）与星域战场（同心椭圆恒星系/光点 activity 动词/凯旋印记/视图开关/悬浮舱）已交付并双取证（shoot-v10 五相位 + theme 20 对全绿，evidence/v10/）；R2 spike 宿主结论落 spike-midrun.md——queue=持久 next-turn 队列、冷会话 prompt=resume；deepen 会话级冷恢复接线挂账 V10.1。决策录 DESIGN.md V10 节。

## 开局必读

1. **`.goal/SPEC.md`** 是唯一权威规格（现为 v8，头置 V8-V9.12 增量索引；v7 六件套正文在其下半原文保留）：§0 定案（不重议）、§1 六件套、§2 验收、§3 红线、§4 坑录、§5 验收记录。历史规格：v1-v4 归档（`.goal/SPEC-v1.md`…`SPEC-v4.md`），v5 含 V6 增量（`.goal/SPEC-v5.md`，其坑录沿用）。动手前先过一遍坑录。
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
| `client/` | 看板前端：views.tsx（V9 三级布局：灵动岛 → **三列局势墙 任务/战场（进行中）/战报（成功+失败合并纯时间序）** → **底部命令调度条**（全部命令卡横滚，活跃优先）+ 命令卡唯一详情入口（上方卡点击经 lineage 路由到源命令 **V9.9 聚焦页 FocusPage + V9.10 状态机补全**——四段导览=主界面卡片拉进窗口：①命令卡（点开下达配置+改档 L0/L1/L2）②任务卡/ghost（**12 态状态机**：drafting ghost=分诊结论+进任务会话、talking ghost=warn 色+进入对话回答、plan ghost=计划原文+批准/驳回、灰提示分岔=定时待发/转达中/待发布/已取消、链卡=计划+任务书+验收标准+去处理）③仅进行中的执行会话卡（点卡直跳原生会话，无 live 只给提示行）④战报卡（点开收官结论+证据+战利品+历次作战逐次可跳+去处理）；子详情一律卡下原地展开；底部双会话跳钮（任务会话/执行会话，未形成禁用占位）代替旧 footer 全部按钮；**TaskDetail/SessionDetail 已裁撤**——孤儿卡直跳末次会话/原生会话；focusSegment 分段直达 plan/chain→任务段、report→战报段；段头无编号、跳转导航已退役（负断言 war-cd-step））+ 四段生命条 + 任务·会话卡 `↩ cmd` 溯源 chip；链成员 `commandTasks` deps-闭包 BFS 纯客户端）、copy.ts（**皮肤词典**：WarCopy 契约 + warCopy 军事/plainCopy 平话 + react-free 皮肤 store）、V7 到访件——inbox.ts（收件箱四类聚合+aging）、visit.ts（last-seen delta，挂载快照）、preflight.ts（夜间预检判定+档位标记）、waithint.ts（排队/待领/配额解释行）、views.tsx 悬停族系高亮+聚焦模式（CardTrace 注入，hover 优先于 focus，无 SVG 连线；自动滚动覆盖纵列+横滚调度条）与空板引导、styles.ts、data.ts、shell-entry.ts（回家键）、index.ts（SSE+关板水合守卫） |
| `client/front.ts` | V13 战线派生纯函数（零 React）：`frontsOf` 血脉∩战场 run 拆分（续代跨战场=新段，成形继承父段，Ⅳ 不并回）、`commandTasks` deps-闭包 BFS（V13 从 views 迁入）、`isSyntheticWs` 合成沙盒启发式 + `UNGROUPED_WS_KEY`、`WzBridgeFrontLite` 星域桥 |
| `activity.ts` | V9.11 执行卡实时活动：宿主 session/event → 动词映射器（纯函数，**载荷在 `.data` 下**）+ `ActivityTracker` 内存滚动表（256 上限不落盘）+ revision 动词盐（只随动词变） |
| `report-capture.ts` | 部队战报事件解析纯函数（parseUnitReportEvent：嵌套 .data 优先/扁平退回，registerReportCapture 消费） |
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

- V5（SPEC.md §4）：R1 机制验证 spike（ctx.planMode/ctx.goals 可用性）→ R2 分诊+L0+自动收官（staff-triage/staff-auto-close）→ R3 计划态+goal 闭环（staff-plan/staff-goal）→ R4 唤醒+注入+配额自愈+lint（quota-recovery）→ R5 AFK 真实考题。已定案不重议：L0 全自动默认、维持征召制（常驻指挥官否决）、参谋 goal 永远 disarm、判定环用决策卡。**V6 增量（SPEC §8，2026-08-25）**：K17 计划判定回推（dashboard pushToStaff→参谋会话，ee21855）、皮肤系统（WarCopy+plainCopy+useSyncExternalStore 切换器，3a42b7c）、v5-spike 定案保留（2ffd12c）、命令拆解成链（staff-decompose：war_decompose 呈批复用计划卡 + war_publish_chain 顺序 deps 链级同工作区，38dbbfd）、goal 接力原子性补偿（60s goalRelayFuse 扫补武装 swept 入账，628e5b8）、三区看板+命令全生命周期（证据 `.goal/evidence/v6/`，设计录 `DESIGN.md`/`PRODUCT.md`）。后续候选：路由冷恢复桥、调度轮转优化、飞书遥控、worktree 隔离、战绩/声望、多参谋、npm 发布。**V7 增量（SPEC.md §1/§5，2026-08-25）**：到访式工作流六件套按 ①→②→③→④→⑥→⑤ 交付（98fca98/9047286/cff4b29/dcedb00/3eaeefe/fb9986f，各轮 verify PASS，终态 160 测）；实现决策录 `DESIGN.md` V7 节。板定位定为「一天到访两三次的指挥所」，非实时盯盘仪表盘。**V7.1 审查整改 + V8 hero 灵动岛（2026-08-25）**：V7.1=impeccable critique 全项修复（12px 底线、color-mix 对比度、品质 chip 单通道、actNote 失败 toast、键盘通道、图例浮层、agingLeader，DESIGN.md V7.1 节）；V8=顶部胶囊岛替代标题栏收编全部操作件（收件箱/摘要/聚焦/下达/挂载/图例/皮肤；hover 展开+点击钉住、浮层不推挤列区、聚焦=岛常驻形态）+ 三区升格视觉大容器（圆角+语义色带）+ 卡片保守瘦身（描述性字段挪详情）+ 悬停自动滚动（nearest+300ms 防抖），取证 shoot-v7.py 含岛断言，决策录 DESIGN.md V8 节（含 war-report 类名双身份坑）。**V9 命令调度中心（2026-08-25，元首定案）**：心智模型=五列是一个命令卡的五种形态 → 布局改三级（灵动岛 → 三列局势墙 任务/战场/战报 → **底部命令调度条** war-dispatch 单行横滚，Dispatch 调度中心隐喻）；**命令卡成唯一详情入口**（上方三列卡点击经 lineageMap 路由到源命令 CommandDetail，孤儿卡才降级旧 TaskDetail/SessionDetail）；CommandDetail 增「相关会话」段（参谋讨论会话+全部执行会话，war-cd-sessions）+ focusSegment 分段直达（plan/chain/report，收件箱路由升级）；战报合并成功+失败单列纯时间序（按天分组删除——单组组头是噪音）；悬停自动滚动扩域横轴（`.war-dispatch .war-rel-same`，漏横滚容器是真 bug，shoot 抓到）。战场游戏化=未来候选。决策录 DESIGN.md V9 节。**V9.2 岛改版+定时下达（2026-08-25，元首点单 + critique 23/40 全项修复）**：聚焦不弹岛（pill 中间聚焦 chip + 点空白退出）；岛只留 ⚙ 设置抽屉（皮肤/图例/行为开关/SSE 状态，localStorage 持久化；挂载入口退役、API 保留）；调度坞左端钉驻 [＋下达][铭牌]；起草器重设计（lead+档位/时机选项卡+cron 预设+下次触发预览+Ctrl+Enter）；**定时命令真闭环**（directive cron → 30s tick 补 dispatched → 引信常轨；`dueScheduledDirectives` 纯函数，schedule.ts 双端复用）；对比度 2.79→6.67:1 shoot 机检。决策录 DESIGN.md V9.2 节（含 styles.ts 双模板串坑 + python-heredoc 丢文件事故）。**V9.3 复评整改（2026-08-26，critique 23→27 后全项修）**：warn 行内文本对比度批修（shoot 四选择器机检 5.86-6.96:1）＋ 五弹窗 `useModalLayer`（dialog 语义/焦点移入归还/Tab 圈禁）＋ Esc 层协调器 `escLayers` 栈（只关最顶层——修复聚焦+弹窗叠加关错层）＋ approved 空链给中性「任务待发布」＋ 败因只挂最新失败尝试 ＋ 批准决策块（一键保留+后果一句话，元首定）＋ 非零收件箱岛染警示（元首定）。styles.ts 双模板串坑连踩两次——verify 永久针脚断言 querySelector 模板闭合完整。决策录 DESIGN.md V9.3 节。**V9.4-9.7 容器化 + critique 冲刺（2026-08-26，goal 驱动五轮）**：调度坞容器化（去铭牌/＋瓦片/track 轨道/动态渐隐）→ 统一命令卡点击（详情唯一叙事中心+进入对话 chip）→ 草稿持久化 + n 快捷键 + inbox 去重 → P0 keyActivate 嵌套劫持 + hover 竞态 + 语义色 token 回退 → ResizeObserver/图例对比度/war-report 双身份清账/词典正名。**critique 趋势 23→27→29→35/40**（双子代理五轮，快照 `.impeccable/critique/`）；shoot 增 drain guard（清盘后折叠缓存竞态）。CSS 追加锚点标记立入 styles.ts（双模板串坑共踩四次，针脚四次拦截）。决策录 DESIGN.md V9.4-9.7 节。**V9.8 命令详情重构（2026-08-26，元首三答：单列+阶段导航/决策带置顶/明细默认收起）**：标题=命令原话（ID 降副行）；「等你发落」决策带置顶常驻（与收件箱四类同源，无事给安神行）；①命令②任务③执行④战报四段竖排故事线（sticky 阶段导航=生命条放大，滚动高亮；段头写结论）；证据/分诊理由/改档折叠为摘要行（原生 details）。决策录 DESIGN.md V9.8 节。**V9.9 聚焦页（2026-08-26，元首重定义：主界面=全生命周期监控版，详情页=一条命令的聚焦导览）**：CommandDetail→FocusPage 重写（四段=主界面卡片拉进窗口、卡下原地展开子详情、底部任务会话/执行会话双跳钮）；阶段导航反映真实在场卡片（approved 空链 task 不再点亮）；点击接线全面梳理（TaskDetail/SessionDetail/死 helper 全删，孤儿卡直跳会话）。verify 173 测 PASS + shoot 全绿（v9-focus-config/report 取证）。决策录 DESIGN.md V9.9 节。**V9.10 聚焦页状态机补全（2026-08-26，元首 goal，源自 12 态×4 段审计）**：删 ①②③④ 跳转导航与滚动高亮（focusSegment 直滚保留、段头去编号）；任务段 12 态状态机——drafting/talking(warn)/plan 三 ghost 变体 + 定时待发/转达中/待发布/已取消灰提示分岔（无卡态不说谎）+ 链卡展开补任务书/验收标准/去处理；配置展开加改档（L0/L1/L2，regradeCommand 写路由）；战报展开补战利品+历次作战（逐次可跳）+去处理。verify 173 测 PASS（负断言 war-cd-step）+ shoot 全绿（Phase G6 talking/cancelled/scheduled+定时下达全程）+ 目检 v9-focus-talking/report 双截图落 `.goal/evidence/v7/`。决策录 DESIGN.md V9.10 节。**V9.11 卡位模型 + demo 升级 + V9.12 审查整改 + V9.13 色彩系统（2026-08-26）**：V9.11 卡位模型（label-primary/secondary/tertiary 三级文本 + 卡位语义，DESIGN.md V9.11 两节）；V9.12 三轮对抗审查整改（事件流复活 parseUnitReportEvent/演示精修九项/SPEC v8 回填，a4ef135/847947e/478c801）；V9.13 色彩系统重设计（styles.ts v4.0 全量重写：`--war-*` 语义令牌层单开关跟随宿主 body[data-ds-dark-theme]、容器海拔四级 canvas→zone→card→well/pop——浅色宿主层塌缩自建灰画布分层/深色各落宿主海拔一层、状态四档语义 蓝=机器在动/琥珀=等你/绿=善终/红=败、浅色压黑深色原值各自成章不机械反转、--war-focus 补宿主不存在的焦点环 alias；取证 `scripts/shoot-theme.py` 双主题 10 对对比度+层梯断言 20/20 全绿，决策录 DESIGN.md V9.13 节）。**V9.11 卡位模型+执行卡实时活动（2026-08-26，元首四条规则 goal）**：R1 任务列升格参谋侧台账（成形卡三变体置顶=`formingVariantOf` 与聚焦页 ghost 同源判定、任务书卡全量常驻+终局 `.settled` 调暗、生命条 reported 即进战报段——修「卡在战报列条停执行段」打架）；R2 执行卡实时活动行（`src/activity.ts` 动词映射器纯函数：step/tool-call→思考中/探索中/编辑中/运行命令…宿主 label 单点计算双皮肤同词；`ActivityTracker` 内存滚动表全量会话皆记；板投影 live attempt 带 `activity` 字段 + `boardRevision` 折动词盐只随动词变（SSE revision-only 不破）；SessionCard `.war-activity` 呼吸点行）。**坑：宿主 SessionEvent 载荷在 `.data` 下**（读顶层 name 会全落「执行中·tool」兜底）；**同族疑似遗留挂账**：`registerReportCapture` 读顶层 `event.source?.kind` 疑似常年不触发，待独立验证轮。真链取证 `scripts/shoot-activity.py`（L0 直发真命令轮询动词）。决策录 DESIGN.md V9.11 节。**V9.11 后半：指示器跟卡走+战报已阅转绿+demo 织换（2026-08-26）**：成形卡在列即任务段、唯 scheduled/未接令停命令段；seen=localStorage `warroom-report-seen` 晚于 `latestSettleMs` 才作数；`src/demo-weave.ts` 开机假会话号→宿主真会话（manifest `.demo-sessions.json`、幂等标记 `.demo-woven.json`、会话建 currentRoot）。决策录 DESIGN.md V9.11 demo 节。**V9.12 审查整改（2026-08-26，元首 goal：第一性原理对抗审查三轮）**：R1 `src/report-capture.ts` parseUnitReportEvent 纯函数复活战报自动记账（嵌套 .data 优先/扁平退回/坏形状 null；顺带证实 V9.11 挂账：顶层读法确实全灭）+ ActivityTracker 驱逐改最旧 ts；R2 演示精修九项——去验收/去下重试令正名（负针脚旧「去处理 · 参谋会话」）、seen 三通道（段直达|点开展开|≥60%+800ms 停留）、weave 三级复用（**`.demo-real-map.json` 真号映射重播幸存是唯一可靠通道**——冷列表注入期拿不到重命名标题）+真实目录守卫 REFUSED、种子每命令独立参谋会话 sec-d0…d13、d8 cron 远期 12 月 1 日、jumpSession 300ms 无操作检测冒板级警示、任务列按源命令 createdAt 倒序、取证脚本入库（shoot-composer/triage-probe/probe-card-coverage）。P3 挂账不改：并行 callId 有损/时钟偏差/板全量重读。verify 195 测；shoot 含 seen 三通道时序断言；探针 17 reused 0 created、staffSessionId 12 互异、32/32 卡全开聚焦页。决策录 DESIGN.md V9.12 节。
- **flags 默认全开政策（元首定，2026-08-25）**：开发期所有功能旗默认 on（`src/flags.ts` DEFAULT_ON_FLAGS + `runtimeFlags`），新功能**不再设旗**直接默认开；`WARROOM_FEATURES` 仅用于 `!name` 关闭个别旗或 opt-in `v5-spike`。正式版发布后恢复「每能力一 flag」流程。单测仍用 `readFeatureFlags`（纯显式，确定性）。
- **v5-spike 探针定案保留**（2026-08-25，非一次性脚手架）：它是唯一能在运行时复检宿主面结构契约的工具（goals/sessions/agents 可达性、toolFilter 接受性、错误面 code）。flag 默认 off、路由缺省不注册（404）、off 时零成本——保留不碍事，删了就要靠考古 R1 证据。宿主 deepseek-harness 升级后：`WARROOM_FEATURES=v5-spike` 起服 + `GET /warroom/api/v5-spike` 一键复检（probe 会话/goal 用后即清，见 K15 残留自愈）。
- 考题残留可清：`C:/Users/kaiji/vibecodingKJ/temp/exam-wsA`、`exam-wsB`、`exam-v3-ws`；`scripts/seed-smoke.ts --clear` 可重置演示数据。
- **模拟作战室（playground）协议（2026-08-25 起，元首要常驻演示板）**：给元首把玩 UI/操作的演示板。必须**停服 → 播种 → 起服**三步：运行中的服务器会用内存旧态落盘覆盖种子（已实测：起服后播种，几分钟后 directives.jsonl 被清空、板变空）。播种命令 `python scripts/seed-playground.py`（只动隔离 `.smoke-state`，与 shoot-v7.py Phase 0+C 同源：全要素演示板 + L1 计划待批命令），然后按本地起服节重启 cordis.smoke.yml 服。验证：`GET /warroom/api/board` 应返回 commands 非空且 3 分钟不消失。
- **CHANGELOG 纪律（2026-08-30 元首令，固化）**：每个版本交付必须在 `CHANGELOG.md` 顶层 `[Unreleased]` 下记一条——Keep a Changelog 1.1 格式（Added/Changed/Fixed/Removed 分组，一条=一项用户/开发者可感变化，验收证据随条目附注），风格参照 `LookatStudy/CHANGELOG.md`；**版本号一律 0.x.y**（`0.<里程碑>.<刀数>`，如 0.18.9——元首令 2026-08-30：pre-1.0 用 0 前缀区分正式版）；发布时把 `[Unreleased]` 改为版本号+日期。README 不维护版本史，只留指向 CHANGELOG 的链接。
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
| LLM 监督层 | **有（2026-08-24 整改）**——promptfoo（`eval/`，裁判 glm-5.2+隔离提示词，三维≥7+一票否决）；门命令 `pnpm verify:eval`，无网关环境变量时**显式 SKIP** |
| 实弹考题端到端门 | **有（2026-08-29 V16.3）**——`pnpm verify:e2e`（run-e2e.mjs：五段驱动+assert-e2e 机检 C1-C8；真实 LLM 两代续接链；前置=smoke 服已起否则诚实 SKIP；tag 定位不清场；证据 .goal/evidence/e2e/ 不入 git） | `eval/README.md`、`scripts/run-eval.mjs` |
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
