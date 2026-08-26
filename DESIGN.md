# DESIGN.md · 作战室看板设计决策录

> 配套 `PRODUCT.md`（产品寄存器）。记录 V6 三区改版与 V7 到访式工作流（2026-08-25）的形态决策与理由；改 UI 前先读这里，别把已收敛的决策再议一遍。

## 三区结构

```
┌─ 指挥中心 ────────┐ ┌─ 战场 ──┐ ┌─ 战报 ───────────┐
│ 命令列  │ 任务列   │ │ 进行中   │ │ 已完成 │ 已失败    │
│ (+下达) │ (悬赏)   │ │ (会话卡) │ │(会话卡)│ (会话卡)  │
└────────────────┘ └─────────┘ └──────────────────┘
       2.2fr            1.3fr           2.2fr
```

- **分区 = 用户的心理阶段**，不是数据状态机：指挥中心是「我说什么」、战场是「机器在干什么」、战报是「结果如何」。中间战场故意最窄（只读，进行中的东西不需要用户盯着操作）。
- 战场只留「进行中」一列；已完成/已失败归战报。旧两区版把 done/failed 塞在战场右半，与「战场=进行中」的直觉冲突。
- 战报两列并排（收官绿 / 折戟红），扫一眼分清善终与善后。

## 命令全生命周期（本轮核心）

一张命令卡从下达到终局始终可追踪，用户不需要知道 task/attempt/deps 这些机器概念：

1. **命令卡本体**：四段生命条（命令→任务→执行→战报）+ 状态行。
   - 段条三态：`done` 绿（已过）、`now` 蓝 + 呼吸动画（正在该阶段）、idle 灰（未到）。动画尊重 `prefers-reduced-motion`。
   - 状态行说人话：等参谋接收 / 等你回答澄清 / 计划待批（橙，需用户动作）/ 待指挥官领取 / 链进度 N/M · 第 K 次尝试 / 已收官（绿）/ 已取消（红）。
2. **命令详情 = 追踪中枢**：原文 → 分诊理由 → 计划卡 → **任务链进展**（每行任务号+状态+进度，可点击跳任务）→ **最新战报**（链内各任务最近一条汇报，按时间倒序）→ 证据 → 判定 → 升降档。
3. **反向溯源**：任务卡 / 会话卡 / 任务详情 / 会话详情都带 `↩ cmd-xxx` 溯源 chip，点击跳回命令详情。从任何一页都能回到「我当时说了什么」。

### 实现定案（勿翻烧饼）

- **零后端改动**：链成员资格纯客户端计算——`commandTasks(cmd, tasks)` 从链头 taskId 出发做 deps-闭包 BFS（链头 + 全部传递依赖者）。这正确覆盖 V6 拆解链（顺序 deps）且对未来 DAG 链也成立。
- `lineageMap`（task→command）在 WarView 渲染期一次构建；正反两个方向都不需要服务器新字段。
- `lifecycleOf` 是个小状态机：cancelled → err 色终态；talking / plan-pending → warn 色（提示用户动作）；链内全部 closed → report done。
- CommandDetail 已组件化（V7.1，props 组件 + useEffect Escape）——V6 时代「普通函数、无 Escape」的旧定案作废。Playwright 脚本两种关法都行：Escape 或点「关闭」。

## 文案与皮肤

- 一切可见文案经 `activeCopy()` 取词（`src/client/copy.ts`），两套皮肤：`warCopy` 军事 / `plainCopy` 平话。新增 UI 文案**必须进词典**（两个皮肤都给），不许在 views 里写死中文——写死了切皮肤就漏。
- 生命周期词表在 `lifecycle` 块（stages/waiting*/attemptN/chain/taskLabel…），两皮肤共用同一函数签名。
- 样式键（cls/dot）与文案彻底解耦：皮肤只换词，不换布局。

## 视觉语言（跟随宿主）

- 颜色一律 `var(--dsw-alias-*)`（宿主 design token），不自造色板；成功/警告/失败用语义别名，不硬编码。
- 信息密度 > 装饰：卡片是紧凑数据行（chip + 标题 + 时间），不搞大留白卡片墙；弹层才展开全文。
- 生命条是 4×Npx 细条 + 微呼吸，不做大进度条——它是「阶段指示」不是「百分比」。

## V7 到访式工作流（2026-08-25 补记）

> 形态定案见 SPEC.md §0（头脑风暴收敛，不重议）。这里记实现层决策。

- **板是「一天到访两三次的指挥所」**，非常驻盯盘仪表盘。信息按到访时刻的问题组织：收件箱（要我做什么）→ 摘要横幅（我离开时发生了什么）→ 三区（各自到哪了）。北极星 = 注意力的效率 × 信任的密度。
- **收件箱是导航不是操作台**：四类需元首动作的卡（答澄清/批计划/翻战报/决重试）聚成一条最老在前的队列，点击只跳「动作发生地」（会话/详情浮层）。板保持纯读投影——红线在 UX 层的落法。
- **last-seen 挂载快照**：`visitDelta` 用 useState 初始化器读一次 `warroom-last-seen`，渲染期不再读（SSE 重渲染间会漂移）。写入时机维持既有：仅 dock 回家键。首访（≤0）给全零 delta，不伪造「刚看过」。
- **族系追踪零几何**：不做 SVG 连线（定案）。`CardTrace {familyId, active, onHover, onFocus}` 注入每张卡；`hover ?? focus` 决定 active 族，非族卡 `war-rel-dim`（opacity .32）、族卡 `war-rel-same`（描边+ring）。hover 瞬态优先于 focus 持久态；focus 顶部聚焦条 + Escape 退出；首版不做族系聚顶位移（避免滚动跳动）。
- **夜间预检是呈现层判定**：`stalledOnUserPlan`（grade L1/L2 且计划未批）→ 命令卡橙虚线后果提示 +「改直发」按钮（既有 regrade API）。三档开关只是往提交文本拼 `!!`/`??` 前缀——零新 API。夜间的真敌人是「卡在等人」，不是失败。
- **「为什么还没动」走 host 只读加料**：投影增可选字段 `queueAhead`（`rules.queuePositionOf`：同区在跑占用 +1、更高优先级排队各 +1）与 `quotaPaused`。既有消费者不读则无感；写端点一个没加。
- **空板引导与日常态互斥**：无命令无任务时三区中部一张引导卡（是什么 + 三步 + 直达起草器），有数据即整体隐退。

## V7.1 审查整改（2026-08-25，impeccable critique 26/40 复盘）

> 审查快照在 `.impeccable/critique/`；整改范围经元首圈定（全部 5 优先 + 9 次要），以下是落法定案，别翻烧饼。

- **12px 字号底线（元首定夺，全面上调）**：全部 10px/11px 小字升 12px（chip/任务号/时间/工作区/收件箱/预检…）。密集信息板身份不靠小字号维持，靠 chip 化与紧凑行高；检测器 tiny-text/undersized 两类归零。目检确认无溢出换行、密度观感仍紧凑。
- **主按钮对比度走 color-mix**：`color-mix(in srgb, var(--dsw-alias-state-business-primary) 80%, #000)` 白字约 5.8:1，明暗两主题都成立；token 声明在前兜底（不支持 color-mix 的环境退纯 token 色）。不自造色板红线不破。
- **稀有度单通道化（元首定夺「换一种表达」）**：会话卡 side-tab 左边框（border-left>1px + 圆角）删除，品质改卡顶行 `qualityChip`。双重理由：side-tab 是检测器指纹模式（与选中态侧标混淆），且品质已有 chip 通道属冗余编码。任务卡的高优先侧标不受影响（那是状态不是品质）。
- **决策失败必须出声**：改档/批案/驳案统一走 `actNote(promise, what)`——失败给 `war-actionerr` toast（`role="alert"`，`failToast(what)` 词典文案，6s 自清）。旧行为静默吞错是信任类 P1。「查看任务」死链降级：任务已不在板（被清理）时按钮 disabled + `taskGone` 提示，不再点开空白浮层。
- **键盘通道**：所有可点卡（命令/任务/会话/外部卡/收件箱条目/链行/溯源 chip/到访分段）`role="button"` + `tabIndex: 0` + `aria-label` + `keyActivate`（Enter/Space + preventDefault）；全局 `.war-root :focus-visible` 描边。卡片是 div 不是原生 button（嵌套交互元素限制），语义用 ARIA 补齐。
- **图例常驻头栏**：「ⓘ 图例」按钮 + 11 行双列浮层（信号灯/生命条/档位/品质/等待…符号语文法），词典 `legend` 块双皮肤。符号系统是本板的 authored 身份，不该只藏在 hover title 里。
- **agingLeader 治 aging 通胀**：收件箱 err 档最老一条加粗 + 「等最久」徽标。全红时红本身失去排序信号，档内相对先后补上。
- **战场倾斜不整改**：中间区视觉重于两侧是审美分歧非缺陷（聚焦模式已提供单命令视图）；记为已收敛决策。
- **宿主噪声甄别**：layout-transition / clipped-overflow / em-dash 命中归属 dsh 宿主页与中国式破折号「——」，插件侧为误报——复扫插件 findings 49→0，余量皆宿主噪声。

## V8 hero 灵动岛（2026-08-25，元首点名重构）

> 元首定调：顶部一颗 hero 灵动岛替代标题栏，所有操作集中于此；岛外三区五列顶端对齐；三区是视觉大容器、列是内部可滚动中容器、卡片轻量化；悬停高亮时自动滚动让高亮卡到眼前。三项交互取舍经元首圈定：保守瘦身 / 混合展开（hover 预览+点击钉住）/ 计数仪表收起态。

- **岛 = 操作与大盘的唯一入口**：`WarIsland` 组件（views）+ `island` 词典块（copy，双皮肤）。收起态胶囊：状态点 + 标题 + 四计数（与 dock 徽章同源）+ 收件箱徽标（含 err 项转红）+ 到访迷你摘要 + 📌钉住指示 + 操作钮组（＋下达/⌁挂载/ⓘ图例/◐皮肤）。原头栏、HQ 区内 VisitBanner/InboxStrip、独立 FocusBar、命令列头 +/⌁ 全部撤并进岛。
- **展开不推挤**：浮层面板 `position:absolute` 盖在列区上方，三区纹丝不动（shoot 断言 board.y 不变）——「灵动岛」的形态前提。morph 过渡（胶囊圆角变化 + 面板下落动画，reduced-motion 关）。
- **混合交互**：hover 即展（看一眼零成本），点击胶囊钉住常驻（连续操作收件箱不被误收），再点或移开收起。操作钮 stopPropagation——点它们不改变钉住态。聚焦模式 = 岛的常驻形态（focusCommandId 非空强制展开，Esc 退出即收回）——替代原独立聚焦条。
- **三区大容器视觉**：`war-zone` 升格为圆角描边容器 + 顶部 3px 语义色带（指挥中心=business 蓝 / 战场=中性灰 / 战报=success 绿，`inset box-shadow` 不占布局）；区标题升 13px 主色。五列维持列内滚动（`war-col-body` 原有），顶端对齐。
- **卡片保守瘦身**（卡上少而直观，详情里详细）：任务卡撤 品质/高优先 chip、依赖锁、cron 徽章、工作区路径、任务书正文、战利品——全部在 TaskDetail 已有；会话卡撤 品质 chip、工作区、战利品摘要——SessionDetail 已有。保留：标记(！/？) + 状态 + 溯源 chip(↩cmd) + 标题 + 尝试/时间 + 解释行（等待 hint/败因/预检/待翻阅）。解释行不撤——「为什么还没动」是卡面即时价值，藏进详情就死了。
- **悬停自动滚动**：hoverFamily 确定后 300ms 防抖，对所有 `.war-col-body .war-rel-same` 卡 `scrollIntoView({block:'nearest'})`——已可见的不动，nearest 只滚最小距离；reduced-motion 用瞬移。悬停离开不回滚（不抢用户滚动权）。shoot 断言：640px 矮视口下各区高亮卡全部滚进各自列视口。
- **坑：`war-report` 类名双重身份**——既是战报文字块样式又是战区类名（历史共存）。区色带必须用 `.war-zone.war-report` 作用域选择器，直接写 `.war-report{box-shadow}` 会给所有战报文字块戴上绿顶带。
- **actionerr toast 改绝对定位浮层**（岛下右上）——失败反馈也不推挤列区，与岛同一形态纪律。

## V9 命令调度中心（2026-08-25，元首点名重构）

> 元首心智模型：**五列其实是一个命令卡的五种形态**——既然主角是命令，入口只该有一个。上方三列是局势墙（任务/战场/战报），命令常驻底部横向调度条（Dispatch 调度中心隐喻：英雄位=命令卡，事件=收件箱待办，派遣=参谋分诊+司令征召）。四项取舍经元首圈定：上方卡点击=跳源命令详情 / 单行横滚活跃优先 / 收件箱直达详情对应段 / 战报去按天分组。

- **布局三级**：灵动岛（顶，不变）→ 三列局势墙（`1.1fr 1fr 1.1fr`，任务=未终局 / 战场=进行中会话+外部挂载 / 战报=成功+失败合并纯时间序）→ 底部命令调度条（`war-dispatch` 单行横滚，所有命令卡 320px 定宽，活跃优先+新→旧）。「指挥中心」区与「命令列」退役——命令不再是列。
- **命令卡=唯一详情入口**：点调度条命令卡开 CommandDetail（全生命周期叙事）。上方三列的卡也可点，但路由统一 = 打开**源命令**详情（`openTaskVia`/`openSessionVia` 查 lineageMap，孤儿卡无溯源才降级旧 TaskDetail/SessionDetail）——详情只有一个叙事中心。
- **CommandDetail 补全叙事**：①「相关会话」段——参谋讨论会话（staffSessionId，每命令一个）+ 各次执行会话（chain 内全部 attempt，按时间倒序），点行进宿主会话窗口（`war-cd-session` 行卡）；②`focusSegment` 分段直达——打开即滚到需发落环节（计划卡/任务链/战报段，`war-cd-plan/chain/report` 锚点）。
- **收件箱路由升级**：批计划→命令详情计划段；翻战报→战报段；决重试→任务链段；答澄清仍直进参谋会话（对话动作本身就是去向）。
- **战报合并去分组**：成功+失败并入一列（绿/红 chip 一眼分），删除按天分组（今天/昨天/更早折叠头）——单组时组头是纯噪音（元首质疑定案）；`dayKeyOf`/`war-day-*` 全撤。
- **自动滚动扩域**：选择器 `.war-col-body .war-rel-same, .war-dispatch .war-rel-same`——调度条是**横向**滚动容器，漏掉它高亮命令卡就滚不进视野（shoot 抓到的真 bug）；横纵两轴都断言。
- **坑：调度条被嵌进三列 grid 只剩一列宽（元首抓到）**——`.war-dispatch` 误写成 `.war-board`（三列网格）的第 4 个子元素，grid 自动布局把它排到第 2 行第 1 列，宽度只剩 ~1/3。正解=板体改纵向 flex（`.war-board`），三列墙套 `.war-ops` 网格层，调度条与它平级。shoot 补几何断言：调度条宽 ≈ 局势墙宽（基准是板体面板宽而非 window.innerWidth——宿主有 280px 侧栏，视口基准会误报）。教训：**DOM 计数断言抓不到几何 bug，宽度关系必须实测 bounding_box**；泛泛的「看起来还好」式目检同样放过坏布局，目检问题必须具体到「A 的边缘是否与 B 对齐」。
- **战场游戏化（Dispatch 式）为未来候选**：元首明确本轮不做，只留单列。
- **V9.1 调度条手感（2026-08-25，元首点单）**：①滚轮横移——垂直滚轮在调度条上换算成 scrollLeft（原生 `addEventListener('wheel', {passive:false})`；React 合成 wheel 是 passive 的 preventDefault 无效），触控板横向手势（deltaX 占优）仍交原生，两端到头放行不困死整页滚动；②与三列拉开物种差——坞带 = `color-mix(主色 6%, 底色)` 淡染凹槽 + 内阴影（**坑：本主题 bg-layer-2 与 bg-base 同为纯白，靠别名分层分不出异色**，shoot 异色断言实测抓到），命令卡加浮起投影，左缘竖排铭牌（`writing-mode:vertical-rl` + `position:sticky;left:0` 钉驻，横滚时铭牌不动卡从底下过）。断言四条进 shoot：滚轮后 scrollLeft>0 / 铭牌在场 / 坞带底色 ≠ 战区底色 / 调度条宽 ≈ 局势墙宽。
- **坑：运行中的服务器会用内存旧态覆盖磁盘种子**——起服后往 `.smoke-state` 播种，几分钟后 directives.jsonl 被引擎落盘清空、板变空（元首报「作战室空了」）。播种演示板必须**停服 → 播种 → 起服**；可重复脚本 `scripts/seed-playground.py`（协议录 AGENTS.md 迭代注意节）。

## V9.2 岛改版 + 定时下达（2026-08-25，元首点单 + impeccable critique 全项修复）

> 元首指令四条：①聚焦不弹岛（pill 中间显示聚焦中，点空白退出）；②岛剥离下达/挂载按钮只留 ⚙ 设置（抽屉：图例/皮肤/其他设置）；③调度条左端常驻 ＝ 下达；④起草器重设计（语义清晰/选项明确/排版清楚 + cron 定时发布）。叠 critique（23/40）三大 P1 全修。

- **聚焦改版**：`open = hover || pinned`（聚焦不再是展开条件——审查 P1-3「到访第一屏被面板遮挡+点击吸附」定案）；pill 中间 `war-island-focus` chip（点击退出）；点空白退出（document click，target 不在卡片/岛/弹窗/调度坞/控件内才退）。面板内容只剩到访摘要+收件箱，FocusBar 退役。
- **岛操作件精简**：pill 只留 ⚙（`war-island-gear`，aria-haspopup=dialog）；下达/挂载/图例/皮肤按钮全撤。**挂载入口退役**（AttachThreadModal 删除，attach API 与外部卡 badge/detach 保留——纯 UI 入口取消，协议不动）。
- **设置抽屉**（`war-settings-drawer`，右侧滑入 360px，role=dialog + aria-modal，Esc 关）：皮肤（军事/平话 + 「更多皮肤未来迭代」提示，元首明示皮肤后续再想）、图例（原 LegendModal 并入）、看板行为开关（悬停族系高亮/悬停自动滚动，`war-switch` role=switch，localStorage 持久化 `warroom-cfg-*`）、连接状态（SSE 在线/断开 + 立即刷新）。
- **调度坞左端钉驻簇**：`war-dispatch-lead`（sticky left）= [＋ 下达圆钮][竖排铭牌]——下达入口常驻坞头，与铭牌一体横滚不动。
- **起草器重设计**：lead 一句话讲清能做什么 → 大输入框 → 档位三选项卡（名+一句语义，取代旧 seg 短标签）→ 时机两选项卡（立即/定时）→ cron 区（3 预设 chips + 自定义输入 + 下次触发实时预览 + 非法就地报错禁提交）→ 最近命令。Ctrl+Enter 提交（Alex）。
- **定时下达后端**（真闭环，非摆设）：`directive_created` 带可选 `cron`（POST 校验 parseCron，400 带中文错误）→ fold 落 `schedule{cron}`，**未 dispatched 不进 `pendingDirectives`**（引信不可见）→ bountyFuse 30s tick 补 `directive_dispatched`（一次性，anchor=创建时刻，错过即跳过）→ 回归 draft，15s 引信照常转达参谋。板投影带 `schedule{cron, dispatchedAt, nextRunAt}`，命令卡 `⏰` 角标 + tooltip。客户端复用 `schedule.ts`（纯模块，parseCron/nextRunOf 双端同源）。
- **critique 修复清单**：P1-1 排版三级刻度（12 正文/13 卡题 600+line-height 1.5/15 区题）；P1-2 语义色 chip 文本 color-mix 加深（st-published 2.79→**6.67:1**，shoot 机检断言）+ time/taskid tertiary→secondary；P1-3 即聚焦改版；P2-2 调度坞右缘渐隐 mask；P2-3 dim 卡 focus-visible 恢复不透明；P3 铭牌 11→12px、toast 挪调度坞上方右角。未做（记 backlog）：chip 形状通道分流（P2-1）、modal role=dialog 焦点陷阱全量（SettingsDrawer 已带，CommandDetail 等待下轮）。
- **坑：styles.ts 尾部有两个模板串**——WAR_CSS 与 `querySelector(\`style[...]\`)`，往「锚点前最后一个反引号」插 CSS 会插进选择器模板（query 炸、宿主入口渲染失败）。教训：模板串追加要锚定 WAR_CSS 的**闭合**反引号，或按行号插。另：python heredoc 带反斜杠/反引号内容会被 bash 层吃字符——复杂脚本一律落临时文件再跑（本轮丢过一次 styles.ts，git checkout + 重放恢复）。

## V9.3 复评整改（2026-08-26，critique 23→27 后全项修复）

> 复评 27/40（趋势 23→27），元首三答：P1 全修+P2 顺带 / 批准保持一键但视觉隔离 / 非零收件箱染警示。整改后 shoot 四条对比度机检 + Esc 层序 + 决策块断言全绿。

- **P1-1 warn 文本对比度批修**：上轮只修了 chip 族，本轮补齐同色系行内文本——`life-status.warn/err`、`preflight-text`、`mark.bang/query`、`inbox-wait(tone-*)`、`visit-seg.s-pending` 全部 color-mix 加深（实测 6.96:1）；visitmini/st-cancelled/visit-since tertiary→secondary；`life-label.now` 加深。检测器另抓的 `＋` 钮 4.2:1 → 底色 82% 混黑（5.86:1）。shoot 断言扩成四选择器循环。
- **P1-2 弹窗 a11y**：`useModalLayer(onClose, label)` 三件套——`role=dialog`+`aria-modal`+焦点移入（tabIndex:-1 容器）/归还 + Tab 圈禁；五个弹窗（CommandDetail/Composer/TaskDetail/SessionDetail/SettingsDrawer）统一接入，旧手写 Esc 效果全删。
- **P1-3 Esc 层协调器**：模块级 `escLayers` 栈 + 只关最顶层判定；`useEscOnlyLayer`（聚焦模式）。根因是监听器随渲染重注册 + React 离散刷新中途摘除（复评实锤复现 2 次）。shoot 断言：聚焦+弹窗叠加，第一个 Esc 只关弹窗、第二个退聚焦。
- **P2-1**：lifecycleOf 增 approved 空链分支（`任务待发布` 中性 tone）——绿「已批准」旁不再挂 warn「参谋接收中」。
- **P2-2**：`isLatestFailedAttempt` 判定——败因只挂最新失败尝试，更早尝试给中性「该次尝试失败——进复盘看全程」（双皮肤词条）。
- **批准视觉隔离**（元首定：一键保留）：`.war-plan-decide` 决策块 = 后果一句话（「批准即放权：参谋按此计划自动推进，夜间无人值守也照常执行」）+ 批准/驳回按钮区，与改档钮物理分组。
- **岛 has-inbox 染色**（元首定）：收件箱非空时 pill 描边+状态点染 warn（「有事等你」成为岛的主导信号），清空回常态。
- **坑（styles.ts 双模板串）连踩第二次**：V9.3 CSS 又插进 querySelector 模板。除再次搬迁外，verify 加**永久针脚**断言该模板在 bundle 里保持开-闭完整形态——第三次会被机检当场拦下。搬迁脚本的 `del [start+1:end]` 不含端点，两次都留孤儿 `` `) !== null) return `` 行——记住删端点。

## V9.4-9.7 容器化 + 四轮 critique 冲刺（2026-08-26，goal 驱动，23→27→29→35/40）

> 元首 goal：调度坞容器化 + impeccable 全面打磨，复评 ≥31。五轮迭代全绿收官：verify PASS + shoot 全绿 + 双子代理终评 **35/40**（趋势 23→27→29→35，快照 `.impeccable/critique/`）。

- **V9.4 容器化（元首定案）**：整坞一个大容器（与三区同语言圆角容器，物种差保留——淡染凹槽）；「命令调度」竖排铭牌退役；＋ 下达瓦片（虚线幽灵态，容器的成员）；命令卡全进 `.war-dispatch-track` 横滚轨道；右缘渐隐**动态化**（can-scroll 类，只在还能向右滚时出现）。岛标题顺应 V9（作战室 · 指挥中心→作战室）。
- **V9.5（29→35 的主力批）**：①**统一命令卡点击**——一律开全生命周期详情（板是叙事中心，好奇不瞬移出板），对话入口改为卡上视觉独立的虚线「进入对话」chip（此前同形卡两种点击行为是复评点名的一致性硬伤）；②起草器草稿 localStorage 持久化（误点背板/顺手 Esc 不焚稿，重开续写）；③全板快捷键 `n`=新建命令（无弹窗层且非输入焦点时），起草器内文档化 kbdHint；④inbox 同命令 talking+计划待批去重（plan 胜出）；⑤cron 错误去双前缀；⑥岛 hover 150ms 意图延迟。
- **V9.6（复评抓的真 bug）**：①**P0 keyActivate 嵌套劫持**——事件源≠宿主卡时放行原生（此前 ◎ 聚焦键回车错开详情、「进入对话」chip 键盘失灵）；②hover 定时器离岛必须 clearTimeout（否则快速划过 150ms 后面板弹开且卡死——V9.5 自己引入的竞态，被下一轮复评实锤）；③**语义色 token 回退**——宿主未定义 `*-error/success-label` 时 color-mix 塌成黑，全部改 `var(label, var(primary))` 回退保语义色；④can-scroll 初算竞态（deps 跟卡数）；⑤重复 OnboardPanel（拼接事故残渣）；⑥列标题升格 h2（板原先零标题）+ composer textarea aria-label。
- **V9.7 扫尾**：can-scroll 改 **ResizeObserver**（布局盒一变即重算，首帧渐隐不再缺席——deps 方案仍漏布局变化路径）；图例符号 4.23→mix 72% 补黑；`.war-report` 文本块改名 `.war-report-body`（**双身份坑自 V8 挂账至此清账**——区容器曾被文本块规则顶成 8px 圆角/pre-wrap）；词典正名（进行中→作战中/执行中，删 zones.field 死键）；压线混比 55→45% tertiary 提余量。
- **坑：styles.ts CSS 追加锚点**——双模板串坑连踩四次后，WAR_CSS 尾部立「追加锚点标记」注释行，今后 CSS 一律插标记后，绝不再用「锚点前最后一个反引号」手癖。守门针脚已四次当场拦截。
- **shoot 协议补丁**：清盘后服务端折叠缓存会短暂回旧内容（实测两次竞态）——Phase A 加「轮询等板真空」drain guard。
- **Backlog（终评遗留，非阻塞）**：方向键卡间导航；20+ 命令时轨道分组/折叠；岛 focus 也触发展开（键盘对称）；aria-live 播报 SSE 变更。

## V9.8 命令详情重构：决策现场（2026-08-26，元首定案三项）

> 元首三答：单列+阶段导航 / 决策带置顶常驻 / 明细默认收起。设计主张一句话：**详情页不是档案袋，是决策现场**——先答「要我做什么」，再讲「怎么回事」，收据最后翻。

- **标题换命令原话**：`「…」` 引号包裹（title 悬停全文），`cmd-` ID 降为副行小字——进来第一眼是元首说过的话，不是机器码。
- **决策带置顶（`war-cd-band`）**：与收件箱四类同源（plan 优先 > clarify > review > retry），有事给动作（批计划/进参谋对话/去④看战报或败因——滚动按钮），无事给安神行「无需发落——自动推进中」（quiet 态绿✓）；定时待发命令显示 ⏰ 出发时刻。批准按钮的一键保留，后果一句话进 band（原 V9.3 plan-decide 块退役，样式与针脚同步换血）。
- **四段阶段导航（`war-cd-steps`，sticky）**：①命令②任务③执行④战报 = 卡片生命条放大；点哪段滚到哪段（scrollIntoView），滚到哪段亮哪段（滚动监听算当前段）；reached 段与当前段分层着色。分段直达 focusSegment 锚点类（war-cd-plan/chain/report）全保留——收件箱路由零改动。
- **段头写结论不写状态**：①=L1·置信 82%；②=复用 `lifecycleOf().status`（如「任务组 1/3 · 执行中」）；③=N 次作战/等执行者领取；④=判定或战报时间。扫段头即可决策。
- **明细折叠（`war-fold` 原生 details/summary）**：证据收成一行摘要 `✓ 3/3 项验收通过 · 测试 8 过/0 败 · +120/-8`，点开才见完整收据（EvidenceBlock）；分诊理由、改档组同折叠。页脚主按钮只留语境动作（进入对话/查看任务），改档+聚焦收进「更多」区。
- 坑：shoot 旧断言等「命令 cmd-」标题前缀——换新判据 `「` 开头；verify 针脚 war-plan-decide → war-cd-band/steps/fold。


## V9.9 聚焦页：全生命周期导览 + 点击接线梳理（2026-08-26，元首定案）

> 元首重定义：**主界面 = 所有卡片的全生命周期监控版；详情页 = 一条命令的全生命周期聚焦导览（聚焦页）**——把主界面的卡片拉进一个窗口。配套裁决：链任务全部按序展示；子详情（配置/计划/战报）卡片下方原地展开。

- **CommandDetail → FocusPage 重写**：顶部标题（「原话」）与「等你发落」决策带沿用 V9.8；主体 = `.war-cd-body`（既有独立滚动容器）内四段 `war-cd-stage`，每段放**真实在场的主界面卡片**（复用组件工厂，`NO_TRACE` 中性 trace 不参与族系高亮）：①嵌入 CommandCard（tour 变体：点卡=展开配置、隐藏 ◎/进入对话、保留 LifeStrip+预检改直发）②链上全部 TaskCard 按序 ③仅 live attempt（`outcome===null`）的 SessionCard——点卡直跳 `sessions.open`；无 live 无卡、只给提示行（已执行完成/尚未开始）④战报卡（最新战报宿主环末次尝试）。空链但有计划（L2 待批/刚批准）给虚线 **ghost 卡**点开看计划原文；连计划都没有给灰提示行。
- **卡下原地展开（`war-subdetail`）**：命令卡→下达配置（发布时机 cron/立即+已发/下次、自主度档位+协议标记+改档数、分诊理由、命令原文）；任务卡/ghost→最终计划原文（pending 给「正在计划中」+进任务会话钮——原生会话就是参谋写计划的地方）；战报卡→收官结论+最新战报+证据折叠。单一 open 状态：同卡再点收起、换卡即切换。
- **底部双会话跳钮（`war-tour-jumps`，代替旧 footer 全部按钮）**：任务会话=staffSessionId（hq 兜底）、执行会话=live 优先/退最近一次尝试；未形成给同名禁用占位（title 说明何时出现）。◎聚焦/查看任务/去处理(footer)/改档折叠全退役；窗口关闭走右上 ✕（新增）+Esc+背板。改档恢复口保留在命令卡预检「改直发」一处。
- **阶段导航反映真实阶段**：lifecycleOf 修正 approved+空链 `reached.task=false`（now 仍指 task 作前沿呼吸位）；battle/report 段头在只有提示行时不再重复提示文案。
- **点击接线全面梳理（详情面收敛为「聚焦页+原生会话」两类）**：**TaskDetail/SessionDetail 两模态整体删除**（死 helper depLock/cronBadge/wsChip 同清）；任务卡有溯源→聚焦页、孤儿（真实流程不会出现）直跳末次会话；会话卡 live 列→聚焦页执行段、战报列→战报段、孤儿直跳原生会话；inbox review/retry 孤儿回退→staff 会话直跳。保留（动作类非详情）：进入对话 chip、任务卡去处理、改直发、外部线程卡、岛/收件箱/设置/起草器全部接线。
- **词典瘦身**：`detail.*` 只剩 reportPrefix/lineageLabel；commandDetail 清 8 死键；session 清 loot/goHandle/enterReview；新增 `focusPage` 双皮肤词典（26 键）。协议 token（!!直接做/??先看方案）以 `GRADE_MARKER` 常量进配置行（与 preflight.applyGradeMarker 同源，不进皮肤词典）。
- 针脚：war-tour-cards/subdetail/jumps/ghost + 任务会话/执行会话；负断言 查看任务/进入会话复盘 不再入包。坑：views.tsx 顶部模块注释里的旧按钮文案会被负断言连坐——注释也是 bundle 内容，改行为要同步改注释。

## V9.10 聚焦页状态机补全：删段导航 + 12 态×4 段全梳理（2026-08-26，元首 goal）

> 起点 = 元首审计诉求：①②③④跳转滚动导航不需要；「顺便给小工具加个导出 csv」(talking) 详情里只有命令卡可点，但参谋会话已起、该在任务卡上操作——「类似问题还有很多，全面梳理」。审计产出 12 状态×4 段矩阵（P1 无可操作卡/P2 提示文案说谎/P3 内容缺口/P4 操作缺口/P5 导航钮去留），元首「按照你的推荐」全采。

- **段导航退役**：删 `.war-cd-steps` 跳转钮与滚动高亮、段头去 ①②③④ 编号（静态标签+结论行）。保留 `focusSegment` 路由直滚（inbox/列卡入口）与决策带滚动语义；verify 负断言 `war-cd-step` 不入包。
- **任务段状态机（12 态分岔，替换 V9.9 单一 ghost）**——优先级 plan > talking > drafting > 链卡 > 灰提示：
  - **已接令无计划（drafting ghost）**：ghost 卡「参谋正在起草任务书」→ 展开 = 分诊结论行（triageLabel+gradeReason）+ [进任务会话]。
  - **等你答问（talking ghost，warn 色描边）**：ghost 卡「等你回答」→ 展开 = 「参谋在等你回答」说明 + [进入对话回答]（warn 主按钮，markTalking + open 会话）——补 P1 缺口：此时用户有了可操作卡。
  - **计划待批（plan ghost）**：ghost 卡 → 展开 = 计划状态标题 + 计划原文 + [批准计划]/[驳回重呈]/[进任务会话]（与决策带同源 decidePlan，两处都有）。
  - **灰提示分岔（无卡态不说谎）**：定时待发 =「⏰ 出发后才转达参谋」+下次出发时间；转达中 = 转达提示；已批准空链 =「任务待发布」；已取消 = 已取消提示。
  - **链已成形**：任务卡 → 展开 = 计划原文 + 任务书（brief）+ 验收标准（acceptance）+ reported/failed 环节加 [去处理]——补 P3/P4。
- **配置展开加改档**：`configRegrade` 行，`war-sub-btns` 内给非当前档的 L0/L1/L2 按钮（regradeCommand 写路由，板仍是读投影）；仅在已分诊且未 approved/cancelled 时出现。
- **战报展开补全**：战利品行（deliverables 逐条 `war-loot` 项）+ 「历次作战」`war-sub-attempts` 列表（每次尝试一行：结果 chip + 会话号前缀 + 任务号 + 相对时间，点行直跳原生会话）+ reported/failed 存在时 [去处理]。
- **词典**：focusPage 增 taskScheduledHint/taskRelaying/taskCancelled/drafting 系/talking 系/triageLabel/triagePending/taskBrief/taskAcceptance/briefMissing/acceptanceMissing/lootLabel(war 战利品/plain 交付)/attemptsSection/configRegrade；清死键 planNone/taskPlanning/taskCard.lootPrefix/commandBand.journey。
- **针脚**：新 needles 进入对话回答/war-btn-warn/taskScheduledHint/taskBrief/war-sub-btns/war-sub-attempts + 负断言 war-cd-step；shoot 增 Phase G6（talking ghost 断言+截图 v9-focus-talking / d3 展开 loots/attempts 计数 / d4 cancelled / composer 定时下达全程）。
- 目检：v9-focus-talking.png（warn ghost 展开态）+ v9-focus-report.png（战报全量展开态）人工核查通过，落 `.goal/evidence/v7/`。

## V9.11 卡位模型 + 执行卡实时活动（2026-08-26，元首四条规则定案）

> 心智模型（元首原话归纳）：任务列=参谋侧台账（从参谋接令起常驻到终局）；执行卡=原生会话窗口的简略版，只显示动作动词（过程语汇实时接入）；执行完毕执行卡平移成战报卡；命令卡四段生命条如实反映。四点拍板：动词双皮肤同词、成形卡点击进聚焦页、全部完成含真链验收、转达中/定时/已取消不出卡。

**R1 卡位模型（纯客户端，0bf4172）**：
- **成形卡**：接令起（空链+已建参谋会话）任务列置顶出现，三变体（drafting 成形中/talking warn 等你答问/plan 计划待你批）——与聚焦页 ghost 共用 `formingVariantOf` 判定（分岔口径不分叉）；点卡进源命令聚焦页任务段；批准发布后同卡位变任务书卡。
- **任务列台账**：`openTasks` 过滤退役，任务书卡全量常驻；终局（closed/failed）调暗 `.settled` 永驻；**reported 保持全亮**（待验收是收件箱动作态，不许被埋——对「终局含 reported」定案的实现取舍）。
- **生命条段位修复**：`reportDone` 加入 reported——上报即进战报段（修元首抓到的「卡已在战报列、命令卡停在执行段」打架）；状态标签回退链 closed > failed > reported。
- shoot 增 R1 台账机检（三成形卡/终局两卡调暗/生命条战报段/成形卡点击路由），取证 v9-ledger.png。

**R2 执行卡实时活动（宿主只读 + 前端）**：
- **动词映射器**（`src/activity.ts` 纯函数）：宿主过程事件 → 思考中（step/start）/探索中→已探索（read/grep/glob/fetch/search…）/编辑中→已编辑（edit/write…）/运行命令→命令完成（bash/shell…）/执行中·工具名（兜底）/待命（turn/end）。工具分类大小写不敏感+子串容忍；callId 配对（乱序 result 不改写、缺 id 退化最近完成）；label 宿主侧单点计算（双皮肤同词天然成立）。
- **宿主事件形状坑（首跑抓到）**：SessionEvent 载荷在 `.data` 下（`{type, seq, time, data}`，与 api-proxy 消费侧 event.data 同源）——首跑动词全落「执行中·tool」兜底即因读顶层 name；修为 data 优先、扁平退回两头兼容。**同族疑似遗留**：`registerReportCapture`（src/index.ts:196）读 `event.source?.kind`/`event.content` 顶层——按嵌套形状疑似常年不触发（部队 subagent-report 自动入账路径）；未在本轮顺手改（行为面变化需独立验证轮），挂账待元首裁决。
- **活动追踪**：`ActivityTracker` 内存滚动表（全量会话皆记、256 上限、不落盘——重启归待命即「当前在做什么」语义）；index.ts 第二个 `session/event` 订阅喂入。
- **板投影/revision**：live attempt 携带 `activity: {verb,label,ts}`（dashboard boardProjection 可选加料）；`boardRevision(stateDir, activitySalt?)` 把动词盐折进签名——**盐只随动词变化**（同动词连续事件不空转 SSE），SSE 仍只发 rev（revision-only 纪律不破）。
- **前端**：SessionCard live 态加 `.war-activity` 行（呼吸点+动词，title 带时间戳）；点卡仍直跳原生会话（全文在那边）。
- **真链取证**（`scripts/shoot-activity.py`）：页面 fetch 下达 L0 直发命令（真实参谋分诊→发布→征召→指挥官真跑工具），轮询 board 断言 live attempt 带 activity、≥2 种动词、revision≥3、截图落证。首跑（扁平形状 bug 版）已 OK（思考中→执行中·tool，12 revision，双截图）；修复后复跑验证真实工具名分类。
- verify 针脚：ActivityTracker/activitySalt（host）+ war-activity（client）+ V9.11 R1 四针 + 负断言 openTasks 退役；单测 tests/activity.test.ts（八态/嵌套兼容/配对/盐稳定性/revision 折叠）。

## V9.11 demo 升级：指示器跟卡走 + 战报已阅转绿 + 全状态覆盖/全点击可达（2026-08-26，元首三点指示）

> 元首定案：①指示器跟卡走——卡进任务列就到任务段，只有定时/未被参谋接手的命令停在命令段，其余同理；②战报段等用户点开看过才变绿（demo 里点不到就由我定判定）；③demo 覆盖所有状态、所有点击都反映真实跳转（「设计出来的生产环境状态」）。

- **指示器跟卡走**：lifecycleOf 空链分支改为 `formingVariantOf !== null → now:'task'`（成形卡在场=卡片已进任务列），与任务列台账同源判定；无卡态（定时未发/转达中）停命令段。
- **战报已阅转绿**：`report-seen` localStorage 账本（per 命令记最近点开时刻）+ `latestSettleMs`（链上最近定论时刻）——seen 晚于定论才整条转绿（now 归 null 收官）；驳回重跑出新战报自动拉回呼吸态。判定=聚焦页战报段进视野（focusSegment='report' 直达或 IntersectionObserver 0.35 阈值——决策带「去看战报」/手动滚动/战报列卡点入全覆盖）。
- **demo 织换器**（`src/demo-weave.ts`，config `demoWeave` 仅 smoke overlay 开）：开机 apiProxy faces 就绪时按 `.demo-sessions.json` 把假会话号换成宿主真会话（`sessions.create({cwd: 当前工作区})`+改名「演示·角色」），重写 campaigns/directives/threads 三条 JSONL，`.demo-woven.json` 标记幂等；播种器清态连标记清（重播→下次开机重织）。**关键实测**：宿主 web 会话目录只收「打开过/retained」的会话——建在 war root 或从未打开的会话 `sessions.open` 静默不切（假号则抛 unknown session）。→ 织换建在当前工作区 + 全任务补 lineage 让板上卡点击统一走聚焦页；**挂账（宿主边界）**：聚焦页底部「任务会话/执行会话」跳钮与「进入对话回答」指向从未打开过的道具会话时首跳不切换（弹窗仍收起有点击反馈；该会话在工作区切换器手动开一次后永久可用）。
- **种子全状态**：14 命令覆盖 draft 定时（d8 cron）/received×2/talking/approved 五态（链成形 d3 双环、待发布 d6、失败重试 d7、各 lineage d9-d13）/cancelled；8 任务覆盖 epic 待领/deps 锁/cron 悬赏/进行中/已报（战利品+证据）/收官/失败两跳/链第二环。三列 **18/18 卡点击全开聚焦页**（探针机检）。
- **顺带真修**：commandTasks 输出改依赖序（投影状态序把 published 后继排到 reported 前驱前——读链倒置）；悬停自动滚动按列聚合（同列多张同族卡逐卡 nearest 互相挤出，最后一张赢）；聚焦页 jumpSession 跳会话同时收弹窗；收件箱条目 scroll-margin-top。
- verify 186 测（针脚 warroom-report-seen/latestSettleMs/weaveDemoSessions/.demo-sessions.json）；shoot 全绿（指示器跟随断言组 + 战报呼吸→点开转绿闭环 + 新状态成形卡断言）。

## V9.12 审查整改（2026-08-26，元首 goal：第一性原理对抗审查三轮）

**R1 事件流复活**（对抗审查 P1-1/P2-6）：
- **parseUnitReportEvent 纯函数**（`src/report-capture.ts`）：registerReportCapture 的战报解析抽出——宿主 SessionEvent 载荷在 `.data` 下（与 activity.ts 同源结论，2026-08-26 实测），旧顶层读法在嵌套形状下**静默失效**（部队战报/结算自动记账一度全灭）。新解法「嵌套 `event.data` 优先、扁平退回、坏形状返 null」，三形单测（嵌套/扁平/畸形 13 例）锁定；registerReportCapture 只留记账半边。
- **ActivityTracker 驱逐改「最旧 ts 先」**：插入序 FIFO 会把「最早出现但仍在打」的会话挤掉（256 上限下 live attempt 也会被逐）；ts 驱逐下持续活跃会话永不成为最旧。单测与旧实现分野：live 首插 + 持续刷新，FIFO 第一次溢出即驱逐 live，新策略只清 stale。

**R2 演示精修**（P1-2/P1-3/P2-4/P2-5/P2-8 + 元首 bug 报）：
- ① **去处理正名**：reported 链「去验收 · 参谋会话」（title：翻阅战报在本页；收官/驳回结论到参谋会话说）/ 败链「去下重试令 · 参谋会话」——三接线点（主界面任务卡 onHandle 按任务状态选词 / 聚焦页任务环面板 / 战报收菜面板按 failedChain 选词），负针脚 `去处理 · 参谋会话` 退役。
- ② **seen 三通道收紧**：段直达（focusSegment='report' 即时）｜战报卡点开展开（即时）｜自行滚到战报段 ≥60% 可见且持续 ≥800ms（IntersectionObserver threshold [0,.6,1] + 进出视野重置计时）。旧 0.35 阈值一闪即绿的宽判定退役。
- ③ **weave 会话复用（三级）**：持久真号映射 `.demo-real-map.json`（播种器重播只清 woven 标记不清这档——确定性主力）→ SessionsApiFace 可选 `list` 按「演示·X」名匹配（尽力而为）→ 全新建；织换后合并落盘映射。实测冷列表在注入时机拿不到重命名标题（宿主边界），映射档是唯一可靠通道——marker 被清的二次重建零新建（泄漏实测 2.5h 36 个）。
- ④ **种子每命令独立参谋会话**：sec-d0…sec-d13（12 条 received 命令各一）+ playground 追加 sec-d5；manifest 全条目化——板 JSON staffSessionId 互异可机检。
- ⑤ **d8 cron 远期**：`0 9 1 12 *`（12 月 1 日）+ 命令原文同步改写——演示期永不到点，不再是一颗「下周一 9 点自动出发」的定时炸弹。
- ⑥ **跳转无操作反馈**：jumpSession 记 open 前 current，300ms 后 current 未变且不等于目标 → onJumpMiss 冒泡到板级 actionError 通道（聚焦页 onClose 即卸载，提示必须活在 WarView）——冷会话/道具会话 open 静默落空从「无反馈假死」变「一句警示」。
- ⑦ **织换真实目录守卫**：stateDir 解析为默认真实数据目录（resolveStateDir('')）时拒绝织换并日志 REFUSED——演示只许进隔离 .smoke-state。
- ⑧ **任务列排序统一**：任务书卡按源命令 createdAt 倒序（与成形卡同一心智：新命令的台账在前），孤儿任务（防御位）殿后保序。
- ⑨ 杂项：.gitignore 收 .zcode/.playwright-mcp；scripts/shoot-composer.py + triage-probe.ts 入库（取证工具不该裸奔）。

**P3 已知取舍（挂账不改，对抗审查认定低危）**：
- **并行调用 callId 有损**：活动行对并行工具调用只跟踪最近一次（乱序 result 有 callId 配对保护，但第二并行调用的进行态会被第一行的 result 翻完成）——单指挥官单线程任务流里罕见。
- **时钟偏差**：seen/latestSettleMs 用客户端钟对事件 ts（宿主 ISO）——跨机钟偏 >数秒才可能误判，本机部署无感。
- **板全量重读**：SSE revision-only 触发 GET /board 全量投影（无增量）——14 命令/8 任务量级 <10ms，等真实规模再议增量协议。

**门禁**：verify 194 测（新针脚 parseUnitReportEvent/去验收/去下重试令/jumpMissHint/REFUSED + 负针脚旧去处理）；shoot 新增 seen 三通道断言组（钉顶 1.1s 不许转绿的收紧回归位 + 展开即绿 + 滚底停留即绿）与正名分野（d3 去验收在/d7 去下重试令在/交叉不在）；探针：二次重建 weave 日志 `N reused, 0 created`、board staffSessionId 互异、18/18 卡点击覆盖。
