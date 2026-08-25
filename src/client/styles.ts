/**
 * Warroom styles v3.0 — the 两区指挥中心 look (指挥中心 | 战场). One idempotent
 * <style> injection, `war-*` class namespace, colors/fonts from the host's
 * `--dsw-*` design tokens (patch-layer bundles cannot use CSS Modules;
 * quality-tier colors are the one deliberate palette beyond the tokens,
 * mirroring QUALITY_TIERS).
 * @module dsh-plugin-warroom/client/styles
 */

const WAR_CSS = `
.war-root{font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base)}
.war-head{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto}
.war-head-title{font-size:15px;font-weight:600}
.war-head-sub{font-size:12px;color:var(--dsw-alias-label-secondary);flex:1 1 auto}
.war-head-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:0 0 auto}
.war-head-dot.on{background:var(--dsw-alias-state-business-primary)}
.war-skin-btn{padding:2px 10px;line-height:18px;font-size:12px;flex:0 0 auto}
.war-dockpill{display:inline-flex;align-items:center;gap:6px}
.war-dockseg{font-size:11px}
.war-err{font-size:12px;color:var(--dsw-alias-state-error-label)}
.war-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:12px 4px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;margin:6px 0}

/* --- the three-region board (v6: 指挥中心 | 战场 | 战报) ---------------------- */
.war-board{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:2.2fr 1.3fr 2.2fr;gap:0}
.war-zone{display:flex;flex-direction:column;min-height:0;min-width:0}
.war-hq{border-right:2px solid var(--dsw-alias-border-l1)}
.war-field{border-right:2px solid var(--dsw-alias-border-l1)}
.war-zone-head{flex:0 0 auto;display:flex;align-items:baseline;gap:8px;padding:8px 14px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.war-zone-title{font-size:12px;font-weight:700;color:var(--dsw-alias-label-secondary);letter-spacing:.08em}
.war-zone-note{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.war-zone-cols{flex:1 1 auto;min-height:0;display:grid;min-width:0}
.war-hq .war-zone-cols{grid-template-columns:repeat(2,minmax(196px,1fr))}
.war-field .war-zone-cols{grid-template-columns:minmax(220px,1fr)}
.war-report .war-zone-cols{grid-template-columns:repeat(2,minmax(180px,1fr))}
.war-col{display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--dsw-alias-border-l1);padding:0 8px}
.war-col:last-child{border-right:0}
.war-col-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;padding:8px 2px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.war-col-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}
.war-col-count{font-size:11px;line-height:16px;min-width:18px;text-align:center;padding:0 5px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.war-col-body{flex:1 1 auto;overflow-y:auto;padding:8px 2px 16px;display:flex;flex-direction:column;gap:8px}
.war-plus{margin-left:auto;padding:2px 10px;line-height:18px}

/* --- cards ------------------------------------------------------------------ */
.war-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:8px 10px;display:flex;flex-direction:column;gap:6px;transition:border-color .12s ease,transform .12s ease,box-shadow .12s ease,opacity .15s ease}
.war-card.clickable{cursor:pointer}
.war-card.clickable:hover{border-color:var(--dsw-alias-label-secondary);transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.war-card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.war-chip{font-size:11px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}
.war-taskid{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:var(--dsw-font-markdown-code)}
.war-time{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:auto;white-space:nowrap}
.war-ws{font-size:11px;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-markdown-code);word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-brief{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.war-report{font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:6px 10px;white-space:pre-wrap;color:var(--dsw-alias-label-primary)}

/* status chip colors */
.war-chip.st-published{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
.war-chip.st-in_progress,.war-chip.oc-live{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.st-reported,.war-chip.oc-reported{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.war-chip.st-closed,.war-chip.oc-done{color:var(--dsw-alias-state-success-label);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.st-failed,.war-chip.oc-fail{color:var(--dsw-alias-state-error-label);border-color:var(--dsw-alias-state-error-primary)}
.war-chip.pri-high{color:var(--dsw-alias-state-error-label);border-color:var(--dsw-alias-state-error-primary);font-weight:600}
/* command-zone chip colors */
.war-chip.st-draft{color:var(--dsw-alias-label-tertiary)}
.war-chip.st-received,.war-chip.st-talking{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);font-weight:600}
.war-chip.st-approved{color:var(--dsw-alias-state-success-label);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.st-cancelled{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}
/* V5 grade chips (档位账本): L0 直发绿 / L1 呈批蓝 / L2 澄清黄 */
.war-chip.gr-L0{color:var(--dsw-alias-state-success-label);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.gr-L1{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.gr-L2{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
/* V5 分诊理由行（命令详情浮层） */
.war-note{margin-top:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
/* V5-R3 计划卡（命令详情浮层内） */
.war-plan{margin-top:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px}
.war-plan-head{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:4px}
.war-plan-body{font-size:12px;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);max-height:240px;overflow:auto}

/* quality-tier palette (the deliberate exception to --dsw-only) */
.war-chip.q-common{color:var(--dsw-alias-label-secondary)}
.war-chip.q-fine{color:var(--dsw-alias-state-success-label);border-color:var(--dsw-alias-state-success-primary)}
.war-chip.q-rare{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.q-epic{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
.war-chip.q-legendary{color:var(--dsw-alias-state-error-label);border-color:var(--dsw-alias-state-error-primary);font-weight:600}
.war-session-card{border-left:3px solid var(--dsw-alias-border-l2)}
.war-session-card.q-edge-fine{border-left-color:var(--dsw-alias-state-success-primary)}
.war-session-card.q-edge-rare{border-left-color:var(--dsw-alias-state-business-primary)}
.war-session-card.q-edge-epic{border-left-color:var(--dsw-alias-state-warn-primary)}
.war-session-card.q-edge-legendary{border-left-color:var(--dsw-alias-state-error-primary)}

/* dots + the received breathing reminder */
.war-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-label-tertiary)}
.war-dot.received{background:var(--dsw-alias-state-business-primary)}
.war-dot.done{background:var(--dsw-alias-state-success-primary)}
.war-command-card.pulse{border-color:var(--dsw-alias-state-business-primary);animation:war-pulse 1.6s ease-in-out infinite}
@keyframes war-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}50%{box-shadow:0 0 0 3px var(--dsw-alias-state-business-primary)}}
@media (prefers-reduced-motion: reduce){.war-command-card.pulse{animation:none}}
.war-command-text{font-size:12px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.war-command-text.struck{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}

/* --- command lifecycle strip (v6: 命令→任务→执行→战报 全程追踪) -------------- */
.war-life{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-top:2px}
.war-life-stage{display:flex;flex-direction:column;gap:3px;min-width:0}
.war-life-bar{height:3px;border-radius:2px;background:var(--dsw-alias-border-l2);transition:background .2s ease}
.war-life-bar.done{background:var(--dsw-alias-state-success-primary)}
.war-life-bar.now{background:var(--dsw-alias-state-business-primary);animation:war-life-breath 2.4s ease-in-out infinite}
@keyframes war-life-breath{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.war-life-bar.now{animation:none}}
.war-life-label{font-size:10px;line-height:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-life-label.done{color:var(--dsw-alias-label-secondary)}
.war-life-label.now{color:var(--dsw-alias-state-business-primary);font-weight:600}
.war-life-status{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.war-life-status.warn{color:var(--dsw-alias-state-warn-label);font-weight:600}
.war-life-status.err{color:var(--dsw-alias-state-error-label)}

/* lineage chip（任务/会话卡 → 源命令）：可点的回溯入口 */
.war-chip.war-lineage{cursor:pointer}
.war-chip.war-lineage:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}

/* --- V7-① 等你发落收件箱（指挥中心头部聚合队列） ------------------------------- */
.war-inbox{flex:0 0 auto;margin:8px 14px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.war-inbox-head{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.war-inbox-title{font-size:12px;font-weight:700;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}
.war-inbox-count{font-size:11px;line-height:16px;min-width:18px;text-align:center;padding:0 5px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.war-inbox-items{display:flex;flex-direction:column;max-height:138px;overflow-y:auto}
.war-inbox-item{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}
.war-inbox-item:last-child{border-bottom:0}
.war-inbox-item:hover{background:var(--dsw-alias-bg-layer-2)}
.war-inbox-text{flex:1 1 auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-inbox-wait{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:0 0 auto}
.war-inbox-item.tone-warn .war-inbox-wait{color:var(--dsw-alias-state-warn-label);font-weight:600}
.war-inbox-item.tone-err .war-inbox-wait{color:var(--dsw-alias-state-error-label);font-weight:600}
.war-inbox-empty{padding:6px 10px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.war-chip.k-clarify{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.war-chip.k-plan{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
.war-chip.k-review{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.war-chip.k-retry{color:var(--dsw-alias-state-error-label);border-color:var(--dsw-alias-state-error-primary)}

/* --- V7-② 到访摘要横幅（自上次看过以来） --------------------------------------- */
.war-visit{flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 14px 0;padding:6px 10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.war-visit-since{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.war-visit-seg{cursor:pointer;font-size:11px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.war-visit-seg:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}
.war-visit-seg.s-closed{color:var(--dsw-alias-state-success-label);border-color:var(--dsw-alias-state-success-primary)}
.war-visit-seg.s-failed{color:var(--dsw-alias-state-error-label);border-color:var(--dsw-alias-state-error-primary)}
.war-visit-seg.s-pending{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary);font-weight:600}

/* --- V7-③ 族系追踪（悬停高亮 + 聚焦压暗 + 聚焦条） ------------------------------ */
.war-card.war-rel-dim{opacity:.32}
.war-card.war-rel-same{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.war-focus-btn{padding:0 6px;line-height:18px;font-size:12px;flex:0 0 auto}
.war-focusbar{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin:8px 14px 0;padding:5px 10px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px}
.war-focusbar-tag{color:var(--dsw-alias-state-business-primary);font-weight:700;flex:0 0 auto}
.war-focusbar-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}

/* 任务链行（命令详情浮层）：一环一行，点行跳任务卡 */
.war-chain-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);cursor:pointer;transition:border-color .12s ease}
.war-chain-row:hover{border-color:var(--dsw-alias-state-business-primary)}
.war-chain-row .war-title{flex:1 1 auto}
.war-chain-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.war-loot-summary{font-size:11px;color:var(--dsw-alias-state-success-label);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.war-waiting{font-size:11px;color:var(--dsw-alias-label-secondary)}

/* misc card furniture */
.war-lock{font-size:11px;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.war-loot{display:flex;flex-wrap:wrap;gap:6px}
.war-loot-item{font-size:11px;padding:2px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.war-loot-item.tests{color:var(--dsw-alias-state-success-label);border-color:var(--dsw-alias-state-success-primary)}
.war-evi{font-size:11px;display:flex;flex-direction:column;gap:2px;padding:4px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.war-evi .ok{color:var(--dsw-alias-state-success-label)}
.war-evi .bad{color:var(--dsw-alias-state-error-label)}
.war-cron{font-size:11px;color:var(--dsw-alias-state-business-primary)}
.war-fail{font-size:12px;color:var(--dsw-alias-state-error-label);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:6px 10px}
.war-mark{font-size:14px;font-weight:700;line-height:1}
.war-mark.bang{color:var(--dsw-alias-state-warn-label)}
.war-mark.query{color:var(--dsw-alias-state-success-label)}

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

/* --- done-zone day groups + dock home pill (v3) ------------------------------ */
.war-day-group{display:flex;flex-direction:column;gap:8px}
.war-col-actions{margin-left:auto;display:inline-flex;gap:6px}
.war-attach-btn{padding:2px 8px;line-height:18px}
.war-external-card{border-style:dashed}
.war-chip.ext-badge{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary);font-weight:600}
.war-btn.war-detach{padding:1px 8px;font-size:11px;line-height:16px}
.war-attach-input{width:100%;font-family:var(--dsw-font-family);font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px;outline:none;margin-bottom:8px}
.war-attach-input:focus{border-color:var(--dsw-alias-state-business-primary)}
.war-day-head{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;cursor:pointer;padding:4px 2px;font-family:var(--dsw-font-family);text-align:left}
.war-day-head:hover{color:var(--dsw-alias-label-primary)}
.war-day-count{font-size:10px;line-height:14px;min-width:14px;text-align:center;padding:0 4px;border-radius:7px;background:var(--dsw-alias-bg-layer-2)}
.war-day-caret{display:inline-block;transition:transform .12s ease;font-size:9px}
.war-day-group.collapsed .war-day-caret{transform:rotate(-90deg)}
.war-dock-home{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:2px 8px;font-family:var(--dsw-font-family)}
.war-dock-home:hover{border-color:var(--dsw-alias-state-business-primary)}
.war-dock-unread{font-size:11px;color:var(--dsw-alias-state-business-primary);font-weight:600}

/* --- buttons ------------------------------------------------------------------ */
.war-btn{cursor:pointer;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:4px 10px;font-family:var(--dsw-font-family)}
.war-btn.primary{background:var(--dsw-alias-state-business-primary);color:#fff;border-color:transparent}
.war-btn:disabled{opacity:.5;cursor:default}

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
`

const STYLE_ID = 'data-dsh-plugin-warroom'

export function ensureWarStyles(): void {
  if (document.head.querySelector(`style[${STYLE_ID}]`) !== null) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_ID, '')
  style.textContent = WAR_CSS
  document.head.appendChild(style)
}
