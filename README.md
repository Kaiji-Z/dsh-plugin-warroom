# dsh-plugin-warroom · 作战室

RTS 思维的 vibecoding 编排插件（DeepSeek Harness / dsh）：**你是元首，只在指挥中心下大白话命令；贴身参谋把每道命令转成带验收标准的任务书；按工作区征召的指挥官带多 agent 部队自主作战。作战室不是替代 thread，而是元首管理多 thread 的另一种工作方式。**

```
┌─ 灵动岛（收件箱 / 到访摘要 / 聚焦 / ＋下达 / ⚙ 设置）──────────────────────┐
├─ 三列局势墙 ──────────────────────────────────────────────────────────────┤
│  任务（参谋侧台账）     │  战场（进行中·实时活动）   │  战报（成功+失败）     │
│  接令起成形卡→任务书卡   │  执行会话卡+动词活动行     │  纯时间序·已阅转绿     │
├─ 底部命令调度条（全部命令卡横滚，活跃优先）────────────────────────────────┤
└───────────────────────────────────────────────────────────────────────────┘
  点任何卡 → 聚焦页：一条命令的全生命周期导览（命令→任务→执行→战报四段故事线）
```

```
命令(＋下达/大白话/n 快捷键) ──tickNow秒级──▶ 参谋分诊（war_triage）
   │ L0 !!直接做：全自动直发   │ L1 默认：计划呈批（等你发落）   │ L2 ??先看方案：对话收敛
   ▼                                 │
 参谋·<命令>会话 ──任务书/分页决策卡──▶ 元首批准 ──▶ war_publish（或 war_decompose 拆 deps 链）
                                                                    │
        按工作区征召：同区互斥排队、跨区并行；@new:<名字> 开新副本；cron 定时命令到点自动出发
                                                                    │
        指挥官 = 顶层 apiProxy 会话（沙箱根=任务工作区，征召令含 persona+履历档案）
                    │ war_deploy_unit（兵种/工具边界/战区）
                    ▼
        部队 = continuable 子代理（侦察/工程/卫生/宣传……TOML 可扩编）
                    │ KillCredit 提交（checks+测试退出码）或 war_fail（败因）
                    ▼
        attemptLog：会话卡落「已完成」（战利品摘要）或「已失败」（败因一行）
                    reported → 元首「去验收」回参谋会话收官/打回；全绿自动收官（AFK）
```

## 看板要点（V7-V9）

- **到访式工作流**：板子不是常驻盯的仪表盘，是一天到访两三次的指挥所——收件箱四类待发落（答澄清/批计划/翻战报/决重试）、到访摘要卡（自上次看过以来的 delta）、悬停族系高亮+聚焦模式、「为什么还没动」解释行。
- **命令卡 = 唯一详情入口**：三列任何卡点击经 lineage 路由到源命令的聚焦页；聚焦页任务段 12 态状态机（成形卡三变体/灰提示分岔/链卡），战报段收官结论+证据+战利品+历次作战。
- **执行卡实时活动**：宿主会话事件映射成动词行（思考中/探索中/编辑中/命令完成…），不用跳会话就知道部队在干嘛。
- **三档自主度 + 定时命令**：起草器选项卡选档/选时机，cron 预设+下次触发预览；L1 计划半夜呈批是「夜间真敌人」——下达后说清后果+给改直发出口。
- **明暗双主题色彩系统**：`--war-*` 语义令牌层单开关跟随宿主；容器海拔四级（画布→区→卡→凹槽）；状态四档语义（蓝=机器在动 / 琥珀=等你 / 绿=善终 / 红=败）；对比度双主题机检 ≥4.5:1。
- **挂载外部会话**：其他插件/任意 dsh 会话可挂进战场（API `POST /warroom/api/threads`），带「外部」徽标、可摘除。
- **SSE 实时 + dock 回家键**：板数据 revision 门控实时刷新；dock pill 重开板带未读徽记。

## 用法

```
侧边栏 →「作战室」→ 调度条 ＋ 下达（或 n 快捷键）   # 主入口：下大白话命令
/war                                                # 或激活作战室
```

参谋按**悬赏令起草法**处理：听懂意图 → 需要澄清就出**分页决策卡**（元首点命令卡进会话应答——卡片等待期间打字不推进，要点卡）→ `war_publish` 携 commandId 发布 → 指挥官应征作战 → 战报回呈 → 收官/打回；KillCredit 机械全绿时自动收官。

任务书支持：quality 五档品质 / deps 任务链依赖 / cron 日常任务（错过即跳过）。

## 兵种扩编（TOML 定义）

项目级 `.warroom/units/*.toml` 覆盖个人级 `~/.dsh/warroom-plugin/units/*.toml` 覆盖内置兵种：

```toml
name = 'artillery'
label = '炮兵'
description = '大范围重构'
developer_instructions = '你是炮兵：承担大规模重构任务……'
sandbox_mode = 'workspace-write'   # read-only | workspace-write | danger-full-access
# 可选：部队级 LLM 路由（成对出现）
# provider = 'glm'
# model = 'glm-5.2-air'
```

> 开发期 feature flags **默认全开**（`WARROOM_FEATURES` 仅用于 `!name` 关闭个别旗或 opt-in `v5-spike` 探针）；正式版发布后恢复「每能力一 flag」流程。

## 状态与恢复

- 战役事件日志（append-only JSONL）：`$DSH_HOME/warroom-plugin/campaigns/<campaignId>.jsonl`，状态由 fold 派生，崩溃可恢复、战后可复盘。
- 命令区事件（append-only）：`$DSH_HOME/warroom-plugin/directives.jsonl`（含每命令会话绑定 `directive_session_opened`、cron 定时）。
- 挂载会话事件（append-only）：`$DSH_HOME/warroom-plugin/threads.jsonl`。
- 履历档案：`$DSH_HOME/warroom-plugin/dossiers/<workspace>-<hash>.md`。
- 全局开关：`$DSH_HOME/warroom-plugin/state.json`。

## 安装 / 开发

```
dsh plugin add dsh-plugin-warroom          # npm（发布后）
dsh plugin add ./dsh-plugin-warroom-0.1.0.tgz

# 本地开发（在 deepseek-harness checkout 内）：
pnpm install && pnpm verify
pnpm dsh --profile web --patch D:/.../dsh-plugin-warroom/cordis.dev.yml --port 3080 --no-open
```

> Windows 本地开发注意：`pnpm add file:` 装不进 profile 时用 junction（`mklink /J`）+ 手动 package.json 依赖绕过；`dsh web --patch` 旗标顺序无效，必须 `dsh --profile web --patch ...`。

## 版本史

| 版本 | 一句话 | 验收 |
|---|---|---|
| v1.0 悬赏令 | 参谋起草 / KillCredit / 失败自愈 / cron / SSE | c67e74e |
| v2.0 五分区悬赏板 | 命令区生命周期 / 多指挥官并行 / 履历档案 / `@new:` | 2026-08-24 |
| v3 两区指挥中心 | 每命令一参谋会话 / 纯跳转判定 / 挂载外部会话 | 真实 LLM 八步考题 |
| v4 指挥部队内协作 | 部队级模型路由 / 队内邮箱 / 任务图调度 / park 换手 | 机检 6/6 |
| v5 参谋自动化（AFK） | 三档自主度 / 计划呈批 / goal 代管 / 全绿自动收官 / 配额熔断 | assert-v5 PASS |
| V6 增量 | 计划判定回推 / 双皮肤 / 命令拆链 / 三区看板+全生命周期 | 877f197 |
| V7 到访式工作流 | 收件箱 / 到访摘要 / 族系悬停+聚焦 / 夜间预检 / 空板引导 | 160 测+shoot |
| V8 hero 灵动岛 | 胶囊岛收编操作件 / 三区视觉大容器 / 悬停自动滚动 | b121d52 |
| V9 命令调度中心 | 三级布局 / 命令卡唯一详情入口 / 战报合并时间序 | 36e1eea |
| V9.2-V9.10 | 定时命令闭环 / a11y 整改 / 容器化美化（critique 35/40）/ 聚焦页 / 12 态状态机 | 各轮 verify+shoot |
| V9.11 卡位模型 | 任务列台账 / 实时活动行 / 战报已阅转绿 / demo 织换器 | 182 测 |
| V9.12 审查整改 | 事件流复活 / 演示精修九项 / SPEC v8 | 195 测+三探针 |
| **V9.13 色彩系统** | `--war-*` 语义令牌层双主题 / 海拔四级 / 状态四档语义 / 选中态三通道 / border-box 复位 | **203 测 + shoot-theme 20/20（版本收口）** |
| V10-V10.1 | 命令续接三模式（deepen/retry/pivot）/ 世代徽标+族谱面包屑 / 星域 TITP 化（board 级铺满+贴边浮舱+卡牌组） | 各轮 verify+shoot |
| V11-V11.5 | 3D 星域战场（NASA 星球/母舰 HQ/编队相位/雷达值班）→ warzone 真实板数据驱动连线 | probe-bridge 14/14 |
| V12-V12.2 | 浅色范式（天空/浮空岛）→ 语义 token 化全项目重铸（三层令牌 + war-tokens.ts 唯一色源 + critique 35/40） | 228 测 + theme 20/20 |
| **V13 战线一等公民** | **血脉≠战线（战线=血脉∩战场，续代跨战场=新战线）** / 任务列战线分组 / 调度坞按段分组 / 星域世代环+未分组行星 / 纯前端零后端 | **235 测 + shoot-v13 12 断言（拆段双证）+ probe 40/40** |
| **V14 战线范式收口** | **血脉除名——战场⊃战线⊃命令** / 聚焦页本地计代+溯源 chip / 链色绑战线 / composer 显式战场选择（续接带父战场）/ 点战场看战线清单 / 写侧引导 | **239 测 + V14 七针脚 + 五 shooter 全绿** |
| **V15 续接闭环+战场正名+战线命名** | 链档案三档注入（staff 1500/征召令 600/pivot 400：上代战报+产物路径+diffstat）/ workspaceKind 投影（kind 感知战场键，auto-worktree 归未分组治误判）/ 战线命名（下达时可选 ≤24 字，name??原文，本轮不可改） | **verify+V15 六针脚 + shoot-v13 命名断言 + 五 shooter 全绿** |

**后续候选**：路由冷恢复桥、调度轮转优化、飞书遥控、git worktree 隔离、战绩/声望、多参谋、战场游戏化、npm 发布（release.mjs + OIDC）。

规格书与坑录见 `.goal/SPEC.md`（现为 v9）；实现决策录 `DESIGN.md`（改 UI 前必读）；给迭代 agent 的开局指引 `AGENTS.md`；验证协议正本 `VERIFICATION.md`。历史规格归档 `.goal/SPEC-v1.md` … `SPEC-v5.md`。
