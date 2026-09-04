/**
 * English 词典（sd 回流自 stardeck i18n，2026-09-02 定案「支持多语言」）：
 * war/plain 两份源词典的逐键英译（键形与中文词典一一对齐——tests/copy-lang.test.ts
 * 锁死：缺键/错形即 FAIL，不许静默回落）；trek 皮肤 = 军事英典过 EN trek 词表
 * 派生（与中文侧同一机制）。边界：i18n 只覆盖板 UI 措辞——账本与提示词资产
 * （prompts/persona/commanderOrderFor 等 agent 面正典）保持中文单一源，不随语言
 * 切换（那是 agent 的军语，不是舰长的话）。
 * 词面基准：以本仓审计轮正典词表为锚（stardeck 参考版过滤掉本仓未回流特性键）。
 * @module dsh-plugin-stardeck/client/copy-en
 */
import type { WarCopy } from './copy.ts'

/** 军事皮肤（英译）：military flavor。 */
export const enWarCopy: WarCopy = {
  "head": {
    "title": "War Room",
    "subActive": "Command → Task → Operation → Result · Command on the left · Battlefield on the right",
    "subIdle": "Retired (enable via /war)",
    "entrySuffix": "Strategic Task Board (cross-workspace)"
  },
  "loading": {
    "connecting": "Connecting to the War Room…",
    "unreachable": err=>`War Room unreachable: ${err}`
  },
  "time": {
    "justNow": "just now",
    "agoMins": n=>`${n} min ago`,
    "agoHours": n=>`${n} h ago`,
    "waitMins": n=>`${n} min`,
    "waitHours": n=>`${n} h`,
    "waitDays": n=>`${n} d`
  },
  "zones": {
    "tasks": {
      "title": "Tasks",
      "note": "Awaiting · Field Commander · In progress · Unread — unsettled tasks"
    },
    "report": {
      "title": "War Reports",
      "note": "Victories and defeats · Click a card to trace the source command"
    }
  },
  "dispatch": {
    "label": "Command strip (scroll sideways)",
    "addTitle": "Issue a new command (scheduling optional) · Shortcut n",
    "viewMapHint": "Switch to the War Zone — one star per battlefield, campaign rings link generations",
    "viewBackHint": "Back to list view (three-column wall)",
    "segActive": "Active",
    "segSettled": "Settled"
  },
  "pipeHint": "Hover a command card to reveal its lineage pipeline — the ring color is the campaign color",
  "cmdTabsArchivedEmpty": "Archived commands land here. Archive entry is on the command focus page — available once the whole line is settled",
  "commandBand": {
    "title": "Awaiting your orders",
    "quiet": "Nothing to decide — this command is advancing on its own",
    "terminalCancelled": "Cancelled — this command has ended, no further action",
    "terminalSettled": "Settled — the whole line is closed, nothing to do",
    "planHint": "The Staff Officer has submitted a plan; approving delegates it (runs unattended at night too)",
    "planPeek": "Plan text (read before approving)",
    "clarifyHint": "The Staff Officer is waiting for your answer",
    "clarifyBtn": "Enter staff dialogue",
    "reviewHint": "Report verified — awaiting your review to close",
    "reviewBtn": "Review the war report",
    "retryHint": "There was a defeat — your call",
    "retryBtn": "Inspect the failure",
    "scheduledHint": time=>`Scheduled \xB7 auto-fires at ${time} (not relayed to staff before then)`,
    "noGrade": "Not yet triaged",
    "noBattle": "Awaiting a Field Commander",
    "battleLine": n=>`${n} operation${n===1?"":"s"}`,
    "noReport": "No war report yet",
    "evChecks": "checks passed",
    "evTests": (passed,failed)=>`tests ${passed} passed/${failed} failed`
  },
  "settings": {
    "title": "Settings",
    "skinSection": "Skin (wording dictionary)",
    "skinTrek": "Star Trek",
    "skinWar": "Military",
    "skinPlain": "Plain",
    "skinHint": "Changes wording only, never mechanics. More skins in future iterations.",
    "langSection": "Language / 语言",
    "langZh": "中文",
    "langEn": "English",
    "langHint": "UI wording only — ledgers and prompt assets stay in Chinese (agent-side canon).",
    "fontSection": "Font size",
    "fontReset": "Reset",
    "fontHint": "Text only (85%-135%): columns and cards keep their layout; text reflows inside its box.",
    "legendSection": "Legend (symbol reference)",
    "behaviorSection": "Board behavior",
    "hoverFamily": "Hover lineage highlight",
    "hoverFamilyHint": "Hover any card: cards of the same command light up, the rest dim",
    "viewMap": "War Zone view",
    "viewMapHint": "On = war zone as base with task/report pods on top; Off = three-column wall (auto-falls back below 900px)",
    "viewSection": "View",
    "narrowNote": "Window narrower than 900px — the war zone falls back to list; widen to restore",
    "autoScroll": "Auto-scroll on hover",
    "autoScrollHint": "If a highlighted card is out of view, scroll it into sight",
    "connSection": "Connection",
    "connOk": "Live channel online",
    "connDown": "Live channel down (degraded to polling)",
    "refresh": "Refresh now",
    "close": "Close"
  },
  "scheduleChip": {
    "chip": time=>`\u23F0 ${time}`,
    "cardTitle": time=>`Scheduled command: auto-fires at ${time} (not relayed to staff before then)`
  },
  "columns": {
    "commands": {
      "title": "Commands",
      "empty": "Press + to issue the first command"
    },
    "tasks": {
      "title": "Tasks",
      "empty": "Awaiting the Staff Officer to post the first bounty"
    },
    "live": {
      "title": "In operation",
      "empty": "After a command is issued, the Field Commander sessions appear here",
      "resident": " · resident"
    },
    "done": {
      "title": "Completed",
      "empty": "The report zone is empty — victories and defeats both land here"
    },
    "failed": {
      "title": "Failed",
      "empty": "No failed sessions yet"
    }
  },
  "lifecycle": {
    "stages": {
      "command": "Command",
      "task": "Task",
      "battle": "Operation",
      "report": "Report"
    },
    "waitingStaff": "Staff drafting",
    "pendingRelay": "Awaiting staff intake",
    "approvedAwaitingPublish": "Task pending release",
    "waitingClarify": "Awaiting your answer",
    "planPending": "Plan awaiting your approval",
    "formingDrafting": "Drafting",
    "waitingClaim": "Awaiting a Field Commander",
    "attemptN": n=>`Attempt ${n}`,
    "chain": (done,total)=>`Task chain ${done}/${total}`,
    "cancelled": "Cancelled",
    "taskLabel": id=>`Task ${id}`
  },
  "inbox": {
    "title": "Awaiting your orders",
    "empty": "Nothing waiting — every line is running on its own",
    "clarify": "Answer",
    "plan": "Approve",
    "review": "Review",
    "retry": "Retry call",
    "waited": d=>`waiting ${d}`,
    "warnTitle": "Waiting over half an hour",
    "errTitle": "Waiting over two hours — overnight commands will stall here all night",
    "oldest": "longest wait"
  },
  "visit": {
    "since": d=>`Since your last visit (${d})`,
    "firstSeen": "First visit — the board is the whole picture",
    "closed": n=>`settled ${n}`,
    "failed": n=>`defeats ${n}`,
    "commands": n=>`new orders ${n}`,
    "pending": n=>`awaiting you ${n}`
  },
  "trace": {
    "focus": "Focus",
    "focusing": "Focusing:",
    "exitFocus": "Exit focus",
    "focusBtnTitle": "Light up only this command's lineage (its tasks and operation sessions); Esc to exit"
  },
  "preflight": {
    "hint": "Will stall at plan-approval — nobody approves at night",
    "hintTalking": "Answer the Staff Officer first, then approve the plan — both steps before it proceeds; unattended at night it stalls until morning",
    "toDirect": "Switch to direct order",
    "title": "Commands graded L1/L2 wait for your plan approval before proceeding; at night nobody approves and they stall. You can switch to L0 direct release (staff publishes immediately), or keep waiting for your approval."
  },
  "onboard": {
    "title": "War Room · State your intent in one sentence",
    "lead": "You command in plain words; the Staff Officer triages and writes the task brief; a Field Commander does the work in an isolated workspace and returns with evidence and results.",
    "steps": [
      "① Issue a command: one plain sentence about what you want",
      "② It runs itself: simple things execute directly; complex ones get a plan for your approval first",
      "③ Collect: finished work lands in the report zone — click a card for evidence, review, and deliverables"
    ],
    "cta": "＋ Issue the first command"
  },
  "waitHint": {
    "queued": n=>`Queued \u2014 ${n} ahead in the same workspace (mutual exclusion, no parallelism)`,
    "awaitingClaim": "Conscription ready — awaiting a Field Commander",
    "quotaPaused": "Quota recovering — paused; the original session resumes on recovery (no re-dispatch)"
  },
  "actions": {
    "failToast": what=>`${what} didn't take \u2014 the server didn't accept it (state may have changed); refresh and retry shortly`,
    "jumpMissHint": "Session did not jump — it is not in the host directory; open it once from the workspace session list, then jump"
  },
  "legend": {
    "btn": "ⓘ Legend",
    "title": "Board legend — symbols and marks",
    "rows": [
      [
        "●",
        "Status, four tiers: blue = machines working",
        "dot-run"
      ],
      [
        "●",
        "amber = awaiting you",
        "dot-wait"
      ],
      [
        "●",
        "green = well-ended (settled/read)",
        "dot-done"
      ],
      [
        "●",
        "red = defeat (final failure/fuse blown)",
        "dot-fail"
      ],
      [
        "◌",
        "Campaign ring: one ring per battlefield; segments = number of campaigns on it (cross-battlefield continuation starts a new campaign)"
      ],
      [
        "！",
        "New bounty posted, awaiting a Field Commander"
      ],
      [
        "？",
        "War report submitted — awaiting your review"
      ],
      [
        "◎",
        "Focus: light up only this command's lineage (tasks + sessions), Esc to exit"
      ],
      [
        "↩",
        "Traceability chip: click to jump back to the source command's full lifecycle"
      ],
      [
        "⌁",
        "Session-id prefix (Field Commander / externally mounted sessions)"
      ],
      [
        "Breathing outline",
        "Command being received by staff (~15 s), no action needed"
      ],
      [
        "!! / ??",
        "Command prefix markers: !! do it now (L0) · ?? plan first (L2)"
      ],
      [
        "L0/L1/L2",
        "Autonomy grades: direct / plan-approval / clarify"
      ],
      [
        "Four-segment bar",
        "Command→Task→Operation→Report lifecycle progress"
      ],
      [
        "Quality, five tiers",
        "Bounty complexity tiers (chip color varies)"
      ],
      [
        "Yellow/Red wait",
        "Inbox waits over 30 min turn yellow, over 2 h turn red; \"longest wait\" bolded"
      ]
    ]
  },
  "colActions": {
    "attachLabel": "⌁ Mount",
    "attachTitle": "Mount an external session onto the battlefield",
    "newTitle": "New command"
  },
  "taskStatus": {
    "published": "Awaiting · Field Commander",
    "in_progress": "In progress",
    "reported": "Unread",
    "draft": "Draft",
    "failed": "Failed",
    "closed": "Settled"
  },
  "statusMark": {
    "published": {
      "mark": "！",
      "title": "New bounty, awaiting a Field Commander"
    },
    "reported": {
      "mark": "？",
      "title": "War report submitted — awaiting the Sovereign's review"
    }
  },
  "cron": {
    "badge": (cron,when)=>`\u23F3 routine ${cron}${when!==""?` \xB7 next ${when}`:""}`,
    "title": nextRun=>`Routine bounty; missed runs are not made up${nextRun!==null?`; next ${nextRun}`:""}`
  },
  "wsChip": path=>`Workspace ${path}`,
  "depLock": {
    "prefix": "🔒 Dependencies locked:",
    "list": ids=>ids.join(", ")
  },
  "qualityTitle": "Bounty quality (complexity tier)",
  "commandStatus": {
    "draft": {
      "label": "Issued",
      "hint": "Staff receiving (~15 s)"
    },
    "received": {
      "label": "Received",
      "hint": "Staff awaiting your answer: click to enter the dialogue and answer (click the card itself for the full lifecycle)"
    },
    "talking": {
      "label": "In dialogue"
    },
    "approved": {
      "label": "Approved",
      "hint": "Task released; click to view the task card"
    },
    "cancelled": {
      "label": "Cancelled"
    }
  },
  "outcome": {
    "live": {
      "label": "In operation"
    },
    "reported": {
      "label": "Awaiting review"
    },
    "succeeded": {
      "label": "Victory"
    },
    "failed": {
      "label": "Defeat"
    }
  },
  "days": {
    "today": "Today",
    "yesterday": "Yesterday",
    "earlier": "Earlier"
  },
  "taskCard": {
    "highPriority": "High priority",
    "attemptN": n=>`Attempt ${n}`,
    "attemptNTitle": "Attempt count including auto re-dispatches",
    "taskIdTitle": "Task ID (for traceability)",
    "failReason": e=>`Cause of defeat: ${e}`,
    "failTitle": "Retries exhausted — waiting for the Sovereign to have staff re-open the case",
    "handleReview": "Send back · Staff session",
    "handleReviewTitle": "Reject this report — deliver your rework note in the staff session (acceptance uses the close button)",
    "handleRetry": "Issue retry order · Staff session",
    "handleRetryTitle": "Retry authorization is given in the staff session — the board is a read projection; orders go through staff"
  },
  "grade": {
    "L0": "L0 direct",
    "L1": "L1 plan-approval",
    "L2": "L2 clarify"
  },
  "chain": {
    "genBadgeTitle": n=>`This command is generation ${n} of this campaign`,
    "breadcrumbAria": "Campaign lineage: generations link back, each level jumpable",
    "tags": {
      "deepen": "Follow-up · deepen",
      "retry": "Follow-up · retry",
      "pivot": "Follow-up · pivot"
    },
    "continueBtn": "Follow-up order",
    "continueBtnTitle": "Issue a follow-up with this command as the template — the new order takes over the campaign"
  },
  "commandCard": {
    "noQuickAction": "No action needed — the command advances automatically",
    "noQuickCancelled": "Cancelled — this command has ended",
    "noQuickSettled": "Settled — the whole line is closed",
    "pipsTitle": n=>`${n} generations in this campaign \u2014 each dot is one generation; its color is that generation's status`,
    "genOverflow": n=>`Gen ${n}`,
    "pipStatus": {
      "run": "Advancing",
      "wait": "Awaiting you",
      "done": "Well-ended",
      "fail": "Retreat",
      "idle": "Ended without battle"
    },
    "panelAria": n=>`${n} prior generations (the latest is on the dock): up/down to select, Enter to open details`
  },
  "starfield": {
    "aria": "War Zone: one star per battlefield; campaign rings link the generations of the same battlefield; field units orbit the stars",
    "hqOn": "HQ online — wartime state, the master switch is on",
    "hqOff": "Peacetime — HQ lights are off",
    "orbIdle": "Executing",
    "mapLegend": "Blue=running · amber=queued · green=done · red=failed | Planet = workspace (inner = oldest) · segmented ring = front count | rotating dashed ring = in combat · callout readout = troops▸state",
    "mapHintToast": "🪐 More than one battlefield — try the War Zone view (click to enable; toggle anytime in ⚙ settings)",
    "mapHintDismiss": "Dismiss",
    "controls": "Left-drag pan · middle-drag rotate · wheel zoom · double-click or R reset · hover a dot to light its campaign",
    "untraced": "Untraced execution",
    "ungrouped": "Ungrouped",
    "hqName": "HEADQUARTERS",
    "hqTag": "Sovereign · Command core",
    "wzStWait": "Awaiting assault",
    "wzStBattle": "Executing",
    "wzStHeld": "Captured",
    "legendWait": "Awaiting assault",
    "legendBattle": "Executing",
    "legendHeld": "Captured",
    "legendHl": "Focus trail",
    "legendFront": "Campaign ring (segments = campaign count)",
    "hintCmd": "Click a battlefield to see campaigns · drag cards to arrange · V toggles view · M back to list",
    "hint3d": "Left pan · middle rotate · wheel zoom · double-click/R reset · V toggles view · M back to list",
    "toggle3d": "3D view",
    "toggle2d": "2D view",
    "toggleAria": "Toggle view",
    "hqPickerTitle": "Register a workspace as a battlefield",
    "hqPickerHint": "Pick a workspace already established host-side — after registration it enters the war zone as a battlefield",
    "hqPickerRegister": "Register as battlefield",
    "hqPickerRegistered": "Registered",
    "hqPickerEmpty": "No workspaces host-side yet (or the list is not ready)",
    "hqPickerLoadError": "Host workspace list unavailable",
    "hqPickerRegFail": "Registration didn't take — retry shortly",
    "frontBfLabel": "Battlefield:",
    "wzLogSortie": (who,target)=>`${who} sorties \u25B8 ${target}`,
    "wzLogReturn": who=>`${who} returns \xB7 session closed`,
    "hqPickerRegGroup": n=>`Registrable (${n})`,
    "hqPickerDoneGroup": n=>`In the war zone (${n})`,
    "xcardPrefix": "In operation:",
    "footStat": (sq,pl,fr)=>`${sq} squads out \xB7 ${pl} battlefields \xB7 ${fr} campaigns`,
    "kbGroupAria": "Battlefield list (keyboard jumps to campaign panel)",
    "logOrder": "Order issued",
    "logTriumph": "Triumph",
    "logRetreat": "Retreat",
    "logReview": "Report awaiting review",
    "garrisonTitle": (ac,aw,tr,fa)=>`Active ${ac} \xB7 awaiting ${aw} \xB7 triumphs ${tr} \xB7 defeats ${fa}`,
    "garrisonAria": (lb,ac,aw,tr,fa)=>`Battlefield ${lb}: active ${ac}, awaiting ${aw}, triumphs ${tr}, defeats ${fa} \u2014 jump to the nearest source command`,
    "stPlanetActive": "In operation",
    "stPlanetSettled": "Settled",
    "stPlanetFailed": "Has defeats",
    "stPlanetIdle": "Not yet at war",
    "failSuffix": n=>` \xB7${n} defeats`,
    "tacGarrison": n=>`Triumphs ${n}`,
    "sqTag": "Field squadron",
    "targetLabel": "Target battlefield",
    "phaseLabel": "Action",
    "returnHq": "Return → mothership",
    "phOutbound": pct=>`Sortie \xB7 ${pct}%`,
    "phBattle": verb=>`In operation \xB7 ${verb}`,
    "phDeployed": "Awaiting review · on station",
    "phPaused": "Quota paused · standing by",
    "phHolding": "Mustering · awaiting start",
    "phReturn": pct=>`Returning \xB7 ${pct}%`,
    "frontN": n=>`Campaign \xB7 ${n} generations`,
    "viewFront": "Click to view this campaign",
    "hqRow": (pl,sq,tr)=>`Governs ${pl} battlefields \xB7 ${sq} squadrons out \xB7 ${tr} career triumphs`,
    "hqGuideToast": "🪐 Squads are out, but the war zone has no battlefields yet — register a workspace to give them a place (click to register)",
    "emptyWatermark": "The war zone is empty — click HQ to register a workspace as a battlefield"
  },
  "front": {
    "genN": n=>`${n} generations`,
    "taskN": n=>`${n} tasks`,
    "originChip": (bf,title)=>`Continued from ${bf===null?"another battlefield":bf} \xB7 ${title}`,
    "stateLive": "Advancing",
    "stateWaiting": "Awaiting you",
    "stateFailed": "Has defeats",
    "stateSettled": "Settled"
  },
  "commandDetail": {
    "gradeReasonPrefix": "Triage reason: ",
    "gradeTitlePrefix": "Triage grade",
    "confidenceSuffix": pct=>` \xB7 confidence ${pct}%`,
    "regradesNote": n=>` (${n} regrade${n===1?"":"s"} by the Sovereign)`,
    "planTitle": {
      "pending": "Pending",
      "approved": "Approved",
      "rejected": "Rejected"
    },
    "approvePlan": "Approve plan",
    "rejectPlan": "Reject for redraft",
    "planIrreversible": "Approval releases immediately and cannot be recalled; rejection returns it to staff for redraft",
    "regradeTo": label=>`Switch to ${label}`,
    "close": "Close",
    "cancelledReason": r=>`Cancel reason: ${r}`,
    "chainDone": (done,total)=>`${done}/${total} settled`
  },
  "focusPage": {
    "configTitle": "Command issue configuration",
    "layerAria": title=>`Command ${title}`,
    "evidenceTests": (cmd,code,passed,failed)=>`\u2699 ${cmd} \u2192 exit code ${code} (${passed} passed/${failed} failed)`,
    "configTiming": "Issue timing",
    "configTimingNow": t=>`Issue now \xB7 ${t}`,
    "configTimingNext": (cron,next)=>`Scheduled \xB7 cron "${cron}" \xB7 next ${next} (auto-fires once at the time)`,
    "configTimingFired": (cron,at)=>`Scheduled \xB7 cron "${cron}" \xB7 auto-issued at ${at}`,
    "configAutonomy": "Autonomy",
    "configAutonomyAuto": "Staff triage (not overridden)",
    "configText": "Command text",
    "configRegrade": "Regrade",
    "planTitle": "Final plan",
    "planPending": "Planning — the Staff Officer is still writing this plan; enter the task session to ask or add context.",
    "planEnterSession": "Enter task session",
    "taskGhostPlanning": "Planning — click to read the plan awaiting approval",
    "taskGhostApproved": "Plan approved; the task is about to be released — click to read the plan",
    "taskAwaitingPublish": "Task pending release — approved, waiting for staff to post the task card",
    "taskScheduledHint": time=>`\u23F0 Scheduled \u2014 not relayed to staff until ${time}`,
    "taskRelaying": "Relaying to staff — becomes a drafting card upon intake",
    "taskCancelled": "Command cancelled — nothing follows",
    "draftingGhostTitle": "Staff is drafting the task brief",
    "draftingGhostCard": "Staff is drafting the task brief — click for the triage result",
    "triageLabel": "Triage",
    "triagePending": "Staff has not triaged yet",
    "talkingGhostTitle": "Staff awaits your answer",
    "talkingGhostCard": "Staff awaits your answer — click to enter the dialogue",
    "talkingGhostNote": "The task card is waiting for your answer to take shape — answer once in the dialogue and staff can proceed.",
    "talkingEnterBtn": "Enter dialogue and answer",
    "taskBrief": "Task brief",
    "taskAcceptance": "Acceptance criteria",
    "briefMissing": "(staff attached no brief text)",
    "acceptanceMissing": "(not declared)",
    "lootLabel": "Spoils",
    "previewTitle": name=>`Artifact preview \xB7 ${name}`,
    "previewOpen": "Reveal in file manager",
    "previewOpenDone": "Opened in your file manager.",
    "previewOpenFail": "Failed to open the folder (see bridge log).",
    "previewBinary": "Not a text file — use \"Reveal in file manager\" to view it.",
    "previewEmpty": "(empty file)",
    "previewFail": "Failed to load artifact: ",
    "lootFileTitle": "Click to preview this artifact",
    "attemptsSection": "Operation history",
    "battleLive": n=>`${n} operation${n===1?"":"s"} in progress`,
    "battleDone": "Execution finished — no sessions in progress",
    "battleNone": "Not yet started — awaiting a Field Commander to claim the task",
    "reportVerdict": "Closing verdict",
    "reportLatest": "Latest war report",
    "reportNone": "No report yet — the verdict appears here after closing",
    "reportLive": (verb,n,when)=>`Operation in progress \xB7 ${verb} \xB7 attempt ${n} \xB7 since ${when}`,
    "reportQueued": "Troops awaiting orders — live coverage starts once they move",
    "reportSettledSoon": "Previous engagement closed; the staff-submitted report will appear here",
    "taskSessionBtn": "Task session",
    "execSessionBtn": "Operation session",
    "taskSessionHint": "No staff session yet — appears once the command is relayed to staff",
    "execSessionHint": "No operation session yet — appears once a Field Commander claims the task"
  },
  "composer": {
    "title": "Issue a command",
    "lead": "Write your intent in one sentence; staff will triage and arrange execution. The two choices below set how much you delegate and when it starts.",
    "placeholder": "e.g. Upgrade every dependency of projA to the latest; settle only with all tests green",
    "cancel": "Cancel",
    "busy": "Issuing…",
    "submit": "Issue now",
    "submitScheduled": "Schedule",
    "gradeSection": "Autonomy (how much to delegate)",
    "gradeAuto": {
      "name": "Staff triage",
      "hint": "Default. Staff weighs it: small changes go straight, big ones get a plan"
    },
    "gradeL0": {
      "name": "!! Do it now",
      "hint": "Runs to the end without confirmation — for changes you are sure of"
    },
    "gradeL2": {
      "name": "?? Plan first",
      "hint": "Submits a plan for approval before any work — for big moves"
    },
    "scheduleSection": "Issue timing (when it starts)",
    "schedNow": {
      "name": "Now",
      "hint": "Relayed to staff immediately"
    },
    "schedCron": {
      "name": "Scheduled",
      "hint": "Auto-fires at the time (once)"
    },
    "cronLabel": "Trigger time (cron: min hour day month weekday)",
    "cronPlaceholder": "e.g. 0 9 * * * = every day at 9:00",
    "cronError": err=>err,
    "nextRun": t=>`Next trigger: ${t} (auto-fires once)`,
    "failFallback": "Issue failed, please retry.",
    "templatesLabel": "Common commands (click to fill, then edit)",
    "templates": [
      {
        "label": "Weekly digest",
        "text": "Summarize this week: list completed tasks and deliverables, failures and causes, and open issues into a weekly report."
      },
      {
        "label": "Dependency patrol",
        "text": "Inspect this project's dependencies: list upgradable items and known risks with advice; apply and test minor upgrades directly, only report major ones."
      },
      {
        "label": "Test patrol",
        "text": "Run the full test suite and summarize failures and causes; fix small issues you are confident about and re-run to verify, report the rest."
      },
      {
        "label": "Doc sync",
        "text": "Compare recent code changes with README/DESIGN and update clearly outdated descriptions; touch only what is certain, list the uncertain."
      },
      {
        "label": "Code review",
        "text": "Review recent changes in this repo: find potential bugs, missed edge cases and obvious smells; give file location, issue and fix advice per item; change nothing."
      }
    ],
    "planetSection": "Battlefield and campaign (optional): which battlefield does this order land on, and which campaign does it continue?",
    "planetAuto": "Staff decides",
    "planetAutoHint": "Unspecified — staff picks or creates a battlefield per the task's nature",
    "frontSub": "Campaigns on this battlefield:",
    "frontNew": "New campaign",
    "frontNewHint": "Start a new campaign on this battlefield",
    "frontEmpty": "No campaigns on this battlefield yet — a new one will start.",
    "frontLiveSuffix": " ⚡",
    "alarmModes": [
      {
        "id": "once",
        "name": "Once",
        "hint": "Fire once at the given date and time"
      },
      {
        "id": "daily",
        "name": "Daily",
        "hint": "Fire every day at the same time"
      },
      {
        "id": "weekday",
        "name": "Weekdays",
        "hint": "Monday to Friday at this time"
      },
      {
        "id": "weekly",
        "name": "Weekly…",
        "hint": "Pick weekdays; fires at the time"
      }
    ],
    "alarmDateLabel": "Date",
    "alarmTimeLabel": "Time",
    "dowNames": [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun"
    ],
    "alarmAdvanced": "Advanced: write a cron expression directly",
    "pastTime": "The chosen time has passed — pick a future time.",
    "nameSection": "Campaign name (optional)",
    "namePlaceholder": "Defaults to the command text (≤24 chars)",
    "kbdHint": "n new command · Ctrl+Enter submit · Esc close (draft kept)"
  },
  "attach": {
    "title": "Mount session",
    "sub": "Mount an existing session onto the battlefield as an \"external\" card (read-only + jump; the session itself is untouched).",
    "sessionIdPlaceholder": "Session ID (sessionId)",
    "notePlaceholder": "Note (optional, one line: what this thread is doing)",
    "cancel": "Cancel",
    "busy": "Mounting…",
    "submit": "Mount",
    "failFallback": "Mount failed, please retry.",
    "badge": "External",
    "noNote": "(external session without a note)",
    "detach": "Unmount",
    "detachTitle": "Remove this external card from the battlefield (the session itself is untouched)",
    "cardTitle": sessionId=>`Externally mounted session ${sessionId} \u2014 click to enter that session window`
  },
  "session": {
    "attemptN": n=>`Attempt ${n}`,
    "attemptNTitle": "Retry attempt",
    "failReason": e=>`Cause of defeat: ${e}`,
    "attemptFailedNeutral": "This attempt failed — open the review for the full run",
    "waitingReport": "Evidence verified — awaiting the Sovereign's review to close",
    "cardTitle": sessionId=>`Field Commander session ${sessionId} \u2014 click for operation details`
  },
  "detail": {
    "reportPrefix": ts=>`[Report \xB7 ${ts}]`,
    "lineageLabel": "From command",
    "lineageJumpTitle": id=>`From command ${id} \u2014 click to trace the full lifecycle`
  },
  "island": {
    "counts": c=>[c.pending>0?`On it ${c.pending}`:"",c.waiting>0?`Field ${c.waiting}`:"",c.active>0?`Executing ${c.active}`:"",c.failed>0?`Defeats ${c.failed}`:""].filter(x=>x!=="").join(" \xB7 "),
    "countSegs": c=>[c.pending>0?{kind:"pending",label:`On it ${c.pending}`}:null,c.waiting>0?{kind:"waiting",label:`Field ${c.waiting}`}:null,c.active>0?{kind:"active",label:`Executing ${c.active}`}:null,c.failed>0?{kind:"failed",label:`Defeats ${c.failed}`}:null].filter(x=>x!==null),
    "countsScope": "Counts cover all tabs (tabs only switch the three columns)",
    "inboxBadge": n=>`\u2709 ${n}`,
    "visitMini": (closed,failed,commands)=>[closed>0?`\u2713settled ${closed}`:"",failed>0?`\u2715defeats ${failed}`:"",commands>0?`\u271Anew ${commands}`:""].filter(s=>s!=="").join(" \xB7 "),
    "pin": "Pin open (click again to fold)",
    "unpin": "Unpin",
    "expandTitle": "Hover to expand · click to pin",
    "announceInbox": n=>`${n} new item${n===1?"":"s"} awaiting your orders in the War Room`
  },
  "cmdTabs": {
    "active": "Active",
    "settled": "Settled",
    "archived": "Archived",
    "aria": "Status slices",
    "countTitle": (label,n)=>`${label} \xB7 ${n} command${n===1?"":"s"}`
  },
  "archive": {
    "button": "Archive this command",
    "gate": "Archivable only after the whole campaign is settled (victory/defeat/cancel)",
    "confirmTitle": "Archive this command?",
    "irreversible": "Irreversible: related sessions hide from the sidebar (logs kept); the board moves it to Archived.",
    "confirmOk": "Archive",
    "cancel": "Cancel",
    "done": n=>`Archived (${n} session${n===1?"":"s"} filed)`,
    "badge": "Archived"
  },
  "dock": {
    "label": "War Room",
    "titleLine": c=>`Staff ${c.pending} \xB7 Field ${c.waiting} \xB7 executing ${c.active}${c.failed>0?` \xB7 failed ${c.failed}`:""} \u2014 click to return to the War Room`,
    "segLine": c=>`War Room${c.pending>0?` staff ${c.pending}`:""} field ${c.waiting} exec ${c.active}${c.failed>0?` fail ${c.failed}`:""}`,
    "unread": n=>`${n} new`
  }
}

/** 平话皮肤（英译）：engineer-plain tone。 */
export const enPlainCopy: WarCopy = {
  "head": {
    "title": "Workbench",
    "subActive": "Command → Task → Run → Result · Issue on the left · Read results on the right",
    "subIdle": "Disabled (enable via /war)",
    "entrySuffix": "Cross-workspace board"
  },
  "loading": {
    "connecting": "Connecting to the board…",
    "unreachable": err=>`Board unreachable: ${err}`
  },
  "time": {
    "justNow": "just now",
    "agoMins": n=>`${n} min ago`,
    "agoHours": n=>`${n} h ago`,
    "waitMins": n=>`${n} min`,
    "waitHours": n=>`${n} h`,
    "waitDays": n=>`${n} d`
  },
  "zones": {
    "tasks": {
      "title": "Tasks",
      "note": "Unfinished tasks"
    },
    "report": {
      "title": "Results",
      "note": "Done and failed · Click a card to trace the source command"
    }
  },
  "dispatch": {
    "label": "Command strip (scroll sideways)",
    "addTitle": "New command (scheduling optional) · Shortcut n",
    "viewMapHint": "Switch to the project map",
    "viewBackHint": "Back to list view",
    "segActive": "Active",
    "segSettled": "Done"
  },
  "pipeHint": "Hover a card to see same-line connections — the color is the line",
  "cmdTabsArchivedEmpty": "Archived items land here. Archive entry is on the item focus page — available once everything is finished",
  "commandBand": {
    "title": "Awaiting you",
    "quiet": "No action needed — this command is advancing on its own",
    "terminalCancelled": "Cancelled — this command has ended",
    "terminalSettled": "Done — everything finished, nothing to do",
    "planHint": "The Planning Agent has a proposal; approve and it proceeds (runs at night too)",
    "planPeek": "Proposal text (have a look before approving)",
    "clarifyHint": "The Planning Agent is waiting for your reply",
    "clarifyBtn": "Open dialogue",
    "reviewHint": "Result verified — awaiting your review",
    "reviewBtn": "View result",
    "retryHint": "There are failures — your call",
    "retryBtn": "View failures",
    "scheduledHint": time=>`Scheduled \xB7 starts automatically at ${time} (not relayed before then)`,
    "noGrade": "Not triaged yet",
    "noBattle": "Awaiting an executor",
    "battleLine": n=>`Run ${n} time${n===1?"":"s"}`,
    "noReport": "No result yet",
    "evChecks": "checks passed",
    "evTests": (passed,failed)=>`tests ${passed} passed/${failed} failed`
  },
  "settings": {
    "title": "Settings",
    "skinSection": "Skin (wording style)",
    "skinTrek": "Star Trek",
    "skinWar": "Military",
    "skinPlain": "Plain",
    "skinHint": "Changes wording only, never features. More skins later.",
    "langSection": "Language / 语言",
    "langZh": "中文",
    "langEn": "English",
    "langHint": "UI wording only — ledgers and prompt assets stay in Chinese (agent-side canon).",
    "fontSection": "Font size",
    "fontReset": "Reset",
    "fontHint": "Text only (85%-135%): columns and cards keep their layout; text reflows inside its box.",
    "legendSection": "Legend (symbol reference)",
    "behaviorSection": "Board behavior",
    "hoverFamily": "Hover to see related",
    "hoverFamilyHint": "Hovering a card lights up cards of the same command and dims the rest",
    "viewMap": "Project map",
    "viewMapHint": "On = planet map as base; Off = three-column list (falls back automatically on narrow windows)",
    "viewSection": "View",
    "narrowNote": "Window too small — the map falls back to list; it restores on widening",
    "autoScroll": "Auto-scroll into view",
    "autoScrollHint": "If a highlighted card is off-screen, scroll it into view",
    "connSection": "Connection",
    "connOk": "Live connection healthy",
    "connDown": "Live connection lost (switched to polling)",
    "refresh": "Refresh now",
    "close": "Close"
  },
  "scheduleChip": {
    "chip": time=>`\u23F0 ${time}`,
    "cardTitle": time=>`Scheduled command: auto-issued at ${time} (not relayed before then)`
  },
  "columns": {
    "commands": {
      "title": "Commands",
      "empty": "Press + to issue the first command"
    },
    "tasks": {
      "title": "Tasks",
      "empty": "Awaiting the Planning Agent to publish the first task"
    },
    "live": {
      "title": "Running",
      "empty": "After a command is issued, execution sessions appear here",
      "resident": " · resident"
    },
    "done": {
      "title": "Done",
      "empty": "Empty so far — both finished and failed land here"
    },
    "failed": {
      "title": "Failed",
      "empty": "No failed sessions yet"
    }
  },
  "lifecycle": {
    "stages": {
      "command": "Issue",
      "task": "Task",
      "battle": "Run",
      "report": "Result"
    },
    "waitingClarify": "Awaiting your answer",
    "waitingStaff": "Planning Agent drafting",
    "pendingRelay": "Awaiting Planning Agent intake",
    "approvedAwaitingPublish": "Task pending release",
    "planPending": "Proposal awaiting your approval",
    "formingDrafting": "Drafting",
    "waitingClaim": "Awaiting an executor",
    "attemptN": n=>`Attempt ${n}`,
    "chain": (done,total)=>`Task group ${done}/${total}`,
    "cancelled": "Cancelled",
    "taskLabel": id=>`Task ${id}`
  },
  "inbox": {
    "title": "Your queue",
    "empty": "Nothing pending — every task line is running on its own",
    "clarify": "Answer",
    "plan": "Approve",
    "review": "Review",
    "retry": "Handle failure",
    "waited": d=>`waited ${d}`,
    "warnTitle": "Waiting over half an hour",
    "errTitle": "Waiting over two hours — overnight items will stall until morning",
    "oldest": "longest wait"
  },
  "visit": {
    "since": d=>`Since your last visit (${d})`,
    "firstSeen": "First visit — the board is the whole picture",
    "closed": n=>`done ${n}`,
    "failed": n=>`failed ${n}`,
    "commands": n=>`new ${n}`,
    "pending": n=>`pending ${n}`
  },
  "trace": {
    "focus": "Only this",
    "focusing": "Isolated:",
    "exitFocus": "Exit",
    "focusBtnTitle": "Show only this command's tasks and sessions, dim the rest; Esc to exit"
  },
  "preflight": {
    "hint": "Waits for your plan approval — stalls all night if nobody approves",
    "hintTalking": "The Planning Agent is waiting for your reply, and the proposal needs your approval — both steps before it proceeds; left unattended overnight it stalls",
    "toDirect": "Switch to direct execution",
    "title": "Items marked L1/L2 wait for your plan approval before proceeding; at night nobody approves and they stall. You can switch to direct execution (the Planning Agent publishes immediately), or keep waiting for your approval."
  },
  "onboard": {
    "title": "Workbench · State your intent in one sentence",
    "lead": "You command in plain words; the system takes it, breaks it into tasks, runs them in isolated workspaces, and returns with evidence and results.",
    "steps": [
      "① Issue a command: one plain sentence about what you want",
      "② It runs itself: simple things execute directly; complex ones propose a plan for your approval first",
      "③ Collect: finished work lands in Results — click a card for evidence, review, and deliverables"
    ],
    "cta": "＋ Issue the first command"
  },
  "waitHint": {
    "queued": n=>`Queued \u2014 ${n} ahead in the same workspace (no parallel runs)`,
    "awaitingClaim": "Awaiting an executor",
    "quotaPaused": "Quota recovering — paused; the original task resumes on recovery (no restart)"
  },
  "actions": {
    "failToast": what=>`${what} didn't take \u2014 the server declined it (state may have changed); refresh and retry shortly`,
    "jumpMissHint": "Session did not jump — it is not in the host directory; open it once from the workspace session list, then jump"
  },
  "legend": {
    "btn": "ⓘ Legend",
    "title": "Board legend — symbols and marks",
    "rows": [
      [
        "●",
        "Status, four tiers: blue = machines working",
        "dot-run"
      ],
      [
        "●",
        "amber = awaiting you",
        "dot-wait"
      ],
      [
        "●",
        "green = done (read)",
        "dot-done"
      ],
      [
        "●",
        "red = failed (final/fuse blown)",
        "dot-fail"
      ],
      [
        "◌",
        "Ring: multiple rounds of the same project (dot = round number); one color = one line; continuing in another project starts a new line"
      ],
      [
        "！",
        "New task, awaiting an executor"
      ],
      [
        "？",
        "Result submitted, awaiting your review"
      ],
      [
        "◎",
        "Only this: highlight related tasks and sessions, dim the rest, Esc to exit"
      ],
      [
        "↩",
        "Source chip: click to jump back to the source command's details"
      ],
      [
        "⌁",
        "Session-id prefix (executor / externally mounted sessions)"
      ],
      [
        "Breathing outline",
        "New command being received by the Planning Agent (~15 s), no action needed"
      ],
      [
        "!! / ??",
        "Command prefix markers: !! do it now (L0) · ?? plan first (L2)"
      ],
      [
        "L0/L1/L2",
        "Autonomy grades: direct / plan-approval / clarify"
      ],
      [
        "Four-segment bar",
        "Issue→Task→Run→Result progress"
      ],
      [
        "Quality, five tiers",
        "Task complexity tiers (chip color varies)"
      ],
      [
        "Yellow/Red wait",
        "Pending over 30 min turns yellow, over 2 h turns red; \"longest wait\" bolded"
      ]
    ]
  },
  "colActions": {
    "attachLabel": "⌁ Mount",
    "attachTitle": "Mount an external session onto the board",
    "newTitle": "New command"
  },
  "taskStatus": {
    "published": "Awaiting · Executor Agent",
    "in_progress": "Running",
    "reported": "Awaiting review",
    "draft": "Draft",
    "failed": "Failed",
    "closed": "Done"
  },
  "statusMark": {
    "published": {
      "mark": "！",
      "title": "New task, awaiting claim"
    },
    "reported": {
      "mark": "？",
      "title": "Report submitted, awaiting review"
    }
  },
  "cron": {
    "badge": (cron,when)=>`\u23F3 recurring ${cron}${when!==""?` \xB7 next ${when}`:""}`,
    "title": nextRun=>`Recurring task; missed runs are not made up${nextRun!==null?`; next ${nextRun}`:""}`
  },
  "wsChip": path=>`Directory ${path}`,
  "depLock": {
    "prefix": "⏳ Dependencies unfinished:",
    "list": ids=>ids.join(", ")
  },
  "qualityTitle": "Complexity tiers",
  "commandStatus": {
    "draft": {
      "label": "Issued",
      "hint": "Planning Agent receiving (~15 s)"
    },
    "received": {
      "label": "Received",
      "hint": "Planning Agent awaiting your reply: click to enter the dialogue and answer (click the card itself for the full lifecycle)"
    },
    "talking": {
      "label": "In dialogue"
    },
    "approved": {
      "label": "Published",
      "hint": "Task published; click to view the task card"
    },
    "cancelled": {
      "label": "Cancelled"
    }
  },
  "outcome": {
    "live": {
      "label": "Running"
    },
    "reported": {
      "label": "Awaiting review"
    },
    "succeeded": {
      "label": "Done"
    },
    "failed": {
      "label": "Failed"
    }
  },
  "days": {
    "today": "Today",
    "yesterday": "Yesterday",
    "earlier": "Earlier"
  },
  "taskCard": {
    "highPriority": "High priority",
    "attemptN": n=>`Attempt ${n}`,
    "attemptNTitle": "Attempt count including auto re-dispatches",
    "taskIdTitle": "Task ID (for traceability)",
    "failReason": e=>`Failure reason: ${e}`,
    "failTitle": "Retries exhausted — waiting for the Planning Agent to re-open the case",
    "handleReview": "Send back · Planning Agent session",
    "handleReviewTitle": "Reject this report — deliver your rework note in the Planning Agent session (acceptance uses the close button)",
    "handleRetry": "Issue retry order · Planning Agent session",
    "handleRetryTitle": "Retry authorization is given in the Planning Agent session — the board is read-only; orders go through the agent"
  },
  "grade": {
    "L0": "L0 direct",
    "L1": "L1 plan-approval",
    "L2": "L2 clarify"
  },
  "chain": {
    "genBadgeTitle": n=>`This command is follow-up ${n} of the same effort`,
    "breadcrumbAria": "Follow-up chain: past steps, each level viewable",
    "tags": {
      "deepen": "Follow-up · continue",
      "retry": "Follow-up · retry",
      "pivot": "Follow-up · pivot"
    },
    "continueBtn": "Continue this effort",
    "continueBtnTitle": "Issue a follow-up based on this command — the new one continues where it left off"
  },
  "commandCard": {
    "noQuickAction": "No action needed — it advances automatically",
    "noQuickCancelled": "Cancelled — this command has ended",
    "noQuickSettled": "Done — everything finished",
    "pipsTitle": n=>`${n} steps in this follow-up line \u2014 each dot is one step; its color is the step's status`,
    "genOverflow": n=>`Round ${n}`,
    "pipStatus": {
      "run": "Running",
      "wait": "Awaiting you",
      "done": "Done",
      "fail": "Failed",
      "idle": "Cancelled"
    },
    "panelAria": n=>`${n} prior follow-ups (the latest is right below): up/down to select, Enter to view`
  },
  "starfield": {
    "aria": "Project map: one planet per project; running tasks orbit around",
    "hqOn": "Working — HQ lights on",
    "hqOff": "No active item lines right now",
    "orbIdle": "Running",
    "mapLegend": "Blue=working · amber=waiting · green=done · red=failed | Planet = project (inner = oldest) · segmented ring = line count | dashed ring = busy now · callout text = troops and status",
    "mapHintToast": "🪐 More than one project — try the map view (click to open; toggle in ⚙ settings)",
    "mapHintDismiss": "Dismiss",
    "controls": "Left-drag pan · middle-drag orbit · wheel zoom · double-click or R reset · hover a bright dot to see related",
    "untraced": "Not linked to a command yet",
    "ungrouped": "Misc",
    "hqName": "HEADQUARTERS",
    "hqTag": "Me · Control center",
    "wzStWait": "Pending",
    "wzStBattle": "Running",
    "wzStHeld": "Done",
    "legendWait": "Pending",
    "legendBattle": "Running",
    "legendHeld": "Done",
    "legendHl": "Focus trail",
    "legendFront": "Ring = item line (segments = line count)",
    "hintCmd": "Click a project for details · drag cards to arrange · V toggles view · M back to list",
    "hint3d": "Left pan · middle rotate · wheel zoom · double-click/R reset · V toggles view · M back to list",
    "toggle3d": "3D view",
    "toggle2d": "2D view",
    "toggleAria": "Toggle view",
    "hqPickerTitle": "Add a workspace",
    "hqPickerHint": "Pick an existing workspace — added workspaces join the board map",
    "hqPickerRegister": "Add",
    "hqPickerRegistered": "Added",
    "hqPickerEmpty": "No workspaces yet (or the list is not ready)",
    "hqPickerLoadError": "Workspace list unavailable",
    "hqPickerRegFail": "Adding didn't take — retry shortly",
    "frontBfLabel": "Project:",
    "wzLogSortie": (who,target)=>`${who} departs \u25B8 ${target}`,
    "wzLogReturn": who=>`${who} returns \xB7 session ended`,
    "hqPickerRegGroup": n=>`Addable (${n})`,
    "hqPickerDoneGroup": n=>`On the board (${n})`,
    "xcardPrefix": "Running:",
    "footStat": (sq,pl,fr)=>`${sq} running \xB7 ${pl} projects \xB7 ${fr} lines`,
    "kbGroupAria": "Project list (keyboard jumps to item-line panel)",
    "logOrder": "Created",
    "logTriumph": "Done",
    "logRetreat": "Failed",
    "logReview": "Awaiting review",
    "garrisonTitle": (ac,aw,tr,fa)=>`Running ${ac} \xB7 pending ${aw} \xB7 done ${tr} \xB7 failed ${fa}`,
    "garrisonAria": (lb,ac,aw,tr,fa)=>`Project ${lb}: running ${ac}, pending ${aw}, done ${tr}, failed ${fa} \u2014 jump to the nearest source command`,
    "stPlanetActive": "Running",
    "stPlanetSettled": "Done",
    "stPlanetFailed": "Has failures",
    "stPlanetIdle": "Idle",
    "failSuffix": n=>` \xB7${n} failed`,
    "tacGarrison": n=>`Done ${n}`,
    "sqTag": "Operatives",
    "targetLabel": "Target project",
    "phaseLabel": "Status",
    "returnHq": "Return → HQ",
    "phOutbound": pct=>`Departing \xB7 ${pct}%`,
    "phBattle": verb=>`Running \xB7 ${verb}`,
    "phDeployed": "Done · awaiting confirmation",
    "phPaused": "Quota paused · holding",
    "phHolding": "Queued · awaiting start",
    "phReturn": pct=>`Returning \xB7 ${pct}%`,
    "frontN": n=>`Same line \xB7 ${n} rounds`,
    "viewFront": "Open this line",
    "hqRow": (pl,sq,tr)=>`Manages ${pl} projects \xB7 ${sq} operatives out \xB7 ${tr} items done in total`,
    "hqGuideToast": "🪐 Tasks are running, but the map has no planets yet — add a workspace to give them a place (click to add)",
    "emptyWatermark": "The map is empty — click HQ to add a workspace"
  },
  "front": {
    "genN": n=>`${n} rounds`,
    "taskN": n=>`${n} items`,
    "originChip": (bf,title)=>`From ${bf===null?"another project":bf} \xB7 ${title}`,
    "stateLive": "Running",
    "stateWaiting": "Awaiting you",
    "stateFailed": "Has failures",
    "stateSettled": "Done"
  },
  "commandDetail": {
    "gradeReasonPrefix": "Triage reason: ",
    "gradeTitlePrefix": "Triage grade",
    "confidenceSuffix": pct=>` \xB7 confidence ${pct}%`,
    "regradesNote": n=>` (${n} regrade${n===1?"":"s"})`,
    "planTitle": {
      "pending": "Pending",
      "approved": "Approved",
      "rejected": "Rejected"
    },
    "approvePlan": "Approve plan",
    "rejectPlan": "Reject for redraft",
    "planIrreversible": "Approval publishes immediately and cannot be recalled; rejection returns it to the Planning Agent for redraft",
    "regradeTo": label=>`Switch to ${label}`,
    "close": "Close",
    "cancelledReason": r=>`Cancel reason: ${r}`,
    "chainDone": (done,total)=>`${done}/${total} done`
  },
  "focusPage": {
    "configTitle": "Command issue configuration",
    "layerAria": title=>`Command ${title}`,
    "evidenceTests": (cmd,code,passed,failed)=>`\u2699 ${cmd} \u2192 exit code ${code} (${passed} passed/${failed} failed)`,
    "configTiming": "Start time",
    "configTimingNow": t=>`Issue now \xB7 ${t}`,
    "configTimingNext": (cron,next)=>`Scheduled \xB7 cron "${cron}" \xB7 next ${next} (starts automatically, once)`,
    "configTimingFired": (cron,at)=>`Scheduled \xB7 cron "${cron}" \xB7 auto-issued at ${at}`,
    "configAutonomy": "Autonomy",
    "configAutonomyAuto": "Planning Agent decides (not overridden)",
    "configText": "Command text",
    "configRegrade": "Regrade",
    "planTitle": "Final plan",
    "planPending": "Planning — the Planning Agent is still writing this plan; enter the task session to ask or add context.",
    "planEnterSession": "Enter task session",
    "taskGhostPlanning": "Planning — click to read the proposal awaiting approval",
    "taskGhostApproved": "Plan approved; the task is about to be published — click to read the plan",
    "taskAwaitingPublish": "Task pending release — approved, waiting for the Planning Agent to post the task card",
    "taskScheduledHint": time=>`\u23F0 Scheduled \u2014 not relayed until ${time}`,
    "taskRelaying": "Relaying to the Planning Agent — becomes a drafting card upon intake",
    "taskCancelled": "Command cancelled — nothing follows",
    "draftingGhostTitle": "The Planning Agent is writing the task spec",
    "draftingGhostCard": "The Planning Agent is writing the task spec — click for the triage result",
    "triageLabel": "Triage",
    "triagePending": "The Planning Agent has not triaged yet",
    "talkingGhostTitle": "The Planning Agent awaits your answer",
    "talkingGhostCard": "The Planning Agent awaits your answer — click to enter the dialogue",
    "talkingGhostNote": "The task card needs your answer to take shape — say one line in the dialogue and the agent can proceed.",
    "talkingEnterBtn": "Enter dialogue and answer",
    "taskBrief": "Task spec",
    "taskAcceptance": "Acceptance criteria",
    "briefMissing": "(the Planning Agent attached no spec text)",
    "acceptanceMissing": "(not declared)",
    "lootLabel": "Deliverables",
    "previewTitle": name=>`Artifact preview \xB7 ${name}`,
    "previewOpen": "Reveal in file manager",
    "previewOpenDone": "Opened in your file manager.",
    "previewOpenFail": "Failed to open the folder (see bridge log).",
    "previewBinary": "Not a text file — use \"Reveal in file manager\" to view it.",
    "previewEmpty": "(empty file)",
    "previewFail": "Failed to load artifact: ",
    "lootFileTitle": "Click to preview this artifact",
    "attemptsSection": "Run history",
    "battleLive": n=>`${n} run${n===1?"":"s"} in progress`,
    "battleDone": "Execution finished — no sessions in progress",
    "battleNone": "Not started yet — awaiting an Executor Agent to claim the task",
    "reportVerdict": "Final verdict",
    "reportLatest": "Latest report",
    "reportNone": "No report yet — the verdict appears here after closing",
    "reportLive": (verb,n,when)=>`Running \xB7 ${verb} \xB7 attempt ${n} \xB7 since ${when}`,
    "reportQueued": "Awaiting an executor — progress is reported here once they start",
    "reportSettledSoon": "The previous round has ended; the result will be placed here once organized",
    "taskSessionBtn": "Task session",
    "execSessionBtn": "Run session",
    "taskSessionHint": "No Planning Agent session yet — appears once the command is relayed",
    "execSessionHint": "No run session yet — appears once an Executor Agent claims the task"
  },
  "composer": {
    "title": "New command",
    "lead": "Write the outcome you want in one sentence and the Planning Agent takes over. Below, choose how much to delegate and when to start.",
    "placeholder": "e.g. Build me a tiny expense tracker: one line a day, browsable history",
    "cancel": "Cancel",
    "busy": "Issuing…",
    "submit": "Issue now",
    "submitScheduled": "Schedule",
    "gradeSection": "Autonomy",
    "gradeAuto": {
      "name": "Let the agent decide",
      "hint": "Default. Small changes go straight; big ones get a proposal first"
    },
    "gradeL0": {
      "name": "!! Do it now",
      "hint": "Runs to the end without confirmation — for things you are sure of"
    },
    "gradeL2": {
      "name": "?? Plan first",
      "hint": "Proposal first, your nod, then work — for big moves"
    },
    "scheduleSection": "Start time",
    "schedNow": {
      "name": "Right away",
      "hint": "Relayed to the Planning Agent immediately"
    },
    "schedCron": {
      "name": "Scheduled",
      "hint": "Auto-issued at the time (once)"
    },
    "cronLabel": "Trigger time (cron: min hour day month weekday)",
    "cronPlaceholder": "e.g. 0 9 * * * = every day at 9:00",
    "cronError": err=>err,
    "nextRun": t=>`Next trigger: ${t} (auto-issued once)`,
    "failFallback": "Issue failed, please retry.",
    "templatesLabel": "Common commands (click to fill, then edit)",
    "templates": [
      {
        "label": "Weekly digest",
        "text": "Summarize this week: completed items and deliverables, failed ones and causes, open issues — into a weekly report."
      },
      {
        "label": "Dependency check",
        "text": "Inspect this project's dependencies: list upgradable items and known risks with advice; apply and test minor upgrades directly, only report major ones."
      },
      {
        "label": "Test check",
        "text": "Run the full test suite and summarize failures and causes; fix small issues you are confident about and re-run to verify, report the rest."
      },
      {
        "label": "Doc sync",
        "text": "Compare recent code changes with README/DESIGN and update clearly outdated descriptions; touch only what is certain, list the uncertain."
      },
      {
        "label": "Code review",
        "text": "Review recent changes in this repo: find potential bugs, missed edge cases and obvious smells; give file location, issue and fix advice per item; change nothing."
      }
    ],
    "planetSection": "Project and item line (optional): in which project, continuing which line?",
    "planetAuto": "Automatic",
    "planetAutoHint": "Unspecified — the Planning Agent picks or creates a project per the task's nature",
    "frontSub": "Item lines in this project:",
    "frontNew": "New line",
    "frontNewHint": "Start another line in this project",
    "frontEmpty": "No lines in this project yet — a new one will start.",
    "frontLiveSuffix": " ⚡",
    "alarmModes": [
      {
        "id": "once",
        "name": "Once",
        "hint": "Fire once at the given date and time"
      },
      {
        "id": "daily",
        "name": "Daily",
        "hint": "Fire every day at the same time"
      },
      {
        "id": "weekday",
        "name": "Weekdays",
        "hint": "Monday to Friday at this time"
      },
      {
        "id": "weekly",
        "name": "Weekly…",
        "hint": "Pick weekdays; fires at the time"
      }
    ],
    "alarmDateLabel": "Date",
    "alarmTimeLabel": "Time",
    "dowNames": [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun"
    ],
    "alarmAdvanced": "Advanced: write a cron expression directly",
    "pastTime": "The chosen time has passed — pick a future time.",
    "nameSection": "Item line name (optional)",
    "namePlaceholder": "Defaults to the command text (≤24 chars)",
    "kbdHint": "n new command · Ctrl+Enter submit · Esc close (draft kept)"
  },
  "attach": {
    "title": "Mount session",
    "sub": "Mount an existing session onto the board as an \"external\" card (read-only + jump; the session itself is untouched).",
    "sessionIdPlaceholder": "Session ID (sessionId)",
    "notePlaceholder": "Note (optional, one line: what this session is doing)",
    "cancel": "Cancel",
    "busy": "Mounting…",
    "submit": "Mount",
    "failFallback": "Mount failed, please retry.",
    "badge": "External",
    "noNote": "(external session without a note)",
    "detach": "Unmount",
    "detachTitle": "Remove this external card from the board (the session itself is untouched)",
    "cardTitle": sessionId=>`Externally mounted session ${sessionId} \u2014 click to enter that session window`
  },
  "session": {
    "attemptN": n=>`Attempt ${n}`,
    "attemptNTitle": "Retry attempt",
    "failReason": e=>`Failure reason: ${e}`,
    "attemptFailedNeutral": "This attempt failed — open the review for the full run",
    "waitingReport": "Evidence verified — awaiting your review",
    "cardTitle": sessionId=>`Executor session ${sessionId} \u2014 click for details`
  },
  "detail": {
    "reportPrefix": ts=>`[Report \xB7 ${ts}]`,
    "lineageLabel": "From command",
    "lineageJumpTitle": id=>`Source ${id} \u2014 click for details`
  },
  "island": {
    "counts": c=>[c.pending>0?`Planning ${c.pending}`:"",c.waiting>0?`Executor ${c.waiting}`:"",c.active>0?`Running ${c.active}`:"",c.failed>0?`Failed ${c.failed}`:""].filter(x=>x!=="").join(" \xB7 "),
    "countSegs": c=>[c.pending>0?{kind:"pending",label:`Planning ${c.pending}`}:null,c.waiting>0?{kind:"waiting",label:`Executor ${c.waiting}`}:null,c.active>0?{kind:"active",label:`Running ${c.active}`}:null,c.failed>0?{kind:"failed",label:`Failed ${c.failed}`}:null].filter(x=>x!==null),
    "countsScope": "Counts cover the whole board (tabs only switch the three columns)",
    "inboxBadge": n=>`\u2709 ${n}`,
    "visitMini": (closed,failed,commands)=>[closed>0?`\u2713done ${closed}`:"",failed>0?`\u2715failed ${failed}`:"",commands>0?`\uFF0Bnew ${commands}`:""].filter(s=>s!=="").join(" \xB7 "),
    "pin": "Pin open (click again to fold)",
    "unpin": "Unpin",
    "expandTitle": "Hover to expand · click to pin",
    "announceInbox": n=>`${n} new item${n===1?"":"s"} pending on the Workbench`
  },
  "cmdTabs": {
    "active": "Active",
    "settled": "Done",
    "archived": "Archived",
    "aria": "Board slices",
    "countTitle": (label,n)=>`${label} \xB7 ${n}`
  },
  "archive": {
    "button": "Archive this item",
    "gate": "Archivable only after everything ends (done/failed/cancelled)",
    "confirmTitle": "Archive this item?",
    "irreversible": "Irreversible: related sessions hide from the list (records kept); the board moves it to Archived.",
    "confirmOk": "Archive",
    "cancel": "Cancel",
    "done": n=>`Archived (${n} session${n===1?"":"s"} filed)`,
    "badge": "Archived"
  },
  "dock": {
    "label": "Workbench",
    "titleLine": c=>`Planner ${c.pending} \xB7 Executor ${c.waiting} \xB7 running ${c.active}${c.failed>0?` \xB7 failed ${c.failed}`:""} \u2014 click to return to the Workbench`,
    "segLine": c=>`Workbench${c.pending>0?` planner ${c.pending}`:""} executor ${c.waiting} run ${c.active}${c.failed>0?` fail ${c.failed}`:""}`,
    "unread": n=>`${n} new`
  }
}

/** EN trek 词表：军事英典 → 星际迷航英典（与中文侧 TREK_LEXICON 同构的英文对）。 */
export const EN_TREK_LEXICON: ReadonlyArray<readonly [string, string]> = [
  ["War Room", "Bridge"],
  ["battlefield", "planet"],
  ["Battlefield", "Planet"],
  ["War Zone", "Starfield"],
  ["war zone", "starfield"],
  ["Sovereign", "Captain"],
  ["Staff Officer", "First Officer"],
  ["Field Commander", "Away Team"],
  ["operation", "mission"],
  ["Operation", "Mission"],
  ["War Report", "Mission Log"],
  ["war report", "mission log"],
  ["Triumph", "Success"],
  ["triumph", "success"],
  ["Retreat", "Setback"],
  ["sorties", "beams down"],
  ["mothership", "flagship"],
  ["squadron", "away detail"],
]
