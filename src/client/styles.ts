/**
 * Warroom styles v3.0 — the 两区指挥中心 look (指挥中心 | 战场). One idempotent
 * <style> injection, `war-*` class namespace, colors/fonts from the host's
 * `--dsw-*` design tokens (patch-layer bundles cannot use CSS Modules;
 * quality-tier colors are the one deliberate palette beyond the tokens,
 * mirroring QUALITY_TIERS).
 * @module dsh-plugin-warroom/client/styles
 */

const WAR_CSS = `
.war-root{font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);position:relative}
/* --- V8 hero 灵动岛（标题栏替代）：收起=计数仪表胶囊，hover 展开/点击钉住 ------- */
.war-island{position:relative;flex:0 0 auto;padding:10px 12px 4px;z-index:40}
.war-island-pill{display:flex;align-items:center;gap:10px;padding:7px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 10px rgba(0,0,0,.08);cursor:pointer;transition:border-radius .22s ease,box-shadow .22s ease}
.war-island-pill:hover{box-shadow:0 4px 14px rgba(0,0,0,.13)}
/* 展开态 morph：胶囊 → 圆角矩形——pill 上圆下平（熔进浮层），浮层上平下圆。 */
.war-island.open .war-island-pill{border-radius:16px 16px 0 0;box-shadow:0 6px 18px rgba(0,0,0,.14)}
.war-island-title{font-size:14px;font-weight:700;white-space:nowrap}
.war-head-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:0 0 auto}
.war-head-dot.on{background:var(--dsw-alias-state-business-primary)}
.war-island-counts{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-island-badge{font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-island-badge.hot{color:color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000);border-color:var(--dsw-alias-state-error-primary);font-weight:600}
.war-island-visitmini{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.war-island-spacer{flex:1 1 auto;min-width:4px}
.war-island-pinned{font-size:12px;flex:0 0 auto}
.war-island .war-btn{padding:2px 10px;line-height:18px;font-size:12px;flex:0 0 auto}
/* 展开浮层：绝对定位盖在列区上方——列纹丝不动（灵动岛不推挤内容）。 */
.war-island-panel{position:absolute;top:100%;left:12px;right:12px;display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;border:1px solid var(--dsw-alias-border-l2);border-top:0;border-radius:0 0 16px 16px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 14px 32px rgba(0,0,0,.18);max-height:52vh;overflow-y:auto;animation:war-island-open .2s ease}
@keyframes war-island-open{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.war-island-panel{animation:none}.war-island-pill{transition:none}}
.war-dockpill{display:inline-flex;align-items:center;gap:6px}
.war-dockseg{font-size:12px}
.war-err{font-size:12px;color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary))}
.war-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:12px 4px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;margin:6px 0}

/* --- V9 局势墙三列（任务/战场/战报）+ 底部命令调度条 ------------------------- */
/* 板体 = 纵向 flex：.war-ops 三列网格占满余高，.war-dispatch 全宽横条贴底。
 * 不能把调度条直接塞进三列 grid——它会被排到第 2 行第 1 列只剩一列宽。 */
.war-board{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.war-ops{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:1.1fr 1fr 1.1fr;gap:10px;padding:2px 10px 6px}
.war-zone{display:flex;flex-direction:column;min-height:0;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);overflow:hidden}
.war-tasks{box-shadow:inset 0 3px 0 var(--dsw-alias-state-business-primary)}
.war-field{box-shadow:inset 0 3px 0 var(--dsw-alias-label-tertiary)}
.war-zone.war-report{box-shadow:inset 0 3px 0 var(--dsw-alias-state-success-primary)}
.war-col{display:flex;flex-direction:column;min-height:0;min-width:0;padding:0 8px}
.war-col-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;padding:8px 2px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.war-col-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}
.war-col-count{font-size:12px;line-height:18px;min-width:18px;text-align:center;padding:0 6px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.war-col-body{flex:1 1 auto;overflow-y:auto;padding:8px 2px 16px;display:flex;flex-direction:column;gap:8px}
/* 底部命令调度条：所有命令卡横向一排（活跃优先+新→旧），单行横滚——
 * Dispatch 调度中心的一排英雄位；命令是唯一可点入口。
 * 视觉与三列刻意拉开物种差：坞带 = 主色淡染凹槽（color-mix——本主题
 * bg-layer-2 与 bg-base 同为白，靠别名分层分不出来）+ 内阴影；命令卡
 * 在坞里浮起一层投影；左缘竖排铭牌 sticky 钉驻。 */
/* V9.4 容器化（元首定）：整坞一个大容器（与三区同语言的圆角容器，物种差
 * 保留——主色淡染凹槽坞）；左端 ＋ 下达瓦片（容器一部分，幽灵虚线态）；
 * 命令卡全部进 .war-dispatch-track 轨道横滚；「命令调度」铭牌退役。 */
.war-dispatch{flex:0 0 auto;display:flex;gap:10px;align-items:stretch;margin:0 10px 10px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-base));box-shadow:inset 0 2px 8px rgba(0,0,0,.08)}
.war-dispatch-track{flex:1 1 auto;min-width:0;display:flex;gap:10px;align-items:stretch;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
.war-dispatch-track.can-scroll{mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 26px),rgba(0,0,0,.35));-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 26px),rgba(0,0,0,.35))}
.war-dispatch .war-command-card{flex:0 0 320px;min-width:0}

/* --- cards ------------------------------------------------------------------ */
.war-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:8px 10px;display:flex;flex-direction:column;gap:6px;transition:border-color .12s ease,transform .12s ease,box-shadow .12s ease,opacity .15s ease}
.war-card.clickable{cursor:pointer}
.war-card.clickable:hover{border-color:var(--dsw-alias-label-secondary);transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.war-card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.war-chip{font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}
.war-taskid{font-size:12px;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-markdown-code)}
.war-time{font-size:12px;color:var(--dsw-alias-label-secondary);margin-left:auto;white-space:nowrap}
.war-ws{font-size:12px;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-markdown-code);word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-brief{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.war-report-body{font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:6px 10px;white-space:pre-wrap;color:var(--dsw-alias-label-primary)}

/* status chip colors */
.war-chip.st-published{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);border-color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)}
.war-chip.st-in_progress,.war-chip.oc-live{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, #000);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.st-reported,.war-chip.oc-reported{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.war-chip.st-closed,.war-chip.oc-done{color:color-mix(in srgb, var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary)) 58%, #000);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.st-failed,.war-chip.oc-fail{color:color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000);border-color:var(--dsw-alias-state-error-primary)}
.war-chip.pri-high{color:color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000);border-color:var(--dsw-alias-state-error-primary);font-weight:600}
/* command-zone chip colors */
.war-chip.st-draft{color:var(--dsw-alias-label-secondary)}
.war-chip.st-received,.war-chip.st-talking{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, #000);border-color:var(--dsw-alias-state-business-primary);font-weight:600}
.war-chip.st-approved{color:color-mix(in srgb, var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary)) 58%, #000);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.st-cancelled{color:var(--dsw-alias-label-secondary);text-decoration:line-through}
/* V5 grade chips (档位账本): L0 直发绿 / L1 呈批蓝 / L2 澄清黄 */
.war-chip.gr-L0{color:color-mix(in srgb, var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary)) 58%, #000);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.gr-L1{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, #000);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.gr-L2{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);border-color:var(--dsw-alias-state-warn-primary)}
/* V5 分诊理由行（命令详情浮层） */
.war-note{margin-top:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
/* V5-R3 计划卡（命令详情浮层内） */
.war-plan{margin-top:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px}
.war-plan-head{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:4px}
.war-plan-body{font-size:12px;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);max-height:240px;overflow:auto}

/* quality-tier palette (the deliberate exception to --dsw-only) */
.war-chip.q-common{color:var(--dsw-alias-label-secondary)}
.war-chip.q-fine{color:color-mix(in srgb, var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary)) 58%, #000);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.q-rare{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, #000);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.q-epic{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);border-color:var(--dsw-alias-state-warn-primary)}
.war-chip.q-legendary{color:color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000);border-color:var(--dsw-alias-state-error-primary);font-weight:600}
/* quality-tier palette (the deliberate exception to --dsw-only).
 * V7.1 审查整改：稀有度从「3px 品质左边框」（side-tab 指纹）改为 chip 单通道
 * ——颜色随档位的品质 chip（qualityChip）已在任务/会话卡上，边框通道删除。 */

/* dots + the received breathing reminder */
.war-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-label-tertiary)}
.war-dot.received{background:var(--dsw-alias-state-business-primary)}
.war-dot.done{background:var(--dsw-alias-state-success-primary)}
.war-command-card.pulse{border-color:var(--dsw-alias-state-business-primary);animation:war-pulse 1.6s ease-in-out infinite}
@keyframes war-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}50%{box-shadow:0 0 0 3px var(--dsw-alias-state-business-primary)}}
@media (prefers-reduced-motion: reduce){.war-command-card.pulse{animation:none}}
.war-command-text{font-size:13px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.war-command-text.struck{color:var(--dsw-alias-label-secondary);text-decoration:line-through}

/* --- command lifecycle strip (v6: 命令→任务→执行→战报 全程追踪) -------------- */
.war-life{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-top:2px}
.war-life-stage{display:flex;flex-direction:column;gap:3px;min-width:0}
.war-life-bar{height:3px;border-radius:2px;background:var(--dsw-alias-border-l2);transition:background .2s ease}
.war-life-bar.done{background:var(--dsw-alias-state-success-primary)}
.war-life-bar.now{background:var(--dsw-alias-state-business-primary);animation:war-life-breath 2.4s ease-in-out infinite}
@keyframes war-life-breath{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.war-life-bar.now{animation:none}}
.war-life-label{font-size:12px;line-height:16px;color:color-mix(in srgb, var(--dsw-alias-label-tertiary) 45%, var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-life-label.done{color:var(--dsw-alias-label-secondary)}
.war-life-label.now{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, #000);font-weight:600}
.war-life-status{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-life-status.warn{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);font-weight:600}
.war-life-status.err{color:color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000)}

/* lineage chip（任务/会话卡 → 源命令）：可点的回溯入口 */
.war-chip.gr-L0,.war-chip.gr-L1,.war-chip.gr-L2{border-radius:4px}
.war-chip.war-lineage{cursor:pointer}
.war-chip.war-lineage:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}

/* --- V7-① 等你发落收件箱（指挥中心头部聚合队列） ------------------------------- */
.war-inbox{flex:0 0 auto;margin:8px 14px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.war-inbox-head{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.war-inbox-title{font-size:12px;font-weight:700;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}
.war-inbox-count{font-size:12px;line-height:18px;min-width:18px;text-align:center;padding:0 6px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.war-inbox-items{display:flex;flex-direction:column;max-height:176px;overflow-y:auto}
.war-inbox-item{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}
.war-inbox-item:last-child{border-bottom:0}
.war-inbox-item:hover{background:var(--dsw-alias-bg-layer-2)}
.war-inbox-text{flex:1 1 auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-inbox-wait{font-size:12px;color:color-mix(in srgb, var(--dsw-alias-label-tertiary) 45%, var(--dsw-alias-label-secondary));white-space:nowrap;flex:0 0 auto}
.war-inbox-item.tone-warn .war-inbox-wait{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);font-weight:600}
.war-inbox-item.tone-err .war-inbox-wait{color:color-mix(in srgb, var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary)) 58%, #000);font-weight:600}
.war-inbox-item.leader .war-inbox-text{font-weight:700}
.war-inbox-oldest{font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary));font-weight:600;flex:0 0 auto}
.war-inbox-empty{padding:6px 10px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.war-chip.k-clarify{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, #000);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.k-plan{color:color-mix(in srgb, var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)) 58%, #000);border-color:var(--dsw-alias-state-warn-primary)}
.war-chip.k-review{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.war-chip.k-retry{color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary));border-color:var(--dsw-alias-state-error-primary)}

/* --- V7-② 到访摘要横幅（自上次看过以来） --------------------------------------- */
.war-visit{flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 14px 0;padding:6px 10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.war-visit-since{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-visit-seg{cursor:pointer;font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-visit-seg:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}
.war-visit-seg.s-closed{color:var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary));border-color:var(--dsw-alias-state-success-primary)}
.war-visit-seg.s-failed{color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary));border-color:var(--dsw-alias-state-error-primary)}
.war-visit-seg.s-pending{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);border-color:var(--dsw-alias-state-warn-primary);font-weight:600}

/* --- V7-③ 族系追踪（悬停高亮 + 聚焦压暗 + 聚焦条） ------------------------------ */
.war-card.war-rel-dim{opacity:.32}
.war-card.war-rel-dim:focus-visible,.war-card.war-rel-dim:focus-within{opacity:1}
.war-card.war-rel-same{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.war-focus-btn{padding:0 6px;line-height:18px;font-size:12px;flex:0 0 auto}

/* --- V7-④ 夜间预检 + 起草器档位/最近命令 ---------------------------------------- */
.war-preflight{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:8px;border:1px dashed var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2)}
.war-preflight-text{flex:1 1 auto;min-width:0;font-size:12px;color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-preflight-btn{padding:2px 8px;font-size:12px;line-height:18px;flex:0 0 auto}
.war-recent-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
.war-recent-label{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:0 0 auto}
.war-recent-item{cursor:pointer;font-size:12px;line-height:18px;padding:0 8px;border-radius:9px;border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.war-recent-item:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}

/* --- V7-⑥ 空板首用引导 -------------------------------------------------------- */
.war-onboard{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 20px;text-align:center}
.war-onboard-title{font-size:16px;font-weight:700;color:var(--dsw-alias-label-primary)}
.war-onboard-lead{max-width:540px;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.war-onboard-steps{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);text-align:left}
.war-onboard-cta{font-size:14px;padding:8px 18px}

/* --- V7-⑤「为什么还没动」等待解释行 -------------------------------------------- */
.war-waithint{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:4px 8px}

/* 任务链行（命令详情浮层）：一环一行，点行跳任务卡 */
.war-chain-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);cursor:pointer;transition:border-color .12s ease}
.war-chain-row:hover{border-color:var(--dsw-alias-state-business-primary)}
.war-chain-row .war-title{flex:1 1 auto}
.war-chain-meta{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.war-loot-summary{font-size:12px;color:var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-waiting{font-size:12px;color:var(--dsw-alias-label-secondary)}

/* misc card furniture */
.war-lock{font-size:12px;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.war-loot{display:flex;flex-wrap:wrap;gap:6px}
.war-loot-item{font-size:12px;padding:4px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.war-loot-item.tests{color:var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary));border-color:var(--dsw-alias-state-success-primary)}
.war-evi{font-size:12px;display:flex;flex-direction:column;gap:2px;padding:4px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.war-evi .ok{color:var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary))}
.war-evi .bad{color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary))}
.war-cron{font-size:12px;color:var(--dsw-alias-state-business-primary)}
.war-fail{font-size:12px;color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary));background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:6px 10px}
.war-mark{font-size:14px;font-weight:700;line-height:1}
.war-mark.bang{color:color-mix(in srgb, var(--dsw-alias-state-warn-label) 58%, #000)}
.war-mark.query{color:color-mix(in srgb, var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary)) 58%, #000)}

/* --- modals ------------------------------------------------------------------ */
.war-modal-backdrop{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:32px}
.war-modal{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.28)}
.war-modal-title{font-size:15px;font-weight:600}
.war-modal-sub{font-size:12px;color:var(--dsw-alias-label-secondary);margin:4px 0 10px}
.war-detail-body{overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 2px 8px}
.war-detail-section{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em;margin-top:4px}
.war-detail-text{font-size:13px;white-space:pre-wrap;color:var(--dsw-alias-label-primary)}
.war-modal-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}
.war-modal.wide{max-width:720px}
.war-composer{width:100%;min-height:120px;resize:vertical;font-family:var(--dsw-font-family);font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;outline:none}
.war-composer:focus{border-color:var(--dsw-alias-state-business-primary)}

/* --- external thread cards + dock home pill (v3) ---------------------------- */
.war-col-actions{margin-left:auto;display:inline-flex;gap:6px}
.war-external-card{border-style:dashed}
.war-chip.ext-badge{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary);font-weight:600}
.war-btn.war-detach{padding:1px 8px;font-size:12px;line-height:16px}
/* V9 命令详情·相关会话入口：一行一会话（讨论/执行），点开进宿主会话窗口。 */
.war-cd-sessions{display:flex;flex-direction:column;gap:6px}
.war-cd-session{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:4px 10px;cursor:pointer;font-family:var(--dsw-font-family);text-align:left}
.war-cd-session:hover{border-color:var(--dsw-alias-state-business-primary)}
.war-dock-home{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:2px 8px;font-family:var(--dsw-font-family)}
.war-dock-home:hover{border-color:var(--dsw-alias-state-business-primary)}
.war-dock-unread{font-size:12px;color:var(--dsw-alias-state-business-primary);font-weight:600}

/* --- buttons ------------------------------------------------------------------ */
.war-btn{cursor:pointer;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:4px 10px;font-family:var(--dsw-font-family)}
/* 白字对比度 ≥4.5:1：主色底向黑混一档（亮暗主题都提升白字对比，保 token 联动）。 */
.war-btn.primary{background:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 80%, #000);color:#fff;border-color:transparent}
.war-btn:disabled{opacity:.5;cursor:default}

/* --- V7.1 审查整改：键盘焦点轮廓 / 决策失败反馈 / 图例浮层 ---------------------- */
.war-root :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
/* V8 决策失败 toast：绝对定位浮层（不推挤列区），岛下方右上。 */
.war-actionerr{position:absolute;bottom:136px;right:24px;z-index:70;display:flex;align-items:center;gap:8px;max-width:480px;margin:0;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-label, var(--dsw-alias-state-error-primary));font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.war-legend-btn{padding:2px 10px;line-height:18px;font-size:12px;flex:0 0 auto}
.war-legend-rows{display:grid;grid-template-columns:max-content 1fr;gap:8px 14px;align-items:baseline}
.war-legend-sym{font-size:12px;font-weight:700;color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);white-space:nowrap}
.war-legend-text{font-size:12px;color:var(--dsw-alias-label-secondary)}

/* --- shell entry (sidebar row + center-column takeover) ------------------------ */
.war-sidebar-row{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-family:var(--dsw-font-family);cursor:pointer;border-radius:8px;text-align:left}
.war-sidebar-row:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.war-sidebar-row[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.war-sidebar-icon{display:inline-flex;align-items:center;flex:0 0 auto;color:currentColor}
.war-sidebar-label{white-space:nowrap}
.war-shell-view{display:none}
html[data-dsh-warroom-active] .war-shell-view{display:flex;flex-direction:column;height:100%}
html[data-dsh-warroom-active] [data-pane='conversation'] > :not([data-dsh-warroom-view]),
html[data-dsh-warroom-active] [class*='centerCol'] > :not([data-dsh-warroom-view]){display:none !important}
/* --- V9.2 岛改版（聚焦 chip + 齿轮）---------------------------------------- */
.war-island-focus{flex:0 1 auto;min-width:0;font-size:12px;font-weight:600;color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);border:1px solid var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);border-radius:999px;padding:2px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--dsw-font-family)}
.war-island-focus:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}
.war-island-gear{font-size:14px;line-height:20px;padding:2px 9px}

/* --- V9.2 调度坞左端钉驻簇（[＋下达][铭牌]）--------------------------------- */
.war-dispatch-add{flex:0 0 auto;width:52px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:600;line-height:1;color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);border:1px dashed color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent);border-radius:10px;cursor:pointer;padding:0;font-family:var(--dsw-font-family);transition:background .12s ease,border-color .12s ease}
.war-dispatch-add:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);border-style:solid;border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, transparent)}
.war-dispatch-add:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring);outline-offset:2px}

/* --- V9.2 定时命令角标 ------------------------------------------------------ */
.war-chip.sched{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);border-color:var(--dsw-alias-state-business-primary);border-style:dashed;background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);font-weight:600}

/* --- V9.2 起草器重设计（说明 + 档位/时机选项卡 + cron）---------------------- */
.war-composer-modal{max-width:640px}
.war-cp-section{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:12px 0 6px}
.war-grade-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.war-grade-cards.war-sched-cards{grid-template-columns:repeat(2,1fr)}
.war-grade-card,.war-sched-card{display:flex;flex-direction:column;gap:4px;align-items:flex-start;text-align:left;padding:8px 10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);cursor:pointer;font-family:var(--dsw-font-family);transition:border-color .12s ease,background .12s ease}
.war-grade-card:hover,.war-sched-card:hover{border-color:var(--dsw-alias-label-secondary)}
.war-grade-card.on,.war-sched-card.on{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-base));box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary)}
.war-grade-card-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.war-grade-card.on .war-grade-card-name{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000)}
.war-grade-card-hint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.war-cron-block{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.war-cron-presets{display:flex;gap:6px;flex-wrap:wrap}
.war-cron-preset{font-size:12px;line-height:20px;padding:2px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);cursor:pointer;font-family:var(--dsw-font-family)}
.war-cron-preset:hover{border-color:var(--dsw-alias-label-secondary)}
.war-cron-preset.on{color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);border-color:var(--dsw-alias-state-business-primary);font-weight:600}
.war-cron-input{width:100%;font-family:var(--dsw-font-markdown-code);font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px;outline:none}
.war-cron-input:focus{border-color:var(--dsw-alias-state-business-primary)}
.war-cron-next{font-size:12px;color:var(--dsw-alias-label-secondary)}

/* --- V9.2 设置抽屉（右侧滑入，不遮岛不推列）--------------------------------- */
.war-settings-backdrop{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.22)}
.war-settings-drawer{position:absolute;top:0;right:0;bottom:0;width:min(360px,92vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-12px 0 32px rgba(0,0,0,.16);animation:war-drawer-in .18s ease}
@media (prefers-reduced-motion: reduce){.war-settings-drawer{animation:none}}
@keyframes war-drawer-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.war-settings-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.war-settings-title{font-size:15px;font-weight:600}
.war-settings-body{flex:1 1 auto;overflow-y:auto;padding:4px 16px 20px}
.war-settings-section{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:16px 0 8px}
.war-skin-row{display:flex;gap:8px}
.war-skin-opt{flex:1 1 auto;font-size:13px;font-weight:600;padding:8px 0;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer;font-family:var(--dsw-font-family)}
.war-skin-opt:hover{border-color:var(--dsw-alias-label-secondary)}
.war-skin-opt.on{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-base));color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary)}
.war-settings-note{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);margin-top:8px}
.war-set-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.war-set-toggle-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.war-set-toggle-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.war-set-toggle-hint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.war-switch{flex:0 0 auto;width:36px;height:20px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);position:relative;cursor:pointer;padding:0;transition:background .15s ease,border-color .15s ease}
.war-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:8px;background:var(--dsw-alias-label-secondary);transition:transform .15s ease,background .15s ease}
.war-switch.on{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.war-switch.on .war-switch-knob{transform:translateX(16px);background:var(--dsw-alias-bg-base)}
.war-switch:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring);outline-offset:2px}
.war-set-conn{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.war-set-conn-dot{width:8px;height:8px;border-radius:5px;background:var(--dsw-alias-state-success-primary);flex:0 0 auto}
.war-set-conn-dot.down{background:var(--dsw-alias-state-error-primary)}
.war-set-conn-text{flex:1 1 auto;min-width:0}
/* --- V9.3：非零收件箱 = 岛的主导信号（胶囊染警示，清空回常态）--------------- */
.war-island-pill.has-inbox{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 60%, var(--dsw-alias-border-l2));box-shadow:0 2px 10px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent)}
.war-island-pill.has-inbox .war-head-dot{background:var(--dsw-alias-state-warn-primary);opacity:1}

/* --- V9.3：批准计划视觉隔离（一键保留，后果先讲清——决策区独立成块）--------- */
.war-modal:focus-visible{outline:none}
/* --- V9.5：进入对话 chip（视觉独立于卡身——对话入口不再借整卡点击）+ kbd 提示 --- */
.war-chip.war-enter-chip{cursor:pointer;color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000);border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent);border-style:dashed;background:transparent;font-family:var(--dsw-font-family);padding:0 8px}
.war-chip.war-enter-chip:hover{border-style:solid;background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent)}
.war-chip.war-enter-chip:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring);outline-offset:2px}
.war-cp-kbd{margin-top:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
/* --- V9.6：列标题 h2 语义化复位 + 语义色 label 回退 primary（宿主未定义时不塌黑） --- */
h2.war-col-title{margin:0;font-size:13px}

/* == WAR_CSS 追加锚点：新 CSS 插在本行之后 == */
/* --- V9.8 命令详情：决策带置顶 + 四段阶段导航 + 折叠收据 ------------------- */
.war-cd-band{margin:8px 0 2px;border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent);padding:8px 12px}
.war-cd-band.quiet{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.war-cd-band-in{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.war-cd-band-tag{flex:0 0 auto;font-size:13px;font-weight:600;color:color-mix(in srgb, var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)) 58%, #000)}
.war-cd-band.quiet .war-cd-band-tag{color:var(--dsw-alias-state-success-primary)}
.war-cd-band-hint{flex:1 1 200px;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.war-cd-band-actions{display:flex;gap:8px;flex:0 0 auto}
.war-cd-stage{display:flex;flex-direction:column;gap:8px;padding-top:6px}
.war-cd-stage-head{display:flex;align-items:center;gap:8px;min-width:0}
.war-cd-stage-name{flex:0 0 auto;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.war-cd-stage-conc{flex:1 1 auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-fold{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:0}
.war-fold summary{list-style:none;cursor:pointer;padding:6px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-fold summary::-webkit-details-marker{display:none}
.war-fold summary::before{content:'▸';font-size:10px;transition:transform .12s ease;flex:0 0 auto}
.war-fold[open] summary::before{transform:rotate(90deg)}
.war-fold summary:hover{color:var(--dsw-alias-label-primary)}
.war-fold > *:not(summary){margin:0 10px 8px}
.war-fold .war-modal-actions{margin:0 10px 8px}
.war-cd-more{display:inline-flex;gap:6px;align-items:center;flex:1 1 auto;min-width:0}
.war-cd-regrade{display:inline-flex}
.war-cd-regrade summary{border:0;background:transparent;padding:2px 8px}
/* --- V9.9 聚焦页：右上 ✕ + 四段卡片区/灰提示行/ghost 卡 + 卡下原地展开子详情 + 底部双会话跳钮 --- */
.war-modal.war-cd-modal{position:relative}
.war-cd-x{position:absolute;top:10px;right:10px;z-index:5;width:26px;height:26px;border-radius:13px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:var(--dsw-font-family);line-height:1}
.war-cd-x:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-business-primary)}
.war-cd-x:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring);outline-offset:2px}
.war-tour-cards{display:flex;flex-direction:column;gap:8px}
.war-tour-hint{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 60%, transparent)}
.war-tour-ghost{display:flex;align-items:center;gap:8px;border:1px dashed color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--dsw-alias-border-l2));border-radius:12px;padding:10px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 4%, transparent);cursor:pointer}
.war-tour-ghost:hover{border-style:solid;color:var(--dsw-alias-label-primary)}
.war-tour-ghost:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring);outline-offset:2px}
.war-tour-ghost-icon{flex:0 0 auto;font-size:14px;color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 70%, #000)}
.war-subdetail{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-border-l2));border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 4%, var(--dsw-alias-bg-layer-1));padding:8px 12px;display:flex;flex-direction:column;gap:8px;margin:-2px 2px 0}
.war-subdetail-title{font-size:12px;font-weight:600;color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, #000)}
.war-sub-row{display:flex;gap:10px;align-items:flex-start;min-width:0}
.war-sub-label{flex:0 0 auto;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);padding-top:1px}
.war-sub-value{flex:1 1 auto;min-width:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
.war-subdetail .war-modal-actions{border-top:0;padding-top:0;justify-content:flex-start}
.war-tour-jumps{display:flex;gap:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}
.war-jump-btn{flex:1 1 0;justify-content:center;display:inline-flex;align-items:center;gap:6px;padding:8px 12px}
.war-jump-btn:disabled{cursor:not-allowed;opacity:.55}
/* --- V9.10 聚焦页状态机补全：warn ghost / 改档按钮组 / 战利品+历次作战行 --- */
.war-tour-ghost.warn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 6%, transparent)}
.war-tour-ghost.warn .war-tour-ghost-icon{color:color-mix(in srgb, var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)) 62%, #000)}
.war-btn.war-btn-warn{border-color:var(--dsw-alias-state-warn-primary);color:color-mix(in srgb, var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)) 72%, #000);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, var(--dsw-alias-bg-base))}
.war-sub-btns{display:inline-flex;gap:6px;flex-wrap:wrap}
.war-sub-attempts{display:inline-flex;flex-direction:column;gap:6px;min-width:0}
.war-sub-attempts .war-cd-session{width:100%}
/* V9.11 任务列=参谋侧台账：成形卡（任务书挂出前的占位）+ 终局任务书卡调暗 */
.war-forming{border-style:dashed}
.war-forming .war-forming-icon{color:var(--dsw-alias-text-secondary, inherit);font-size:14px;line-height:1}
.war-forming.warn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 6%, transparent)}
.war-forming.warn .war-forming-icon{color:color-mix(in srgb, var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)) 62%, #000)}
.war-card.settled{opacity:.55}
.war-card.settled:hover,.war-card.settled:focus-visible{opacity:.85}
/* V9.11 R2 执行卡实时活动行：呼吸点 + 宿主侧单点动词 */
.war-activity{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-text-secondary, inherit)}
.war-activity-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-business-primary);animation:war-act-pulse 1.6s ease-in-out infinite}
.war-activity-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes war-act-pulse{0%,100%{opacity:.35}50%{opacity:1}}

`

const STYLE_ID = 'data-dsh-plugin-warroom'

export function ensureWarStyles(): void {
  if (document.head.querySelector(`style[${STYLE_ID}]`) !== null) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_ID, '')
  style.textContent = WAR_CSS
  document.head.appendChild(style)
}
