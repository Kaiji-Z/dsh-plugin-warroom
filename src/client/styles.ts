/**
 * Warroom styles v5.0 — 三层语义令牌架构（V12.2 语义 token 化）。
 * One idempotent <style> injection, `war-*` class namespace.
 *
 * 三层架构（皮肤化的缝就在这）：
 *   L1 基元 —— 裸色值只允许出现在 .war-root 与 body[data-ds-dark-theme]
 *      两个令牌定义块（含星域场景组/链色谱这两条刻意第二色谱）。
 *   L2 语义 —— --war-* 令牌层；组件与场景规则【只】引用本层，不直穿
 *      --dsw-alias-*、不写裸色。换肤 = 整块重映射本层，规则零改动。
 *   L3 场景开关 —— 明（.war-root 缺省）/暗（宿主 body[data-ds-dark-theme]
 *      单开关跟随）/皮肤钩子（[data-war-skin] 挂 .war-root，当前只换措辞，
 *      视觉皮肤未来在此重映射）/星域态（.war-mapmode 布局开关）。
 *
 * V9.13 取材原则原样有效：浅色=宿主 alias + 定向压黑（白底对比），深色=宿主
 * 明度档原值直用或微量混白——两主题各自成章，不机械反转。容器海拔四级：
 * canvas（画布）→ zone（三区容器）→ card（卡片）→ well（凹槽）。
 * TS 侧消费（canvas 2D 战术盘/three.js 语义色/速报日志色）经
 * war-tokens.ts 从本层读取——CSS 是唯一色源，回退哨兵由
 * tests/war-tokens.test.ts 双向锁死。
 * （patch-layer bundles cannot use CSS Modules; quality-tier colors ride the
 * status token family now, mirroring QUALITY_TIERS.）
 * @module dsh-plugin-warroom/client/styles
 */

export const WAR_CSS = `
/* ═══ L1/L2 语义令牌层 · 浅色缺省（v5.0）══════════════════════════════════════ */
.war-root{
  /* 海拔：浅色主题宿主四层 bg 同为白（宿主分层塌缩），由灰画布 vs 白容器自建层级；
   * 深色主题直接用宿主真实海拔四级（950 画布 / 875 区 / 850 卡 / 800 凹槽）。 */
  --war-canvas: var(--dsw-static-neutral-bluish-50);
  --war-zone-bg: var(--dsw-alias-bg-base);
  --war-card-bg: var(--dsw-alias-bg-layer-1);
  --war-pop-bg: var(--dsw-alias-bg-layer-1);
  --war-well-bg: var(--dsw-static-neutral-bluish-75);
  /* 文本/边框/字体（V12.2 中间层收编：组件规则不再直穿 --dsw-alias-*） */
  --war-text-1: var(--dsw-alias-label-primary);
  --war-text-2: var(--dsw-alias-label-secondary);
  --war-text-3: var(--dsw-alias-label-tertiary);
  --war-border: var(--dsw-alias-border-l2);
  --war-border-soft: var(--dsw-alias-border-l1);
  --war-border-hover: var(--dsw-alias-label-secondary);
  --war-font: var(--dsw-font-family);
  --war-font-code: var(--dsw-font-markdown-code);
  --war-scrollbar: var(--dsw-alias-scrollbar-bg-l2, auto);
  /* 状态前景（12px 正文级 → 各主题 ≥4.5:1）：浅色压黑保白底对比；
   * 深色用宿主 primary 原值（为深底调的明度，实测 4.8-7.3:1）。 */
  --war-run: color-mix(in srgb, var(--dsw-alias-state-business-primary) 62%, #000);
  --war-run-strong: color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);
  --war-wait: color-mix(in srgb, var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)) 58%, #000);
  --war-done: color-mix(in srgb, var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary)) 58%, #000);
  --war-fail: color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000);
  /* 状态原色（描边/圆点/彩带/辉光共用的饱和档；正文前景用上面压黑档） */
  --war-run-border: var(--dsw-alias-state-business-primary);
  --war-wait-border: var(--dsw-alias-state-warn-primary);
  --war-done-border: var(--dsw-alias-state-success-primary);
  --war-fail-border: var(--dsw-alias-state-error-primary);
  /* 三区彩带（任务/星球/任务回报的顶部身份色） */
  --war-band-task: var(--dsw-alias-state-business-primary);
  --war-band-field: var(--dsw-alias-label-tertiary);
  --war-band-report: var(--dsw-alias-state-success-primary);
  /* 动作（实心按钮）与焦点环 */
  --war-action-bg: color-mix(in srgb, var(--dsw-alias-state-business-primary) 78%, #000);
  --war-action-fg: #fff;
  --war-focus: var(--dsw-alias-state-business-primary);
  /* 状态底染（ghost/警示卡/坞带）——透明基，随底色自然合成 */
  --war-run-tint: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
  --war-wait-tint: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);
  --war-done-tint: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent);
  --war-fail-tint: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
  /* 选项卡选中态（档位/时机/cron 预设/皮肤）：底染要量得出（旧 7% 两主题实测
   * 仅 1.09-1.12:1，等于没有）——三通道=底染+名字色+圆点标记。 */
  --war-select-tint: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, var(--war-card-bg));
  --war-select-name: var(--war-run-strong);
  --war-dock-bg: color-mix(in srgb, var(--dsw-alias-state-business-primary) 5%, var(--dsw-alias-bg-base));
  --war-dock-inset: inset 0 2px 8px rgba(15, 23, 42, .07);
  /* 投影三档 + 遮罩：浅色蓝黑低强度，深色纯黑高强度 */
  --war-shadow-1: 0 1px 2px rgba(15, 23, 42, .05), 0 2px 8px rgba(15, 23, 42, .07);
  --war-shadow-2: 0 4px 14px rgba(15, 23, 42, .1);
  --war-shadow-3: 0 14px 32px rgba(15, 23, 42, .16);
  --war-backdrop: rgba(15, 23, 42, .34);
  /* 圆角阶（皮肤可调轮廓性格；布局级数值不进令牌） */
  --war-r-pill: 999px; --war-r-lg: 12px; --war-r-md: 10px; --war-r-sm: 8px;
  /* 星域场景组（V12.2）：浅=纸面证件风/蓝图纸面，深=深空玻璃/战术雷达。
   * 执行卡、名签、tooltip、切换钮、图例、hint、战术盘、速报日志色全组在此
   * ——TS 侧 war-tokens.ts 按名读取，回退哨兵锁死同值。 */
  --war-wz-wait: #b07800; --war-wz-battle: #d9480f; --war-wz-held: #1971c2; --war-wz-hl: #0e7490; --war-wz-active: #1971c2; --war-wz-settled: #2f9e44; --war-wz-failed: #c92a2a;
  --war-wz-line: rgba(176,120,0,.72);
  --war-wz-card-bg: rgba(252,253,255,.92); --war-wz-card-border: rgba(176,120,0,.5);
  --war-wz-card-text: #23405e; --war-wz-card-dim: #5a7396;
  --war-wz-card-hover-border: #b07800; --war-wz-card-hover-text: #0b2b4a;
  --war-wz-card-shadow: 0 1px 8px rgba(30,60,100,.18); --war-wz-card-hover-shadow: 0 2px 12px rgba(30,60,100,.28);
  --war-wz-dot: #d9480f; --war-wz-dot-glow: rgba(217,72,15,.7);
  --war-wz-toggle-bg: rgba(255,255,255,.78); --war-wz-toggle-border: rgba(28,78,128,.45); --war-wz-toggle-text: #33506e;
  --war-wz-toggle-on-bg: linear-gradient(180deg,rgba(25,113,194,.24),rgba(25,113,194,.08));
  --war-wz-toggle-on-text: #0b3a63; --war-wz-toggle-hover-text: #0b3a63;
  --war-wz-legend-text: #4a648a; --war-wz-hint: #4a648a;
  --war-wz-tip-bg: rgba(252,253,255,.95); --war-wz-tip-border: rgba(28,78,128,.35);
  --war-wz-tip-shadow: 0 4px 20px rgba(30,60,100,.22); --war-wz-tip-text: #23405e;
  --war-wz-tip-name: #10365c; --war-wz-tip-tag: #1c4e80; --war-wz-tip-tag-border: rgba(28,78,128,.45);
  --war-wz-tip-desc: #4c6a8a; --war-wz-tip-row-line: rgba(70,110,160,.25);
  --war-wz-tip-label: #5a7396; --war-wz-tip-value: #132f4a;
  --war-wz-tip-dot: #1971c2; --war-wz-tip-dot-glow: rgba(25,113,194,.6);
  --war-wz-tip-dot-warm: #b07800; --war-wz-tip-emph: #8a5f00;
  --war-wz-chip-wait-text: #8a5f00; --war-wz-chip-wait-bg: rgba(176,120,0,.12); --war-wz-chip-wait-border: rgba(176,120,0,.5);
  --war-wz-chip-battle-text: #c2410c; --war-wz-chip-battle-bg: rgba(217,72,15,.1); --war-wz-chip-battle-border: rgba(217,72,15,.5);
  --war-wz-chip-held-text: #1971c2; --war-wz-chip-held-bg: rgba(25,113,194,.1); --war-wz-chip-held-border: rgba(25,113,194,.5);
  /* V18.2 星球生命周期态 chip（与 V18 发光四档同源：settled 绿/failed 红/idle 中性） */
  --war-wz-chip-settled-text: #2b7a3a; --war-wz-chip-settled-bg: rgba(47,158,68,.1); --war-wz-chip-settled-border: rgba(47,158,68,.5);
  --war-wz-chip-failed-text: #b8322f; --war-wz-chip-failed-bg: rgba(201,42,42,.1); --war-wz-chip-failed-border: rgba(201,42,42,.5);
  --war-wz-chip-idle-text: #5b6167; --war-wz-chip-idle-bg: rgba(120,130,140,.12); --war-wz-chip-idle-border: rgba(120,130,140,.45);
  /* 速报日志色（kind 化：order 下令/engage 接敌/triumph 达成/retreat 败退/
   * return 返航/review 待验收）——浅色压深保白蓝图对比，深色原亮值。 */
  --war-log-order: #8a5f00; --war-log-engage: #c2410c; --war-log-triumph: #1971c2;
  --war-log-retreat: #b3261e; --war-log-return: #6741d9; --war-log-review: #b07800;
  /* 2D 战术盘双皮（浅=蓝图纸面）：canvas 绘制经 war-tokens.ts 读取 */
  --war-tac-bg0: #f8fbfe; --war-tac-bg1: #eef4fa; --war-tac-bg2: #e3edf7;
  --war-tac-grid: rgba(70,110,160,.12); --war-tac-ring: rgba(90,130,180,.55); --war-tac-ring-txt: rgba(80,120,170,.6);
  --war-tac-cross: rgba(90,130,180,.32); --war-tac-tick: rgba(90,130,180,.45); --war-tac-bearing: rgba(70,105,150,.65);
  --war-tac-hq-pulse: 28,78,128; --war-tac-hq-fill: rgba(214,232,248,.95);
  --war-tac-hq: #1c4e80; --war-tac-hq-core: #2d6ca6; --war-tac-hq-label: #1c4e80;
  --war-wz-hl-line: rgba(14,116,144,.55); --war-wz-battle-pulse: 217,72,15;
  --war-tac-garrison: rgba(25,113,194,.75); --war-tac-name: rgba(40,70,110,.9); --war-tac-name-hl: #0b3a53;
  --war-tac-sq-battle: #d9480f; --war-tac-sq-ret: #6741d9; --war-tac-sq-dep: #1971c2; --war-tac-sq-hold: #b07800;
  --war-tac-corner: rgba(28,78,128,.5);
  /* 3D 天穹（浅=暖阳光斑+浅蓝天幕，画布 alpha:true 透出）/ 晕影 / 2D 海图纸 /
   * 标签光晕（浅=白晕压天幕，深=黑晕压星海——canvas 上的 DOM 标签可读性保险） */
  --war-label-halo: 0 0 6px rgba(255,255,255,.75);
  --war-sky-bg: radial-gradient(circle at 68% 16%, rgba(255,243,214,.9), rgba(255,243,214,0) 36%), linear-gradient(180deg, #c9e5f8 0%, #e6f3fd 52%, #f5fafF 100%);
  --war-sky-vig: radial-gradient(ellipse at center, transparent 62%, rgba(255,255,255,.55) 100%);
  --war-chart-bg:
    radial-gradient(1100px 460px at 72% -12%, color-mix(in srgb, var(--war-run-border) 8%, transparent), transparent 62%),
    radial-gradient(820px 400px at 12% 112%, color-mix(in srgb, var(--chain-hue, #a83d84) 6%, transparent), transparent 55%),
    linear-gradient(color-mix(in srgb, var(--war-border-soft) 28%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--war-border-soft) 28%, transparent) 1px, transparent 1px),
    color-mix(in srgb, #efe6d2 40%, var(--war-canvas));
  /* 2D 星域 HQ 太阳（lit 态）：浅色压深字 + 柔辉，深色原亮 + 双层辉光 */
  --war-sun: color-mix(in srgb, #f6c453 45%, #2b1d00);
  --war-sun-glow: 0 0 10px color-mix(in srgb, #f6c453 38%, transparent);
  font-family:var(--war-font);color:var(--war-text-1);display:flex;flex-direction:column;height:100%;min-height:0;background:var(--war-canvas);position:relative;scrollbar-color:var(--war-scrollbar) transparent}
.war-root ::selection{background:color-mix(in srgb, var(--war-run-border) 22%, transparent)}
/* 宿主不给插件子树提供 border-box 复位——content-box 下一切 width:100%+padding
 * 的件（弹窗本体/命令输入框/cron 输入/侧栏行）都会横向戳出父容器（舰长报修
 * 实测：composer 恒溢出弹窗右缘 8px、modal 实宽 678 超 max-width 640）。 */
.war-root *,.war-root *::before,.war-root *::after{box-sizing:border-box}

/* ═══ L3 深色覆盖（宿主 body 单开关，插件不设第二套）══════════════════════════ */
body[data-ds-dark-theme] .war-root{
  /* 深色层梯：宿主暗色层不塌缩，四级容器各落一层（浅色因 layer 全白不覆盖
   * zone/card/pop，靠灰画布分层）。层梯可辨性由 shoot-theme 断言兜底。 */
  --war-canvas: var(--dsw-alias-bg-base);
  --war-zone-bg: var(--dsw-alias-bg-layer-1);
  --war-card-bg: var(--dsw-alias-bg-layer-2);
  --war-well-bg: var(--dsw-alias-bg-layer-3);
  --war-pop-bg: var(--dsw-alias-bg-layer-3);
  --war-run: var(--dsw-alias-state-business-primary);
  --war-run-strong: var(--dsw-alias-state-business-primary);
  --war-wait: var(--dsw-alias-state-warn-primary);
  --war-done: var(--dsw-alias-state-success-primary);
  --war-fail: color-mix(in srgb, var(--dsw-alias-state-error-primary) 75%, #fff); /* V13：红基色天生暗于琥珀/绿，86% 白档在 well 底仅 4.29:1——败因行 12px 正文要 4.5+ */
  --war-action-bg: color-mix(in srgb, var(--dsw-alias-state-business-primary) 70%, #000);
  --war-run-tint: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  --war-wait-tint: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
  --war-done-tint: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
  --war-fail-tint: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);
  --war-select-tint: color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, var(--war-card-bg));
  --war-select-name: #fff;
  --war-dock-bg: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-base));
  --war-dock-inset: inset 0 2px 8px rgba(0, 0, 0, .32);
  --war-shadow-1: 0 2px 8px rgba(0, 0, 0, .35);
  --war-shadow-2: 0 4px 14px rgba(0, 0, 0, .45);
  --war-shadow-3: 0 14px 36px rgba(0, 0, 0, .55);
  --war-backdrop: rgba(0, 0, 0, .55);
  /* 星域场景组 · 深空玻璃/战术雷达皮 */
  --war-wz-wait: #ffc24d; --war-wz-battle: #ff6a55; --war-wz-held: #66d4ff; --war-wz-hl: #6fe3ff; --war-wz-active: #5aa9ff; --war-wz-settled: #4cd98e; --war-wz-failed: #ff5f56;
  --war-wz-line: rgba(255,179,92,.78);
  --war-wz-card-bg: rgba(8,14,28,.84); --war-wz-card-border: rgba(255,179,92,.4);
  --war-wz-card-text: #cfe6ff; --war-wz-card-dim: #7e9cc0;
  --war-wz-card-hover-border: rgba(255,179,92,.9); --war-wz-card-hover-text: #eef8ff;
  --war-wz-card-shadow: 0 0 14px rgba(0,140,255,.14); --war-wz-card-hover-shadow: 0 0 18px rgba(0,140,255,.3);
  --war-wz-dot: #6fe3ff; --war-wz-dot-glow: #6fe3ff;
  --war-wz-toggle-bg: rgba(8,14,28,.6); --war-wz-toggle-border: rgba(111,227,255,.4); --war-wz-toggle-text: #8fb6dd;
  --war-wz-toggle-on-bg: linear-gradient(180deg,rgba(60,140,255,.3),rgba(60,140,255,.1));
  --war-wz-toggle-on-text: #eaf6ff; --war-wz-toggle-hover-text: #dff2ff;
  --war-wz-legend-text: #7e9cc0; --war-wz-hint: #7e9cc0;
  --war-wz-tip-bg: rgba(8,14,28,.78); --war-wz-tip-border: rgba(111,227,255,.35);
  --war-wz-tip-shadow: 0 0 26px rgba(0,140,255,.16),inset 0 0 20px rgba(20,60,120,.22); --war-wz-tip-text: #cfe6ff;
  --war-wz-tip-name: #eaf6ff; --war-wz-tip-tag: #8fd8ff; --war-wz-tip-tag-border: rgba(111,227,255,.4);
  --war-wz-tip-desc: #9db8d8; --war-wz-tip-row-line: rgba(120,170,220,.14);
  --war-wz-tip-label: #7e9cc0; --war-wz-tip-value: #e8f4ff;
  --war-wz-tip-dot: #6fe3ff; --war-wz-tip-dot-glow: #6fe3ff;
  --war-wz-tip-dot-warm: #ffb35c; --war-wz-tip-emph: #ffc98a;
  --war-wz-chip-wait-text: #ffc24d; --war-wz-chip-wait-bg: rgba(255,176,32,.12); --war-wz-chip-wait-border: rgba(255,176,32,.45);
  --war-wz-chip-battle-text: #ff6a55; --war-wz-chip-battle-bg: rgba(255,64,48,.12); --war-wz-chip-battle-border: rgba(255,80,64,.5);
  --war-wz-chip-held-text: #66d4ff; --war-wz-chip-held-bg: rgba(77,163,255,.12); --war-wz-chip-held-border: rgba(77,163,255,.5);
  /* V18.2 星球生命周期态 chip（深=V18 态色原亮值） */
  --war-wz-chip-settled-text: #4cd98e; --war-wz-chip-settled-bg: rgba(76,217,142,.1); --war-wz-chip-settled-border: rgba(76,217,142,.45);
  --war-wz-chip-failed-text: #ff5f56; --war-wz-chip-failed-bg: rgba(255,95,86,.1); --war-wz-chip-failed-border: rgba(255,95,86,.45);
  --war-wz-chip-idle-text: #9aa7b4; --war-wz-chip-idle-bg: rgba(150,165,180,.1); --war-wz-chip-idle-border: rgba(150,165,180,.4);
  --war-log-order: #ffc98a; --war-log-engage: #ff7755; --war-log-triumph: #5fc4ff;
  --war-log-retreat: #ff5a5a; --war-log-return: #9a86ff; --war-log-review: #ffc24d;
  --war-tac-bg0: #04101f; --war-tac-bg1: #020812; --war-tac-bg2: #010409;
  --war-tac-grid: rgba(60,120,190,.07); --war-tac-ring: rgba(80,160,230,.2); --war-tac-ring-txt: rgba(110,180,240,.4);
  --war-tac-cross: rgba(80,160,230,.15); --war-tac-tick: rgba(90,170,240,.35); --war-tac-bearing: rgba(120,190,250,.5);
  --war-tac-hq-pulse: 111,227,255; --war-tac-hq-fill: rgba(20,50,90,.92);
  --war-tac-hq: #9fdcff; --war-tac-hq-core: #cfeeff; --war-tac-hq-label: #bfe6ff;
  --war-wz-hl-line: rgba(111,227,255,.55); --war-wz-battle-pulse: 255,90,60;
  --war-tac-garrison: rgba(95,196,255,.7); --war-tac-name: rgba(200,225,250,.85); --war-tac-name-hl: #bfefff;
  --war-tac-sq-battle: #ff7755; --war-tac-sq-ret: #9a86ff; --war-tac-sq-dep: #5fc4ff; --war-tac-sq-hold: #ffc98a;
  --war-tac-corner: rgba(111,227,255,.5);
  --war-sky-bg: radial-gradient(ellipse at 50% 44%, #0a1122 0%, #070b16 55%, var(--war-canvas) 100%);
  --war-sky-vig: radial-gradient(ellipse at center, transparent 55%, rgba(2,4,12,.6) 100%);
  --war-chart-bg:
    radial-gradient(1100px 460px at 72% -12%, color-mix(in srgb, var(--war-run-border) 9%, transparent), transparent 60%),
    radial-gradient(820px 400px at 12% 112%, color-mix(in srgb, #a83d84 7%, transparent), transparent 55%),
    var(--war-canvas);
  --war-sun: #f6c453;
  --war-sun-glow: 0 0 14px color-mix(in srgb, #f6c453 65%, transparent), 0 0 40px color-mix(in srgb, #f6c453 25%, transparent);
  --war-label-halo: 0 0 6px rgba(0,0,0,.65);
}

/* ═══ 皮肤钩子（V12.2）：[data-war-skin] 挂 .war-root，由设置抽屉的文案皮肤 ══
 * 开关同步落属性。当前军事/平话两皮只换措辞（WarCopy 词典）不换色；未来视觉
 * 皮肤在此选择器内重映射 --war-* 令牌层即可，组件规则零改动。 */

/* --- V8 hero 灵动岛（标题栏替代）：收起=计数仪表胶囊，hover 展开/点击钉住 ------- */
.war-island{position:relative;flex:0 0 auto;padding:10px 12px 4px;z-index:40}
.war-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap} /* 读屏专用（视觉隐藏 live 区） */
.war-island-pill{display:flex;align-items:center;gap:10px;padding:7px 14px;border:1px solid var(--war-border);border-radius:var(--war-r-pill);background:var(--war-card-bg);box-shadow:var(--war-shadow-1);cursor:pointer;transition:border-radius .22s ease,box-shadow .22s ease}
.war-island-pill:hover{box-shadow:var(--war-shadow-2)}
/* 展开态 morph：胶囊 → 圆角矩形——pill 上圆下平（熔进浮层），浮层上平下圆。 */
.war-island.open .war-island-pill{border-radius:16px 16px 0 0;box-shadow:var(--war-shadow-2)}
.war-island-title{font-size:14px;font-weight:700;white-space:nowrap}
.war-head-dot{width:8px;height:8px;border-radius:50%;background:var(--war-wait-border);flex:0 0 auto}
.war-head-dot.on{background:var(--war-run-border)}
.war-island-counts{font-size:12px;color:var(--war-text-2);white-space:nowrap}
.war-island-num{font-size:13px;font-weight:600;color:var(--war-text-2)} /* V12.2 critique P3：计数数字上权重（第一眼信息反层级倒挂） */
.war-island-badge{font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--war-border);color:var(--war-text-2);white-space:nowrap;background:transparent;cursor:pointer;font-family:var(--war-font)} /* V16.4-R3：span→button——显式透明底防 UA ButtonFace 泄漏 */
.war-island-seg{background:none;border:none;font:inherit;color:inherit;cursor:pointer;padding:0}
.war-island-seg:hover .war-island-num,.war-island-seg:hover{color:var(--war-text-1)}
.war-flash{outline:2px solid var(--war-focus) !important;outline-offset:1px;border-radius:var(--war-r-sm)} /* V16.4-R3：计数路由的 1.6s 闪显描边 */
.war-island-badge.hot{color:var(--war-fail);border-color:var(--war-fail-border);font-weight:600}
.war-island-badge.wait{color:var(--war-wait);border-color:var(--war-wait-border)} /* V16.4 P2-1：琥珀=等你搬到徽标（等外勤小队是机器等待，四数全中性） */
.war-island-visitmini{font-size:12px;color:var(--war-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.war-vm-seg.done{color:var(--war-done)} /* V16.4-R7：delta 语义染色 */
.war-vm-seg.fail{color:var(--war-fail)}
.war-vm-seg.run{color:var(--war-run-strong)}
.war-island-spacer{flex:1 1 auto;min-width:4px}
.war-island-pinned{font-size:12px;flex:0 0 auto}
.war-island .war-btn{padding:2px 10px;line-height:18px;font-size:12px;flex:0 0 auto}
/* 展开浮层：绝对定位盖在列区上方——列纹丝不动（灵动岛不推挤内容）。 */
.war-island-panel{position:absolute;top:100%;left:12px;right:12px;display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;border:1px solid var(--war-border);border-top:0;border-radius:0 0 16px 16px;background:var(--war-pop-bg);box-shadow:var(--war-shadow-3);max-height:52vh;overflow-y:auto;animation:war-island-open .2s ease}
@keyframes war-island-open{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.war-island-panel{animation:none}.war-island-pill{transition:none}}
.war-dockpill{display:inline-flex;align-items:center;gap:6px}
.war-dockseg{font-size:12px}
.war-err{font-size:12px;color:var(--war-fail)}
.war-empty{color:var(--war-text-2);font-size:12px;padding:12px 4px;text-align:center;border:1px dashed var(--war-border);border-radius:var(--war-r-md);margin:6px 0}

/* --- V9 局势墙三列（任务/星球/任务回报）+ 底部命令调度条 ------------------------- */
/* 板体 = 纵向 flex：.war-ops 三列网格占满余高，.war-dispatch 全宽横条贴底。
 * 不能把调度条直接塞进三列 grid——它会被排到第 2 行第 1 列只剩一列宽。 */
.war-board{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.war-ops{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:1.1fr 1fr 1.1fr;gap:10px;padding:2px 10px 6px}
.war-zone{display:flex;flex-direction:column;min-height:0;min-width:0;border:1px solid var(--war-border);border-radius:var(--war-r-lg);background:var(--war-zone-bg);overflow:hidden}
.war-tasks{box-shadow:inset 0 3px 0 var(--war-band-task)}
.war-field{box-shadow:inset 0 3px 0 var(--war-band-field)}
.war-zone.war-report{box-shadow:inset 0 3px 0 var(--war-band-report)}
.war-col{display:flex;flex-direction:column;min-height:0;min-width:0;padding:0 8px}
.war-col-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;padding:8px 2px;background:var(--war-zone-bg);border-bottom:1px solid var(--war-border-soft);flex:0 0 auto}
.war-col-title{font-size:13px;font-weight:600;color:var(--war-text-2);letter-spacing:.04em}
.war-col-count{font-size:12px;line-height:18px;min-width:18px;text-align:center;padding:0 6px;border-radius:9px;background:var(--war-well-bg);color:var(--war-text-2)}
.war-col-body{flex:1 1 auto;overflow-y:auto;padding:8px 2px 16px;display:flex;flex-direction:column;gap:8px}
/* 底部命令调度条：所有命令卡横向一排（活跃优先+新→旧），单行横滚——
 * Dispatch 调度中心的一排英雄位；命令是唯一可点入口。
 * 视觉与三列刻意拉开物种差：坞带 = 主色淡染凹槽（--war-dock-bg 双主题各自
 * 调强度）+ 内阴影；命令卡在坞里浮起一层投影。
 * V9.4 容器化（舰长定）：整坞一个大容器（与三区同语言的圆角容器，物种差
 * 保留——主色淡染凹槽坞）；左端 ＋ 下达瓦片（容器一部分，幽灵虚线态）；
 * 命令卡全部进 .war-dispatch-track 轨道横滚；「命令调度」铭牌休眠。 */
/* V17.6 舰长令：调度栏**定高**——横滚条预留进栏高内（卡区=卡高+细滚条位），
 * 滚条出现/消失不改变栏高，卡锚 y 恒定（顶对齐+定值 padding-top）。 */
.war-dispatch{flex:0 0 auto;display:flex;gap:10px;align-items:stretch;height:218px;margin:0 10px 10px;padding:10px;border:1px solid var(--war-border);border-radius:var(--war-r-lg);background:var(--war-dock-bg);box-shadow:var(--war-dock-inset)}
.war-dispatch-track{flex:1 1 auto;min-width:0;display:flex;gap:10px;align-items:flex-start;padding:10px 2px 12px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:thin}
.war-dispatch-track.can-scroll{mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 26px),rgba(0,0,0,.35));-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 26px),rgba(0,0,0,.35))}
.war-dispatch .war-command-card{flex:0 0 320px;min-width:0}
/* V12.2 critique P1：调度轨道分段铭牌——竖排小路标（活跃段 | 收官段），
 * 扫读不用整轨滚完；单段在场时视图层不挂牌。 */
.war-track-seg{flex:0 0 auto;align-self:center;writing-mode:vertical-rl;padding:10px 5px;border-radius:var(--war-r-sm);font-size:12px;font-weight:600;letter-spacing:.14em;color:var(--war-text-2);border:1px dashed var(--war-border);user-select:none;white-space:nowrap}/* V13.2：text-3 实测 3.5:1（critique B 抓）——分段铭牌是 12px 正文级 */

/* --- cards ------------------------------------------------------------------ */
.war-card{border:1px solid var(--war-border);border-radius:var(--war-r-md);background:var(--war-card-bg);padding:8px 10px;display:flex;flex-direction:column;gap:6px;transition:border-color .12s ease,transform .12s ease,box-shadow .12s ease,opacity .15s ease}
.war-card.clickable{cursor:pointer}
.war-card.clickable:hover{border-color:var(--war-border-hover);transform:translateY(-1px);box-shadow:var(--war-shadow-1)}
.war-card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.war-chip{font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--war-border);color:var(--war-text-2);white-space:nowrap}
.war-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}
.war-taskid{font-size:12px;color:var(--war-text-2);font-family:var(--war-font-code)}
.war-time{font-size:12px;color:var(--war-text-2);margin-left:auto;white-space:nowrap}
.war-ws{font-size:12px;color:var(--war-text-2);font-family:var(--war-font-code);word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-brief{font-size:12px;line-height:1.5;color:var(--war-text-2);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.war-report-body{font-size:12px;background:var(--war-well-bg);border-radius:var(--war-r-sm);padding:6px 10px;white-space:pre-wrap;color:var(--war-text-1)}

/* status chip colors —— 状态语义四色 + 中性：
 * 蓝=机器在动（进行/直发档/定时）、琥珀=等你（对话/呈批/等待警示）、
 * 绿=圆满（收官/打赢/已阅）、红=败（失败/错误/高危）、中性灰=待你翻阅
 * （reported——事实已定，动作是你翻，不给惊扰色）。 */
.war-chip.st-published{color:var(--war-wait);border-color:var(--war-wait-border);background:var(--war-wait-tint)}
.war-chip.st-in_progress,.war-chip.oc-live{color:var(--war-run);border-color:var(--war-run-border)}
.war-chip.st-reported,.war-chip.oc-reported{color:var(--war-text-1);border-color:var(--war-border-hover)}
.war-chip.st-closed,.war-chip.oc-done{color:var(--war-done);border-color:var(--war-done-border)}
.war-chip.st-failed,.war-chip.oc-fail{color:var(--war-fail);border-color:var(--war-fail-border)}
.war-chip.pri-high{color:var(--war-fail);border-color:var(--war-fail-border);font-weight:600}
/* command-zone chip colors —— V9.13 语义拆分：received=大副在动（蓝）、
 * talking=等你回答（琥珀，与台账 warn ghost/收件箱 k-clarify 同族对齐）。 */
.war-chip.st-draft{color:var(--war-text-2)}
.war-chip.st-received{color:var(--war-run);border-color:var(--war-run-border);font-weight:600}
.war-chip.st-talking{color:var(--war-wait);border-color:var(--war-wait-border);font-weight:600}
.war-chip.st-approved{color:var(--war-done);border-color:var(--war-done-border)}
.war-chip.st-cancelled{color:var(--war-text-2);text-decoration:line-through}
/* V5 grade chips (档位账本): L0 直发绿 / L1 呈批蓝 / L2 澄清黄 */
.war-chip.gr-L0{color:var(--war-done);border-color:var(--war-done-border)}
.war-chip.gr-L1{color:var(--war-run);border-color:var(--war-run-border)}
.war-chip.gr-L2{color:var(--war-wait);border-color:var(--war-wait-border)}
/* V5 分诊理由行（命令详情浮层） */
.war-note{margin-top:6px;font-size:12px;color:var(--war-text-2)}
/* V5-R3 计划卡（命令详情浮层内） */
.war-plan{margin-top:10px;border:1px solid var(--war-border);border-radius:var(--war-r-sm);padding:8px 10px}
.war-plan-head{font-size:12px;font-weight:600;color:var(--war-text-1);margin-bottom:4px}
.war-plan-body{font-size:12px;white-space:pre-wrap;color:var(--war-text-1);max-height:240px;overflow:auto}

/* quality-tier palette（状态令牌族的刻意映射：common=中性/fine=绿/rare=蓝/
 * epic=琥珀/legendary=红——与 QUALITY_TIERS 对齐，皮肤随令牌走）。 */
.war-chip.q-common{color:var(--war-text-2)}
.war-chip.q-fine{color:var(--war-done);border-color:var(--war-done-border)}
.war-chip.q-rare{color:var(--war-run);border-color:var(--war-run-border)}
.war-chip.q-epic{color:var(--war-wait);border-color:var(--war-wait-border)}
.war-chip.q-legendary{color:var(--war-fail);border-color:var(--war-fail-border);font-weight:600}
/* V7.1 审查整改：稀有度从「3px 品质左边框」（side-tab 指纹）改为 chip 单通道
 * ——颜色随档位的品质 chip（qualityChip）已在任务/会话卡上，边框通道删除。 */

/* dots + the received breathing reminder */
.war-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--war-text-3)}
.war-dot.received{background:var(--war-run-border)}
.war-dot.done{background:var(--war-done-border)}
.war-command-card.pulse{border-color:var(--war-run-border);animation:war-pulse 1.6s ease-in-out infinite}
@keyframes war-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}50%{box-shadow:0 0 0 3px var(--war-run-border)}}
@media (prefers-reduced-motion: reduce){.war-command-card.pulse{animation:none}.war-group-history .war-command-card{animation:none}}
.war-command-text{font-size:13px;font-weight:600;line-height:1.5;color:var(--war-text-1);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.war-command-text.struck{color:var(--war-text-2);text-decoration:line-through}

/* --- command lifecycle strip (v6: 命令→任务→执行→任务回报 全程追踪) -------------- */
.war-life{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-top:2px}
.war-life-stage{display:flex;flex-direction:column;gap:3px;min-width:0}
.war-life-bar{height:3px;border-radius:2px;background:var(--war-border);transition:background .2s ease}
.war-life-bar.done{background:var(--war-done-border)}
.war-life-bar.err{background:var(--war-fail-border)} /* V12.2 critique P2：败局终站红——绿严格=圆满（图例契约），挫败的报告段红收尾 */
.war-life-bar.now{background:var(--war-run-border);animation:war-life-breath 2.4s ease-in-out infinite}
@keyframes war-life-breath{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.war-life-bar.now{animation:none}}
.war-life-label{font-size:12px;line-height:16px;min-height:16px;color:color-mix(in srgb, var(--war-text-3) 45%, var(--war-text-2));white-space:nowrap;overflow:hidden;text-overflow:ellipsis} /* V16.4：min-height 保恒高——段标签只在 now 段出现，空段位不塌 */
.war-life-label.done{color:var(--war-text-2)}
.war-life-label.now{color:var(--war-run-strong);font-weight:600}
.war-life-status{font-size:12px;color:var(--war-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-life-status.warn{color:var(--war-wait);font-weight:600}
.war-life-status.err{color:var(--war-fail)}

/* lineage chip（任务/会话卡 → 源命令）：可点的回溯入口 */
.war-chip.gr-L0,.war-chip.gr-L1,.war-chip.gr-L2{border-radius:4px}
.war-chip.war-lineage{cursor:pointer}
.war-chip.war-lineage:hover{border-color:var(--war-run-border);color:var(--war-text-1)}

/* --- V7-① 等你定夺收件箱（指挥中心头部聚合队列） ------------------------------- */
.war-inbox{flex:0 0 auto;margin:8px 14px 0;border:1px solid var(--war-border);border-radius:var(--war-r-md);background:var(--war-card-bg)}
.war-inbox-head{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--war-border-soft)}
.war-inbox-title{font-size:12px;font-weight:700;color:var(--war-text-2);letter-spacing:.04em}
.war-inbox-count{font-size:12px;line-height:18px;min-width:18px;text-align:center;padding:0 6px;border-radius:9px;background:var(--war-well-bg);color:var(--war-text-2)}
.war-inbox-items{display:flex;flex-direction:column;max-height:176px;overflow-y:auto}
.war-inbox-item{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;border-bottom:1px solid var(--war-border-soft);scroll-margin-top:36px}
.war-inbox-item:last-child{border-bottom:0}
.war-inbox-item:hover{background:var(--war-well-bg)}
.war-inbox-text{flex:1 1 auto;min-width:0;font-size:12px;color:var(--war-text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-inbox-wait{font-size:12px;color:color-mix(in srgb, var(--war-text-3) 45%, var(--war-text-2));white-space:nowrap;flex:0 0 auto}
.war-inbox-item.tone-warn .war-inbox-wait{color:var(--war-wait);font-weight:600}
.war-inbox-item.tone-err .war-inbox-wait{color:var(--war-fail);font-weight:600}
.war-inbox-item.leader .war-inbox-text{font-weight:700}
.war-inbox-oldest{font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--war-fail-border);color:var(--war-fail);font-weight:600;flex:0 0 auto}
.war-inbox-empty{padding:6px 10px;font-size:12px;color:var(--war-text-3)}
/* 收件箱四类 chip：答澄清=等你（琥珀，与 talking 同族）/ 批计划=等你决（琥珀）/
 * 翻任务回报=中性（事实已定）/ 决重试=红（败后动作）。 */
.war-chip.k-clarify{color:var(--war-wait);border-color:var(--war-wait-border)}
.war-chip.k-plan{color:var(--war-wait);border-color:var(--war-wait-border)}
.war-chip.k-review{color:var(--war-text-1);border-color:var(--war-border-hover)}
.war-chip.k-retry{color:var(--war-fail);border-color:var(--war-fail-border)}

/* --- V7-② 到访摘要横幅（自上次看过以来） --------------------------------------- */
.war-visit{flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 14px 0;padding:6px 10px;border:1px dashed var(--war-border);border-radius:var(--war-r-md);background:var(--war-card-bg)}
.war-visit-since{font-size:12px;color:var(--war-text-2);white-space:nowrap}
.war-visit-seg{cursor:pointer;font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--war-border);color:var(--war-text-2);white-space:nowrap}
.war-visit-seg:hover{border-color:var(--war-run-border);color:var(--war-text-1)}
.war-visit-seg.s-closed{color:var(--war-done);border-color:var(--war-done-border)}
.war-visit-seg.s-failed{color:var(--war-fail);border-color:var(--war-fail-border)}
.war-visit-seg.s-pending{color:var(--war-wait);border-color:var(--war-wait-border);font-weight:600}

/* --- V7-③ 族系追踪（悬停高亮 + 聚焦压暗 + 聚焦条） ------------------------------ */
.war-card.war-rel-dim{opacity:.32}
.war-card.war-rel-dim:focus-visible,.war-card.war-rel-dim:focus-within{opacity:1}
.war-card.war-rel-same{border-color:var(--war-run-border);box-shadow:0 0 0 2px var(--war-run-border)}
.war-focus-btn{padding:0 8px;line-height:22px;font-size:17px;flex:0 0 auto} /* V10.1 舰长定：聚焦图标加大一档 */

/* --- V7-④ 夜间预检 + 起草器档位/最近命令 ---------------------------------------- */
.war-card-note{display:flex;align-items:center;min-width:0;min-height:18px;font-size:12px;line-height:18px;color:var(--war-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap} /* R4 通知行：预检提示/取消原因；空也留位（恒高） */
.war-card-note.war-preflight{padding:0;border:none;border-radius:0;background:transparent}
.war-card-note.is-fail{color:var(--war-fail)}
.war-preflight-text{flex:1 1 auto;min-width:0;font-size:12px;color:var(--war-wait);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-preflight-btn{padding:2px 8px;font-size:12px;line-height:18px;flex:0 0 auto}

/* --- V7-⑥ 空板首用引导 -------------------------------------------------------- */
.war-onboard{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 20px;text-align:center}
.war-onboard-title{font-size:16px;font-weight:700;color:var(--war-text-1)}
.war-onboard-lead{max-width:540px;font-size:13px;line-height:1.7;color:var(--war-text-2)}
.war-onboard-steps{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--war-text-2);text-align:left}
.war-onboard-cta{font-size:14px;padding:8px 18px}

/* --- V7-⑤「为什么还没动」等待解释行 -------------------------------------------- */
.war-waithint{font-size:12px;color:var(--war-text-2);background:var(--war-well-bg);border-radius:var(--war-r-sm);padding:4px 8px}

/* 任务链行（命令详情浮层）：一环一行，点行跳任务卡 */
.war-chain-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--war-border);border-radius:var(--war-r-sm);background:var(--war-zone-bg);cursor:pointer;transition:border-color .12s ease}
.war-chain-row:hover{border-color:var(--war-run-border)}
.war-chain-row .war-title{flex:1 1 auto}
.war-chain-meta{font-size:12px;color:var(--war-text-3);white-space:nowrap}
.war-loot-summary{font-size:12px;color:var(--war-done);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-waiting{font-size:12px;color:var(--war-text-2)}

/* misc card furniture */
.war-lock{font-size:12px;color:var(--war-text-2);display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.war-loot{display:flex;flex-wrap:wrap;gap:6px}
.war-loot-item{font-size:12px;padding:4px 8px;border-radius:var(--war-r-sm);background:var(--war-well-bg);border:1px dashed var(--war-border);color:var(--war-text-2)}
.war-loot-item.tests{color:var(--war-done);border-color:var(--war-done-border)}
.war-evi{font-size:12px;display:flex;flex-direction:column;gap:2px;padding:4px 8px;border-radius:var(--war-r-sm);background:var(--war-well-bg)}
.war-evi .ok{color:var(--war-done)}
.war-evi .bad{color:var(--war-fail)}
.war-cron{font-size:12px;color:var(--war-run)}
.war-fail{font-size:12px;color:var(--war-fail);background:var(--war-well-bg);border-radius:var(--war-r-sm);padding:6px 10px}
.war-mark{font-size:14px;font-weight:700;line-height:1}
/* V9.13 语义对齐：!! 前缀=强制 L0 直发（绿族，与 gr-L0 同）；?? 前缀=强制 L2
 * 澄清（琥珀族，与 gr-L2 同）——前缀标记与档位 chip 同一概念同一色。 */
.war-mark.bang{color:var(--war-done)}
.war-mark.query{color:var(--war-wait)}

/* --- modals ------------------------------------------------------------------ */
.war-modal-backdrop{position:fixed;inset:0;z-index:9000;background:var(--war-backdrop);display:flex;align-items:center;justify-content:center;padding:32px}
.war-modal{background:var(--war-pop-bg);border:1px solid var(--war-border);border-radius:var(--war-r-lg);max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;padding:16px 18px;box-shadow:var(--war-shadow-3)}
.war-modal-title{font-size:15px;font-weight:600}
.war-modal-sub{font-size:12px;color:var(--war-text-2);margin:4px 0 10px}
.war-detail-body{overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 2px 8px}
.war-detail-section{font-size:12px;font-weight:600;color:var(--war-text-2);letter-spacing:.04em;margin-top:4px}
.war-detail-text{font-size:13px;white-space:pre-wrap;color:var(--war-text-1)}
.war-modal-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid var(--war-border-soft)}
.war-modal.wide{max-width:720px}
.war-composer{width:100%;min-height:88px;resize:vertical;font-family:var(--war-font);font-size:13px;color:var(--war-text-1);background:var(--war-well-bg);border:1px solid var(--war-border);border-radius:var(--war-r-md);padding:10px 12px;outline:none}
.war-composer:focus{border-color:var(--war-run-border)}

/* --- external thread cards + dock home pill (v3) ---------------------------- */
.war-col-actions{margin-left:auto;display:inline-flex;gap:6px}
.war-external-card{border-style:dashed}
.war-chip.ext-badge{color:var(--war-wait);border-color:var(--war-wait-border);font-weight:600}
.war-btn.war-detach{padding:1px 8px;font-size:12px;line-height:16px}
/* V9 命令详情·相关会话入口：一行一会话（讨论/执行），点开进宿主会话窗口。 */
.war-cd-sessions{display:flex;flex-direction:column;gap:6px}
.war-cd-session{display:flex;align-items:center;gap:8px;border:1px solid var(--war-border);border-radius:var(--war-r-sm);background:var(--war-well-bg);padding:4px 10px;cursor:pointer;font-family:var(--war-font);text-align:left}
.war-cd-session:hover{border-color:var(--war-run-border)}
.war-dock-home{cursor:pointer;border:1px solid var(--war-border);border-radius:var(--war-r-md);background:var(--war-card-bg);padding:2px 8px;font-family:var(--war-font)}
.war-dock-home:hover{border-color:var(--war-run-border)}
.war-dock-unread{font-size:12px;color:var(--war-run);font-weight:600}

/* --- buttons ------------------------------------------------------------------ */
.war-btn{cursor:pointer;border-radius:var(--war-r-sm);border:1px solid var(--war-border);background:var(--war-well-bg);color:var(--war-text-1);font-size:12px;padding:4px 10px;font-family:var(--war-font)}
.war-btn.war-focus-btn{font-size:17px;line-height:22px;padding:0 8px} /* ◎ 加大（基类在后压同名，升特异性两连；纵向 0 衬垫保 R5 行高 24） */
/* 实心主按钮：动作底色双主题各自压黑定档，白字 ≥4.5:1（token 联动宿主主色）。 */
.war-btn.primary{background:var(--war-action-bg);color:var(--war-action-fg);border-color:transparent}
.war-btn:disabled{opacity:.5;cursor:default}

/* --- V7.1 审查整改：键盘焦点轮廓 / 决策失败反馈 / 图例浮层 ---------------------- */
.war-root :focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
/* V8 决策失败 toast：绝对定位浮层（不推挤列区），岛下方右上。 */
.war-actionerr{position:absolute;bottom:136px;right:24px;z-index:70;display:flex;align-items:center;gap:8px;max-width:480px;margin:0;padding:6px 10px;border-radius:var(--war-r-sm);border:1px solid var(--war-fail-border);background:var(--war-pop-bg);color:var(--war-fail);font-size:12px;box-shadow:var(--war-shadow-2)}
.war-legend-btn{padding:2px 10px;line-height:18px;font-size:12px;flex:0 0 auto}
.war-legend-rows{display:grid;grid-template-columns:max-content 1fr;gap:8px 14px;align-items:baseline}
.war-legend-sym{font-size:12px;font-weight:700;color:var(--war-run-strong);white-space:nowrap}
.war-legend-text{font-size:12px;color:var(--war-text-2)}

/* --- shell entry (sidebar row + center-column takeover) ------------------------ */
/* war-sidebar-* 挂在宿主侧栏（.war-root 之外）——宿主铬层，刻意保留
 * --dsw-alias 直引：--war-* 令牌在 war-root 上定义，这里解析不到。 */
.war-sidebar-row{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-family:var(--dsw-font-family);cursor:pointer;border-radius:8px;text-align:left}
.war-sidebar-row:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.war-sidebar-row[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.war-sidebar-icon{display:inline-flex;align-items:center;flex:0 0 auto;color:currentColor}
.war-sidebar-label{white-space:nowrap}
/* V16 宿主侧栏收起（rail 态，祖先类 *_collapsed 后缀稳定）：藏文字只留图标，
 * 35px 轨道内图标居中（padding 收零，与宿主原生 rail 行对齐）。 */
[class*="_collapsed"] .war-sidebar-row{justify-content:center;padding:7px 0;gap:0}
[class*="_collapsed"] .war-sidebar-label{display:none}
.war-shell-view{display:none}
html[data-dsh-warroom-active] .war-shell-view{display:flex;flex-direction:column;height:100%}
html[data-dsh-warroom-active] [data-pane='conversation'] > :not([data-dsh-warroom-view]),
html[data-dsh-warroom-active] [class*='centerCol'] > :not([data-dsh-warroom-view]){display:none !important}
/* --- V9.2 岛改版（聚焦 chip + 齿轮）---------------------------------------- */
.war-island-focus{flex:0 1 auto;min-width:0;font-size:12px;font-weight:600;color:var(--war-run-strong);border:1px solid var(--war-run-border);background:var(--war-run-tint);border-radius:var(--war-r-pill);padding:2px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--war-font)}
.war-island-focus:hover{background:color-mix(in srgb, var(--war-run-border) 18%, transparent)}
.war-island-gear{font-size:14px;line-height:20px;padding:2px 9px}

/* --- V9.2 调度坞左端钉驻簇（[＋下达][铭牌]）--------------------------------- */
.war-dispatch-add{flex:0 0 auto;width:52px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:600;line-height:1;color:var(--war-run-strong);background:var(--war-run-tint);border:1px dashed color-mix(in srgb, var(--war-run-border) 45%, transparent);border-radius:var(--war-r-md);cursor:pointer;padding:0;font-family:var(--war-font);transition:background .12s ease,border-color .12s ease}
/* V17.8 舰长令：管线不再虚显常驻——默认全隐，仅 hover/聚焦族的管可见
 * （100%+流动）。opacity 隐（非 display）——几何仍可测，取证不破。 */
.war-pipe-svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4} /* SVG 默认 300×150——必须显式撑满；z=4 压过调度坞(3)——坞顶横沟管段走在坞容器 padding 带里，同层会被后画的坞盖住 */
.war-pipe-svg path{fill:none;stroke:var(--chain-hue,#888);stroke-width:2;stroke-linejoin:round;opacity:0;transition:opacity .25s}
.war-pipe-svg path.war-pipe-prog{stroke-dasharray:7 7}
.war-pipe-svg.has-active g.on path{opacity:1}
.war-pipe-svg g.on path.war-pipe-prog{stroke-width:2.5;animation:war-pipe-flow 1.1s linear infinite}
/* V17.1 map 总线走板内边（元首红线示意）：实线管身（虚线只留给流动 prog——直线弦语言已由 HQ/星球弦承担） */
@keyframes war-pipe-flow{to{stroke-dashoffset:-28}}
@media (prefers-reduced-motion:reduce){.war-pipe-svg g.on path.war-pipe-prog{animation:none}}
/* V17.6 图标页签组（舰长令：紧凑图标 button group **竖排**在＋旁，组框随
 * stretch 与＋钮齐高；全名走 title 悬停提示；选中=tint 底+高亮字+左缘亮条）。 */
.war-cmdtabs{flex:0 0 auto;display:flex;flex-direction:column;align-self:stretch;border:1px solid var(--war-border);border-radius:var(--war-r-sm);overflow:hidden}
.war-cmdtab{flex:1 1 0;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 8px;border:none;background:transparent;color:var(--war-text-2);font-family:var(--war-font);font-size:12px;font-weight:600;white-space:nowrap}
.war-cmdtab + .war-cmdtab{border-top:1px solid var(--war-border)}
.war-cmdtab:hover{color:var(--war-text-1);background:color-mix(in srgb, var(--war-text-1) 7%, transparent)}
.war-cmdtab.on{color:var(--war-select-name);background:var(--war-select-tint);box-shadow:inset 2px 0 0 var(--war-run-border)}
.war-cmdtab-ico{font-size:11px;line-height:1}
/* V18 HQ 工作区注册弹窗。 */
.war-hq-picker{display:flex;flex-direction:column;gap:8px;min-width:380px;max-width:520px;max-height:60vh;overflow-y:auto}
.war-hq-picker-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.war-hq-picker-title{font-size:14px;font-weight:600;color:var(--war-text-1)}
.war-hq-picker-x{cursor:pointer;background:transparent;border:none;color:var(--war-text-2);font-size:14px;padding:2px 6px}
.war-hq-picker-x:hover{color:var(--war-text-1)}
.war-hq-picker-hint{margin:0;font-size:12px;color:var(--war-text-2)}
.war-hq-picker-err{margin:0;font-size:12px;color:var(--war-fail)}
.war-hq-picker-row{display:flex;align-items:center;gap:10px;padding:7px 9px;border:1px solid var(--war-border);border-radius:var(--war-r-sm)}
.war-hq-picker-name{flex:0 0 auto;font-size:13px;font-weight:600;color:var(--war-text-1);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-hq-picker-path{flex:1 1 auto;min-width:0;font-size:12px;color:var(--war-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.war-hq-picker-done{flex:0 0 auto;font-size:12px;color:var(--war-done)}
/* V17 归档行/确认条（聚焦页决策带下方）。 */
.war-archive-row{display:flex;align-items:center;gap:8px;margin-top:6px}
.war-archive-btn:disabled{cursor:not-allowed;opacity:.5}
.war-archive-when{font-size:12px;color:var(--war-text-2)}
.war-archive-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;padding:8px 10px;border-radius:var(--war-r-sm);border:1px solid var(--war-wait-border);background:var(--war-wait-tint)}
/* V18 critique：不可逆确认键走红语义（红=终局既成语言，不再 primary 蓝）。 */
.war-btn-danger{border-color:var(--war-fail-border);color:var(--war-fail);background:var(--war-fail-tint)}
.war-btn-danger:hover{border-color:var(--war-fail);color:var(--war-fail)}
/* V18 critique：归档终局闸理由从 title 提升为可见副行。 */
.war-archive-gate{font-size:12px;color:var(--war-text-2);flex-basis:100%}
/* V18 critique：归档空页签调度条安神行。 */
.war-dispatch-empty{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:60px;font-size:12px;color:var(--war-text-2)}
.war-archive-warn{font-size:12px;color:var(--war-wait);flex:1 1 auto;min-width:200px}
.war-dispatch-add:hover{background:color-mix(in srgb, var(--war-run-border) 14%, transparent);border-style:solid;border-color:color-mix(in srgb, var(--war-run-border) 65%, transparent)}
.war-dispatch-add:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}

/* --- V9.2 定时命令角标 ------------------------------------------------------ */
.war-chip.sched{color:var(--war-run-strong);border-color:var(--war-run-border);border-style:dashed;background:var(--war-run-tint);font-weight:600}

/* --- V9.2 起草器重设计（说明 + 档位/时机选项卡 + cron）---------------------- */
.war-composer-modal{max-width:640px;max-height:80vh;overflow-y:auto}
.war-composer-modal .war-modal-actions,.war-composer-modal .war-cp-kbd{position:sticky;bottom:0;background:var(--war-pop-bg)} /* V16.4-R7：滚动时提交行/快捷键行不裁 */ /* V16.4-R5 critique P2：cron/星球二级全展开会越 80vh——节体可滚，不再裁按钮行 */
.war-cp-section{font-size:12px;font-weight:600;color:var(--war-text-2);letter-spacing:.02em;margin:16px 0 6px}
.war-grade-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.war-grade-cards.war-sched-cards{grid-template-columns:repeat(2,1fr)}
.war-grade-card,.war-sched-card{display:flex;flex-direction:column;gap:4px;align-items:flex-start;text-align:left;padding:8px 10px;border-radius:var(--war-r-md);border:1px solid var(--war-border);background:var(--war-card-bg);cursor:pointer;font-family:var(--war-font);transition:border-color .12s ease,background .12s ease}
.war-grade-card:hover,.war-sched-card:hover{border-color:var(--war-border-hover)}
.war-grade-card.on,.war-sched-card.on{border-color:var(--war-run-border);background:var(--war-select-tint);box-shadow:inset 0 0 0 1px var(--war-run-border)}
.war-grade-card-name{font-size:13px;font-weight:600;color:var(--war-text-1)}
.war-grade-card.on .war-grade-card-name{color:var(--war-select-name)}
.war-grade-card.on .war-grade-card-name::before,.war-sched-card.on .war-grade-card-name::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:6px;vertical-align:1px}
.war-grade-card-hint{font-size:12px;line-height:1.5;color:var(--war-text-2)}
/* V18.8 闹钟式定时（替代 cron presets）：模式 chips + 原生 date/time + 周几组。 */
.war-alarm-block{display:flex;flex-direction:column;gap:8px;margin-top:8px;background:var(--war-well-bg);border:1px solid var(--war-border-soft);border-radius:var(--war-r-md);padding:10px 12px 12px}
.war-alarm-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.war-alarm-time,.war-alarm-date{font-family:var(--war-font);font-size:13px;color:var(--war-text-1);background:var(--war-card-bg);border:1px solid var(--war-border);border-radius:var(--war-r-md);padding:4px 10px;outline:none}
.war-alarm-time:focus,.war-alarm-date:focus{border-color:var(--war-run-border)}
body[data-ds-dark-theme] .war-root .war-alarm-time,body[data-ds-dark-theme] .war-root .war-alarm-date{color-scheme:dark}
.war-dow-row{display:flex;gap:4px;flex-wrap:wrap}
.war-cron-adv{margin-top:2px;font-size:12px}
.war-cron-adv input{width:100%}
.war-cron-adv summary{cursor:pointer;color:var(--war-text-2);line-height:20px;width:fit-content}
.war-cron-adv summary:hover{color:var(--war-text-1)}
.war-cron-adv input{margin-top:6px}
.war-cron-input{width:100%;font-family:var(--war-font-code);font-size:13px;color:var(--war-text-1);background:var(--war-well-bg);border:1px solid var(--war-border);border-radius:var(--war-r-md);padding:8px 12px;outline:none}
.war-cron-input:focus{border-color:var(--war-run-border)}
.war-cron-next{font-size:12px;color:var(--war-text-2)}

/* --- V9.2 设置抽屉（右侧滑入，不遮岛不推列）--------------------------------- */
.war-settings-backdrop{position:fixed;inset:0;z-index:80;background:var(--war-backdrop)}
.war-settings-drawer{position:absolute;top:0;right:0;bottom:0;width:min(360px,92vw);display:flex;flex-direction:column;background:var(--war-pop-bg);border-left:1px solid var(--war-border);box-shadow:var(--war-shadow-3);animation:war-drawer-in .18s ease}
@media (prefers-reduced-motion: reduce){.war-settings-drawer{animation:none}}
@keyframes war-drawer-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.war-settings-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--war-border-soft)}
.war-settings-title{font-size:15px;font-weight:600}
.war-settings-body{flex:1 1 auto;overflow-y:auto;padding:4px 16px 20px}
.war-settings-section{font-size:13px;font-weight:600;color:var(--war-text-2);margin:16px 0 8px}
.war-skin-row{display:flex;gap:8px}
.war-skin-opt{flex:1 1 auto;font-size:13px;font-weight:600;padding:8px 0;border-radius:var(--war-r-md);border:1px solid var(--war-border);background:var(--war-card-bg);color:var(--war-text-1);cursor:pointer;font-family:var(--war-font)}
.war-skin-opt:hover{border-color:var(--war-border-hover)}
.war-skin-opt.on{border-color:var(--war-run-border);background:var(--war-select-tint);color:var(--war-select-name);box-shadow:inset 0 0 0 1px var(--war-run-border)}
.war-settings-note{font-size:12px;line-height:1.5;color:var(--war-text-2);margin-top:8px}
.war-set-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--war-border-soft)}
.war-set-toggle-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.war-set-toggle-label{font-size:13px;font-weight:600;color:var(--war-text-1)}
.war-set-toggle-hint{font-size:12px;line-height:1.5;color:var(--war-text-2)}
.war-switch{flex:0 0 auto;width:36px;height:20px;border-radius:10px;border:1px solid var(--war-border);background:var(--war-well-bg);position:relative;cursor:pointer;padding:0;transition:background .15s ease,border-color .15s ease}
.war-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:8px;background:var(--war-text-2);transition:transform .15s ease,background .15s ease}
.war-switch.on{background:var(--war-run-border);border-color:var(--war-run-border)}
.war-switch.on .war-switch-knob{transform:translateX(16px);background:var(--war-action-fg)}
.war-switch:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
.war-set-conn{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--war-text-2)}
.war-set-conn-dot{width:8px;height:8px;border-radius:5px;background:var(--war-done-border);flex:0 0 auto}
.war-set-conn-dot.down{background:var(--war-fail-border)}
.war-set-conn-text{flex:1 1 auto;min-width:0}
/* --- V9.3：非零收件箱 = 岛的主导信号（胶囊染警示，清空回常态）--------------- */
.war-island-pill.has-inbox{border-color:color-mix(in srgb, var(--war-wait-border) 60%, var(--war-border));box-shadow:0 2px 10px color-mix(in srgb, var(--war-wait-border) 18%, transparent)}
.war-island-pill.has-inbox .war-head-dot{background:var(--war-wait-border);opacity:1}

/* --- V9.3：批准计划视觉隔离（一键保留，后果先讲清——决策区独立成块）--------- */
.war-modal:focus-visible{outline:none}
/* --- V9.5：进入对话 chip（视觉独立于卡身——对话入口不再借整卡点击）+ kbd 提示 --- */
.war-btn.war-enter-btn{cursor:pointer;color:var(--war-run-strong);border-color:color-mix(in srgb, var(--war-run-border) 45%, transparent);background:transparent;flex:0 0 auto}
.war-btn.war-enter-btn:hover{background:var(--war-run-tint)}
.war-btn.war-enter-btn:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
.war-cp-kbd{margin-top:8px;font-size:12px;color:var(--war-text-2)}
/* --- V9.6：列标题 h2 语义化复位 + 语义色 label 回退 primary（宿主未定义时不塌黑） --- */
h2.war-col-title{margin:0;font-size:13px}

/* == WAR_CSS 追加锚点：新 CSS 插在本行之后 == */
/* --- V10 战线链色与身份 -------------------------------------------------------
 * 链是隐形语义的可见显影：8 个低饱和槽位、双主题各自成章（浅=压黑保白底对比，
 * 深=原值微亮）；strength/mixto 两枚主题变量让组件规则免写裸色值。槽位本体是
 * 故意调开的八相（与状态四档蓝琥珀绿红错位），像 quality 调色板一样是语义层
 * 之外的第二条刻意色谱（L1 基元，皮肤可整组换谱）。 */
.war-root{--war-chain-strength:62%;--war-chain-mixto:#000}
body[data-ds-dark-theme] .war-root{--war-chain-strength:85%;--war-chain-mixto:#fff}
.war-chain-hue-0{--chain-hue:#6f5bd6}
.war-chain-hue-1{--chain-hue:#0e7f76}
.war-chain-hue-2{--chain-hue:#4c8f3f}
.war-chain-hue-3{--chain-hue:#9a6b1f}
.war-chain-hue-4{--chain-hue:#b04a3c}
.war-chain-hue-5{--chain-hue:#a83d84}
.war-chain-hue-6{--chain-hue:#3465b8}
.war-chain-hue-7{--chain-hue:#5d6b7a}
body[data-ds-dark-theme] .war-root .war-chain-hue-0{--chain-hue:#ab9df2}
body[data-ds-dark-theme] .war-root .war-chain-hue-1{--chain-hue:#63d8cd}
body[data-ds-dark-theme] .war-root .war-chain-hue-2{--chain-hue:#93d47f}
body[data-ds-dark-theme] .war-root .war-chain-hue-3{--chain-hue:#e3b566}
body[data-ds-dark-theme] .war-root .war-chain-hue-4{--chain-hue:#ef9083}
body[data-ds-dark-theme] .war-root .war-chain-hue-5{--chain-hue:#eb97d5}
body[data-ds-dark-theme] .war-root .war-chain-hue-6{--chain-hue:#8fb2f2}
body[data-ds-dark-theme] .war-root .war-chain-hue-7{--chain-hue:#adc0d1}
/* 世代徽标（Ⅱ 起）：命令卡顶部一行的小徽章，12px 底线以内 */
.war-gen-badge{display:inline-flex;align-items:center;padding:0 6px;border-radius:var(--war-r-pill);font-size:12px;line-height:16px;font-weight:700;color:color-mix(in srgb,var(--chain-hue,#888) var(--war-chain-strength),var(--war-chain-mixto));border:1px solid color-mix(in srgb,var(--chain-hue,#888) 45%,transparent);background:color-mix(in srgb,var(--chain-hue,#888) 12%,transparent)}
/* 聚焦页战线族谱：Ⅰ→…→本代，逐级可跳；当前代加粗高亮不可再点自己 */
.war-cd-chain{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.war-cd-chain-item{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid color-mix(in srgb,var(--chain-hue,#888) 35%,transparent);background:color-mix(in srgb,var(--chain-hue,#888) 8%,transparent);color:var(--war-text-2);font-size:12px;line-height:18px;padding:1px 8px;border-radius:var(--war-r-pill);cursor:pointer;text-align:left;font-family:var(--war-font)}
.war-cd-chain-item.now{font-weight:700;color:color-mix(in srgb,var(--chain-hue,#888) var(--war-chain-strength),var(--war-chain-mixto));border-color:color-mix(in srgb,var(--chain-hue,#888) 60%,transparent);cursor:default}
.war-cd-chain-item:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
/* V18.8 常用命令模板：贴输入框的一排填充 chips（dashed=可点但不喧宾）。 */
.war-tpl-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
.war-tpl-label{font-size:12px;color:var(--war-text-3);flex:0 0 auto}
.war-tpl{cursor:pointer;font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px dashed var(--war-border);color:var(--war-text-2);background:transparent;white-space:nowrap;font-family:var(--war-font)} /* V16.4-R2 口径：text-3 底线以下不再用 */
.war-tpl:hover{border-color:var(--war-run-border);color:var(--war-text-1)}
.war-front-sub{font-size:12px;line-height:20px;color:var(--war-text-3);margin-top:6px}
/* 起草器续接排：独立类（勿混用 war-tpl——一类一用，V18.1 针脚事故口径） */
.war-continue-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.war-continue-chip{cursor:pointer;font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px dashed var(--war-border);color:var(--war-text-2);background:transparent;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font-family:var(--war-font)}
.war-continue-chip.on{border-style:solid;border-color:var(--war-focus);color:var(--war-text-1);font-weight:600;background:var(--war-run-tint)}
/* --- V10-R3a 星域星球（同心椭圆恒星系）--------------------------------------
 * 全 DOM/CSS；浅色=米白海图纸风（细网格+淡染），深色=夜航星图（点状星幕）。
 * 容器与轨道全用 --war-* 令牌系衍生色。 */
.war-starfield{position:relative;flex:1;min-height:420px;border-radius:14px;overflow:hidden;border:1px solid var(--war-border-soft);
  background:var(--war-chart-bg);
  background-size:auto,auto,56px 56px,56px 56px,auto}
/* 夜间星幕：box-shadow 级联太贵，固定 radial 点阵两层足够氛围（深色专属美术资产） */
body[data-ds-dark-theme] .war-root .war-stars{position:absolute;inset:0;
  background-image:
    radial-gradient(1.2px 1.2px at 18% 26%, rgba(255,255,255,.75), transparent 100%),
    radial-gradient(1px 1px at 64% 14%, rgba(255,255,255,.5), transparent 100%),
    radial-gradient(1.4px 1.4px at 82% 58%, rgba(255,255,255,.65), transparent 100%),
    radial-gradient(1px 1px at 34% 78%, rgba(255,255,255,.45), transparent 100%),
    radial-gradient(1.2px 1.2px at 50% 44%, rgba(255,255,255,.35), transparent 100%),
    radial-gradient(1px 1px at 90% 30%, rgba(255,255,255,.5), transparent 100%),
    radial-gradient(1px 1px at 8% 60%, rgba(255,255,255,.4), transparent 100%),
    radial-gradient(1.3px 1.3px at 42% 8%, rgba(255,255,255,.6), transparent 100%);
  pointer-events:none}
.war-orbit{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);border:1px dashed color-mix(in srgb, var(--war-border) 70%, transparent);border-radius:50%;pointer-events:none}
.war-hq{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-size:20px;line-height:1;color:var(--war-text-3);filter:saturate(.2);pointer-events:none;font-family:var(--war-font)}
.war-hq.lit{color:var(--war-sun);filter:none;text-shadow:var(--war-sun-glow)}
.war-planet{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;background:transparent;border:none;padding:0;cursor:pointer;font-family:var(--war-font)}
.war-planet:focus-visible{outline:2px solid var(--war-focus);outline-offset:4px;border-radius:var(--war-r-md)}
.war-planet-ball{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 32% 30%, color-mix(in srgb,#fff 28%,transparent), transparent 46%), var(--war-well-bg);border:1px solid var(--war-border)}
.war-planet.busy .war-planet-ball{width:20px;height:20px;border-color:color-mix(in srgb, var(--war-run-border) 55%, transparent);box-shadow:0 0 10px color-mix(in srgb, var(--war-run-border) 30%, transparent)}
.war-planet-label{font-size:12px;color:var(--war-text-2);max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-orb{position:absolute;transform:translate(-50%,-50%);background:transparent;border:none;padding:10px;cursor:default;font-family:var(--war-font)}
.war-orb-body{display:block;width:11px;height:11px;border-radius:50%;background:var(--war-run-strong);box-shadow:0 0 0 3px var(--war-run-tint), 0 0 12px color-mix(in srgb, var(--war-run-border) 45%, transparent);animation:war-orb-pulse 2.2s ease-in-out infinite}
.war-orb.wait .war-orb-body{background:var(--war-wait);box-shadow:0 0 0 3px var(--war-wait-tint)}
@keyframes war-orb-pulse{50%{box-shadow:0 0 0 6px var(--war-run-tint), 0 0 18px color-mix(in srgb, var(--war-run-border) 55%, transparent)}}
.war-orb.clickable{cursor:pointer}
.war-orb:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px;border-radius:var(--war-r-sm)}
.war-orb-verb{position:absolute;top:-4px;left:50%;transform:translate(-50%,-100%);font-size:12px;color:var(--war-text-1);white-space:nowrap;background:color-mix(in srgb, var(--war-card-bg) 88%, transparent);padding:1px 6px;border-radius:6px;border:1px solid var(--war-border-soft);pointer-events:none}
.war-planet-stats{font-size:12px;line-height:14px;color:var(--war-text-3);letter-spacing:.02em}
.war-planet-stats.wait{color:var(--war-wait)}
.war-planet-stats.fail{color:var(--war-fail)}
.war-legend-dot{display:inline-block;width:10px;height:10px;border-radius:50%}
.war-legend-dot.dot-run{background:var(--war-run-strong)}
.war-legend-dot.dot-wait{background:var(--war-wait)}
.war-legend-dot.dot-done{background:var(--war-done)}
.war-legend-dot.dot-fail{background:var(--war-fail)}
.war-detach,.war-cd-session{min-height:24px}
/* V10.1 今战速报条：星域态的活体主表面（AFK 回访第一问「现在呢」） */
/* --- V11 P2 3D 星域（舰长定案）：canvas 画空间，DOM 覆盖层承载交互实体 --- */
.war-starfield3d{cursor:grab;touch-action:none;user-select:none;background:var(--war-sky-bg)} /* V12 浅色=天穹（暖阳光斑+浅蓝天幕）；画布 alpha:true 透出；深色太空芯走令牌深色档 */
.war-starfield3d:active{cursor:grabbing}
/* --- V11.4 warzone demo 全要素进驻（3D 现实视图 + 2D 指挥室） --- */
.war-wz-3d{position:absolute;inset:0;width:100%;height:100%;display:block}
.war-wz-tac{position:absolute;inset:0;width:100%;height:100%;display:none} /* 盘面颜色由 draw 经 war-tokens 读 --war-tac-* 双调色板（深色雷达/浅色蓝图） */
.war-wz.war-wz-cmd .war-wz-tac{display:block}
.war-wz.war-wz-cmd .war-wz-vig,.war-wz.war-wz-cmd .war-wz-foot{display:none}
.war-wz-vig{position:absolute;inset:0;pointer-events:none;z-index:5;background:var(--war-sky-vig)}
/* V11.5f 执行卡覆盖层：SVG 连线（星球→卡）+ 活体卡 + 高亮名签（frame 循环摆位）。
 * V11.5g（舰长令）：卡索引线=实线琥珀——与 HQ↔星球高亮轨迹（虚线青）双通道区分。
 * V12.2（舰长令·语义 token 化）：覆盖层全走 --war-wz-* 场景令牌——浅色=纸面
 * 证件风（浅底深字）为缺省，深空玻璃风=令牌深色档（V9.13 双主题纪律）。 */
.war-wz-lines{position:absolute;inset:0;width:100%;height:100%;z-index:6;pointer-events:none;overflow:visible}
.war-wz-xline{stroke:var(--war-wz-line);stroke-width:1.3}
.war-wz-cards{position:absolute;inset:0;z-index:8;pointer-events:none}
.war-wz-xcard{position:absolute;left:0;top:0;pointer-events:auto;display:flex;align-items:center;gap:6px;padding:4px 11px 4px 8px;border-radius:var(--war-r-pill);background:var(--war-wz-card-bg);border:1px solid var(--war-wz-card-border);color:var(--war-wz-card-text);font:12px/1.4 var(--war-font);white-space:nowrap;cursor:grab;backdrop-filter:blur(6px);box-shadow:var(--war-wz-card-shadow);transition:border-color .15s,box-shadow .15s;touch-action:none}
.war-wz-xcard:active{cursor:grabbing}
.war-wz-xcard:hover,.war-wz-xcard:focus-visible{border-color:var(--war-wz-card-hover-border);box-shadow:var(--war-wz-card-hover-shadow);color:var(--war-wz-card-hover-text);outline:none}
.war-wz-xdot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--war-wz-dot);box-shadow:0 0 5px var(--war-wz-dot-glow);animation:war-wz-breathe 1.6s ease-in-out infinite}
.war-wz-xverb{font-weight:600}
.war-wz-xsrc{color:var(--war-wz-card-dim)}
@keyframes war-wz-breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.82)}}
.war-wz-toggle{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:15;display:flex;border:1px solid var(--war-wz-toggle-border);border-radius:var(--war-r-sm);overflow:hidden;backdrop-filter:blur(6px);background:var(--war-wz-toggle-bg)} /* 顶中——右上角是任务回报浮舱列头的地盘（.war-ops z=2 层叠上下文），落那儿点不到 */
.war-wz-toggle button{appearance:none;border:0;padding:8px 16px;cursor:pointer;transition:.18s;font:12px var(--war-font);letter-spacing:.1em;color:var(--war-wz-toggle-text);background:transparent}
.war-wz-toggle button.on{background:var(--war-wz-toggle-on-bg);color:var(--war-wz-toggle-on-text);font-weight:700}
.war-wz-toggle button:hover{color:var(--war-wz-toggle-hover-text)}
.war-wz-foot{position:absolute;left:50%;bottom:calc(var(--war-dock-h, 230px) + 10px);transform:translateX(-50%);z-index:6;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;user-select:none}
.war-wz-foot-stat{font-size:12px;color:var(--war-text-2);letter-spacing:.04em}
/* V16.4-R2 critique P2：键盘镜像星球钮——平时视觉隐藏，focus-visible 显形为浮钮。 */
.war-wz-kbplanet{position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden}
.war-wz-kbplanet:focus-visible{position:fixed;left:340px;top:64px;z-index:30;width:auto;height:auto;overflow:visible;padding:4px 10px;border-radius:var(--war-r-pill);border:1px solid var(--war-run-border);background:var(--war-pop-bg);color:var(--war-text-1);font-size:12px;font-family:var(--war-font);outline:2px solid var(--war-focus);outline-offset:1px}
.war-wz-legend{display:flex;gap:14px;font:12px/1.5 var(--war-font);color:var(--war-wz-legend-text)}
.war-wz-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:1px}
.war-wz-legend .lg-wait{background:var(--war-wz-wait)}
.war-wz-legend .lg-battle{background:var(--war-wz-battle)}
.war-wz-legend .lg-held{background:var(--war-wz-held)}
.war-wz-legend .lg-hl{background:var(--war-wz-hl)}
.war-wz-hint{font:12px/1.5 var(--war-font);color:var(--war-wz-hint)}
/* V18.3：定宽 360（高度不限，长路径换行不省略）；pointer-events auto——聚焦态
 * 钉住卡内嵌战线行可点击（事件委托 data-wz-front，卡体点击不落回星域）。 */
.war-wz-tip{position:absolute;left:0;top:0;z-index:20;min-width:236px;max-width:360px;display:none;background:var(--war-wz-tip-bg);border:1px solid var(--war-wz-tip-border);border-radius:var(--war-r-md);padding:12px 14px;backdrop-filter:blur(8px);box-shadow:var(--war-wz-tip-shadow);color:var(--war-wz-tip-text);font:12px/1.65 var(--war-font);pointer-events:auto}
.war-wz-tip .tt-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.war-wz-tip .dot{width:9px;height:9px;border-radius:50%;background:var(--war-wz-tip-dot);box-shadow:0 0 5px var(--war-wz-tip-dot-glow);flex:none}
.war-wz-tip .dot.warm{background:var(--war-wz-tip-dot-warm)}
.war-wz-tip .tt-name{font-size:14px;font-weight:700;letter-spacing:.06em;color:var(--war-wz-tip-name);white-space:nowrap}
.war-wz-tip .tt-tag{margin-left:auto;font-size:12px;color:var(--war-wz-tip-tag);border:1px solid var(--war-wz-tip-tag-border);padding:1px 7px;border-radius:99px;white-space:nowrap}
.war-wz-tip .tt-desc{color:var(--war-wz-tip-desc);font-size:12px;margin-bottom:8px;white-space:normal;overflow-wrap:anywhere}  /* V18.3：完整路径换行不省略（舰长令） */
.war-wz-tip .tt-row{display:flex;justify-content:space-between;gap:18px;padding:2.5px 0;border-top:1px dashed var(--war-wz-tip-row-line)}
.war-wz-tip .tt-row span{color:var(--war-wz-tip-label)}
.war-wz-tip .tt-row b{color:var(--war-wz-tip-value);font-weight:600;font-family:var(--war-font-code);white-space:nowrap}
.war-wz-tip .tt-emph{color:var(--war-wz-tip-emph)}
.war-wz-chip{padding:1px 9px;border-radius:99px;font-size:12px;font-weight:700;font-family:var(--war-font)}
.war-wz-chip.st-wait{color:var(--war-wz-chip-wait-text);background:var(--war-wz-chip-wait-bg);border:1px solid var(--war-wz-chip-wait-border)}
.war-wz-chip.st-battle{color:var(--war-wz-chip-battle-text);background:var(--war-wz-chip-battle-bg);border:1px solid var(--war-wz-chip-battle-border)}
.war-wz-chip.st-held{color:var(--war-wz-chip-held-text);background:var(--war-wz-chip-held-bg);border:1px solid var(--war-wz-chip-held-border)}
/* V18.2 星球生命周期态 chip（悬停卡状态位：settled 绿/failed 红/idle 中性） */
.war-wz-chip.st-settled{color:var(--war-wz-chip-settled-text);background:var(--war-wz-chip-settled-bg);border:1px solid var(--war-wz-chip-settled-border)}
.war-wz-chip.st-failed{color:var(--war-wz-chip-failed-text);background:var(--war-wz-chip-failed-bg);border:1px solid var(--war-wz-chip-failed-border)}
.war-wz-chip.st-idle{color:var(--war-wz-chip-idle-text);background:var(--war-wz-chip-idle-bg);border:1px solid var(--war-wz-chip-idle-border)}
/* V11.5：雷达=值班默认态，浮舱/坞是操作面恒在场（原 wz-cmd 全屏让位休眠） */
.war-s3d-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.war-s3d-overlay{position:absolute;inset:0;pointer-events:none}
.war-s3d-overlay .war-planet,.war-s3d-overlay .war-orb{position:absolute;left:0;top:0;pointer-events:auto;will-change:transform}
.war-s3d-overlay .war-orb-ghost{position:absolute;left:0;top:0}
.war-s3d-overlay .war-hq{position:absolute;left:0;top:0;pointer-events:none;font-size:0} /* 太阳本体在 canvas；DOM 只留语义（title/aria） */
/* V11.3：canvas 行星已真实化，DOM 球退位成细环锚点（免得像颗黑月压在星球上） */
.war-s3d-overlay .war-planet-ball{background:transparent;border-color:color-mix(in srgb,var(--war-border) 55%,transparent)}
.war-s3d-overlay .war-planet.busy .war-planet-ball{border-color:color-mix(in srgb,var(--war-run-border) 65%,transparent)}
/* V12.2 critique P2：星域浅色可读性——星球标签升 primary + 双主题光晕
 * （2D 回退态标签贴海图纸/蓝图；深色加黑晕防星光串扰；3D 态 canvas 自绘）。 */
.war-board.war-mapmode .war-planet-label{color:var(--war-text-1);text-shadow:var(--war-label-halo);font-weight:500}
.war-live-stack{position:absolute;left:50%;bottom:230px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:1;pointer-events:none}
.war-live-bar{display:flex;gap:14px;align-items:center;padding:6px 14px;border-radius:var(--war-r-pill);background:color-mix(in srgb, var(--war-card-bg) 82%, transparent);border:1px solid var(--war-border-soft);box-shadow:0 6px 22px color-mix(in srgb,#000 18%,transparent);max-width:72vw;overflow:hidden}
@supports (backdrop-filter: blur(8px)){.war-live-bar{backdrop-filter:blur(8px)}}
.war-live-item{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;color:var(--war-text-2)}
.war-live-verb{font-weight:700;color:var(--war-run-strong)}
.war-live-cmd{max-width:180px;overflow:hidden;text-overflow:ellipsis}
.war-map-legend{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--war-text-2);background:color-mix(in srgb, var(--war-card-bg) 72%, transparent);padding:3px 10px;border-radius:var(--war-r-sm);border:1px solid var(--war-border-soft);pointer-events:none;white-space:nowrap}
.war-map-legend .war-legend-dot{flex:0 0 auto}
/* V10.1 星域指路 toast（一次性） */
.war-map-hint{position:absolute;left:50%;transform:translateX(-50%);top:auto;bottom:calc(var(--war-dock-h, 230px) + 12px);z-index:40;max-width:340px;padding:8px 10px 8px 14px;border-radius:var(--war-r-lg);border:1px solid color-mix(in srgb, var(--war-run-border) 45%, transparent);background:var(--war-card-bg);color:var(--war-text-1);font-size:13px;line-height:1.5;box-shadow:0 10px 30px color-mix(in srgb,#000 22%,transparent);font-family:var(--war-font);display:flex;align-items:center;gap:6px} /* V16.4-R2：抬到调度条上方（dock 实测高变量）+ 内部主/忽略两钮 */
/* V18 critique：管线指路 toast——同沟带右缘（与 map-hint 错位共存）。 */
.war-pipe-hint{left:auto;right:12px;transform:none;max-width:300px}
.war-map-hint-main{cursor:pointer;background:none;border:none;font:inherit;color:inherit;text-align:left;padding:0}
.war-map-hint-main:hover{color:var(--war-run-strong)}
.war-map-hint-x{flex:none;cursor:pointer;font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--war-border);color:var(--war-text-2);background:transparent}
.war-map-hint-x:hover{color:var(--war-text-1);border-color:var(--war-run-border)}
.war-map-hint:hover{background:var(--war-run-tint)}
.war-map-hint:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
.war-settings-body{padding-bottom:32px}
@media (max-width:899px){
  /* V12.2 critique P1：窄窗（含 200% 缩放）列表态单列堆叠——星域态 <900px
   * 自动回列表的先例延伸到列表自身；每区 44vh 内滚，不再三列挤省略号。 */
  .war-ops{display:flex;flex-direction:column;gap:10px}
  .war-ops .war-zone{flex:0 0 auto}
  .war-ops .war-col-body{max-height:44vh}
  .war-ops .war-zone.war-tasks{grid-column:auto;max-height:none}
}
@media (prefers-reduced-motion: reduce){
  .war-orb-body{animation:none}
  .war-wz-xdot{animation:none;box-shadow:none}
  .war-planet.busy .war-planet-ball{box-shadow:none}
  .war-cmd-group .war-command-card{transition:none}
  .war-cmd-group .war-command-card:hover{transform:none}
}
/* V10.1 昔日阵地 ghost：hover 族链时显形的已结算 attempt——空心静止，绿=圆满/红=败 */
.war-orb-ghost{position:absolute;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;border:2px solid var(--war-done);background:transparent;opacity:.6;pointer-events:none}
.war-orb-ghost.fail{border-color:var(--war-fail)}
/* --- V10-R3b 星域态悬浮舱：中列让位恒星系后，左右两列窄幅半透明浮起 ---------- */
.war-ops.war-map{grid-template-columns:minmax(230px,19%) minmax(0,1fr) minmax(230px,21%)}
.war-ops.war-map .war-zone{background:color-mix(in srgb, var(--war-card-bg) 78%, transparent);border-color:transparent;box-shadow:0 8px 28px color-mix(in srgb,#000 18%,transparent)}
body[data-ds-dark-theme] .war-root .war-ops.war-map .war-zone{box-shadow:0 8px 30px color-mix(in srgb,#000 55%,transparent)}
@supports (backdrop-filter: blur(8px)){
  .war-ops.war-map .war-zone{backdrop-filter:blur(9px)}
}
/* V10.1 岛压图：hero 灵动岛浮于全幅星域之上（z 高于坞 3/舱 2/图 0） */
.war-island{position:relative;z-index:5}
/* --- V10.1 TITP 化布局（舰长示意图定案）：地图=界面本体 ----------------------
 * 星域从三列网格的中列格子解放，board 级铺满为底；任务/任务回报列转贴边浮舱压图
 * （CALLS/MESSAGES 语言）；命令坞满宽压底不参战。列表态零改动（类不挂即原样）。 */
.war-board{position:relative}
.war-board.war-mapmode .war-starfield{position:absolute;inset:0;min-height:0;flex:none;z-index:0;border-radius:0;border:none} /* V10.1 全幅底图（舰长定）：调度/任务/任务回报全部浮于其上 */
.war-board.war-mapmode .war-ops{position:relative;flex:1 1 auto;min-height:0;z-index:2;display:block;pointer-events:none;background:transparent;border:none;overflow:visible} /* V10.1 结构修：容器回文档流，底边=坞顶——舱底随坞高自适应，重叠构造上不可能 */
.war-board.war-mapmode .war-zone{pointer-events:auto;position:absolute;top:8px;bottom:8px;width:min(320px,26vw);overflow-y:auto;background:color-mix(in srgb, var(--war-card-bg) 84%, transparent);border-color:transparent;box-shadow:0 10px 34px color-mix(in srgb,#000 24%,transparent)}
body[data-ds-dark-theme] .war-root .war-board.war-mapmode .war-zone{box-shadow:0 10px 36px color-mix(in srgb,#000 60%,transparent)}
@supports (backdrop-filter: blur(10px)){
  .war-board.war-mapmode .war-zone{backdrop-filter:blur(10px)}
}
.war-board.war-mapmode .war-zone.war-tasks{left:10px} /* 左右 10px=坞内缩同款（舰长目检 2026-08-27） */
.war-board.war-mapmode .war-zone.war-report{right:10px}
.war-board.war-mapmode .war-zone.war-field{display:none}
.war-board.war-mapmode .war-dispatch{position:relative;z-index:3;margin-top:auto} /* V17.6 定高/padding 走基规则（滚动条预留进栏高），map 态不再另切 */
/* --- V10.1 调度坞卡牌组（舰长二改）：纯横向深叠，每卡只露 60px 标签缘，
 * hover 卡浮到组顶显全貌；无 45 度/垂直错位 -------------------------------- */
.war-root{--war-card-w:316px;--war-card-h:168px;--war-history-card-h:137px} /* 五行恒高卡实测值（probe 校准）；历史卡=R1-R4 无 R5（168-31）。定义在 war-root：组面板 portal 出坞后仍在域内 */
:is(.war-dispatch, .war-group-panel) .war-command-card{width:var(--war-card-w);min-width:var(--war-card-w);max-width:var(--war-card-w);height:var(--war-card-h);overflow:hidden;gap:5px} /* 五行卡规格（舰长定）：同尺寸，长文本一行截断 */
:is(.war-dispatch, .war-group-panel) .war-card-top{flex-wrap:nowrap;overflow:hidden;flex:0 0 auto}
:is(.war-dispatch, .war-group-panel) .war-command-text{display:block;flex:0 0 auto;white-space:nowrap;-webkit-line-clamp:unset;-webkit-box-orient:initial;text-overflow:ellipsis}
:is(.war-dispatch, .war-group-panel) .war-life{flex:0 0 auto}
:is(.war-dispatch, .war-group-panel) .war-card-note{flex:0 0 18px}
:is(.war-dispatch, .war-group-panel) .war-card-actions{flex:0 0 24px;margin-top:auto;display:flex;align-items:center;gap:6px;min-width:0}
.war-card-actions-empty{font-size:12px;line-height:18px;color:var(--war-text-3)}
.war-cmd-group{position:relative;display:block;flex:0 0 auto}
.war-cmd-group-face{position:relative;display:block}
.war-cmd-group .war-command-card{transition:none}
.war-cmd-group .war-command-card:hover{transform:none} /* 组内卡不悬起——展开面板才是组的外观动作 */
/* 组性信号①：卡底两道渐缩纸缘=底下还压着历代（不展开也一眼可读） */
.war-cmd-group-face::after,.war-cmd-group-face::before{content:'';position:absolute;left:10px;right:10px;bottom:-3px;height:5px;border-radius:0 0 8px 8px;border:1px solid var(--war-border);border-top:none;background:var(--war-card-bg);z-index:-1}
.war-cmd-group-face::before{left:20px;right:20px;bottom:-6px;opacity:.7}
.war-cmd-group.open .war-cmd-group-face::before,.war-cmd-group.open .war-cmd-group-face::after{display:none}
/* 组性信号②：历代状态 pip——罗马数字=代数，颜色=该代状态（四档语义 + 灰=未战而终） */
.war-gen-pips{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto}
.war-gen-pip{width:8px;height:8px;border-radius:50%;padding:0;font-size:0;background:currentColor;flex:0 0 auto}
.war-gen-pip.st-run{color:var(--war-run-strong)}
.war-gen-pip.st-wait{color:var(--war-wait)}
.war-gen-pip.st-done{color:var(--war-done)}
.war-gen-pip.st-fail{color:var(--war-fail)}
.war-gen-pip.st-idle{color:var(--war-text-3)}
.war-gen-pip.now{width:10px;height:10px;outline:1.5px solid currentColor;outline-offset:2px} /* 卡面=最新代：放大+描环 */
.war-gen-pip.more{font-size:12px;width:auto;height:16px;background:none;color:var(--war-text-2);font-weight:600;padding:0 2px} /* >4 代截头=总代数 chip（V13.5：12px 底线+精确深度） */
/* 组展开面板（Mac 下载栈式，舰长定）：无边框无底色无内衬——历代卡直接自卡面
 * 上方生长（最新前代贴底，更老依次向上），最高 4 行滚轮翻看；fixed 从卡面实测
 * 坐标落位（轨道横滚容器会裁剪绝对定位子元素），translateY(-100%) 底缘贴卡面 */
.war-group-panel{position:fixed;width:calc(var(--war-card-w) + 12px);max-height:calc(min(var(--war-panel-rows, 4), 4) * (var(--war-history-card-h) + 8px) + 4px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:2px 12px 2px 0;z-index:60;transform:translateY(-100%);scrollbar-width:thin}
.war-group-history{display:block}
.war-group-history .war-command-card{height:var(--war-history-card-h);box-shadow:var(--war-shadow-1);animation:war-fan-in .18s ease-out backwards;animation-delay:calc(var(--i, 0) * 40ms)} /* 层叠入场：最新前代先起，更老依次跟上 */
.war-group-history .war-command-card:hover{transform:none;box-shadow:var(--war-shadow-1);border-color:var(--war-border)} /* 历史卡无悬停反馈（舰长定）——生命周期已退场，点开详情是唯一交互 */
@keyframes war-fan-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
/* --- V9.8 命令详情：决策带置顶 + 四段阶段导航 + 折叠收据 ------------------- */
.war-cd-band{margin:8px 0 2px;border:1px solid color-mix(in srgb, var(--war-wait-border) 35%, transparent);border-radius:var(--war-r-md);background:var(--war-wait-tint);padding:8px 12px}
.war-cd-band.quiet{border-color:var(--war-border);background:var(--war-well-bg)}
.war-cd-band-in{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.war-cd-band-tag{flex:0 0 auto;font-size:13px;font-weight:600;color:var(--war-wait)}
.war-cd-band.quiet .war-cd-band-tag{color:var(--war-done)}
.war-cd-band.quiet .war-cd-band-tag.war-cd-band-err{color:var(--war-fail)}
.war-cd-band-hint{flex:1 1 200px;min-width:0;font-size:12px;line-height:1.5;color:var(--war-text-2)}
.war-cd-band-actions{display:flex;gap:8px;flex:0 0 auto}
.war-cd-stage{display:flex;flex-direction:column;gap:8px;padding-top:6px}
.war-cd-stage-head{display:flex;align-items:center;gap:8px;min-width:0}
.war-cd-stage-name{flex:0 0 auto;font-size:13px;font-weight:600;color:var(--war-text-1)}
.war-cd-stage-conc{flex:1 1 auto;min-width:0;font-size:12px;color:var(--war-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-fold{border:1px solid var(--war-border);border-radius:var(--war-r-md);background:var(--war-card-bg);padding:0}
.war-fold summary{list-style:none;cursor:pointer;padding:6px 10px;font-size:12px;color:var(--war-text-2);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-fold summary::-webkit-details-marker{display:none}
.war-fold summary::before{content:'▸';font-size:10px;transition:transform .12s ease;flex:0 0 auto}
.war-fold[open] summary::before{transform:rotate(90deg)}
.war-fold summary:hover{color:var(--war-text-1)}
.war-fold > *:not(summary){margin:0 10px 8px}
.war-fold .war-modal-actions{margin:0 10px 8px}
.war-cd-more{display:inline-flex;gap:6px;align-items:center;flex:1 1 auto;min-width:0}
.war-cd-regrade{display:inline-flex}
.war-cd-regrade summary{border:0;background:transparent;padding:2px 8px}
/* --- V9.9 聚焦页：右上 ✕ + 四段卡片区/灰提示行/ghost 卡 + 卡下原地展开子详情 + 底部双会话跳钮 --- */
.war-modal.war-cd-modal{position:relative}
.war-cd-x{position:absolute;top:10px;right:10px;z-index:5;width:26px;height:26px;border-radius:13px;border:1px solid var(--war-border);background:var(--war-well-bg);color:var(--war-text-2);cursor:pointer;font-family:var(--war-font);line-height:1}
.war-cd-x:hover{color:var(--war-text-1);border-color:var(--war-run-border)}
.war-cd-x:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
.war-tour-cards{display:flex;flex-direction:column;gap:8px}
.war-tour-hint{border:1px dashed var(--war-border);border-radius:var(--war-r-md);padding:8px 12px;font-size:12px;color:var(--war-text-2);background:color-mix(in srgb, var(--war-card-bg) 60%, transparent)}
.war-tour-ghost{display:flex;align-items:center;gap:8px;border:1px dashed color-mix(in srgb, var(--war-run-border) 45%, var(--war-border));border-radius:var(--war-r-lg);padding:10px 12px;font-size:12px;color:var(--war-text-2);background:var(--war-run-tint);cursor:pointer}
.war-tour-ghost:hover{border-style:solid;color:var(--war-text-1)}
.war-tour-ghost:focus-visible{outline:2px solid var(--war-focus);outline-offset:2px}
.war-tour-ghost-icon{flex:0 0 auto;font-size:14px;color:var(--war-run-strong)}
.war-subdetail{border:1px solid color-mix(in srgb, var(--war-run-border) 30%, var(--war-border));border-radius:var(--war-r-md);background:color-mix(in srgb, var(--war-run-border) 4%, var(--war-card-bg));padding:8px 12px;display:flex;flex-direction:column;gap:8px;margin:-2px 2px 0}
.war-subdetail-title{font-size:12px;font-weight:600;color:var(--war-run-strong)}
.war-sub-row{display:flex;gap:10px;align-items:flex-start;min-width:0}
.war-sub-label{flex:0 0 auto;font-size:12px;font-weight:600;color:var(--war-text-2);padding-top:1px}
.war-sub-value{flex:1 1 auto;min-width:0;font-size:12px;line-height:1.6;color:var(--war-text-1);white-space:pre-wrap;word-break:break-word}
.war-subdetail .war-modal-actions{border-top:0;padding-top:0;justify-content:flex-start}
.war-tour-jumps{display:flex;gap:10px;padding-top:10px;border-top:1px solid var(--war-border-soft)}
.war-jump-btn{flex:1 1 0;justify-content:center;display:inline-flex;align-items:center;gap:6px;padding:8px 12px}
.war-jump-btn:disabled{cursor:not-allowed;opacity:.55;border-style:dashed;color:var(--war-text-3);background:transparent} /* V16.4-R2：禁用占位三通道可辨（虚线+灰字+透明底），色弱不只靠 opacity */
/* --- V9.10 聚焦页状态机补全：warn ghost / 改档按钮组 / 任务产出+历次执行行 --- */
.war-tour-ghost.warn{border-color:color-mix(in srgb, var(--war-wait-border) 55%, var(--war-border));background:var(--war-wait-tint)}
.war-tour-ghost.warn .war-tour-ghost-icon{color:var(--war-wait)}
.war-btn.war-btn-warn{border-color:var(--war-wait-border);color:var(--war-wait);background:color-mix(in srgb, var(--war-wait-border) 8%, var(--war-card-bg))}
.war-sub-btns{display:inline-flex;gap:6px;flex-wrap:wrap}
.war-sub-attempts{display:inline-flex;flex-direction:column;gap:6px;min-width:0}
.war-sub-attempts .war-cd-session{width:100%}
/* V9.11 任务列=大副侧台账：成形卡（任务书挂出前的占位）+ 终局任务书卡调暗 */
.war-forming{border-style:dashed}
.war-forming .war-forming-icon{color:var(--war-text-2);font-size:14px;line-height:1}
.war-forming.warn{border-color:color-mix(in srgb, var(--war-wait-border) 55%, var(--war-border));background:var(--war-wait-tint)}
.war-forming.warn .war-forming-icon{color:var(--war-wait)}
.war-card.settled{opacity:.55}
.war-card.settled:hover,.war-card.settled:focus-visible{opacity:.85}
/* V9.11 R2 执行卡实时活动行：呼吸点 + 宿主侧单点动词 */
.war-activity{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--war-text-2)}
.war-activity-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--war-run-border);animation:war-act-pulse 1.6s ease-in-out infinite}
/* V18 critique B2：reduce 守卫必须在基础规则**之后**（同特异性后者胜——放前面会被 934 打穿）。 */
@media (prefers-reduced-motion:reduce){.war-activity-dot,.war-activity-dot::after{animation:none}}
.war-activity-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes war-act-pulse{0%,100%{opacity:.35}50%{opacity:1}}
/* --- V13 战线一等公民：战线头（任务列）/ 航迹（2D SVG）/ 未分组 / 3D 图例 ------ */
.war-front-group{display:flex;flex-direction:column;gap:8px}
/* V13.3 组=围合容器（critique R2 P1）+ V13.4 浅色提浓（critique R3 P1：4%/22%
 * 在白底上 1.03/1.3:1 低于知觉阈值——浅色基线 8%/42%，深色维持淡雅）。
 * V16.4 critique B：side-tab 侧条退役（探测器成体系命中）——链色身份由
 * tint+围合边+头点（war-front-dot）三通道承载，左条是第四重冗余。 */
.war-front-group{margin-top:7px;padding:4px 4px 6px;border-radius:var(--war-r-lg);background:color-mix(in srgb,var(--chain-hue,#888) 8%,transparent);border:1px solid color-mix(in srgb,var(--chain-hue,#888) 42%,transparent)}
body[data-ds-dark-theme] .war-root .war-front-group{background:color-mix(in srgb,var(--chain-hue,#888) 9%,transparent);border-color:color-mix(in srgb,var(--chain-hue,#888) 24%,transparent)}
.war-front-group.settled{opacity:.78}
.war-front-head{display:flex;align-items:center;gap:6px;padding:3px 6px 5px;min-width:0}
.war-front-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:var(--chain-hue,#888);box-shadow:0 0 0 2px color-mix(in srgb,var(--chain-hue,#888) 25%,transparent)}
.war-front-title{font-size:13px;font-weight:600;color:var(--war-text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}
.war-front-gen{flex:0 0 auto}
.war-front-bf{flex:0 0 auto;font-size:12px;color:var(--war-text-2);padding:1px 7px;border-radius:var(--war-r-pill);border:1px solid color-mix(in srgb,var(--chain-hue,#888) 45%,transparent)}
.war-front-state{font-size:12px;flex:0 0 auto;color:var(--war-text-2)}
.war-front-state.warn{color:var(--war-wait);font-weight:600}
.war-front-state.err{color:var(--war-fail)}
.war-front-state.done{color:var(--war-done)}
.war-inbox-front{display:flex;align-items:center;gap:6px;padding:4px 10px 2px;border-radius:var(--war-r-sm);background:color-mix(in srgb,var(--chain-hue,#888) 7%,transparent)} /* V16.4：侧条退役——头内 war-front-dot 已 carry 链色 */
.war-inbox-front-text{font-size:12px;font-weight:600;color:var(--war-text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 2D 星域战线航迹（SVG viewBox 0 0 100 100 非等比——描边 vector-effect 防拉伸变形） */
.war-front-badge2d{position:absolute;transform:translate(-50%,-50%);z-index:1;font-size:12px;font-weight:600;line-height:1;padding:2px 7px;border-radius:var(--war-r-pill);color:var(--war-text-1);background:color-mix(in srgb,var(--chain-hue,#888) 30%,var(--war-pop-bg));border:1px solid color-mix(in srgb,var(--chain-hue,#888) 55%,transparent);pointer-events:none}
.war-front-badge2d.settled{opacity:.55}
/* V14 点星球看战线：星球⊃战线 清单浮层（3D/2D 同类名同形） */
/* V18.3 聚焦态钉住悬停卡内嵌战线清单（bfpanel 弹窗退役并入；行样式承 bfpanel-row
 * 血统：链色底染+hover 加深，链色经行上 war-chain-hue-N 类的 --chain-hue 变量）。 */
.war-wz-tipfront{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 8px;margin:6px 0 0;border:1px solid transparent;border-radius:var(--war-r-sm);background:color-mix(in srgb,var(--chain-hue,#888) 6%,transparent);cursor:pointer;font-family:var(--war-font);font-size:12px;color:var(--war-text-1)}
.war-wz-tipfront:hover{background:color-mix(in srgb,var(--chain-hue,#888) 14%,transparent)}
.war-wz-tipfront:focus-visible{outline:2px solid var(--war-focus);outline-offset:1px}
.war-wz-tipfront-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.war-wz-tipfront-meta{flex:none;color:var(--war-text-2);font-size:11px}
/* V14 溯源 chip + 起草器星球注 */
.war-bf-chip{flex:none;font-size:12px;line-height:18px;padding:0 7px;border-radius:9px;border:1px dashed var(--war-border);color:var(--war-text-2);background:transparent;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.war-cd-origin{flex:none;font-size:12px;padding:2px 9px;border-radius:var(--war-r-pill);border:1px dashed var(--war-border);color:var(--war-text-2);background:transparent;cursor:pointer;font-family:var(--war-font)}
.war-cd-origin:hover{color:var(--war-text-1);border-color:var(--war-border-hover,var(--war-border))}
.war-name-input{width:100%;font-size:13px;line-height:20px;padding:6px 10px;border-radius:var(--war-r-md);border:1px solid var(--war-border);color:var(--war-text-1);background:var(--war-well-bg);font-family:var(--war-font);margin-bottom:2px}
.war-name-input:focus-visible{outline:2px solid var(--war-focus);outline-offset:1px}
.war-cp-note{font-size:12px;color:var(--war-text-2);margin-top:4px;line-height:1.5}
.war-front-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:0}
/* V15.2 分段环（一星球一环，段数=战线数）：中性色不编码链色身份 */
.war-front-line{fill:none;stroke:var(--war-text-2);stroke-width:1.6;stroke-opacity:.7;vector-effect:non-scaling-stroke;stroke-linejoin:round}
/* 3D 图例 lg-front + 战线信息卡链色点 */
.war-wz-legend .lg-front{background:linear-gradient(90deg,var(--war-run-strong),var(--war-done))}
.war-wz-tip .dot.chain{background:var(--chain-hue,#888)}
`


const STYLE_ID = 'data-dsh-plugin-warroom'

export function ensureWarStyles(): void {
  if (document.head.querySelector(`style[${STYLE_ID}]`) !== null) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_ID, '')
  style.textContent = WAR_CSS
  document.head.appendChild(style)
}
