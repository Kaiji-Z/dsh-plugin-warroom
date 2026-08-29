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

## V16.4 UI critique 闭环（2026-08-29，八轮双子评审）

impeccable critique 协议（A=设计总监无锚定审查 + B=探测器/浏览器行为实证，严格隔离）跑了八轮：R1 基线 30/40 → R2 34 → R3 33 → R4 31 → R5 后 27 → R7 校准后 33/40（P0=0）；B 侧缺陷数 1→1→2→0→1→0 单调收敛，后四轮机检/行为级零缺陷（对比度 25 选择器×双主题全过、焦点零死角、键盘全链、hash 深链、reduced-motion、200% 缩放、星域避让）。评分波动源是每轮新评审的视角差与挂账归类差，客观质量面单调收敛。决策与坑：

- **协议标记不进人读面**：`displayTitleOf`（preflight.ts）剥整行【星球：/战场：…】标记（双兼容），接 11 处 client + 2 处 host 会话命名——聚焦页 H1/续接 chips/调度卡标题不再被截断 Windows 路径占据。
- **琥珀=等你搬家**：四计数是机器态全中性；收件箱 ✉ 徽标才是行动信号（非 err 时挂 wait 色）。
- **岛计数可点路由**：countSegs 词典分段（trek 随派生），四段统一 flash 列内目标卡（R8 统一手势：钉岛只归 ✉）；`.war-flash` 1.6s 描边。
- **词汇收敛一词一面**（连续三轮评审同指的 P1）：TREK_LEXICON +失败/已失败/败退→挫败 +打赢了→圆满（长词先于短词入表——数组序即匹配序）；island 作战→执行中（向 plain 对齐）；garrison 败→折戟；canvas 红缀 ·N挫败；图例红档/evTests 同步；skin.test 机检锁面（改词必挂测试）。**坑：改名后量宽串要与绘制串同步**（3D 名签 measure `·N败` draw `·N挫败` 中心偏移半字）。
- **星域文案并词典**（V16 结构性保证在地图半边失效的补课）：starfield 块 +26 键×军事/平话，trek 派生——HQ 卡/状态 chip/图例/双 hint/切换钮/bfpanel/执行卡 aria/footStat/速报四动词/2D garrisonTitle。**坑：桥接星球（WzBridgePlanet）没有 name 字段**——键盘镜像钮曾渲染字面 undefined（B8 实测），名取 dirLabel(wsPath)。
- **聚焦页状态进 URL**：`#war-cmd-<id>` 挂 detailCommandId。**坑：R1 曾误接 focusCommandId（族系高亮）**——静态 needle 只证代码串存在，接错状态变量只有行为级断言能抓（B2 四角度实证）。
- **自定义属性不跨兄弟继承**：--war-dock-h 内联在 .war-board 上，hint 挂 war-root 下永远走 0px 回退（B3 实测「抬升整改从未生效」）——依赖实测变量的浮层必须挂变量所在子树内。
- **canvas 微文案卫生**：零值标签不渲染（九星九个 0艘）、假距离刻度退役、LV·艘→达成 N；键盘镜像钮（视觉隐藏 focus-visible 显形）+ bfpanel autoFocus（Esc 才可达）补 canvas 交互死角。
- **composer 恒高弹窗要内滚**：max-height:80vh+overflow-y，提交行/快捷键行 sticky——cron+二级全展开曾会裁按钮行。
- **shooter 断言随 UI 语义演进同步**是仓库惯例：本轮同步 shoot-v7（任务卡定位改标题、报告段按位取 nth(3)、recent 二级展开、圆满/挫败词面）、shoot-v10（世代标记断言随 V15.2b 环语义退役、复位收敛改轮询 15s——固定 2800ms 在慢机软光栅下确定性不足）。
- **挂账**（产品待办非界面缺陷）：雷达 canvas 名签避让算法（长名横穿/密星互叠）、任务列筛选/搜索、图例 IA（16 行分组折叠）、3D 相机键盘手势、canvas 动画 reduced-motion 降级、零 delta 安神行、PRODUCT.md 词面与 V16 对齐。

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

## V9.13 色彩系统（2026-08-26，元首点单：浅深双主题 + 语义明确 + 容器色重设计）

**令牌架构**（styles.ts v4.0 全量重写，`--war-*` 语义层）：
- **单开关跟随宿主**：令牌定义在 `.war-root`（浅色缺省）+ `body[data-ds-dark-theme] .war-root`（深色覆盖）——插件不设第二套主题开关，宿主 theme-presenter 翻 body 属性即全板换装。组件规则只吃令牌与「宿主语义 token 为基的衍生色混」，不直写裸色值。
- **容器海拔四级**：canvas（画布）→ zone（三区容器）→ card（卡片）→ well（凹槽/输入/小控件底）+ pop（弹层顶格）。**宿主边界实测**：浅色主题宿主四层 bg 全白（分层塌缩）——浅色自建层级（灰画布 bluish-50 vs 白容器 vs bluish-75 凹槽）；深色主题宿主层不塌缩——四级各落宿主海拔一层（base/layer-1/layer-2/layer-3，实测 #151517→#232324→#2c2c2e→#353638 两两可辨）。首版漏了 dark zone/card/pop 覆盖（zone 落回 bg-base 与画布同色，容器只剩边框可辨）——目检抓到后补齐，并给 shoot-theme 加「层梯可辨」永久断言。
- **状态语义四档**（12px 正文级，两主题各 ≥4.5:1）：蓝=机器在动（received/进行/定时/L1 档）/ 琥珀=等你（talking/plan 待批/warn/L2）/ 绿=善终（closed/收官/`!!` 直做/L0）/ 红=败（failed/error/重试）。V9.13 语义细分：st-received（蓝）与 st-talking（琥珀）拆分、k-clarify 归琥珀、`.war-mark.bang` 归绿（与档位 chip 对齐）。
- **取材原则——两主题各自成章，不机械反转**：浅色=宿主 alias + 定向压黑（color-mix X% #000，白底 5.2-9.9:1）；深色=宿主明度档原值直用（为深底调的 -400/-500，4.8-7.3:1）。实测律：压黑混法在深底会塌到 2.3-2.8:1，反之深色原值在白底也不达标——所以两套覆盖表分开作曲。深色卡片层提亮一档后 fail 掉到 4.24 → error-primary 86% 混白回 4.94。
- **宿主缺口绕行**：`--dsw-alias-state-warn-label` 两主题同为琥珀 600（浅色直接用会 2.79:1）——走 fallback 链 + 压黑/原值双轨；`state-focus-ring` alias 不存在（旧 4 处 outline 引用全是无效声明=无焦点环）——新增 `--war-focus` 令牌统一焦点环。
- **浏览器面**：::selection 染业务蓝、scrollbar-color 跟宿主滚动槽令牌、三档投影浅色蓝黑低强度/深色纯黑高强度、遮罩浅 .34/深 .55。

**取证**（`scripts/shoot-theme.py` 新工具）：双主题各跑 10 组前景/容器对比对（含半透明底染合成——alpha tint 必须叠到最近不透明祖先再算，Chromium 对 color-mix 返回 color(srgb) 记法，解析器两代都收）+ 层梯断言 + 四截图。当前 20/20 全绿（浅 5.21-9.92 / 深 4.94-10.42）。

**微调轮**（impeccable 目检→批量修→机检确认）：dark 层梯补齐（上）+ `.war-plan-body` 从 label-secondary 升 primary（计划原文是正文级内容，灰字在浅色聚焦页发灰）+ 深色 fail 混白补差。
**元首报修·下达对话框（同日补丁）**：功能面探针全过（档位轮转/禁用逻辑/草稿持久化/几何不溢出/cron 预览/零控制台错误），病灶=**选项卡选中态不可辨**——旧 7% 底染两主题实测仅 1.09-1.12:1（等于没有），状态全靠细边框独扛，目检浅深双轮点名。修法=选中态升**三通道**：`--war-select-tint`（浅 14%/深 20% 底染，深色 1.40:1）+ `--war-select-name`（浅=深蓝 5.96:1/深=白 9.98:1）+ 名字前圆点标记（非色通道）——档位卡/时机卡/cron 预设 chip/皮肤选项四处统一收编。取证 `_tmp` 探针量化前后 + 双主题目检确认。
**元首报修二·输入框溢出（同日补丁二）**：根因=**宿主不给插件子树提供 border-box 复位**——content-box 下一切 `width:100%`+padding 的件横向戳出父容器（composer 输入框恒溢出弹窗右缘 8px、`.war-modal` 实宽 678 超 max-width 640、cron 输入/侧栏行同病）。修法=一条全局复位 `.war-root *,::before,::after{box-sizing:border-box}`（治本，整棵子树不再可能横向溢出；固定尺寸小件统一缩 2px，开关旋钮几何自洽已核）。复测：textarea 距弹窗右缘余 18px、横向滚动面归零（638=638）、弹窗回 640 实宽、极端拖大被 flex 列吸收不外溢；三视口（1600x900/1280x700/1024x620）全过。

**门禁**：verify 199 测（新针脚 --war-canvas / body[data-ds-dark-theme] .war-root / dark 层梯两条 / 焦点环令牌）；shoot-v7 全绿（浅色侧既有断言 6.65-6.96:1 不回退）；shoot-theme 20/20 + 层梯两主题成立。

---

## V10 · 战线续接 + 星域战场（2026-08-26，元首 goal 全程）

**定案三柱**：①链是隐形语义（continuesFrom 嫁接，旧命令永远定格终态）；②星域是空间容器（同心椭圆恒星系，workspace=战区内老外新，☀HQ=WarGlobalState.active 化身）；③hover 是揭示手段（CardTrace 扩域到轨道光点，族链四段联动）。

**数据层**：`directive_created` 可选 `continuesFrom`/`continuationMode(deepen|retry|pivot)` 创建时按父态冻结（deriveContinuation 纯函数服务端推导，400 带可读理由）；`foldChains` 祖先闭包（rootByCommand/generationOf/membersOfRoot，环/悬挂/深度 32 护栏——手改日志自封段不炸）；投影 BoardCommand.chain{generation,rootId,length,hueSlot}，hueSlot=服务端 FNV-1a 单点算好喂前端。旧 JSONL 零迁移。

**pivot 分路（R1c 定案落地）**：真命令一穿五态——引信见 pivot 不开参谋会话，文本直插父任务活体 attempt 执行会话队列（sessions.prompt queue），received 记执行会话号→approved 挂父任务号即刻归档；无活体（排队中/已收官）落回常轨走参谋且带兜底档案；push 失败留 draft 重投。deepen/retry 征召词尾拼【战线档案】各代战况+败因明文。

**R2 spike 结论（evidence/v10/spike-midrun.md，宿主源码考古）**：queue=持久 next-turn 队列回合末自动消费（重启重放），busy 不拒不断——「将于本回合结束后送达」文案与宿主机制逐字吻合；busyEnter 设置纯手势级解析只作用于人手输入，插件推送固定 queue 即寄生其默认口径；冷会话 prompt=agents.resume 官方续接通道——deepen 会话级接线挂账 V10.1（v1 由战线档案保上下文）。

**星域实现红线兑现**：全 DOM/CSS 禁 WebGL；坐标全确定性（galaxyLayout 椭圆 rx=14+k*12 压扁 0.62、黄金角方位、moon 相位 hash01(sessionId)），SSE revision 翻新零抖动（6 测钉死）；凯旋印记=行星 data-triumphs 计数+标签 ✓N 只记 closed 仗；视图开关 war-dispatch-view 按钮双向、<900px 强制列表回退（列表态=原三列不动，回归安全网实测 shoot-v7 全绿共存）。

**悬浮舱（R3b）**：war-map 态左右列收窄(19%/21%)+78% 卡底色+blur 浮起+投影加深，中列整幅让位恒星系——任务左/星域中/战报右即 Dispatch 终态构图。

**坑录增补**：①起草器续接 chip 曾混用 `war-recent-item` 类把 shoot-v7 的 recent 选择器毒化（9 个假最近项、recent 回填断言失效）——取证脚本选择器就是针脚，组件类名必须独立命名空间；②shoot-theme/shoot-v7 各吃特定种子板面，互相串场前必须先跑对应 shooter 重建板面；③smoke 服 host 半边启动时装载代码，重建 lib 后必须重启进程（client 可热、host 不可热）——本机重启惯例 `CI=true nohup pnpm dsh --profile web --patch <repo>/cordis.smoke.yml --port 3080 --no-open`（无 TTY 下 CI=true 免依赖清空交互确认）。

**验证**：verify 209 测 PASS（+6 净增：directives+4、relay+4、starfield 新档 6，另并入既有计数口径）+ shoot-v10.py 五相位全绿×2 遍 + shoot-theme 双主题 20 对全绿 + 双主题地图截图入库。

## V10.1 卡规格统一 + 卡牌组三改（2026-08-26，元首定案三条）

**五行恒高卡（全部命令卡）**：R1 徽章行（dot/状态/档位/世代/sched/时间靠右）→ R2 命令原文一行截断（title 悬停全文，聚焦页标题有原文）→ R3 生命条 → R4 通知行（预检提示·取消原因，空也留 18px 位）→ R5 快捷操作行（进入对话·改直发·◎ 聚焦；tour 变体全空给「无快捷操作」占位）。实测尺寸 `--war-card-w:316px/--war-card-h:166px`（probe 双皮肤零溢出校准）；◎ 从 R1 挪到 R5=全部操作归行，R1 宽度让位徽章。旧预检虚线盒退役，`.war-card-note.war-preflight` 保留类名防 shoot-v7 针脚（war-preflight-text/-btn 同名保留）。

**卡组三改（元首三答）**：①坞里只摆最新代卡面（叠缘 50px 露出/band 路由/pointer-events 全退役——被盖卡点击劫持的 P0 从构造上消失）；②组性双信号=卡底两道渐缩纸缘（::before/::after z:-1，非阴影不犯硬影禁）+ R1 历代状态 pip（罗马数字=代数 GEN_ROMAN 同源，颜色=该代 OWN 任务状态四档+灰=未战而终，最新代下划线 now 标记；>4 代截头「…+最新4」与面板 4 行同口径防撑爆 R1）；③悬停 150ms/离开 200ms 向上展开面板：fixed 定位从卡面实测坐标落位（轨道横滚容器必裁剪绝对定位子元素；宿主无 transform 祖先，modal/map-hint 两条 fixed 先例），`min(代数,4)` 行固定高内部滚轮翻看（原生 stopPropagation 拦轨道横移——React 合成 wheel 到不了原生 track 监听），新在顶，点任一代直达聚焦页。键鼠同权：focus-within 同展开、↑/↓ 选代、Enter 打开、Esc 收拢回卡面；dock roving（←/→）排除面板卡。

**代际 OWN 语义（probe 实抓）**：pip 状态必须按「该代自己的任务」算（lineage 归属过滤），不能吃 commandTasks deps 闭包——否则祖先代的 closed 会把后代 pip 染绿。同理族系高亮升根级：星域光点溯源到 Ⅰ 代旧令时，坞里代表该战线的组卡面要点亮（exact-id 匹配落空，shoot-v10 P2 回归实抓）；单命令 root=自身行为不变。

**坑录**：宿主 `~/.dsh/settings.yaml` 的 ui-theme: dark 残留会让 shoot-v7 浅色对比度断言全灭（st-published 2.01:1 同款复发）——起服前先核 preference: light。

## V10.1 复评定形：圆点 pip + Mac 下载栈式面板 + 聚焦主导航（2026-08-26，元首五条）

**pip 复归圆点**（初版罗马数字被否）：一点一代、颜色=该代 OWN 任务状态四档+灰=未战而终，最新代放大+描环（outline-offset 环）；罗马数字退到 title/aria（圆点不背字）。>4 代「…+最新4」截头不变。

**聚焦是主导航态**：①聚焦激活时悬停族系高亮全面让位（traceActive 优先级翻转为 focusCommandId ?? hoverFamily——原 hover 优先会抢聚焦的能力）；②◎ 再点同卡=退出聚焦（onFocus 改 toggle；退出后鼠标若仍在卡上，悬停通道独立接管属正常）；③◎ 图标 17px 加大——`.war-btn.war-focus-btn` 两连类升特异性（`.war-btn` 基类在文件后部会压同名单类），且必须带 `padding:0 8px`：漏了它基类 4px 纵衬垫把按钮撑到 32px 溢出 R5 行（shoot-v10 同尺寸机检实抓）。卡高随之校准 316×168。

**面板 Mac 下载栈式**：去盒壳（无边框/底色/内衬）——历代卡直接自卡面上方生长；**最新代不重复**（坞上卡面即最新，面板只摆 cards.slice(0,-1)），最新前代贴底、更老依次向上，最高 4 行滚轮翻看；层叠入场 --i 错峰（最新前代先起，40ms 步进）。**历史卡=同形去 R5**（--war-history-card-h 137：过去的命令无操作，点开详情弹窗是唯一交互）且无悬停反馈（NO_TRACE+hover 中性化）——生命周期已从主界面退场。星域 ghost 族系同步升根级（hover 组面时 Ⅰ 代昔日阵地也显形，与卡面高亮同语义）。

## V10.1 六代演示链 + 组面板三坑收口（2026-08-26，元首验收轮）

**六代战线种子（playground 层追加，不动 seed-smoke——shoot 依赖其精确板面）**：「projC 部署」链走完三种续接模式（retry/pivot×2/deepen×3）与五档状态色（Ⅰ 收官绿/Ⅱ 再战败红/Ⅲ 转向后取消灰/Ⅳ 报发落琥珀→KillCredit 全绿自动收官转绿是机制真跑/Ⅴ 在打蓝/Ⅵ 分诊中蓝呼吸），外加 L1→L0 改档事件。pip 恰好 >4 触发「…+最新4」截头；面板 5 张历史卡 >4 行上限触发滚轮。种子入口 `scripts/seed-playground.py`（manifest 织换号同步注册）。

**坑①（P0 视觉）：Chromium 把 overflow 滚动容器里的 fixed 后代当滚动内容绘制**——组面板 fixed 挂在调度轨道（overflow:auto）内时，层叠被拽进坞域，高于 4 行的面板被三列卡片盖住（矮面板恰好落在列内容下方空档，probe 双轮才抓到；z-index 9999 无效、elementFromPoint 才是照妖镜）。修法=createPortal 挂 `.war-root` 直下（React 合成事件沿 React 树冒泡，hover/键盘/滚轮语义不变）；shoot 面板 locator 必须改全局（不再是组 DOM 后代）。

**坑②：portal 出坞破 CSS 变量域**——卡规格变量原定义在 `.war-dispatch`，面板挂 war-root 后 `--war-card-w/h` 全失效（宽高回退自然值）。修法=变量升 `.war-root`，规格选择器改 `:is(.war-dispatch, .war-group-panel)` 双域。

**坑③：滚轮起步方向（元首定）**——展开即滚到底：首屏见贴卡面的最新前代（Ⅴ 在底），往上翻才见更老（Mac 下载栈直觉）。effect 依赖必须含 pos：open 先翻时 pos 尚 null、面板未挂载，坐标落位后才是真挂载时机（首版依赖只写 open，scrollTop 赋值扑空）。

## V10.1 灵动岛文案与通知审查（2026-08-26，元首点单复审）

**文案五改（双皮肤）**：①岛计数「待接」正名「接令」（plain=待分诊）——与「待领」一字之差语义撞车，参谋侧未成形命令（分诊/对话）统一为接令中，宿主侧栏 tooltip 同步；②零段折叠——「待接 0 · 待领 0 · 作战中 0」是胶囊噪音，非零才显示（failed 原本就折）；③到访迷你条「▲收官」→「✓收官」（善终语义，与凯旋印记同符；plain ▲完成→✓完成）；④war 皮肤到访横幅「新命令」→「新令」与迷你条「✚新令」同词（plain 本就一致）；⑤钉住标记 📌 emoji→◉（彩色 emoji 跨平台渲染不可控，◉ 与 ◎ 同族）。

**通知可达性两实修**：①pill 的 aria-label 原为静态「作战室——悬停展开·点击钉住」，aria-label 覆盖内容使计数/徽章对读屏不可见——改动态拼入大盘计数+收件箱数（「作战室——接令 5 · 待领 4 …——等你发落 4——悬停展开」）；②新增视觉隐藏 live 区（.war-sr-only + role=status）：收件箱净增播「作战室新增 N 件等你发落」。**水合守卫（probe 实抓）**：首版把 SSE 首灌 0→4 也当"新增"播——开局报"新增 4 件"是噪音（那是到访摘要横幅的本职）。判定抽纯函数 `inboxGrowthAnnounce`（inbox.ts，单测钉死：未水合一律静默/水合后首次只记基线/净增返增量/持平减少静默）。本地 smoke 服无 LLM 网关，活体增长链路靠纯函数+水合静默 e2e 双覆盖。

**坑**：shoot-v7 到访横幅断言「新命令」被改名击中——取证针脚就是文案契约，改名必须跟针脚。

## V11 · 3D 星域战场 P2（2026-08-27，元首定案「直接做到 P2」）

**架构定案**：真 WebGL（three@0.185 打进 client bundle，禁 CDN）画「空间」——星粒球壳（确定性种子 900 点）/行星球体（Lambert 微光影）/同心轨道环/卫星光点/ghost 空心环/HQ 暖阳；**DOM 覆盖层承载全部交互实体**——行星按钮/光点/ghost/速报条/微图例仍是 DOM（aria/键盘/族系高亮/shoot 针脚原封不动），canvas 只管空间。手写轨道相机（拖拽旋转/滚轮缩放/双击与 R 复位、指数阻尼、reduced-motion 直达）；覆盖层每帧以视空间深度投影摆位（translate3d+scale+深度 zIndex），背后元素隐藏。**三红线沿用**：坐标全确定性（SSE revision 零抖动，相机是 ref 本地量不随渲染重置）；不造假运动（会动的只有用户手里的相机）；WebGL 不可用整棵回落 2D 星域（onUnavailable→no3d）。浅色=纸色宇宙/深色=星尘深空（读 body[data-ds-dark-theme] + MutationObserver 跟随宿主）。

**工程坑录（四连，全部 probe/shoot 实抓）**：①tsdown 默认把 dependencies 外置——client 包裹层的 require 只认宿主冻结模块表，运行时 require('three') 必静默回落 2D；解法 `noExternal:['three']`（bundle 240KB→1.56MB raw，gzip 72→~390KB，元首知情成本）。②覆盖层登记原走 CSS 属性选择器——**Windows 反斜杠路径（C:\repo\alpha）在 CSS 选择器里是转义符**，querySelector 永不命中（shoot 板全灭、playground 正斜杠侥幸全过的照妖镜）；解法 JS 侧 key 映射。③缩放基准距两路不同源：相机初值用 aspect 1.8、基准用挂载瞬时尺寸（布局未稳 aspect≈0→dist 夹到 420 上限）→ s 恒钉 1.6、滚轮「失灵」；解法 ResizeObserver 首次真实尺寸 + 数据落地双条件定标，复位/键盘全走同一 ref。④窄板（1280）初始机位按全宽 fit——行星投进任务/战报浮舱；解法 `initialCam(count, aspect, safeWidthFrac)` 横向按【可用带宽】收缩（views 按实测舱位推占比），CAM_DIST_MAX 升 800，与 2D 禁区收缩同语义（1720/1280/1000 三视口零遮挡机检全过）。

**验证**：tests/starfield3d.test.ts 5 测（夹持/阻尼/布局确定性/月轨/机位自适应含中带收缩）；verify 针脚 galaxyLayout3D+WebGLRenderer；shoot-v10 P2 增 3D 断言（canvas 在场/拖拽旋转/双击复位/滚轮同比缩——近距卡 1.6 上限的不计/覆盖层零遮挡）；三件套 EXIT=0；双主题 3D 截图目检（九星环系+太阳+光点+速报条浮舱共存）。

## V11.1 demo 视觉栈全量移植 + 三键相机（2026-08-27，元首「素材直接拿来用」）

**视觉栈移植（space-warzone.html，程序化素材=代码，全确定性化）**：UnrealBloomPass 辉光（demo 参数 1.0/.65/.18，浅色降 0.55/阈值 0.32）+ ACES 色调映射曝光 1.1 + FogExp2 深空雾（浅色无雾）+ 太阳点光/冷补光/环境光三灯 + 三层彩色星海（2800 星调色板：白/蓝/暖/紫/青×亮度，远中亮 1600/700/180）+ 四片加法混合星云 + 小行星带（Icosahedron InstancedMesh 140 块，外环外圈确定性散布）+ planetTexture 全量移植（横带/大陆斑块/陨石坑/极冠 256×128 SRGB）+ 行星 MeshStandard 自发光贴图 + 大气光晕 sprite（加法混合吃 bloom）。行星色相按环序走 demo hues 八色板+hash 微抖（同行星恒同貌）。浅色=纸色宇宙同栈降饱和（emissive .18/星半暗/星云 .035）。

**三键相机（元首定）**：左键拖拽=平移（即时跟手——位移不阻尼，手感=推着星系走；像素→世界按中心距换算，沿相机右/上轴推 center，PAN_LIMIT 300 防走丢）；中键=旋转（阻尼）；滚轮=缩放。中键 mousedown 必须 preventDefault（浏览器自动滚动圈，pointerdown 拦不住）。双击/R 复位含平移归零。相机位=center+球坐标偏移，lookAt(center)。

**坑（本轮双坑）**：①noExternal:['three'] 精确匹配漏掉 'three/addons/...' 子路径——外置 require 一出，壳层模块表 miss 让**整个 client 加载炸掉**（插件入口都不见，console 才有真相）；改正则 `/^three(\/.*)?$/`。②宿主 ui-theme: dark 残留再犯（v7 st-published 2.01 同款）——shoot-theme 不写 settings.yaml，恢复是人工纪律；任何 dark 截图回合后必须核 light。

**验证**：verify PASS（starfield3d 5 测含中带收缩）；shoot-v10 P2 三键断言（中键旋转/左键平移/双击复位含平移归零/滚轮同比缩）+ 三件套 EXIT=0 + 1720/1280/1000 三视口零遮挡复验。

## V11.2 「3D 可交互太空战区」重铸（2026-08-27，元首规格书：母舰/散布/派兵/星闪）

**规格四件**：①场景中心=大型母舰 Headquarters（金属科幻、引擎光晕、静泊原点、全场景最大单体）；②星球松散随机散布（大中小强烈分异、独有色相贴图光晕——**明确不要规整同心圆**）；③作战部队从母舰起飞飞往星球（平滑动画），attempt 收束返航消隐；④星海闪烁 + 深空雾 + 辉光。元首规格实质**修订两条旧红线**：「不造假运动」让位于派兵剧场、「内老外新同心环」让位于松散散布——落法是飞行=真实部署的动态呈现（事件驱动起飞、挂载期已驻单位演到场上演回放），不是状态伪造。

**母舰建模（全程序生成）**：六棱柱主舰身（纵轴 Z、艏细艉粗）+ 舰首锥 + 舰桥/桅杆 + 双舷舱 + 尾鳍，flatShading 金属材质（metalness .62）；三喷口引擎 glow sprite（加法混合），脉动=战时心跳（`sin(t*2.4)`，active 关战争降为余烬）。**远景读成光球的教训**：引擎 glow 首版 scale 5.5/opacity .85 在 bloom 下把 34 长的船体整个吞掉——收小到 4/.6 才让船体轮廓在默认机位可辨。4 倍放大目检通道（PIL crop + LANCZOS resize）确证建模无误，是辉光量级问题。

**松散散布（galaxyLayout3D 重写）**：大中小按创建序分配（前 2 大、3-5 中、余小），半径带大 [68+1.2n,100+1.2n]/中 [46+1.2n,76+1.2n]/小 [34+1.2n,62+1.2n]，方位/距离/纵向全 hash 确定性随机；逐颗 12 次拒绝采样（与已落位星间距 > 半径和+12、母舰净空 >40）。initialCam 改按 layoutExtent(extent) 定机位（不再环数推半径），裕度 1.35。

**派兵战机（ShipSystem）**：每活体 attempt 一架（锥体 1.5/5.2 + 橙红 glow 9）；三态机 fly→stationed→return→gone：起飞=母舰艉部随机偏移出发，缓入缓出二次贝塞尔（控制点 hash 抬高）3.2s 到达 moonPos3D 目标点；驻泊=绕目标 2.4 半径 0.35rad/s 巡护（lookAt 切线朝向）；消失=贝塞尔返航 2.2s 后移除。SSE 增量同步（sessionId diff：新=起飞、缺=返航、留=目标随动）。reduced-motion：不飞不闪直接驻泊。DOM orb 按钮仍钉在目标点（交互/aria 原封），战机是 canvas 剧场。

**星闪**：三层星海换 ShaderMaterial（uTime 逐星相位 `sin(uTime*freq+phase)` 幅度 ±42%、尺寸衰减 1400/-mv.z × pixelRatio）；亮度下限提到 .72、far 层尺寸 1.8——首版「星海稀疏」目检反馈后调。

**验证**：verify PASS 218 测（starfield3d 6 测：散布确定性/大中小带/净空/不叠/椭圆轨道下界/extent 机位）；probe-v112 16/16（双主题 canvas+母舰标记+帧差>0+三视口零遮挡+三键相机）；shoot-v10/v7/theme 三件套 EXIT=0（v7 前又踩 ui-theme dark 残留第 4 次，复位 light 后全绿）；目检双主题 1720 截图落 .goal/evidence/v11/。

### V11.2 视觉检查整改轮（同日，「用视觉检查并优化星域」）

五机位双主题捕拍（`temp/vision_v112.py`：默认/横转/中距/母舰特写/浅色 + PIL 中带裁剪与 4x 放大）目检抓出三组缺陷，全部修复：

1. **行星逆光剪影**（两主题同病：深色全黑、浅色成扁平深蓝圆片）——根因是太阳用原点 PointLight，行星朝相机面永远背光。重铸为三灯：**主光 DirectionalLight**（0xfff2e0, 2.4）从默认机位侧上方 (340,420,260) 打亮行星正面纹理 + **冷轮廓光**（0x88aaff, 0.5）反侧补背光面 + 原点小 PointLight 只管母舰艉部暖色。行星自发光深色 0.32→0.42。
2. **母舰过曝成火球**（特写整幅白盲+暖雾罩场）——引擎 sprite 量级 × bloom 阈值 0.18 双重放大：贴图白核缩小变暖（255,236,200 起 0.95 透明度分三段衰减）、scale 4→2.3±1.0 脉动、opacity .4+.2·pulse；bloom dark threshold .18→.28 / strength 1.0→.85。修后特写六棱柱船身/舰桥/舷舱/尾鳍全可辨（4x 放大目检）。
3. **碎石带画出规整圆弧横穿星球带**（radius=extent×0.9 正好切进行星带，且匀值半径读作「同心圆」——正撞元首红线）——外移 extent×1.18、半径差 ±30、纵向 ±16、120 块缩小 0.25-0.95：读作外缘碎屑云。
4. 浅色光晕奶白（additive 白 halo 在纸底晕开）——halo opacity 浅色 .16→.07。母舰 scale 1.18 提存在感；initialCam 裕度 1.35→1.28 填幅。
5. **暗色残留第 4 次破案**：settings.yaml 的 `ui-theme: dark` 不是脚本写的——**:3080 活宿主界面切主题会持久化回 settings.yaml**（元首开着板切了暗色）。取证跑批前先核该文件；复现「v7 st-published 2.01」先查这个。

验证：verify PASS + probe-v112 16/16 + shoot 三件套全绿（复位 light 后）；五机位复拍对比确认三组缺陷全消。

## V11.3 星球真实化：NASA 自然色 + 星空提质（2026-08-27，元首定案「彩色的很 low」+ 三问拍板）

**定案三问**：①色板=全 NASA 自然色（彩虹糖退役）；②环境动效放行（自转+云漂——「不造假运动」红线第二次修订，真实天体本就在转）；③范围锁星球+星空（母舰/战机保持）。**浅色模式不适用星空语义——深色为准，浅色只保不破不再投入**（元首本轮明示）。

**六原型贴图管线**（取代 PLANET_HUES 彩虹板）：确定性值噪声（lattice 预生成 Float32Array，逐像素零字符串拼接——512x256 性能护栏）+ fBm 四阶金字塔（u 横向环绕无缝/极点夹持）；`archetypeOf(wsPath)` hash 分派 gas(木星米棕带纹+域扭曲+风暴斑)/icegas(海王深蓝弱带)/rust(火星锈岩+玄武斑+极冠+22 坑)/gray(水星密坑 36)/ice(冰壳裂脊线)/terra(深海+棕绿大陆+极冠)；同趟 ImageData 画 map+bump 高度场（bumpScale .45 终结线浮雕）；**模块级纹理缓存**（key=kind:wsPath，超 48 组丢最旧）——syncPlanets 随 SSE 高频重建网格但贴图终身画一次。

**大气/云/自转**：BackSide fresnel 薄壳（1.15x，pow3.5 陡衰减，色随原型、gray 免）接棒 halo 光球（退役）；云壳 1.02x（fBm alphaMap 纬向拉伸，terra/rust）；轴倾 group.rotation.z、自转表面 rotation.y（0.02-0.055 rad/s，气巨 1.7x），云 1.35x 速差；reduced-motion 全冻结。emissive 0.42→0.06（夜面真黑）。星空：黑体谱星色（白/蓝白/黄白/橙/红橙）+ 银河带（倾斜大圆环 900 微星拟高斯散布+两片带向微光）+ 星云降调。

**三轮目检排障（视觉检查工作流的价值证明）**：①首轮行星全炸白球——先疑大气 shader（uK 1→0.32 无效）再疑云层 Lambert 过曝（收覆盖无效），最终定位：**照片显示色直接当材质 albedo**（sRGB 238→线性 0.86）在 2.4 主光下必然白切——六套 ramp 全部压到真实反照率（气巨 0.35-0.5）+ 主光回 2.0 才治本；②headless fps=4 是 SwiftShader 软件光栅假象——**fps 门必须在有头真 GPU 实例测**（实测 60.1-60.3fps，probe 已内置 headful 实例）；③键盘缩放替代滚轮/双击捕拍（点空白聚焦 canvas 后 +/-/R——滚轮点会误开命令卡，中距截图拍成聚焦页）。DOM 球 3D 态弱化成细环（真实行星上压个黑球像黑月）。

**验证**：verify PASS（新测试 planetNoise/archetypeOf 确定性+环绕连续性+原型合法）+ probe-v112 17/17（含 headful fps≥45）+ shoot 三件套全绿（v7 前又踩 ui-theme dark 回写——活宿主界面持久化，复位后背靠背跑批）。取证 `.goal/evidence/v11/v113-*.png`。

## V11.4 warzone demo 全要素 1:1 整体进驻（2026-08-27，元首令「完全一比一替换当前星域」）

**定位**：现役 starfield3d 整体退役，space-warzone.html 1126 行全要素原样搬入（`src/client/warzone-scene.ts` 引擎 + starfield3d.tsx 薄壳）。世界是 demo 自己的——**后端连线（workspace→星球 / attempt→编队 / HQ→母舰）是下一独立阶段**，本阶段零板数据消费。

**全要素清单（常量逐字对齐）**：①3D 现实视图：ACES1.1+FogExp2(0x06070f,.00075)+Bloom(1.0/.65/.18)+MSAA×4、五灯制、2800 星闪烁海、4 星云、140 碎石带；②母舰 Headquarters（八棱柱舰体/上层甲板/指挥塔/信标呼吸/传感器球/Torus 桁架/六连接梁/四引擎舱光晕/8 舷窗灯带，自转 .06）；③16 星球（大3中6小7，松散随机轨道 ecc .05-.22+24 次间距采样，程序纹理，状态光晕：作战中橙红脉冲+战火环/已占领偏蓝，克洛诺斯…恩底弥翁命名）；④战争模拟：编队 3-4 机 V 阵（qbez 弧线）出征→接敌（6-14s）→攻占（冲击波环）→部署→返航；上限 9 支、4.5-8s 派兵、无目标随机失守反转——永不落幕；⑤悬停信息卡三型（HQ 战力/星球等级半径距离驻军/编队进度，raycast 拾取，0.5s 实时刷新）；⑥**2D 指挥室**（◉/▤+V 键）：雷达盘（距离环/度刻度/55 段扫描余辉）/HQ 八角符号/星球符号（状态色+驻军弧）/编队三角+虚线航迹/编队名册/态势统计/战况速报 WAR LOG/四角括号/CRT 扫描线+信号闪线/滚轮缩放；⑦HUD/图例/提示/暗角（loading 屏不搬——无 CDN 等待）。

**集成决策**：①**确定性改写**：demo 全部 Math.random→hash01 种子 det()（固定种子 'warzone'，`warzonePlanets()` 纯函数导出单测钉死——同种子恒同布局，SSE 零抖动）；②相机用 demo 正案 **OrbitControls**（three/addons 已入包：左键旋转/中键推拉/滚轮缩放/禁平移，damping .06，距 50-620）——元首早前三键 spec 让位「1:1 demo」，连线阶段可再调；③布局适配：切换钮放**顶中 HUD 下**（右上角是战报浮舱列头的地盘——`.war-ops` mapmode 是 z-index:2 层叠上下文，落那儿 Playwright 实抓点不到）；图例/提示沉底中带（浮舱侧位让开）；指挥室模式 board 挂 `wz-cmd` 类让浮舱/坞整体让位（demo body.cmd 等价物）；④V 键带输入态守卫（composer 打字不触发）；⑤主题恒深空（星空语义属深色）；⑥reduced-motion 全模拟冻结（dt=0）；⑦WebGL 失败仍整棵回落 2D 星域；⑧调试句柄 `window.__wz`（planets/squads/log/mode/setMode）供探针断言。

**移植抓虫三则**：①薄壳漏 `createElement` 导入——挂载 ReferenceError，整板 0 元素（React 壳件必查导入面）；②`pick()` 返回实体 ref 本身，帧循环误拆 `hit.ref`→undefined→`hovered.kind` 炸断 rAF 主循环（信息卡永不现身+引擎停摆一石二鸟，页错探针立功）；③排障通道=页内直接调 `__wz.scene.pick(0,0)` 二分定位（射线对/壳错）。

**验证**：verify PASS（tests 换血：布局确定性/间距/分级/qbez/ease；针脚 warzonePlanets+FLEET ROSTER+HEADQUARTERS）+ **probe-warzone 21/21**（DOM 件/16 星分级/编队在途/日志演化/信息卡/指挥室按钮+V 键闭环/浮舱让位/1280 冒烟/有头 fps 60.1）+ shoot-v10 P2 改写全绿（星球 DOM 断言→warzone 断言+相机 OrbitControls 断言）+ v7/theme 回归绿（ui-theme dark 又回写一次——复位后背靠背跑批）。取证 `.goal/evidence/v11/v114-*.png` + `.goal/evidence/v10/`。

### V11.4a 星空修复（同日，元首目检「星空和 html 里看到的不一样」）

根因：渲染器误开 `alpha:true`（透明画布）——双重后果：①宿主浅色主题白底透出，加法混合白星画在白底=整片隐身；②更隐蔽的：加法混合写进 alpha 画布后，浏览器按预乘 alpha 合成会把 RGB 钳到 α 以下——星点系统性压暗、bloom 辉光被削，观感「稀疏暗淡不像 demo」。修=`alpha:false`+`setClearColor(0x02030a)`（demo body 底色，1:1 正案）。教训：**移植 demo 的加法混合星空必须连画布透明度一起照抄**；实测上空带亮星点 53 颗/峰值 243，probe 21/21 无回归。

### V11.4b 「星链」星空修复（同日，元首目检「星星排列整齐像星链，不像星空」）

真正的根因不在移植，在种子函数：裸 FNV-1a 对「只差末位一个字符的连续键」（星星 key:0..2799）输出**恰差 prime/2^32≈0.0039**——u/th 坐标渐变排队，2800 颗星被织成 720 条弧线（V11 起截图里的「点状弧线」一直误判成碎石带，实为星链）。修=hash01 加 murmur3 终结混叠（fmix32：xor15/imul/xor13/imul/xor16），全库散列受益且确定性不变；实测修后 u 序列全随机、分桶 259-311（理想 280），verify 全绿（无测试钉死旧值——当时立「断言关系不钉值」的纪律红利）。另按元首令恢复画布 alpha:true（透明底，容器 CSS 透出）。**教训入坑录：确定性种子函数对连续整型后缀键必须有终结雪崩，新哈希使用前先跑连续键相关性检查。**

## V11.5 连线：真实板数据驱动 warzone（2026-08-27，元首愿景收敛定案）

**愿景**（元首宏图收敛三答）：整个 AI 编程系统=太空战争——用户=舰长（HQ 母舰）、agent=舰队、星系=workspace、folder 星球层不做（收敛）；产品先插件后独立（多宿主 hub=第三阶段）；**雷达值班+3D 战略**双态（2D 指挥室为日常默认态——高信息密度值班，3D 星图为战略/演示态，V 键双向）。定位=k9s for AI agents 的星图渲染（state-first 导航对 history-first 会话列表的换轨）。

**映射落法**：星球=workspace（N=去重战区数，命名=目录名·W-02，大小分级=历史任务量排名 top2 大/3-5 中/余小，`warzoneLayoutFor` 纯函数确定性散布）；状态=待进攻（无活跃）/作战中（有 live attempt，橙红脉冲+战火环）/已占领（有凯旋史，偏蓝+驻军弧=凯旋数）；编队=agent 会话（live attempt：holding 集结/已领未起跑→battle 交战/有动词→deployed 驻泊/配额暂停或待验收；spawn=母舰起飞 qbez、消失=返航消隐、相位随板迁移，`attemptPhaseOf` 纯函数）；inbound=待发命令数；WAR LOG=真实事件流（下令琥珀/凯旋蓝/败退红/待验收琥珀，`warLogOf` 30 封顶本地时分戳）；HQ 卡/星球卡/编队卡全部真实字段。**demo 自驱模拟（trySpawn/失守反转/自动攻占）整体退役**——bridged 态旁路，每颗星每次发光对应真实状态（红线）。

**视图纪律**：雷达默认态下浮舱/坞**不再让位**（原 wz-cmd 全屏化退役）——雷达是态势底图，任务/战报舱与命令坞是操作面恒在场；HUD/图例/提示按 demo body.cmd 语义隐退。reduced-motion 冻结全程保留。

**坑**：syncBoard 初稿把 SQ 编号当 sessionId diff 键+虚构 helper——返工为 WzSquad.sessionId 字段+squadBySession Map；rebuildBelt 是旧设计残留名（demo 碎石带本就固定母舰近郊，1:1 保持）；针脚 warzonePlanets 被树摇换 warzoneLayoutFor。

**验证**：verify PASS（桥接 4 新测：warzoneLayoutFor 确定性/任务量分级/命名、attemptPhaseOf 暂停优先、warLogOf 倒序封顶 stamp）+ **probe-warzone(bridge) 14/14**（星球==去重 workspace、编队==live+reported、状态与编队在场一致红线、真实日志、雷达默认+浮舱在场、V 切 3D、HQ 卡真实行、59fps）+ shoot 三件套全绿（P2 连线版：雷达默认/浮舱恒在/HQ 卡带凯旋行/相机 OrbitControls）。取证 `.goal/evidence/v11/v115-*.png`。

### V11.5a 公转停止（同日，元首问「星球应该运动吗」→ 定案：公转停/自转留）

论证四层：①空间记忆是宇宙愿景核心资产，4-13 分钟一圈的漂移把上午记的星图下午就重排；②军图铁律=地形不动单位动（星球是地形 workspace，编队是单位 agent——地形漂移不表达任何真实状态，与「假失守」同罪仅更温和）；③值班可用性：雷达爬行符号难扫视、3D 漂移目标难 hover；④场景生命由星闪/扫描余辉/编队/引擎呼吸/交战脉冲/**自转**（V11.3 放行，不改位置）供血，不需要公转。实现=update() bridged 态不推进 o.angle（一行门控）；probe 新增「星球坐标 2.5s 恒定」断言钉死。拒绝折中方案「极慢公转」：感知不到=无生命感，却照样弃位置确定性。

### V11.5b 三键相机 + V11.5c 雷达围合区（同日，元首两令）

**V11.5b**：手势改 3D 软件范式——左键平移（即时跟手，推 center）/ 中键旋转（阻尼，**绕当前屏幕中心**不再恒对 HQ）/ 滚轮缩放（指数）；双击/R 复位含平移归零。OrbitControls 退役（demo 正案让位元首新手势）；clampCam/dampCam 纯函数单测（dt=0=reduced-motion 直接吸附）。滚轮双路由：雷达态缩态势图、3D 态缩机距。**坑**：headless 软光栅 rAF≈4fps，阻尼收敛慢 5 倍——shoot 复位断言须等 2.8s 而非 1.1s。

**V11.5c**：雷达画布不再全屏乱叠——**画进灵动岛/任务舱/战报舱/命令坞围合的中央自由区**（壳每帧算 safe 矩形传入，盘心/名册/态势/速报/标题/底栏/四角括号全锚 safe；宽<940 时侧面板让位）；**扫描波束+55 段余辉+偶发信号闪线按令退役**（静态距离环/刻度/方位标/CRT 纹理保留）。probe 15/15；取证 v115c-radar-safe.png。

### V11.5e 回绕倒转修复（同日，元首实抓「快到 360° 瞬间反向转回去」）

根因：dampCam 对 yaw 线性插值，而 clampCam 把 yaw 归一化 [0,2π)——累计旋转跨 2π→0 边界时目标值从 6.28 回绕成 0.01，阻尼器带当前值沿数字直线倒退扫过近整圈（k=9 下即「嗖」地反转）。修=最短弧插值（Δ 折算 (-π,π] 再乘阻尼系数）——角度回绕必走短弧。单测钉边界（6.2→0.1 应推进 +0.18 方向）；实弹 14 段连续拖拽 3.12rad 全程单调无倒跳。教训入坑录：**任何角度阻尼/插值必须先做 shortest-arc 折算，归一化与插值不能裸拼**。

### V11.5d 中键横向旋向翻转（同日，元首实抓「左右旋转是反的」）

orbitBy 的 dx 符号翻转（`-dx * 0.006`）：拖右=场景右旋（3D 软件惯例——手抓场景转而非转相机）。同轮按元首令重播种子演示板（「切换到新的种子demo」=seed-playground.py 重播种卡配置，**不是**改星空种子——歧义当场澄清，星空种子 gen 前缀误改已回滚）。

### V11.5f 指挥室减负 + 执行卡索引 + 高亮联动（2026-08-27，元首六条令）

**元首六条**：①指挥室去信息窗（作战编队/战区态势/战况速报）；②星球尽可能分散不挤；③执行中卡片索引到星球所在处（连线=旧战场卡的实时动词卡）；④「深空战区/DEEP SPACE WARZONE」HUD 取消，按钮改「3D 视图/2D 视图」；⑤悬停/聚焦板卡→高亮对应星球+显工作区名+HQ↔星球飞船轨迹。

**落法**：
- **雷达减负**：WarzoneTactical.draw 砍 panel() 族（名册/态势/速报/顶底栏文字），只留盘+距离环+HQ 八角+星球符号（含高亮虚线轨迹+亮名）+编队三角+CRT 静态纹；安全区测量从 cmd 分支提升到双态共用（执行卡钳位也用它）。
- **星球分散**：warzoneLayoutFor 带宽拉宽（大星 r200-310/中 130-240/小 90-200，tilt 6-30°，y ±55）+拒绝间距 `p.radius+radius+42`；WZ_CAM_HOME.dist 281.6→350（拉远兜视野）。
- **执行卡覆盖层**（.war-wz-xcard）：live 编队才上卡（呼吸点+动词+源命令摘要），DOM 卡钉星球屏幕位（3D=planetScreen 投影/2D=hits 命中位），SVG 虚线连星球→卡，点击跳源命令聚焦页（sourceCommandId 经桥新字段透传），悬停/聚焦联动星球高亮；同星多卡按 k*34 纵向叠放。
- **高亮联动**：hlWs=板卡 hover/focus（views 按 familyCmdIds→任务 workspace 去重算 highlightWs 无条件传参）∪ 执行卡 hover；scene.setHighlight 重建 ≤4 条 LineDashedMaterial 虚线（HQ↔星球，dashSize6/gapSize4 青色）+星球本体增亮（op .58+青染 35%+halo×1.16）+名签 .war-wz-pname（亮星下方）+2D 雷达同高亮（盘心→星球亮虚线+粗名）。frame 循环 hlKey 变更检测，SSE revision-only 不受扰。
- **HUD 撤**：JSX 块+CSS+针脚全清（FLEET ROSTER 针换 war-wz-xcard/setHighlight 针）；提示行改「左键 平移 · 中键 旋转 · 滚轮 缩放 · 双击/R 复位 · V 切换视图」。

**目检抓真 bug（几何机检补位）**：执行卡钉星球真实屏位，projA 星球投影恰落命令坞底下——卡被 .war-dispatch 拦截不可点。修=卡位钳进围合安全区（hw/hh 按 offsetWidth 实测，线仍指真实星球位）；playwright 几何断言双态 0 相交（比视觉更硬）。另 probe 红线收窄：作战中⇔有 **live** 编队进驻（reported 驻泊编队可停在非交战星——待验收≠作战中，不是状态说谎）。

**验证**：verify PASS（218 测）+ probe-warzone **21/21**（HUD 撤除/按钮名/执行卡==live/高亮进出双断言/名签）+ shoot-v10/v7/theme 三件套全绿 + 双态几何 0 相交。取证 v115f-radar/3d/3d-highlight.png。**CDN 目检通道又失效**（analyze_image 对 Read 回传 URL 400），用 PIL 裁半图+DOM 几何机检替代——目检 SOP 再确认。

### V11.5g 执行卡拖放+双线语义+HQ 锚星阶+动态缩放界（2026-08-27，元首五条令）

**五条**：①2D 执行卡可自由拖放、始终以**实线**索引回星球；②3D 连线同改、与 HQ 线区分；③tooltip 不许被调度栏/浮舱遮住；④星球大小以 HQ 为基准重设——旧 LV4 大星(9-13)降为 LV1 小星档、以此类推（小星拉远看不见是根因：旧 1.8-3 在 dist>500 时屏占不足 4px）；⑤缩放范围随星球布局与星体大小实时限界。

**落法**：
- **双线语义**：卡索引线=**实线琥珀** rgba(255,179,92,.78) 1.3px（SVG，双态共用）；HQ↔星球高亮轨迹=虚线青 0x6fe3ff（3D LineDashedMaterial/2D 雷达同款）——「部队在哪打」vs「母舰援护谁」两通道一眼分野。卡描边/悬停同步琥珀系。
- **2D 拖放**：委托 pointer 事件在卡容器（React 重渲染不丢手柄），pointer capture 保拖拽跟踪；偏移记 `cardOffRef`（sessionId→dx/dy，相对安全区锚位，2D 态生效、3D 态忽略钉回投影）；未拖的卡仍钳围合 safe 区，拖过的自由摆放。**坑：pointer capture 会把拖拽后的 click 落回卡上误开聚焦页**（probe 实抓）——拖动>4px 后 350ms 窗内捕获阶段拦截 click。拖拽期间点亮该战区高亮（与悬停同路）。
- **tooltip 防遮挡**：围合 safe 矩形计算提前到拾取后（双态共用），信息卡位置钳进 safe（先按指针方位翻转，再整体夹持）。
- **HQ 锚星阶**：small 9-13 / medium 14-18 / large 19-24（HQ 船体半径 ~15 居中为锚）；demo 谱与真实谱同步换代；编队驻泊/交战轨道半径改比例式（`radius*1.15+6` / `*1.18+4/7`），光环/冲击环本就比例式。
- **动态缩放界**：`wzCamBounds(minR, maxR, extent, viewH)` 纯函数——近界=max(最大星,HQ)×2.3（防穿模），远界=min(最小星可见性[viewH 下≥9px], (外沿+最大星)×2.6[战场取景], 3200)，兜底≥home（复位永合法）；`clampCam/dampCam` 加可选界参（无参退静态常数，旧调用/旧测零破坏）；`recalcCamBounds()` 钩在 syncBoard 星球重建与 resize，orbitBy/zoomBy/帧阻尼全吃动态界。camInfo 携带 distMin/distMax 供探针。

**验证**：verify 219 测 PASS（wzCamBounds 新测五断言+星阶范围断言换代+可选界兼容测）+ probe-warzone **27/27**（实线琥珀 computed-style、拖放 Δcard==Δline、狂拉两头封在动态界±8、复位在界内）+ shoot-v10/v7/theme 三件套全绿 + 像素机检（远界 dist694 时小星 23px/大星 59px、拖后连线拉伸 177px）。取证 v115g-radar-drag/3d/3d-far/tooltip-safe.png。**教训**：宿主主题残留第 5 次入账（:3080 活 UI 写回 dark，取证前必查 settings.yaml）。

### V11.5h 星球回 NASA 自然色（2026-08-28，元首令「星球用NASA自然色」）

V11.3 六原型被 V11.4 warzone 整替退役后按令复权——从 710abc8 考古整体移植进 warzone-scene.ts：**archetypeOf(wsPath)** 确定性分派（gas 气巨/icegas 冰气巨/rust 锈质/gray 灰质/ice 冰质/terra 类地，权重偏哑光岩质）+ fBm 确定性贴图（lattice 预生成 Float32Array、512x256、模块级缓存 48 组丢最旧——SSE 重建零重画）+ bumpMap 高度场 + 云壳（terra/rust，差速自转 ×1.16）+ 大气临边辉（BackSide fresnel，gray 免）+ 行星环（气巨 55%，Cassini 缝）。**ramp 取真实反照率的 V11.3 教训原样随行**（照片显示色当 albedo 会被主光推成白板）。架构改造：WzPlanet.mesh 升 THREE.Group（表面/云/大气/环/halo/proxy 全子节点本地坐标，轨道只推 group）；halo 仍是状态语义载体（作战中橙红脉冲/占领蓝/高亮青），底色换原型中性辉光 ARCH_GLOW；teardown 群组遍历释放（Set 去重），**缓存贴图绝不 dispose**（违者 SSE 重建即白球）。

**坑（考古移植三连）**：①sed 区间重叠致 ATMO_COLOR 重复声明；②提取区间切在 STAR_VERT 模板字符串中间——半截 shader 尾巴留在块尾炸全文解析；③planetNoise 尾两行被边界截掉（brace 差 1 只报 EOF，靠 top-level 声明深度扫描定位）。以后考古移植用函数边界标记而非行号区间。

**验证**：verify 220 测 PASS（archetypeOf 确定性+120 路径六型全覆盖、planetNoise 确定性/值域）+ probe-warzone **28/28**（新增 NASA 材质断言：每星 bumpMap 在场）+ shoot 三件套全绿 + 纹理互异机检（8 星 8 张独立贴图）+ 壳层组合实证（表面/云/大气/环/halo/代理子节点齐全）。取证 v115h-3d-nasa/close.png。

### V11.5i 可见太阳 + 半球补光（2026-08-28，元首采纳评估案）

评估先行（元首问「要不要太阳做全局光照，性能如何」）：方向光本就是全局光照（无衰减照全场，星球晨昏线已在），缺的只是**可见的光源锚**；真阴影/GI 在战场尺度（星距 90-310、半径 9-24）影子无落点=纯付费零收益，且 V11.2 有原点太阳逆光剪影旧案——结论：远处一颗可见太阳+半球补光、不开阴影。落法：主光**方位**同向、1200 单位外、地平线上 16°——自发光核（HDR 蓝白色 2.0/2.1/2.4 与主光 0xaabbff 同谱，不重涂星球）+glow sprite（glowSprite 本就关雾）走既有 bloom 放大成耀斑；HemisphereLight(0x33415e 天/0x241a12 地, 0.4) 给背光面冷色 tint。**硬教训：相机永远俯视原点（pitch 0.08-1.52 全向下），视图锥上缘仰角上限 ≈23°——首版太阳按主光仰角 52° 放，投影 y=4.3 永远出锥不可见**；压到 16° + 用户旋到对侧低俯角才入画（proj y=0.56 实证）。构序坑：glowSprite 依赖 this.glowTex，太阳块必须放 glowTex 创建之后。验证：verify PASS（needle HemisphereLight）+ probe 30/30（太阳在场/关雾/距离>1000+半球光）+ shoot-v10/v7/theme 全绿 + 亮度采样 255（bloom 全亮核）+ fps 60.2 无回归。取证 v115i-3d-sun.png。

## V12 浅色范式：星空→天空（2026-08-28，元首定案四问全采推荐案）

**范式定案**：浅色不适配星空是死路（白底黑星=噪点、暗色辉光白天全灭）——换范式不换配色。深色=深空战争（星海/NASA 球体/母舰/战舰/辉光 bloom），浅色=**天空战场**（浅蓝天穹/白云/暖阳/**浮空岛**/空中要塞/战机）。语义层（轨道运动学/状态机/高亮/执行卡/编队 diff）零改动——两套视觉工厂共享同一引擎。

**元首四答**：①岛型=**王国之泪层岩为主+纳格兰垂坠石点缀**（俯视相机 4.6°-87° 决定顶面主读——阿凡达垂直剪影出局；选型红利=语义物理化：层级=任务量 LV、LV2+ 长建筑=打过仗、凯旋史=发光凯旋碑、荒岛=待进攻）②2D=**蓝图纸面风**（白纸+青蓝制图线，指挥室=图纸）③状态语义=**光柱+基座环**（作战中=橙光柱升腾+基座橙环脉冲；占领=蓝环；高亮=青环——白天辉光失效的正解）④云=**极慢漂移**（云非地形，星闪呼吸同类；岛/战机轨迹不动）。

**工程三刀**：
- **R1 主题机制**：`scene.setTheme(dark)`+壳 MutationObserver（body[data-ds-dark-theme] 宿主持有，热切换即时生效）；星海/星云 vs 云层（10 张宽软 sprite 漂移 ±700 环回）可见性互换；太阳双皮（蓝白热星↔暖阳）；灯光双档（含暖白主光 2.1）；雾色双档；**bloom 浅色直接关**（无辉光可放大，还省 GPU）；2D draw 双调色板（21 处换 P.*，状态色浅色压深：琥珀 b07800/橙红 d9480f/蓝 1971c2）；CSS 天穹底（暖阳光斑 radial+浅蓝渐变，画布 alpha 透出）+vig 天光晕染。
- **R2 视觉工厂**：`addSkyIsland`（顶岩盘+草顶+LV3+ 中层岩盘+底锥+2-4 垂坠石+LV2+ 建筑/塔楼+min(3,凯旋) 发光碑+基座环 Torus+作战光柱 62 高 DoubleSide 柱，全 det 确定性）；`buildFortress`（八角石台+塔楼+四角楼+停机坪环标+信标灯——**与母舰同契约** beacon/engines/pick-proxy，update 零分支）；主题翻转=planetKey 清空重放 lastBridge + HQ 变体守卫（防首贴空转双建）；舰体材质升场景级共享（applyTheme 整体换肤零重建——深空合金蓝灰/橙引擎↔白昼浅机身/冷尾焰，编队 glow 白转）。
- **R3 覆盖层 token 化**：执行卡/名签/tooltip/切换钮/图例/hint 全部浅色优先（纸面证件风：浅底深字）+`body[data-ds-dark-theme]` 深空玻璃覆写（V9.13 纪律）；图例 inline 色改 lg-* 类；engine 高亮虚线浅色 0x0e7490。

**坑**：heredoc 长脚本两次被截（改 Write 文件通道）；applyTheme 首贴无条件拆建 HQ（变体守卫修）；hqProxy 字段漏声明（tsc 抓）。**宿主主题残留第 6 次**（取证前 settings.yaml 必查）。

**验证**：verify 224 测 PASS（针脚 addSkyIsland/buildFortress）+ **probe-warzone 35/35**（开局强制深色跑深空套件→热切浅色：浮空岛组/要塞/bloom 关/云在场/蓝图亮底 r=232→切回深色：球体+母舰+bloom 复活+HQ 无双建）+ shoot-v10/v7/theme 三件套全绿 + fps 59.7 无回归。取证 v12-light-radar/3d.png。

### V12.1 HQ 双形态重铸（2026-08-28，元首令：2D 标签精简 + 3D HQ 太暗淡）

**2D**：雷达 HQ 标签 `HQ · HEADQUARTERS`→`HQ`（元首令）。**3D 双形态提亮增细节**：
- **深色母舰**：暗淡根因=hull metalness 0.9 无环境贴图（黑铁一块）——降 0.6+提亮基色；发光细节加密=双层连续舷窗带（远距读出「旗舰」）+8 点环缘航行灯（青/琥珀交替勾外环）+塔尖天线灯+舰底引擎洗涤光（48/0.1 柔衬）+信标 2.3/辉光 11；上方冷点光 900→1400 提亮上表面。中心影调 max 226/p90 46——亮件在暗壳上不白成一团（首版过曝 mean 246 调柔）。
- **浅色要塞**：暗淡根因=**白上白**（白石对青天零对比）——暖沙石墙 vs 青天冷暖分离 + **深石底锥**（浮空岛同语言，白天剪影）+台缘/塔身金饰环+青光双停机坪环+信标辉光+**天光柱**（95 高青白 0.1——白昼 HQ 签名）+四角旗枪。中心影调 p10 161/p50 241/max 255 全影调。
- **update 引擎脉动尊重 per-sprite 基准**（userData.base）——母舰 10/要塞 5，原硬编码 9 会互相打架。

**两坑（均机检/探针当场抓获）**：①**构造器 applyTheme 曾在 buildHq 之前调用**——浅色宿主开机不换皮（母舰留天空、hqVariant 恒 null）；probe 因「先强制深色」流程漏网，补**开机即正确范式**断言（36/36）。②**TDZ 坑 V10.1 原案重演**——底锥 add() 调用插在 const add 声明前，运行时 ReferenceError 整板回落 2D（build 不查运行时；空板先抓 pageerror 的纪律再次生效）。**取证采样坑**：截图中心 ≠ 画面中心（板面画布偏移），HQ 实际投影 (1000,477)——采样必须按投影定位。

**验证**：verify PASS + probe 36/36 + shoot 三件套全绿。取证 v121-hq-dark/light.png。

## V12.2 语义 token 化全项目重铸（2026-08-28，元首令：全面排查语义→token 化→场景切换→皮肤化基础 + impeccable ≥35 交付门）

**架构定案——三层令牌（styles.ts v5.0）**：L1 基元（裸色只许出现在 `.war-root` 与 `body[data-ds-dark-theme] .war-root` 两个令牌定义块，含 wz/tac/log/sky/chart/sun 六组场景令牌与链八相谱）；L2 语义（`--war-*`——组件与场景规则**只**引用本层，dsw 直穿清零、warzone 覆盖层 60+ 裸色清零、'Segoe UI' 硬编码字体清零）；L3 场景开关（明缺省/暗随宿主 body/皮肤钩子 `[data-war-skin]` 挂 .war-root 随文案皮肤落属性/星域态 .war-mapmode）。**TS 侧唯一色源=CSS**：`src/client/war-tokens.ts` 在构造与 setTheme/applyTheme 时 getComputedStyle 读令牌（帧循环禁读），headless/主题错位（probe 强转深色）走同值回退——**回退哨兵由 tests/war-tokens.test.ts 双向锁死**（令牌闭合：每个被引用 var(--war-*) 必有静态定义——直接防 styles.ts:530 旧案 `var(--war-canvas-bg)` 未定义 var 的再次发生；组件区纯净：非定义块无 dsw 直穿/裸 hex，豁免=mask 黑/镜面高光/中性阴影/var 回退；回退↔CSS 值互锁）。

**语义收编清单**：文本三阶（text-1/2/3）、边框三档（border/soft/hover）、字体双轨（font/font-code）、状态原色四档（*-border：描边/圆点/彩带/辉光共用饱和档，与压黑前景档分工）、三区彩带（band-task/field/report）、圆角阶（r-pill/lg/md/sm）。**2D 战术盘双皮调色板整表迁入令牌**（--war-tac-* 21 字段×2 皮 + wz 状态四原色共享）；**速报日志色 kind 化**（order/engage/triumph/retreat/return/review 六类，浅色压深修 latent bug——旧 #ffc98a 画白蓝图 ~1.8:1）；**3D 语义状态色统一 token 族**（battle/held/hl/wait 四 THREE.Color 在 applyTheme 刷新；美术资产 NASA 贴图/浮空岛/舰体/HDR 留 applyTheme 工厂=皮肤另一半缝，文档写明边界）。

**critique 三轮（双子代理，快照 `.impeccable/critique/`）**：36（V10.1 旧基线）→ 33（首轮：调度条索引/窄窗降级/星域浅色/聚焦页重复/岛计数倒挂）→ 32（复评新发现：aria-live 覆盖/星舱截断/四数平权；两条误报经父级源码复核勘误——「无 aria-live」「无方向键」皆不实）→ **35（终审达标）**。整改落点：调度轨道**状态分段竖铭牌**（进行中|已收官，词典双皮肤新增 segActive/segSettled）、列表态 <900px **单列堆叠**（200% 缩放降级）、星域标签 text-1+`--war-label-halo` 双主题光晕、**warzone 覆盖层 12px 底线**（10/11px 全部清除）、岛计数数字 13px/600+**待领琥珀主从**+aria-live=polite、聚焦页 tour 卡去重（原文由页首标题独占，卡内降 ID 行）、live-cmd 全文 title、**败局红终局**（`war-life-bar.err`——绿严格=善终的图例契约修复，已阅态 done-done-done-err/未阅态红状态行）、`.war-wz-hint` 对比度 3.77→浅 5.81/深 6.63、**m 快捷键**（列表⇄星域一步切，与 n 同守卫）、3D 图例补「聚焦轨迹」行。

**遗留 backlog（终审 P3，产品决策留元首）**：命令筛选/搜索（50+ 卡时「只看等你发落」）；待×3 词法后缀化（等·参谋/等·指挥官——词表决策）；败局决策带「无快捷操作」与报告卡内恢复的层级。

**坑（本轮新增入账）**：①**块注释内 `*/` 序列提前终止注释**——`（--war-wz-*/--war-tac-*）` 一写就把后面内容当代码，esbuild 报「Expected identifier but found --」，注释里禁止 token 通配写法；②**对象字面量保留字键**（`return:`）需引号；③**critique 快照同秒同名互相覆盖**——多轮落盘必须隔秒；④**双子代理复审方差**——fresh 代理每轮会发现新 P2/P3 且有 ~2 条/轮误报率，父级必须源码复核再入整改单（本轮拦下「无 aria-live」「无方向键」「hover 宽度跳变」三条误报）。

**验证**：verify **228 测** PASS（新增 war-tokens 五测：闭合/纯净/钩子在场/回退哨兵×2——哨兵首跑即抓到本人 held #5fc4ff vs 令牌 #66d4ff 漂移，机制自证有效）+ verify.mjs 六新针脚 + shoot-theme **20/20** + shoot-v10 五相位 + shoot-v7 + probe-warzone **36/36** + 双主题 3D 令牌 computed 实证（浅 #b07800→深 #ffc24d 全组翻转）+ 像素统计（浅 lum242/深 lum26）+ 12px 底线浏览器复扫 0 违规。取证 `.goal/evidence/v12/`：v122-3d-light/dark、v122-fix-dispatch/narrow/3d-light、v122-final-map-light/dark。

### V12.2.1 「让图例失业」（2026-08-28，元首令，critique 遗留 P2 当场定案）

等待对象后缀化：`接令/待领`（plain `待分诊/待领`）→ **`等·参谋`/`等·指挥官`**——等待对象进词本身，词表自消歧，两皮图例的「待×3」消歧行删除（图例失业）。同族对齐：坞 pill titleLine/segLine、任务列注、taskStatus.published（`待领取`→`等·指挥官领取`）。散文语境（参谋接令分诊/部队待领令）不动——它们本就自明。**坑**：岛计数染色渲染按 `·` 切段会把词内的 `等·参谋` 也切开（渲染成 `等 · 参谋`，琥珀判定失灵）——段分隔必须切带空格的 `' · '`，live 复核当场抓获。

## V13 战线一等公民（2026-08-28，元首范式升格：血脉∩战场 + 未分组行星 + 世代环）

**范式定案（元首本体论，多轮对话收敛）**：命令（一次意志；生命线本体=事件账本，会话只是演员——每命令 1 参谋会话 + 每尝试 1 执行会话）→ **战线（一等公民）** → 战场（=workspace=真实项目文件夹）→ 战区（=星域视图整体）。用户三活动：①下达命令（已满足）②查看进行中/等待中的战线 + 回复（查看主入口=战区视图，回复主入口=灵动岛）③复盘（聚焦页）。**视觉理解一等公民从「会话」换成「战线」**——老 coding 用户的 workspace-session 心智被范式替换：board 把卡片和战场用战线串起来。

**血脉 ≠ 战线（实现中途元首纠正，本轮最重要定案）**：血脉（chain/continuesFrom/rootId，族谱层）**永不拆分**——聚焦页族谱面包屑、六代链面板、hover 族系高亮仍是全血脉；**战线 = 血脉 ∩ 战场**（视图分组层）——Ⅰ 命令落定战场后，ⅡⅢⅣ 后继必须跟随；**续代跨战场 = 新 Ⅰ 命令 = 新战线**（不是同一条线拐弯）。`frontsOf`（src/client/front.ts）按「父相对 run 拆分」实现：某代任务战场 ≠ 父代战场 → 该代自立段头开新段；成形代（无任务）继承父段；Ⅳ 离开 Q 回 P **不并回** P 上的旧段（段一旦离开不回头）。同 rootId 拆出的多段**同链色**（血脉同色=「同源的两场仗」，视觉自然）。段键=`rootId/段头 commandId`，视图一律按 commandId 索引战线（`cmdFront` Map——按 rootId 索引会在拆分后互相覆盖，本轮实抓）。

**workspace 物理模型（与宿主对齐钉死）**：宿主 workspace 实体=记账（uuid+realpath+title）；**物理写边界=(会话 cwd × SandboxMode)**，指挥官被宿主围栏钉死在任务 workspace（KillCredit 越界一票否决，tools.ts）。**未分组=合成沙盒聚合**：warRoot 下 `tasks/<id>`/`instances/<id>` 非项目文件夹，纯客户端路径启发式（`.warroom` 段 + tasks/instances 段对）聚合为一颗中性「未分组」行星（词典化：war 未分组/plain 杂项），bound 项目=战场行星。已知局限（挂账）：config 改 warRoot 名或 auto 任务建 worktree-of-P 时误判（误当项目行星，视觉无害）；正解=投影加 `workspaceKind` 字段（未来后端小增量）。

**视图落点（纯前端零后端，数据全部来自板投影现成字段）**：
- **任务列战线分组**：多代战线一组（`war-front-group` + 链色 `war-front-head`：链色点+段头命令原文+N代 chip+聚合态 warn/err/done），成形卡归组首；单代/孤儿维持原扁平心智；组与扁平项按战线 lastActivity 交错。组头是列内行不是卡——V10.1 五行恒高卡规格不破。
- **调度坞按段分组**：`dispatchGroups` 组键从 rootId 换成段键——跨战场续代不再同叠一组：老段照常入收官区（faceActive=段内任一活跃，原 cards[0]=最老代判定在分段后语义漂移），新段另起组面。
- **星域世代环（3D）**：`rebuildFrontLines` 单战场锚定——战线在其战场行星外一圈链色 torus 环 + 世代八面体标记沿顶弧排布（Ⅰ 左→末代右，末代放大、live 加辉光 sprite），收官战线降透明度留痕；跨行星连线不存在（跨战场=新战线）。标记兼拾取代理：pick→front→源命令聚焦页。链色经 `readChainHue`（war-tokens.ts）从 CSS `--chain-hue-N` 运行时读取 + 同值回退（哨兵测试双向锁死，V12.2 纪律）。2D 回退同源：`.war-front-svg` 圆环+代点（viewBox 100×100）。
- **收件箱战线分组头**：动作仍命令/任务粒度（板只读红线不动），渲染层 `war-inbox-front` 组头（多代战线才显示）。
- **族系高亮重定向收敛到段内**：坞面卡点亮条件从「同血脉」改「同战线」（hover 旧代光点只点亮该段代表卡；全血脉 hover 高亮其余通道不变）。

**词面迁移**：workspace 语境「战区」→「战场」（HQ 信息卡/星球 tooltip 6 处/aria）；「星域战场」→「战区」（视图名）；图例补「环=战线（点=世代）」行。plain 皮肤同步。

**V13.1 升格为配套必需（原挂账①，升格理由：无写侧引导战线会持续无谓拆分——参谋续接时不绑父 workspace，跨战场成为常态而非例外）**：①起草法/参谋提示注入「续接跟随父任务 workspace」约束；②`chainNoteFor` 知识连续性——Ⅱ 代参谋会话只拿到 18 字档案行的断供问题，注入上代报告摘要+关键产物路径。另两条挂账维持：跨域命令能力通路（「全电脑」宽域 workspace 路由 + full-access 对接）、投影 workspaceKind 字段。

**坑（本轮入账）**：①**TDZ 第三案**——巨组件中把调用点前移（战线分组装配期即调 taskCardOf）会踩声明滞后的 `openTaskVia`（build 不查运行时，板整树白屏；解法=声明整体上移，视图.tsx 内 const 声明序审查新增检查项）；②**pick() 返回实体本身**（`userData.ref` 即 WzFrontNode），不是 `{kind, ref}` 包装——探针脚本按包装取 `hit.ref.rootCommandId` 会 TypeError；③**会话续传回放陈旧 Read**——system-reminder 重放的 views.tsx 片段可能是整改前内容，Edit 前一律现读（既有记忆重申，本轮再中一次：按回放以为还是 battlefields 数组）；④**深色 `.war-fail` 对比度 4.25:1**——红基色天生暗于琥珀/绿，同档 58/86% 混色在 well 底上差临门一脚；深色 86%→75% 混白实测 4.86:1，`.war-fail` 入 shoot-theme 机检对（11×2）。

**验证**：verify **235 测** PASS（frontsOf 重写为单战场规则：血脉∩战场拆分/Ⅳ 不并回/成形继承/pivot 任务去重/沙盒判定/commandTasks 迁移平权）+ verify.mjs V13 针脚（frontsOf/rebuildFrontLines/readChainHue/war-front-head/war-front-line/未分组/每片战场一颗星）+ **shoot-v13 12 断言全绿**（拆段双证：同血脉 a101 两卡组分列 + 任务列两段头各自带队；未分组行星 W-09；环==锚定战线数/标记==代数和/pick 可达；2D 回退 SVG 环）+ probe-warzone **40/40**（fps 60.3）+ shoot-theme **11×2** + shoot-v7 + shoot-v10（新增组头/世代环断言）+ playground 种子补 Ⅶ 未分组战线（相机图片归档，`.warroom/tasks/` 沙盒）。取证 `.goal/evidence/v13/`（7 图）。

### V13.2 critique 整改（2026-08-28，双子代理 Round1 28/40 → 整改批）

**采纳并修复**：①**P1-1 链色撞槽**（hueSlot=FNV(rootId)%8 无消解，演示板实抓 9 处 chain-hue 全落槽 7=灰——战线唯一身份线全灭）→ `greedyRootHues` 纯函数（front.ts）：血脉按最近活动降序贪心挑最少占用槽、平手保哈希槽；≤8 血脉零撞、同血脉恒同色；frontsOf 内部 + views 全消费点（世代徽标/续接 chip/族谱条）统一 `chainHueOf`（模块级查表 WarView 每渲染刷新——消费点散在模块级组件工厂，props 打穿成本>单板单例）；**纯客户端重映射，服务器投影不动**。②**P1-2 组头低于知觉阈值**（视觉复检 3 个只识别 1 个）→ tint 7→13%、border 3→4px、dot 9px+外环光晕、title 13px、组间距 7px、chip 补任务数「N 代 · N 任务」（双皮肤 taskN 词典）。③**P2-4 世代环标记数不清**→八面体 1.6→2.1/末代 2.4→3.1/辉光 7→8.5。④**P2-5 浅色天空态环被洗白**→浅色环透明度 +0.15/标记 +0.05~0.2。⑤B 实测 `.war-track-seg` 3.5:1（text-3）→ text-2（5.46/10.49 双绿）。⑥杂项：死 CSS `.war-dispatch-view` 清除、`.war-wz-xdot` 补 prefers-reduced-motion、2D 图例按 ｜ 分行、inbox-front text-2→text-1。

**驳回（有案可稽）**：P1-3「战区开关挪回坞上」——V10.1 元首定案开关在设置抽屉+坞上按钮退役有 shoot 负断言，勿翻烧饼（m 快捷键+mapHint 已在）；B pulsing-dot ERROR=四档状态呼吸语言既定设计（reduced-motion 补齐）；聚焦页嵌套卡=V9.9 定案构图；三区顶彩带=V9.13 语义设计。**误报勘误**：A「无等最久徽标」——agingLeader 词典/样式在场（渲染条件=err 档存在）；B text-occlusion 多为检测器自身 overlay 标签被插件 chrome 盖住。

**验证**：verify **237 测** PASS（新增 greedyRootHues 两测：撞槽互异/同血脉同色/超 8 回绕均衡）+ shoot-v13 12 断言 + theme 11×2 + probe 40/40 复跑全绿；live 实证 hue 分色 0/7、组头 chip「3 代 · 2 任务」。快照 `.impeccable/critique/2026-08-28T05-39-39Z__src-client-views-tsx.md`（Round1）。

### V13.3 critique 二轮整改（R2 27/40 后——组围合/战场名 chip/世代徽牌）

**采纳并修复**：①**R2-P1 组头与卡同解剖学**（「压扁的卡」——两次独立视觉复检都把组头误读为卡）→ `.war-front-group` 升格**围合容器**（chain 4% 淡染底 + 22% 边框 + r-lg 圆角），组头降为容器内标题行（撤自带 border-left/背景）——分组从 proximity 读法变 containment 读法。②**R2-P2 同血脉兄弟段不可辨**（同色同 chip）→ 头加**战场名 chip**（`war-front-bf`：dirName / 未分组词典；tooltip 补战场行）——拆段身份有了第二编码通道；收件箱组标签 `title.slice(12)`→`首8字·战场名`（12 字截断无法识别组）。③**R2-P2 环深不可测**（八面体数不清=装饰）→ 环顶 **「N 代」canvas 徽牌 sprite**（主题自适应字色、settled 半透明、纹理随组析构 dispose）；settled 环透明度 0.18→0.28（星空里近乎隐形）；3D 图例行扩「点=世代·同色=同血脉」。

**驳回/挂账**：「段=血脉头下子行」重构——与元首当日拆分定案相反，记开放问题；3D 行星常驻名牌（性能/布局量级）→ backlog；四套状态词表收敛（island/front/warzone/starfield）→ 独立设计轮 backlog；「2D 当默认」——与 V11.5 雷达值班+3D 战略定案相反，驳回。

**验证**：verify PASS（237 测）+ shoot-v13 12 断言 + theme 11×2 + probe 40/40 全绿复跑。快照 `.impeccable/critique/`（R2 2026-08-28T06-02-24Z）。

## V14 战线范式收口（2026-08-28，元首定案：血脉除名——战线=命令聚合，绑定一个战场）

> 元首新本体论（盘逻辑对齐后全采）：**战场（workspace）⊃ 战线 ⊃ 命令**。下达时可显式选战场（类似宿主新对话选工作区）；workspace 就是溯源容器（原「血脉」职能）；一个战场可有多条战线；中途转向的战线不再是原战线（锚定Ⅰ的战场）；后续代落别的战场=不是后续代，是新战线；点战场能看到该战场全部战线。continuesFrom 从概念表除名，退回账本事实字段。

**落点四件**：
- **①血脉除名（词面+语义锚点）**：图例「同色=同血脉」→「一色=一条战线」；3D 图例同步；聚焦页族谱不再跨战场点名全链——**本地计代**（`localGenOf`：锚=本地Ⅰ，徽标/pips/族谱条全部战线内自序）+ **origin 溯源 chip**（`war-cd-origin`「续接自 源战场·源战线」，点跳源战线锚）——跨战场痕迹收缩为一条可点的事实。
- **②链色绑战线**：贪心分配键从 rootId 换成战线（frontsOf 内联重排）——兄弟段天然异色（V13.2 critique「两段同色分不清」连根解）。`boardHueByRoot` 单例换 `boardFrontByCmd`（commandId→WarFront），链色/本地计代消费统一走这张表。
- **③composer 显式战场选择器**：新节「战场（可选）」（bfSection 词典双皮肤）——「参谋定」缺省 + 现存战场 chips（wsOrder 创建序，选中键不在展示切片时保底附加）；**续接选中自动带父战线战场**（pickCont → cand.bf），改选即宣告新战线（bfContNote 一句话教学）。提交拼协议标记行 **`【战场：<路径>】`**（`applyBattlefieldMarker`，preflight.ts，幂等、跨皮肤同文、null 不拼）。
- **④点战场看战线清单**：3D `war-wz-bfpanel`（点行星/星球 → 战场名标题 + 战线行[链色点+名+`N 代·状态`]，点行跳该战线聚焦页）+ 2D 同源（星球按钮直开面板，退役旧 onPlanetOpen 跳最近命令行为）。

**写侧引导（原 V13.1 核心，收窄落地）**：skill.ts 工作区路由新第 1/2 条——战场标记行无条件遵守；续接默认绑父代任务工作区（仅命令明确要求换地点才换）。relay 战线档案注入补一行工作区纪律。

**坑（本轮入账）**：①**composer 闭包变量名与 props 名不一致**（bfChoices vs props.battlefields）→ ReferenceError pageerror、composer 整树挂——注入代码后必须 live 验证（n 键开起草器抓 pageerror）；②**chip 选中判定用 className.includes('on')** 会命中 continue 里的子串——探针一律 classList.contains；③**color-mix 混 transparent 在 Chromium 产出 `oklab(...)` 计算值**——对比度解析器必须带 oklab→sRGB 换算分支（shoot-v7 两个测量器已补，6.27:1 实测过）；④**宿主 settings 被活界面持久化 dark 后 theme-presenter 异步写回**——对比度测量必须同 tick removeAttribute+读值；⑤展示切片（slice 8）与数据全集不一致时**选中项保底附加**。

**验证**：verify PASS（239 测：V14 新测「链色绑战线兄弟段互异」「本地计代+origin 溯源」+7 条 V14 针脚 localGenOf/originChip/bfSection/【战场：/war-wz-bfpanel/战线跟着战场走×2）+ shoot-v13 12 断言 + shoot-v7（oklab 修复后全绿，4 组对比度 6.27-6.96:1）+ shoot-v10 + shoot-theme 11×2 + probe 40/40。live 验证：composer 8+1 chips/续接自动带 projA/聚焦页本地 Ⅰ Ⅱ Ⅲ+origin chip/3D 点行星面板 1 行零 pageerror。取证 `.goal/evidence/v13/`（V14 五图）。critique 未跑（元首令：改好即可，后续一起审）。

### V14.1 critique 整改（R6 双子代理 27/40——P0 机检根因修复）

**B6 机检最有价值发现**：未选中 `.war-continue-chip` **无插件 background 规则** → UA `ButtonFace` 在宿主 `color-scheme:dark`（不随 data-ds-dark-theme 翻转）下恒泄漏 rgb(107,107,107)——**两主题同为灰底灰字（浅 1.09:1）**，V14 旗舰面（战场选择器）在浅色下不可用。修复=continue-chip/recent-item 显式 `background:transparent`（实测 5.80:1，shoot-v7 增机检位：n 开起草器量未选中 chip）。

**其余采纳**：①单代战线卡增战场 chip（`war-bf-chip`，taskCardOf 经 taskFront→bfNameOf 传参）——V14 模型下每条命令出生即有战场身份；②wz-foot 被坞裁切→bottom 魔数 238px 退役，`calc(var(--war-dock-h)+10px)`（views 实测 dockH 注入变量；`--war-dock-h` 入 war-tokens RUNTIME_VARS 豁免——哨兵体系第一次为「JS 注入变量」开口子）；③composer 续接候选改本地计代（`localGenOf`——composer 说战线的话）；④origin chip 截断 10→14；⑤战报空态中性化（原「还没有打赢的会话」预设胜利，与合并成败列矛盾）。

**驳回**：「战场 picker 仅歧义时出现」（V14 显式选择是元首点名第 1 条）；雷达行星三层微文本（canvas 标签系统量级，backlog）。

**验证**：verify PASS + shoot-v7 全绿（新机检 5.80:1）+ v13（操场板）/theme 11×2/v10/probe 40/40。快照 `.impeccable/critique/2026-08-28T12-12-34Z`。**运行纪律新增**：shoot 跑批会互相换板（v7 跑完板= v7 夹具），依赖特定板面的 shooter（shoot-v13 需操场板）前必须重播 `seed-playground.py`——本轮 v13 首跑 6 断言红全是板面错配非代码回归。

## V15 续接闭环 + 战场正名 + 战线命名（2026-08-28，元首批准计划，三向同车）

> 计划定案三问（推荐案全采）：战线名**元首下达时可选给**（composer「战线名（可选）」≤24 字；参谋不命名——名字只从命令通道进账本，读投影红线不动）；**本轮不可改名**（`directive_named` 事件挂账，regrade 先例在）；显示 `name ?? 锚命令原文`（frontsOf 单行，全消费点自动跟随）。

**A 续接闭环（V13.1 收尾）**：现状实锤——relay `chainNoteFor` 只给「18 字→结局一行」，而**上代完整 CampaignState 早在 campaignOf 缓存里没用**（战报/战利品/evidence.files/diffstat 全躺着）；pivot 直插只带父代 16 字；征召令对续接代指挥官零链上下文。落法：①新纯模块 `src/chain-note.ts`——`buildChainNote`（最近 3 代详情：结论/败因+战报摘要≤160 字+产物路径≤5 条+diffstat；更老一代一行式；**cap 1500 尺寸纪律**——dossier 无上限的教训）/`buildCommanderChainBrief`（≤600）/`pivotChainSlice`（≤400）；②relay 接线（staff 链档案+pivot 父代速览）；③**征召令接线**（conscriptTask 内反查 taskId→续接命令——publish/收官接力/补征入口一处覆盖，不改 conscript op 签名），【战线前情】节嵌 dossier 后；④skill 起草法补「brief 点名上代产物路径，续在成果上不重做」。

**B workspaceKind 投影**：`task_published` 可选字段（`bound|bound-worktree|instance|auto-worktree|auto-dir`）——写侧 `composeWorkspaceKind`（bound 分支探测 `.git` 是文件=worktree 指针；两发布点：war_publish+拆解链）；fold/投影/BoardTask 全链；**客户端 wsKeyOf kind 感知**（有真值按 kind 分键——auto worktree-of-P 归未分组治误判；kind 缺失回落路径启发式，append-only 无回填）。SSE 零影响（投影字段不入 revision 哈希，queueAhead 先例）。

**C 战线命名**：POST `name`（trim+≤24）→ `directive_created.name`（cron 可选字段先例）→ fold → 投影 `name: d.name ?? null` → BoardCommand.name → `frontsOf` title。composer 双皮肤「战线名（可选）」输入。种子 Ⅳ 段命名「compose 迁移」+ Ⅶ「相册整理」演示。

**验证**：verify PASS（chain-note 4 测：详情窗/空退化/三档 cap/指挥官末代详情；wsKeyOf kind 感知 6 断言含 bound-worktree=项目行星）+ V15 六针脚（buildChainNote/buildCommanderChainBrief/pivotChainSlice/workspaceKind×2/namePlaceholder）+ shoot-v13 增 L5 命名战线断言（组头显示「compose 迁移 3 代·2 任务」实锤）+ 板 API 冒烟（kind dist：bound 4+auto-dir 1+legacy 8 回落并存；named=compose 迁移/相册整理）+ theme 11×2/v7/v10/probe 40/40 全绿。critique 未跑（元首令）。取证 `.goal/evidence/v13/`。

## V15.1 实弹考题轮（2026-08-28，元首令「做1」+两处临时加修）

**考题**（`.goal/evidence/v15/r15-exam.md` 正本，assert-v15 15/15 PASS）：两代续接链真实 LLM 全链——代1指挥官现场随机生成 token（1c3568e9）落 manifest，代2 deepen 续接产出 summary 逐字引用 token。归因锁设计：token 不在任何命令原文里，下游出现它唯一通道=V15 链档案注入；机检抓双通道（参谋任务书✓指挥官战报✓）。workspaceKind=bound 真值上板双证。

**考题抓出三真 bug 全修**：①war_publish 悬空批准死锁——旧序先落 directive_approved(taskId) 再绑工作区，绑定失败即死锁（重试被终态守卫拒，参谋只能改账本——第一轮考题参谋真的去做了外科手术，被元首叫停）；修=工作区路由前置，失败零写入。②引信双开竞态——下令立即 tickNow 与 15s 周期 tick 撞车双读到 draft，一代双参谋会话（第二个空转自判无需处理）；修=fuse 在途守卫。③参谋会话裸 cwd 无工作区身份（元首定案**选项2：参谋绑 warRoot 工作区**——星域语义不变 warRoot 本就是未分组行星，宿主侧栏从幽灵变居民，与指挥官征召同构）——relay 改走 workspace.create(幂等)+workspaceId，落地实证侧栏现 war 工作区、参谋自检身份合规。④jumpSession try/catch 接 select 抛错走 onJumpMiss 警示（原来 UI 无动作一声闷响）。

**上游发现（更正）**：初判「宿主冷会话列表失效」系误诊——真相是**冷列表起服后首次扫描慢**（412 会话头约 10-15s），早期采样全在扫描完成前（元首肉眼反证：study-area 会话一直可见；复测 t+15s 老会话齐现）。跳转在列表就绪后正常；war 组下 4 条参谋会话行可见（修2 实证，r15-jump-final.png）。

**坑**：poll 谓词返回布尔=「非 None 即成功」首轮即退（received 拍终态）；审批应答 POST /api/respond 需 client-response 信封+wire rpcId（mux approval/requested 帧取，与审计 approvalId 两个 id 空间）；沙盒审批等待期参谋 turn 冻结（考题环境准备下令前做）。

## V15.2 世代徽牌退役（2026-08-28，元首令）

星球视图「N 代」canvas 徽牌（V13.3 加、V13.4 critique 加大）拆除——元首定案它冗余+过曝：代数已由世代环世代点（末代放大+辉光）编码，精确值走悬停 tooltip/战场面板/任务列组头；牌子 opacity 1.0 是全场唯一满亮 sprite，喂 bloom 成耀斑=星球过曝主源。拆除回到 V13 干净基线；2D 回退的「N 代」报数牌（DOM，无 bloom）保留。shoot-v13 回归 PASS。证据 r15-v152-3d.png。

## V15.2b 星域环语义重铸（2026-08-29，元首定案）

**问题**：旧语义「每战线一条链色环」在多战线星球退化为叠罗汉——10 条战线=10 个密环，环数不可读。
**新语义（元首定）**：一星球一环、**分段=战线数**；不区分链色，环色取星球自身辉光底色（每星球确定性一套色系）；世代点退役（代数是卡片层信息：悬停 tooltip/战场面板/任务列组头）；作战中红色扩散圈（spawnRing 环境脉冲两处）退役——「正在战斗」由舰队环绕表达。无操作可读四件事：星球名字/战斗状态/战线数量/正在执行工具的卡片。
**落点**：3D rebuildFrontLines 按战场聚合计数→TorusGeometry 弧段×N（gap 0.24，per-planet 倾角 det(fr:ws)）；2D 一星球一 circle（strokeDasharray 切段，中性 --war-text-2 色）；世代八面体/末代辉光/badge2d/链色类全部退场；图例两处更新（战线环（分段=战线数））。
**坑**：war-tokens 哨兵的 var() 回退豁免正则是 `[a-z-]+` 不认数字——`var(--war-text-2,#xxx)` 会判裸色（--war-text-2 含数字），令牌已无条件定义就别带回退；readChainHue 因此全仓无引用（tsdown tree-shake 掉）→ verify 针脚换成 strokeDasharray/分段语义。
**验证**：verify PASS（新针脚）+ shoot-v13 重写 M/F 相位全绿（M1 环组==锚定战场数 9/9、M2 段和==战线数 10/10、M4 八面体清零、F2 dasharray 环在场）+ 双视图截图目检（r15-v152-2d-final/3d-final）。

## V16 星际迷航语义统一（2026-08-29，元首定案）

**动机**：星域概念既立，角色与全套词表统一到星际迷航语境；且术语必须能随皮肤变化。

**定案词表**（元首六问：范围=全套、默认=trek、战线/星域/编队维持、HQ=星舰）：
角色：元首→舰长（Captain）、参谋→大副（XO）、指挥官→外勤小队（Away-Team，会话标题前缀 `外勤·`）、部队/兵种→外勤组员。对象：作战室→舰桥、战场(workspace)→星球、悬赏→任务令、战报→任务回报、战利品→任务产出、凯旋→达成、征召令→外勤任务简报（动词征召→派遣）、母舰/HQ→星舰、战时/停战→出航/入坞、标记【战场：】→【星球：】（skill 教学双兼容，旧令有效）。维持：战线、星域、编队、命令、任务、世代、链色。

**皮肤架构（核心决策）**：copy.ts 军事词典 warCopy 保持原文=单一源；`TREK_LEXICON`（17 条，最长优先）+ `TREK_FIXUPS`（语境修正：每片星球一颗星→每个项目一颗星、行星=星球→行星=项目）运行时深走派生 `trekCopy`；SkinId='trek'|'war'|'plain'，**默认 trek**（localStorage 旧值 war/plain 仍受尊重）；平话词典独立成篇不动。改一处词典 → 军事/星际迷航同步生效。设置抽屉三按钮（星际迷航/军事/平话）。

**实施**：批变换脚本（纯 split/join 最长优先）扫 32 源文件+tests+scripts≈600 处；host 侧（persona/tools/skill/relay/index 等）用 trek 正典（LLM 与 UI 同词）；会话标题前缀 `大副·`/`外勤·`（旧会话 append-only 不动）；shell-entry 侧栏标签改词典驱动+订阅换肤（V6 以来两皮肤同名「作战室」掩盖的静态渲染 bug 顺带修复）。

**坑**：①trekCopy 运行时派生 → bundle 只有军事源串+变换代码，**静态 needle 不能断言 trek 字面量**——词典类针脚指军事源串，另加 TREK_LEXICON/星际迷航/外勤任务简报机制针脚；②变换脚本别跑 copy.ts（词典源）；③shoot-v7 皮肤数断言 2→3；④「征召」动词跟「外勤小队」搭配改「派遣」（征召新外勤小队→派遣新外勤小队、补征召→补派遣），征召制=机制名保留注释。

**验证**：verify PASS（含 skin.test 重写：trek 缺省/词表无残留深走断言/三皮肤切换）+ shoot-v13/v7/theme 全绿 + 三皮肤实测切换（舰桥↔作战室侧栏即时换词）。证据 `.goal/evidence/v16/`。

## V16.1 语义全面梳理收尾（2026-08-29，元首令：三皮肤全量重梳）

**①宿主侧栏收起（rail 态）只留图标**：宿主收起类名=CSS-module 哈希前缀+`_collapsed` 后缀（后缀稳定）——styles.ts `[class*="_collapsed"]` 包含选择器藏 `.war-sidebar-label`、图标 35px 轨道居中。**②TREK 残留隐喻扩表 7 词**：作战→执行、战区→星域、折戟→挫败、收菜→收获、善终→圆满、发落→定夺、退役→休眠（军事皮肤原样保留）。**③plainCopy 正名**（64 处）：大白话办公语系——工作台/助理/干员/老板/项目/任务单/汇报/交付物/派工单/主控台/干活/开工收工。**④关键坑：trekifyCopy 函数字段漏派生**——`failed: n => \`折戟 ${n}\`` 藏在函数体，纯字符串遍历不进（v7 到访横幅实锤「折戟 1」）；修=函数包一层让返回值也过词表。⑤词典源串针脚两轮回指（扩表重跑会再伤 verify/skin.test 的军事期望值——变换脚本永远别跑 copy.ts 与军事断言）。
验证：verify + shoot-v13/v7/theme 全绿 + 收起态（labelGone/35px）与三皮肤（舰桥/作战室/工作台）实测。

## V16.2 平话语系二定（2026-08-29，元首令：符合 AI 工程师习惯）

平话角色改为当下 AI agent 通行语：**用户 — 规划 Agent — 执行 Agent**（原 老板/助理/干员 43 处替换；会话=规划 Agent 会话/执行 Agent 会话）。其余平话词（工作台/项目/任务单/汇报/交付物/派工单/主控台）维持。verify PASS。

## V16.3 verify:e2e 实弹考题回归门（2026-08-29，元首令「4」）

exam-v15 范式常驻化：`pnpm verify:e2e` → scripts/run-e2e.mjs 编排（板面可达性前置→诚实 SKIP 同 promptfoo 纪律；五段驱动 issue/track1/issue2/track2/close → assert-e2e 机检 C1-C8）。**tag 定位不动既有板面**（可在操场直接跑，只追加两条 E2E 命令——考题不再要求清场）；证据落 `.goal/evidence/e2e/`（gitignore，历史考题证据冻结在 v15/ 不覆盖）；考场 ws=temp/e2e-exam-ws 每次清旧。机检泛化：exam-e2e.py/assert-e2e.py 从 v15 拷贝改 tag（E2E代1/代2考题）+名称（e2e战线）。

**首跑结果（2026-08-29 02:00）**：门机械链全对（前置→五段→FAIL 退出码），实弹抓到真问题——**任务 task_published 后 25 分钟无 task_claimed**（征召器/patrol 静默跳过，server.log 零线索：conscriptTask 拒因不上日志）。现场保留（.smoke-state 20260829-020104-9061.jsonl 未清，操场勿重播）待下轮诊断：查 conscriptTask 各 return reason（工作区冲突/满编/spawned 集合泄漏）+ 给 patrol 拒因补日志。

**V16.4 后复跑（2026-08-29 11:17，最新构建）**：E2E-EXAM **PASS（C1-C8 全过）**——两代续接链真实 LLM 全通（代1 token=b9ee2a5e 现场随机→代2 summary 逐字引用，链档案双通道归因 staff=True/commander=True），workspaceKind=bound 双证，KillCredit 双代自动收官；maxCommanders 8 修复生效（操场 3 条假 in_progress 并存下征召正常）。门就此常态化：`pnpm verify:e2e`（前置=活服，约 10 分钟）。证据 .goal/evidence/e2e/。

## V16.5 e2e 体检四修（2026-08-29，元首令「仔细调研计划后来修」）

**调研结论**（外勤/大副原生会话 transcript 解码）：①war_claim 回执自己截断令牌（`attemptId.slice(0,8)}…`）——两代外勤抄回执短号被拒 3 次（子任务认领却给全形，不一致）；②【战线前情】其实喂全了（产物路径+token 值都在）——外勤是过度求证，18 次 pwsh 近半在翻 ~/.dsh/sessions/projcache/server 日志/.smoke-state 账本；③孤儿会话（简报投递失败后已建会话被弃，巡检重试再建新的=堆孤儿）；④征召拒因零日志（V16.3 静默排队 25 分钟同根）。

**修复**：①claim 回执全形令牌+「完整复制、不要截断」提示；submit/fail 拒因加 UUID 全形格式说明（令牌校验红线不动，是展示面在诱导犯错）。②征召令（仅续接令）加指引行「上代产物就在本工作区内——直接读文件，不要检索宿主会话记录/服务日志/工作区之外」。③孤儿自愈：prompt 失败把会话记入 orphanSessions，重试复用同会话重投不再另建。④单点拒因日志（runConscript 包装：成功必记+跳过按同任务同拒因去抖，四入口发布/接力/重派/巡检全覆盖）。

**复跑实锤**（E2E-EXAM PASS C1-C8）：最新外勤会话 **war_claim×1/war_submit×1、令牌不匹配 0 次**（修前 2-3 次）；**pwsh×2、翻宿主内部 0 次**（修前 ~8 次），全程 7 次工具调用收官（修前 ~34 次）；server.log 上线「征召跳过（原因）」去抖行+「外勤小队已派遣」行——顺带暴露操场种子引用不存在的 D:/smoke 路径（巡检每轮去抖尝试，无害，种子候选改进）。verify+三针脚（全形令牌/指引行/跳过日志）。

## V17 三页签全局切片 + 命令归档 + 族系管网连线（2026-08-29，元首令，已交付）

**定案**（元首四问拍板）：淡管常显 12% + hover 增强（不设开关）；仅链全终局可归档（服务端同闸）；已取消归已收官页签（删除线）；列表态管网直连执行卡。

### A. 三页签全局切片 + 命令归档
- **页签=客户端过滤器**：板照旧全量投影，前端按 `warroom-cmd-tab`（localStorage 持久化，缺省进行中）过滤全部派生列表——任务列/执行中列/回报列/调度条卡组/星域桥 planetSpecs/wzFronts 世代环/收件箱/灵动岛计数全部随页签换（元首令「切标题栏换整个显示 UI」）。tabOf：archived→若 cmdActive 归进行中否则归已收官（已归档完成态回参加进行中巡检）；cancelled→已收官。
- **归档**：`Directive.archived {at, sessions}` + `directive_archived` 账面事件——**fold 处理必须放在终态守卫之前**（否则被 TERMINAL 守卫吞掉，archived 是唯一允许叠在终态上改账的事件）。写路由 POST /warroom/api/archive 三道闸（存在→未归档→链全终局：链上成员要么 cancelled 要么任务 closed/failed），扇出**并行**（会话互不依赖）逐会话调宿主 `workspaces.archiveSession`（宿主无恢复 RPC=真不可逆），部分失败如实记账（succeeded only 入账，全败 502）；GET /warroom/api/host-sessions 只读清单（A-③ 核查通道）。归档行（ArchiveRow）：非终局禁用+终局点开原地确认条（「不可逆」警示）→ 成功关聚焦页+自动切已归档页签+徽章（「已达成 · 相对时间」+会话清单 title）。
- **坑：宿主 RPC 冷启动与操作队拥塞**——宿主 sessions/registry 操作串行落盘（enqueueOperation），演示板 fuse/织换/征召同队时单 RPC 实测 15s-2min+。归档扇出必须**有界**：index 侧 withTimeout 90s 按会话失败记账（不假装成也不无限挂起）；rpcId 用序数（并行扇出下 Date.now() 毫秒撞号）。shoot-v17 归档放全脚本最后+先等 host-sessions 完成一次应答（冷窗实测 1-3 分钟）。

### B. 族系管网连线（舰长令：推翻 V7「族系追踪零几何」定案）
- **架构**：`src/client/pipe-overlay.tsx` 板级 SVG overlay（pointer-events:none）。淡管常显 12%（水电管网隐喻：管常在，hover 该族升 100%+流动动画、其余压 5%）；管色=战线链色（--chain-hue 八相 g 类）；流动只跑到生命条 now 段（dProg 前缀子路径，war-pipe-flow 虚线位移；reduced-motion 停）。
- **端口有向**（本次最大返工教训）：命令卡=顶缘出（上行进板）；后续卡=左缘入+右缘出（有下站才出）——管件像水电接件，**中间站的两端口之间不画线**（卡体本身是导管；画了必穿卡）。列表态：坞→任务舱走横沟+竖干（横沟 y=「列区底↔坞卡顶」夹缝中点——卡 rect 在滚动容器里报全长，贴坞顶 -12 会撞列卡下半截）；卡间段=列间 gutter 中线（左列右缘↔右列左缘之间，必在空沟）。**锚点裁剪**：滚出列体可视区的卡=站台缺席（rect 报全长位置，连它必出穿坞死管——hue-1 案）。
- **map 态拓扑**（SPEC §B）：命令卡→任务舱(竖干)→HQ→出航弦→星球→返航弦→HQ→回报舱(直线弦，星域弦线语言)。HQ/星球屏幕位经 `__wz` 投影出口取（2D=盘心/hits 帧缓存；3D=相机投影 hqScreen/planetScreen）；overlay 按 rect 差换算坐标。流动对齐：执行段=流进星球；回报段=满管。星球身上的执行卡群沿用 war-wz-xline 不动。no3d 回落（StarfieldMap）无 __wz 出口→弦段缺席、只画 DOM 腿（挂账）。
- **星域压暗**（元首令「星域高亮时其余内容压暗」）：scene.setDim + tac.draw(dim)——非命中星球（光晕/名牌/2D globalAlpha）与编队 ×0.35，HQ 与命中族保持增亮。**浅色主题 3D 环分支是死代码**（p.ring 恒 null——V12 基座环从未接线），3D 压暗实证走暗色 halo 分支（挂账：浅色 3D 行星压暗不可视）。浅色纸面上星球填充是暗叠加——alpha 压暗=像素变亮（像素取证断言取幅度不取方向）。
- **性能**：1s 兜底重算序列化比对（lastSigRef），无变化不 setPaths——每秒换数组身份会拖全板持续重渲染+放大点击竞态窗口。

### C. 验证
verify（+10 条 V17-B 针脚：常显 12%/hover 100%/其余 5%/setDim/dimActive/dProg 流动/through>=2 星球流段/reduced-motion/hqScreen/war-pipe-map）两轮 PASS；shoot-v17 11 断言块全绿（页签三态/归档闸/不可逆确认/星域随页签过滤/列表管 0 穿卡/hover 100-5/Map 弦过 HQ 5px/2D 像素压暗/3D halo 0.22-0.62/归档扇出/宿主清单核查）；shoot-v7/shoot-v10/shoot-theme 同步页签语义后全绿（战报列/终局台账卡/取消卡/对比度采样按页签归位——既有断言随 UI 演进同步不删除）；shoot-critique 证据捕获无报错。

## V17.1 map 总线改走板内边（2026-08-29，元首红线示意）

元首在截图上画红线定稿 map 态走势：**管线走板内边**——命令卡上缘出 → 坞顶横沟向左 → **任务列右外竖干（内边总线，全族共用 x=任务列右缘+24）** → 任务卡右缘支管 → 竖干续行到板顶横沟（y=8）→ **HQ 竖直接点**（星球弦挂 HQ，直线染链色）→ 顶沟续右 → 回报列左外下行 → **战报卡左缘**入。取代初版「task→HQ→planet→HQ→report 全直线弦」。
实现要点：①mapMain 一根连续干线 + 任务支管/星球弦两个子路径——**子路径 M 会移当前点，支管必须最后追加**（否则续行从支管端点斜拉出去）；②支管下垂 x=回报列左缘-12（卡外，不穿卡体）；③map 管身改**实线**（虚线只留给流动 prog——直线弦语言由星球弦承担）；④HQ 接点即总线在 HQ.x 的下垂 Hairpin，满管(回报段)时下行-回上-续行。
机检：shoot-v17 全绿，HQ 距离 0px（接点精确过 HQ）；目检 `.goal/evidence/v17/v171-map-bus-hover.png` 与红线示意一致。

## V17.2 右缘双端口 + 回报腿修复（2026-08-29，元首三反馈）
①任务卡端口改**右缘双支管**（入=下位 +10、出=上位 -10；两态通用）——列表态竖干同步从左缘管井迁到任务列右外沟槽（+5，左缘残留清零）；执行/回报卡保持左缘入。②map 态回报腿漏接根因=站序数压缩错位（无执行站的族 stops=[cmd,task,report]，reportIdx=2 永远够不着 through>=3）——mapDraw 改**显式旗标**（toTask/toHq/toReport），base=全网络常显、prog 按 stage 旗标驱动，序数彻底退役。③管网 overlay z-index 3→4（同层被后画的调度坞盖住坞顶横沟段）。

## V17.3 竖干卡位断开（2026-08-29，元首反馈）
map 态竖干不再贯通任务卡位：下行段到任务卡**入端口**（右缘下位）进卡即止，**出端口**（右缘上位）再出来续行顶沟→HQ→回报——卡位中间不画线，「进卡再出来」的导管感。列表态本就分段（入下出上），无需改。

## V17.4 map 态管网退场 + 星球悬停/点击联动卡片族（2026-08-29，元首令）
①**map 态管网整体退场**（元首改主意：星域内部不铺管线）——PipeOverlay 只在列表态挂载；星域内部保留原装 HQ→星球虚线（hlLines，高亮时亮起）与高亮机制不变。②**星球悬停 → 相关卡片族高亮**（与卡片悬停同路）：starfield3d 帧环 hovered 星球变化沿 → onPlanetHover(ws) → views setHoverFamily(cmdIdForWs(ws))。③**星球点击 → 粘性高亮聚焦**：onPlanetClick → setFocusCommandId toggle（再点同星球取消、点他星球换族）；**点星域空处 → onVoidClick 清除**。取代 V14 的「点星球开 bf 面板」（面板走 kbplanet 键盘镜像仍可达）。坑三连：④**V9.2 空白退聚焦的 document 监听抢跑**——星球 click 先设 focus 同一次 click 又被 document 空白清除（target=canvas 非卡片）→ 星域加入豁免表，星域内清除由 onVoidClick 显式管。⑤**编队命中圈盖住星球中心**（绕星巡弋）——拾取改星球优先（pickAt：圈内星球恒胜出，编队在圈外仍可拾取），悬停/点击同源。⑥2D 态点击拾取必须用帧环 hits（雷达布局与 3D 投影不同轴，scene.pick 在 2D 错位）。机检：shoot-v17 全绿（map 管网退场断言 + hlLines≥1 + 星球悬停/粘滞/再点取消/空处取消四连）。

## V17.5 map 管网复归定稿 + 幻影端口修复（2026-08-29，元首两道勘误）

元首勘误拨正 V17.4：「为什么 map 态管网整体退场，我只是让你不要连接到星域的 HQ，直接从任务连接到战报卡片即可」+「顶沟要保留」。**定稿走势**：命令卡上缘 → 坞顶横沟 → 任务列右外竖干 → 任务卡右缘入端口进卡（V17.3 卡位断开保留）→ 出端口续行竖干 → 板顶横沟（topY=8）→ 右行 → 回报列左外下行 → 战报卡左缘入。**无 HQ 接点、无星球弦**（星域内部只留原装 hlLines 虚线+高亮；V17.4 ②③星球悬停/点击联动保留）；mapDraw 旗标收敛为单 toReport，mapChord 退役。

- **幻影端口（本次主坑）**：edgePort 端口锚曾用「滚动容器裁剪后缝段的中心」——大半滚出列体的任务卡（alpha 卡 [607..762] vs 列体底 666）只剩一条缝，缝中心把端口拖到幻影位（stub 进卡位置错 ~75px）；修=**端口按原始 rect 计算** + 端口点落在裁剪盒外=站台缺席（±1px 包含检查）。完全出缝的卡（bravo [1004..1122]）空交=整族跳过，本就是「不在场不画」设计。
- **回报腿测试姿势**：汇报族命令卡默认卷出调度条、任务卡在折叠线下——断言前先把两处滚动到位（walk-up 找滚动容器 scrollLeft/scrollTop 居中）+ 等重算 tick 再量；rep_hit ≤ 20px 实测 **0px**（正触左缘）。
- **诊断方法论**：①探针累积数组（__pipeDrawn）跨 compute 混多个布局纪元，rect 对账自相矛盾——清空后等一次新 compute 再同帧对账 + 截图定案；②overlay box.left=280（挂中列），端口 x=319 是页坐标 599 的 overlay 系，别当错位；③上下文压缩后的 Read 重放可能是旧文件内容（V17.4 mapDraw(toHq,toReport) 差点骗我回滚重做）——一律 grep 磁盘为准。
- 机检：verify PASS + shoot-v17 全绿（rep_hit=0 / hq dist 377 不绕 HQ / ⑧ 0 穿卡 / ⑤⑦ 归档流 / 星球悬停粘性 / 3D halo）。目检 `.goal/evidence/v17/v175-now.png`（map 态全板）。
