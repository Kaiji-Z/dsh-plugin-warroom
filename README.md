# dsh-plugin-warroom · 作战室

RTS 思维的 vibecoding 编排插件（DeepSeek Harness / dsh）：**你是元首，只在「指挥中心」下大白话命令；贴身参谋把每道命令转成带验收标准的任务书；按工作区征召的司令带多 agent 部队自主作战。作战室不是替代 thread，而是元首管理多 thread 的另一种工作方式。**

```
┌────── 左区 · 指挥中心（一切输入） ──────────────┬────── 右区 · 战场（只读 + 跳转） ──────────────┐
│ 命令列：+ 下达 → 每命令一个参谋会话              │ 进行中 │ 已完成(按日折叠) │ 已失败              │
│ 任务列：悬赏卡 →「去处理」直达参谋会话裁决        │ 点卡 = 只读详情浮层 →「进入会话复盘」跳 thread  │
└────────────────────────────────────────────┴────────────────────────────────────────────┘
```

```
命令(+号/大白话) ──tickNow秒级──▶ 参谋·<命令>会话 ──任务书/分页决策卡──▶ 元首点卡批准
                                                                    │ war_publish(commandId)
                                                                    ▼
        按工作区征召：同区互斥排队、跨区并行；@new:<名字> 开新副本
                                                                    │
        司令 = 顶层 apiProxy 会话（沙箱根=任务工作区，征召令含 persona+履历档案）
                    │ war_deploy_unit（兵种/工具边界/战区）
                    ▼
        部队 = continuable 子代理（侦察/工程/卫生/宣传……TOML 可扩编）
                    │ KillCredit 提交（checks+测试退出码）或 war_fail（败因）
                    ▼
        attemptLog：会话卡落「已完成」（战利品摘要）或「已失败」（败因一行）
                    reported → 元首「去处理」回参谋会话收官/打回
```

## v3 核心概念（两区指挥中心）

- **指挥中心（左区）= 唯一输入面**：命令列 `+` 下达、任务列悬赏与裁决入口都在这里；**战场（右区）是读投影**——只看结果与跳转，浏览器端不提供改任务的写操作（唯一例外：⌁ 挂载外部会话，append-only 事件入账）。
- **每命令一个参谋会话**：下达即建独立会话（`参谋·<命令摘要>`），秒级接收（tickNow）；点 received/talking 命令卡直达**该命令的**会话。无常驻「参谋部」入口——命令卡就是入口。
- **判定 = 纯跳转**：任务 reported/failed 时卡上出「去处理」→ 直达所属命令的参谋会话，打字收官或打回；战场卡点击是**详情优先**浮层（任务书/战报/KillCredit/战利品），浮层内「进入会话复盘」跳 thread 复盘。
- **挂载外部会话**：其他插件/任意 dsh 会话可挂进战场（`⌁ 挂载` + sessionId + 备注），带「外部」徽标展示、可摘除——与其他插件共存不互斥。
- **多司令并行 + KillCredit + 履历档案**（承 v2）：同工作区互斥排队、跨区并行；提交必须带逐条证据；司令退任落盘 dossier，同区下任自动携带。
- **SSE 实时 + dock 回家键**：板数据 revision 门控实时刷新；dock pill 可点击重开板并带未读徽记（received/reported/failed 新增计数）。
- **已完成按日折叠**（今天/昨天/更早），历史不淹没视野。

## 用法

```
侧边栏 →「作战室」→ 指挥中心 + 号        # 主入口：下大白话命令
/war                                    # 或激活作战室
```

参谋按**悬赏令起草法**处理：听懂意图 → 需要澄清就出**分页决策卡**（工作区路由、任务书批准；元首点命令卡进会话应答——卡片等待期间打字不推进，要点卡）→ `war_publish` 携 commandId 发布 → 命令卡自动翻「已批准」并链接任务 → 司令应征作战 → 战报回呈 → 元首「去处理」收官。

任务书支持：quality 五档品质 / deps 任务链依赖 / cron 日常任务（错过即跳过）。

## 兵种扩编（TOML 定义）

项目级 `.warroom/units/*.toml` 覆盖个人级 `~/.dsh/warroom-plugin/units/*.toml` 覆盖内置兵种：

```toml
name = 'artillery'
label = '炮兵'
description = '大范围重构'
developer_instructions = '你是炮兵：承担大规模重构任务……'
sandbox_mode = 'workspace-write'   # read-only | workspace-write | danger-full-access
# 可选：部队级 LLM 路由（V4，成对出现；需 WARROOM_FEATURES=troop-llm-routing 生效）
# provider = 'glm'
# model = 'glm-5.2-air'
```

## 状态与恢复

- 战役事件日志（append-only JSONL）：`$DSH_HOME/warroom-plugin/campaigns/<campaignId>.jsonl`，状态由 fold 派生，崩溃可恢复、战后可复盘。
- 命令区事件（append-only）：`$DSH_HOME/warroom-plugin/directives.jsonl`（含每命令会话绑定 `directive_session_opened`）。
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

## 状态与路线

- **v1.0（悬赏令）**：参谋起草 / KillCredit / 失败自愈 / cron / SSE / 侧栏入口 —— 已验收（c67e74e）。
- **v2.0（五分区悬赏板 + 多司令）**：命令区生命周期 / 按工作区征召并行 / attempt 级会话卡 / 履历档案 / 新副本 `@new:` / 会话跳转 —— 已现场验收（2026-08-24，证据 `.goal/evidence/v2/`）。
- **v3（两区指挥中心）**：指挥中心/战场分区、每命令一个参谋会话、tickNow 秒级接收、纯跳转判定（详情浮层 + 去处理）、挂载外部会话、dock 回家键 + 未读、按日折叠 —— 已现场验收（2026-08-24，真实 LLM 八步考题，证据 `.goal/evidence/v3/`）。
- **v4（司令部队内协作）**：部队级模型路由（`troop-llm-routing`）+ 部队直讯+邮箱（`troop-mailbox`）+ 队内任务图+认领调度（`troop-scheduler`）+ park/换手/冷恢复（`troop-park`）——四大能力全部 feature flag 化（`WARROOM_FEATURES`，缺省 off == 改前行为），已现场验收（2026-08-24 真实 LLM 全链考题，机检 6/6，证据 `.goal/evidence/v4/`）。
- **v5（参谋自动化/AFK）进行中**：三档自主度（L0 全自动默认 / L1 计划呈批 / L2 对话收敛，命令可覆写档位）+ 计划态与 goal 的插件代管（宿主原生服务）+ KillCredit 全绿自动收官 + 配额耗尽自动恢复续作。
- **后续候选**：命令拆解、路由冷恢复桥、调度轮转优化、飞书遥控、git worktree 隔离、战绩/声望系统、多参谋、README 配套发布（release.mjs + OIDC）、起草法全文内嵌 relay（apiProxy 会话看不到编程注册技能，见 SPEC 坑录）。

规格书与坑录见 `.goal/SPEC.md`（§7 坑录）；v1/v2 规格存档 `.goal/SPEC-v1.md` / `SPEC-v2.md`；给迭代 agent 的开局指引见 `AGENTS.md`。
