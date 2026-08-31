# Changelog

本仓库所有面向用户与开发者的显著变化都记录在此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。版本号 **v0.x.y-N**：
`v0.<里程碑>.<迭代>-<刀数>`（如 v0.18.9-6 = 第 18 里程碑、第 9 迭代、第 6 刀）。
尚未 1.0，不承诺 semver 兼容，但版本单调递增，正观感与 LookatStudy 等同好仓库一致。
package.json 落地时去 v 前缀（`0.18.9-6`，semver 预发布段承载刀数）。

记录约定：
- 每个版本一组，变化按 `Added` / `Changed` / `Fixed` / `Removed` 分组。
- 一条 = 一项用户或开发者可感的变化；纯构建胶水/内部重构折成一行 internal。
- 同头版本内的多条刀改以条目尾注（0.18.9-N）区分，不另立头。
- 验收证据（测试数 / shooter / 探针）随条目附注，是本项目的交付纪律。
- **发版门**：平时交付只在 `[Unreleased]` 积条目，版本号（package.json 与版本头）保持不动；明说「发版」时才落版本头、推进版本号。

## [Unreleased]

### Changed
- **所有回报强制人工验收（舰长令 2026-09-01）** —— `staff-auto-close` 移出默认开清单：KillCredit 证据机械全绿也不再自动收官，任务一律停在 `reported` 等舰长定夺（收件箱「等你定夺」承接）。机制保留为 opt-in（env 显式开，或新增 `config.extraFeatures` 装配层附加旗——smoke overlay 即用此法，e2e 考题 C1b/C8 继续覆盖收官机制本身）；env `!name` 仍可压掉 extra。新增 2 组旗测试锁死新默认（含 DEFAULT_ON 不含 staff-auto-close 断言）。

### Fixed
- **CI OIDC 发版流水线首跑打通（0.20.0 发版过程修复）** —— 两坑：①CI linux 上 `pnpm install` 撞 `onnxruntime-node` 构建脚本严格审批（promptfoo optional 原生链）——`allowBuilds` 显式补 false；②测试套首次在 linux 上跑，五处 Windows 路径假设平台参数化（工作区大小写归一仅 win/darwin、越界外部路径 posix 用 `/` 绝对式——语义零改动，win 本机 292 全绿 + linux CI 全绿双验证）。流水线自此从手动发布转 release.mjs 一条命令自动发。

## [0.20.0] - 2026-09-01

本批（B1+B2，goal 驱动两轮）：后端本职六件全交付并实弹验证（板读缓存/trace 端点/
装配层测试/提示词资产化+快照门/生命周期闭环/工作区收官清理）；提示词最小充分审查
（契约修正+重写收敛，实弹全链 90 秒闭环）；验证体系三层齐装——监督层首弹实弹过门。

### Added
- **监督层首次实弹过门（B2 后置轮，2026-08-24 挂账清账）** —— 裁判 glm-5.2 接真网关（LookatStudy `.env` 的 z.ai 兼容端点映射 OPENAI_*）：`pnpm verify:eval` 2/2 PASS——正向（R3 八步真实轨迹）10/8/10 无否决（裁判对模糊时间戳/概述描述实质扣分，≥7 门实证真严）；负向（幽灵战报）一票否决四条全中。配套三修：provider `passthrough.thinking.type=disabled`（z.ai 网关 glm-5.2 默认开 thinking 吃光输出预算致判决 JSON 截断——promptfoo config 不透传任意字段必须走 passthrough）；断言双向收紧（无 `{"achieve"` 真 JSON 即 FAIL 防空输出假阳性）+ 抽取取最后段防花括号误配；R3 正向夹具战报补全五条验收逐条判定（对齐真实 war_submit evidence.checks 逐项行为；判据通过条件原样未放宽，负向用例一字未动）。坑录与首跑分数入 eval/README.md，AGENTS P1 挂账同步清账，取证 `.goal/evidence/b2-live/`。
- **提示词最小充分审查（B2，重写收敛尺度）** —— 审查正本 `.goal/SPEC-B2.md`（23 份资产逐份裁决表：18 份快照资产 + troop 五件新入册）。**契约修正×3**：分诊/计划/拆解的教学参数名 `command_id`→`commandId`（对齐 war_triage/war_plan/war_decompose schema——旧教学会被 additionalProperties:false 剥参、靠模型自纠空转）；新增契约一致性机检测试（四处 camelCase 逐字断言 + snake_case 负断言）。**重写收敛**：起草法 4292→3720（-13%，锁定针脚全保）、大副条令 2724→2558、外勤条令 3078→2913（出口协议段零触碰）；旧 18 份总量 33812→31430（**-7.1%**），单发最大注入（大副全量）6495→5920（-8.9%）。**实弹行为回归全链 90 秒闭环**：下达→分诊一次到位（L0/0.95）→发布→领取→submit 三项证据→KillCredit 全绿收官，零重试零纠偏（取证 `.goal/evidence/b2-live/`）；监督层 verify:eval 显式 SKIP（GLM 网关未接）。全量 292/292 绿。
- **板读路径 mtime 指纹缓存（B1-件③）** —— campaigns/directives/threads/planets 四路 JSONL 装载此前每次全量重读重解析（板请求、引信 tick、SSE 周期全是 O(总事件数) 磁盘读）；新 `src/fold-cache.ts` 进程内 mtime+size 指纹缓存（与 boardRevision 同判据：append 必变 size），未变更零重读、append 即失效。读计数器单测 5 例（tests/fold-cache.test.ts）；全量 252 测全绿（基线 247）。
- **命令追踪端点 `GET /warroom/api/trace?commandId=<id>`（B1-件②）** —— VERIFICATION.md §8 P2 挂账兑现：单命令全事件时间线（directive + campaign 原始事件）+ 板投影任务面（attemptLog/queueAhead/quotaPaused）+ 引信视角（待转达/定时未发）+ 征召视角（spawned 守卫、去抖拒因——「为什么还没动」机器可查）。只读调试面，板读投影红线不动；三态专测 5 例（tests/trace-endpoint.test.ts），全量 257 测全绿。
- **装配层与新路由测试补强（B1-件④）** —— 此前零覆盖的四块补齐 19 例：征召器装配层（满编门/spawn-once 守卫/孤儿会话复用/工作区占用排队/patrolNow 补征——`createConscriptor` 开测试出口、`patrolNow` 改可 await）；dashboard 新路由（**archive 不可逆写通道六态**：面缺席 501/缺参 400/未知 404/已归档 400/链未终局 400/全成落账 + 部分失败如实 + 全败 502；host-sessions、host-workspaces、planets POST）；planets 注册库纯函数；state tiny-pointer。全量 276 测全绿。
- **提示词单一资产源 + 快照门禁（B1-件①）** —— 宿主侧提示词模板正文从 relay.ts/index.ts 的散落字面量收拢进 `src/prompts.ts`（征召令 relayPromptFor/转达 pivotPromptFor/战线档案段 chainArchiveSection/外勤征召令组装 commanderOrderFor；persona/skill/chain-note 经其汇出）；`tests/prompts-snapshot.test.ts` 全文快照门——**改任何措辞必须显式再生成 fixtures 并随改动评审**（`WARROOM_UPDATE_SNAPSHOTS=1`），verify 另加源级负针脚（relay/index 长文案字面量清零）；**出口协议段（war_claim 令牌/war_submit/war_fail/war_comment/KillCredit）点名断言为不可裁剪内容**。纪律条目固化 AGENTS.md。17 份快照 fixtures；全量 279 测全绿。
- **worktree 收官清理（B1-件⑥）** —— auto+repo 分支的 linked worktree 此前只建不清（`.warroom/tasks/` 下 detached worktree 无限堆积）；现随**链归档** best-effort 释放（触发点定案=归档而非任务终态：任务产出活在 worktree 里，直接终态即删会摧毁 deliverables 与续接前情）。`workspace.ts releaseTaskWorkspace` 三道保险（物化根 tasks/ 路径范围 / linked worktree 判据 / 主仓 remove --force 失败留置），bound/instance/普通目录永不触碰；成败都落 `workspace_released` 事件（fold 投影 workspaceReleased）并随归档响应如实返回。真 git 仓实跑单测 5 例；全量 284 测全绿。
- **会话生命周期闭环（B1-件⑤）** —— 三断点补齐：①孤儿会话 GC——任务终态（收官/败局用尽）清征召器内存表，`CommanderOps.forget` 接线；②孤儿落盘 `orphans.json`（tiny-pointer 同 state.json 先例）——插件重启不再失忆、旧孤儿会话不再变永久垃圾；③**in_progress 死会话 rescue**（V10.1 挂账兑现）——90s 巡检对「claimer 无活体 agent 且未配额暂停」的搁浅任务先 `agents.resume` 续命（宿主源码考古证实：resume 存在、owner=agent 服务自持、持久队列自动重放）+ 续行提示入队（prompts.ts rescueNudgeFor，快照门覆盖）；resume 连败 ≥2 次才判死回栏（防 persistence 瞬时打嗝烧 attempt），面缺席只记拒因留置（trace 可见）。spike 报告 `.goal/evidence/b1-resume-spike.md`；生命周期单测 7 例；全量 291 测全绿（基线 247）。
- **B1 实弹验证轮（隔离 smoke 板，取证 `.goal/evidence/b1-live/`）** —— 杀服重启场景 rescue 首弹三发全中（3 条搁浅 in_progress 全部 resume 续行，二轮巡检静默零误回栏）；重派外勤经续行链真弹 **KillCredit 机械全绿自动收官**（验收 4 项全过/退出码 0/无越界）；trace 端点/SSE revision-only/征召拒因日志/终态 forget 落盘 orphans.json 全部 live 验证。实弹校准语义：宿主对已建会话保持活体 agent——「已建≠搁浅」，真正搁浅=重启后冷会话。

### Fixed
- **`pnpm install` 死于构建脚本占位符** —— d7614e4 误把 pnpm 引导的 `pnpm-workspace.yaml` 占位符（"set this to true or false"）提交入库，pnpm 11.7 安装一律 ERR_PNPM_IGNORED_BUILDS 失败、连带 `pnpm run`/verify 全挂；填成显式布尔（esbuild:true 维持，其余 false=维持从未构建的现状）后恢复。

## [0.19.0] - 2026-08-31

首次 npm 上架（手动首发，绑定 trusted publisher 后转 release.mjs 自动发版）。

### Fixed
- **浅色 3D「太阳中间一颗灰点」（元首实抓，像素取证四层剥洋葱）** —— 真因链：太阳球芯被 ACES 色调映射封顶在 ~0.9 灰白（229,229,229），而它的加法光晕在亮天上钳成纯白盘（255）且盘比球大——芯比自己的晕暗=灰点。终修：白昼隐藏晕 sprite（暖意交给 CSS 暖霞，家视图同位）；远景云漂过相机平面时投影除零把 opacity 永久污染成 NaN（不透明白云糊屏=白盘真身）——视空间前置检查+非有限跳过+中毒救回。
- **浅色天穹重做** —— 天顶 azure→天际暖白的真天穹梯度（旧 #c9e5f8→#f5faff 苍白如雾）；阳光斑弱化为暖霞（亮度压到太阳芯之下）；白晕影 .55→.3；雾色随新天际。
- **HQ 注册弹窗滚动结构** —— 旧整个弹窗滚（标题跟着清单跑）；改头部/提示定死+清单体内滚+节头 sticky（43 行清单滚到哪都知道身处哪组）。（元首实抓）

### Added
- **npm 发布机制就绪（参考 LookatStudy 同款）** —— `scripts/release.mjs` 一条命令发版（verify 门→净树门→bump→tag→push→轮询 npm；关键词双轨：milestone/major=里程碑、iteration/minor=迭代、knife/patch=刀）+ `.github/workflows/publish.yml` GitHub OIDC 可信发布（零 npm token 存储，v* tag 触发，普通 push 永不发版）。首次发布前需在 npmjs.com 预登记 pending publisher。

## [0.18.9-6] - 2026-08-30

### Changed
- **HQ 注册弹窗布局重排** —— 分组两段（已在星域 / 可注册）+ 两行行卡（星球名+操作在上、路径副行在下）+ 弹窗内滚；全套项目令牌，双主题随令牌适配。（0.18.9-4）

### Fixed
- **管线残留（元首实抓）** —— 悬停 pager 星球后，任何后续悬停（含空白处）都有管线赖着不走。根因：族系管网的 React 键用了裸 rootId，续接/拆解链一个根多条命令时撞键，生产版协调错乱把上一族的 `.on` 残留在 DOM。键改为「根：锚命令 id」；悬停同根多命令=多管同亮（族系语义不变）。（0.18.9-1）
- **管线审查整改五连（impeccable 双子代理实证）** —— ①族系去重一根一族：根坞卡缺席时画出的「穿空幽灵干线」除名；②组面板内历史卡不做锚：面板展开不再被管线垂直穿透；③沟带被面板全占时命令腿让位不画（不退化成斜线穿卡）；④任务→战报顶沟钳到列头下缘；⑤圆角弯头 rr 死代码修复（旧式恒 0——弯头自 V17 起从未渲染过）。附：定时 chip 暗色对比 4.17→≥4.5（前景下沉令牌层 `--war-sched-text`）；已归档空态渲染安神行而非空盒。probe-pipefix 8 断言 + shoot-v17 ⑧（8 paths / 0 穿卡）。（0.18.9-5）
- **浅色 3D 云二修** —— 远景云环路过画面正中时逐帧淡出（投影点距屏幕中心过近即隐身），八朝向扫描取证全净。（0.18.9-6）
- **HQ 注册弹窗「不是项目里的弹窗」（元首实抓）** —— 点击 HQ 后弹出的注册工作区面板裸渲染 `war-modal`，缺背板包装：无 fixed 定位、无遮罩、不居中，以文档流内联在星域容器里。补齐全项目统一的 背板 + 点击停传播 + 焦点圈 三件套。（0.18.9-3）

### Added
- **README 公开化 v2** —— 创作初衷成文（侧栏之痛 → 命令切入 → 星际迷航范式）+ GitHub 最佳实践结构 + docs/ 四张暗色实拍（星域/舰桥/起草器/聚焦页）。仓库公开发布：github.com/Kaiji-Z/dsh-plugin-warroom（MIT），`.goal/.impeccable/shots-v182` 过程目录转本地不入库，历史重写 362MB→1.9MB。

## [0.18.9] - 2026-08-30

### Changed
- **起草器视觉精修（impeccable 口径）** —— 区块标题收成 mini-header（上 16 下 6 呼吸节奏）；闹钟簇（模式+时刻+预览+高级）包进 well 面板读成一个单位；输入件底色一族一致；sticky 提交条与弹窗面接缝消除。

### Fixed
- **浅色 3D 四连（元首实测五条令）** —— ①云层推远景环 950-1500（结构上不可能再遮挡）+ 积云剪影贴图；②浅色铭牌白描边垫底+深墨填色（地图标签术），任何背景可读；③浅色 HQ 重制为天空旗舰（暗色星舰同轮廓同契约，白昼材质语系：实色深蓝舷窗/normal 混合软雾替代加法辉光）；④浅色状态语义升级平铺色环垫+缘环同材质双件——细管环日光不可见是旧观感根源。

## [0.18.8] - 2026-08-30

### Added
- **起草器重设计（元首五条令）** —— ①常用命令模板 5 枚（每周总结/依赖巡检/测试巡检/文档同步/代码审查）贴输入框点击即填；②星球→战线融合选择器：先选星球才展开该星球战线行，续接必随星球（结构性不可能「续接 A 星球战线发到 B 星球」）；③闹钟式定时：单次/每天/工作日/每周… 模式 chips + 原生 date/time + 下次触发预览，`buildAlarmCron` 纯函数生成 cron，高级面板保留直写；过去时刻就地报错（不拦会静默滚到明年）。

### Removed
- **最近命令** —— 分散注意，整体退役（代码/样式/词典三处根除）。

## [0.18.0 – 0.18.7] - 2026-08-29 → 2026-08-30

### Added
- **星球=真实工作区** —— 星域星球绑定宿主真实目录，HQ 点击注册已有工作区为星球；未分组沙盒合成一颗行星。
- **星域悬停/聚焦重梳（V18.2-V18.4）** —— 悬停卡只留 名/路径/状态（完整路径换行不省略）；战线列表进悬停卡；点击星球=聚焦态，悬停卡钉住成可交互窗口（战线行点击进聚焦页），聚焦期其他星球零悬停事件。
- **弧形铭文** —— 星球名恒定屏字号 12px 弧排于星球上缘，面向镜头不被遮挡；曲率动态适配星球屏半径（贴 limb 外 4px），远界放平悬上方；2D 同语言（上缘外弧+身份色分段战线环）。
- **皮肤全量跟随** —— 星域内所有卡面词表随皮肤派生（trek 运行时变换结构性保证）。

### Fixed
- **halo 覆写潜伏 bug（V18.2）** —— V17 压暗逻辑 find 首中 halo，每帧覆写状态脉动为常数，shoot 断言一直靠 bug 的常量通过；改 userData 定点定位 + lerp 时间归一。
- **铭文脱锚（V18.5 元首圈认）** —— 弧曲率原为画布常量，只有近景对位；改随星球屏半径动态重绘。
- **impeccable critique 三轮 28→33→34（V18.1）** —— 列头计数切片口径/归档空态安神/管线指路 toast/终局带二态/岛「等你」段/续接折叠/3D foot 避让/useModalLayer 焦点归还系统性修复。

## [0.17.0] - 2026-08-29

### Added
- **三页签全局切片** —— 进行中/已收官/已归档；命令归档（终局闸+原地二次确认），归档会话从宿主冷列表消失。
- **族系管网** —— 坞→任务→回报的族系连线，仅 hover 显形、随战况生长（stage 截段：未到回报的族不铺回报腿）；map 态走面板缘外 8px 定沟，卡锚缺席按 kind 寻址防「穿空幽灵干线」。
- **页签图标组** —— icon 化页签（全名在 aria），调度栏定高 218。

## [0.16.0] - 2026-08-29

### Changed
- **星际迷航语义统一（元首定案）** —— 角色 舰长—大副—外勤小队（原元首—参谋—指挥官）；舰桥/星球/任务令/任务回报/星舰/出航入坞全套词表；trek 皮肤=军事词典运行时派生（TREK_LEXICON），改一处三皮肤同步；host 侧 persona/tools/skill 同正典。英文标识符与 war_* 工具名永不动。
- **V16.1-V16.5** —— 侧栏收起只留图标；平话语系 64 处（工作台/助理/干员/任务单）；`pnpm verify:e2e` 实弹考题回归门常驻；e2e transcript 体检四修。

## [0.15.0] - 2026-08-28

### Added
- **续接闭环** —— 链档案三档注入（大副档案 1500/征召令 600/pivot 400：上代战报+产物路径+diffstat+败因），续在成果上不重做；战线命名（下达可选 ≤24 字）。
- **workspaceKind 投影** —— kind 感知战场键，auto-worktree 归未分组治误判。

### Fixed
- **实弹考题抓出三真 bug（V15.1）** —— war_publish 悬空批准死锁（工作区路由前置零写入）；引信双开竞态（tickNow×15s 撞车双参谋，fuse 在途守卫）；参谋会话绑 warRoot 工作区（宿主侧栏从幽灵变居民）。勘误：宿主冷列表是慢不是坏——起服 ≥15s 再采样。

## [0.13.0 – 0.14.0] - 2026-08-28

### Changed
- **战线范式收口（元首定案）** —— 血脉除名：**战场⊃战线⊃命令**；战线=命令的聚合绑一颗星球，续代跨战场自立新战线（origin 溯源 chip 一枚可点的事实）；聚焦页本地计代；链色绑战线；composer 显式星球选择。

## [0.12.0 – 0.12.2] - 2026-08-28

### Added
- **浅色范式：星空→天空** —— 浮空岛（王国之泪层岩+纳格兰垂坠石）/层级=任务量/达成碑/基座环+执行光柱；空中要塞 HQ。
- **语义 token 化全项目重铸** —— 三层令牌（基元/语义 `--war-*`/场景开关），war-tokens.ts 唯一色源 + 双向锁死哨兵；组件区裸色清零；critique 35/40。

## [0.11.0] - 2026-08-27

### Added
- **3D 星域战场** —— NASA 自然色星球（六原型确定性绘制）/星舰 HQ/编队相位状态机/雷达值班态；V11.5 起真实板数据驱动（星球=workspace 任务量、WAR LOG=真实事件流），demo 自驱退役。

## [0.10.0] - 2026-08-26

### Added
- **战线续接三模式** —— deepen/retry/pivot；世代徽标+族谱面包屑；星域战场视图（同心椭圆恒星系/凯旋印记/视图开关）。

## [0.9.2 – 0.9.13] - 2026-08-25 → 2026-08-26

### Added
- 定时命令真闭环（directive cron→30s tick→引信常轨）；聚焦页（一条命令的四段导览）+ 任务段 12 态状态机；任务列台账化+执行卡实时活动行（宿主 session→动词映射）；战报已阅转绿；hero 灵动岛；命令调度中心（三级布局+命令卡唯一详情入口）；`--war-*` 语义令牌双主题色彩系统（状态四档语义：蓝=机器在动/琥珀=等你/绿=善终/红=败）。

### Fixed
- 多轮 impeccable critique 闭环 23→35/40：对比度批修 5.8-6.9:1、五弹窗焦点圈、Esc 层协调器、键路死角、语义 token 回退哨兵。

## [0.7.0 – 0.9.1] - 2026-08-25

### Added
- **到访式工作流** —— 收件箱四类待发落、到访摘要（last-seen delta）、族系悬停+聚焦、夜间预检（改直发出口）、「为什么还没动」解释行、空板引导。
- **hero 灵动岛** —— 胶囊岛收编全部操作件（hover 展开+点击钉住）。
- **命令调度中心** —— 三列局势墙+底部命令调度条；命令卡=唯一详情入口。

## [0.6.0] - 2026-08-25

### Added
- 计划判定回推（pushToStaff）；双皮肤系统（军事/平话）；命令拆解成链（deps 链级同工作区）；goal 接力原子性补偿（60s 扫补）；三区看板+命令全生命周期；**flags 默认全开政策**。

## [0.5.0 参谋自动化（AFK）] - 2026-08-25

### Added
- 三档自主度 L0/L1/L2（`war_triage` + `!!直接做`/`??先看方案` 覆写）；计划态插件自建（`war_plan` 呈批+发布硬门）；goal 代管（CAS 链、指挥官 armed/参谋 disarm 红线）；KillCredit 全绿自动收官；分级推+去抖唤醒+板摘要注入；配额熔断（原地暂停恢复）。真实 LLM 全链考题达标。

## [0.4.0] - 2026-08-25

### Added
- 部队级模型路由 / 队内邮箱 / 任务图调度 / park 换手。

## [0.3.0] - 2026-08-24

### Added
- 每命令一参谋会话 relay / 纯跳转判定 / 挂载外部会话。真实 LLM 八步考题驱动。

## [0.2.0] - 2026-08-24

### Added
- 五分区悬赏板 / 命令区生命周期 / 多指挥官并行 / 履历档案 / `@new:` 新副本。

## [0.1.0 悬赏令] - 2026-08-23

### Added
- 首个可用版本：参谋起草 / KillCredit / 失败自愈 / cron / SSE 实时板。
