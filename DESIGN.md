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

