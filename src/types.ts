/**
 * Warroom domain types: unit specs (兵种), campaign events, folded campaign
 * state, and the small global war state. Shared by host modules and tests;
 * kept free of any harness imports so the fold/validation logic stays pure.
 * @module dsh-plugin-warroom/types
 */

/** Tool-permission tier for a unit type (agent sandbox_mode, mapped onto dsh toolFilter). */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

/** Where a unit spec came from; project overrides personal overrides builtin (layered precedence). */
export type UnitSource = 'builtin' | 'personal' | 'project'

/** Optional per-troop LLM route (V4-R1): complete pairs
 * only, applied behind the `troop-llm-routing` feature flag. */
export interface UnitRoute {
  readonly provider: string
  readonly model: string
}

/** A 兵种 definition — one agent-definition TOML file. */
export interface UnitSpec {
  /** Stable code name used in war_deploy_unit (e.g. 'recon'). */
  readonly name: string
  /** Human label shown in reports (e.g. '侦察兵'). */
  readonly label: string
  /** One line: when to choose this unit. */
  readonly description: string
  /** developer_instructions — injected as the troop's persona. */
  readonly instructions: string
  /** Permission ceiling; read-only units cannot hold an exclusive front. */
  readonly sandboxMode: SandboxMode
  /** Reserved for V2 out-of-process backends; V1 always spawns in-process. */
  readonly backend: 'in-process'
  readonly route?: UnitRoute
  readonly source: UnitSource
}

/** A deployed troop, folded from the campaign event log. */
export interface UnitRecord {
  readonly childId: string
  readonly unitName: string
  readonly label: string
  readonly mission: string
  readonly front: string
  readonly writes: boolean
  readonly deployedAt: string
  readonly orders: ReadonlyArray<{ ts: string; order: string }>
  lastReport?: string
  recalled?: { reason: string; ts: string }
  settled?: { stopReason: string; ts: string }
}

/** One commander attempt (作战会话) on a task — the unit the board's
 * 进行中/已完成/已失败 columns are made of. `sessionId` is the commander's
 * conversation (claimedBy at claim time); clicking the card opens it. */
export interface AttemptRecord {
  /** Capability token issued at claim (empty for v0.2 legacy claims). */
  readonly id: string
  /** 1-based attempt number. */
  readonly n: number
  /** The commander session that ran (and still owns) this attempt. */
  readonly sessionId: string
  readonly startedAt: string
  endedAt?: string
  /** undefined = still live; 'failed' | 'reported' | 'succeeded' once settled. */
  outcome?: 'failed' | 'reported' | 'succeeded'
}

/** Campaign state derived by folding the append-only event log. */
export interface CampaignState {
  readonly campaignId: string
  intent: string
  readonly startedAt: string
  hqSessionId?: string
  title?: string
  brief?: string
  acceptance?: string
  priority?: 'normal' | 'high'
  /** Bounty rarity (WoW color language); default common. */
  quality?: QualityTier
  /** 前置任务 campaignIds — a bounty unlocks only when all deps are closed. */
  deps?: readonly string[]
  /** Daily-quest cron; absent = one-shot bounty. */
  schedule?: TaskSchedule
  /** How many bounty rounds a cron re-trigger has opened (0 = never re-run). */
  rounds: number
  workspacePath?: string
  status: TaskStatus
  claimedBy?: string
  publishedBy?: string
  /** Capability token of the CURRENT attempt — stale submits are rejected. */
  attempt?: { readonly id: string; readonly n: number }
  /** Attempts started so far (attempt numbers are 1-based). */
  attempts: number
  /** Every attempt ever started, in order — the board's session cards. */
  readonly attemptLog: ReadonlyArray<AttemptRecord>
  /** Last failure reason (shown while failed / during requeue). */
  lastError?: string
  /** Collected loot (出本掉落) accumulated across submissions. */
  readonly deliverables: ReadonlyArray<Deliverable>
  readonly reports: ReadonlyArray<{ ts: string; from: string; text: string; evidence?: SubmissionEvidence }>
  readonly comments: ReadonlyArray<{ ts: string; from: string; text: string }>
  /** V4-R2 direct messages (troop-mailbox flag): logged first, delivered marked. */
  readonly messages: ReadonlyArray<{ messageId: string; ts: string; from: string; to: string; text: string; delivered?: boolean }>
  /** V4-R3 intra-task subtask graph (troop-scheduler flag). */
  readonly subtasks: Map<string, SubtaskRecord>
  closedVerdict?: string
  plan?: string
  readonly units: Map<string, UnitRecord>
}

/** One 队内子任务 (V4-R3) — the commander's work breakdown inside a task.
 * attempt tokens mirror the campaign-level discipline: a stale attemptId on
 * subtask_updated means ownership changed. `blocked` returns the subtask to
 * the open pool with its note kept. */
export interface SubtaskRecord {
  readonly subtaskId: string
  readonly title: string
  readonly detail?: string
  readonly deps: readonly string[]
  status: 'open' | 'in_progress' | 'completed'
  claimedBy?: string
  claimedAt?: string
  updatedAt?: string
  /** Capability token of the CURRENT claim. */
  attempt?: { readonly id: string; readonly n: number }
  attempts: number
  lastNote?: string
  /** V4-R4: owner interrupted but attempt kept (park ≠ revoke). */
  parked?: boolean
}

/** Task lifecycle on the strategic board. `failed` is a terminal-for-humans
 * state: retries already exhausted, the 参谋 must re-file a new bounty. */
export type TaskStatus = 'draft' | 'published' | 'in_progress' | 'reported' | 'failed' | 'closed'

/** Bounty quality tier — the WoW rarity color language for task complexity. */
export type QualityTier = 'common' | 'fine' | 'rare' | 'epic' | 'legendary'

/** Tier registry the UI and the secretary share (label = 悬赏板文案). */
export const QUALITY_TIERS: ReadonlyArray<{ readonly tier: QualityTier; readonly label: string; readonly colorVar: string }> = [
  { tier: 'common', label: '普通', colorVar: '--dsw-alias-label-secondary' },
  { tier: 'fine', label: '精良', colorVar: '--dsw-alias-state-success-label' },
  { tier: 'rare', label: '稀有', colorVar: '--dsw-alias-state-business-primary' },
  { tier: 'epic', label: '史诗', colorVar: '--dsw-alias-state-warn-label' },
  { tier: 'legendary', label: '传说', colorVar: '--dsw-alias-state-danger-label' },
]

/** KillCredit evidence a commander must attach to war_submit — the system
 * verifies, troops never self-certify). */
export interface SubmissionEvidence {
  /** DoD checklist verdicts, one per acceptance item. */
  readonly checks: ReadonlyArray<{ readonly item: string; readonly passed: boolean }>
  /** A test command actually run, with its real exit code. */
  readonly tests?: { readonly command: string; readonly exitCode: number; readonly passed: number; readonly failed: number }
  /** `git diff --stat` style summary line(s). */
  readonly diffstat?: string
  /** Touched file paths. */
  readonly files?: readonly string[]
}

/** A collected loot item shown on the board card (出本掉落). */
export interface Deliverable {
  readonly kind: 'files' | 'tests' | 'diffstat' | 'note'
  readonly summary: string
  readonly detail?: string
  readonly ts: string
}

/** Daily-quest schedule on a bounty. */
export interface TaskSchedule {
  readonly cron: string
  enabled: boolean
  nextRunAt?: string
  lastTriggeredAt?: string
}

/** The append-only event log's entry union (one JSON line each). Fields added
 * in v1.0 are optional so v0.2 logs keep folding unchanged. */
export type WarEvent =
  | { type: 'task_created'; ts: string; campaignId: string; title: string; brief: string; acceptance: string; priority: 'normal' | 'high'; publishedBy?: string; quality?: QualityTier; deps?: string[] }
  | { type: 'task_published'; ts: string; campaignId: string; workspacePath: string; publishedBy?: string }
  | { type: 'task_claimed'; ts: string; campaignId: string; claimedBy: string; attemptId?: string; attempt?: number }
  | { type: 'task_submitted'; ts: string; campaignId: string; report: string; from: string; evidence?: SubmissionEvidence; deliverables?: Deliverable[] }
  | { type: 'task_commented'; ts: string; campaignId: string; comment: string; from: string }
  | { type: 'task_closed'; ts: string; campaignId: string; verdict: string }
  | { type: 'task_attempt_failed'; ts: string; campaignId: string; reason: string; from?: string }
  | { type: 'task_requeued'; ts: string; campaignId: string; reason: string }
  | { type: 'task_failed'; ts: string; campaignId: string; reason: string }
  | { type: 'task_scheduled'; ts: string; campaignId: string; cron: string; enabled: boolean }
  | { type: 'task_schedule_triggered'; ts: string; campaignId: string; skipped: boolean; note?: string }
  | { type: 'campaign_started'; ts: string; campaignId: string; intent: string; hqSessionId?: string }
  | { type: 'plan_recorded'; ts: string; campaignId: string; plan: string }
  | { type: 'unit_deployed'; ts: string; campaignId: string; childId: string; unitName: string; label: string; mission: string; front: string; writes: boolean }
  | { type: 'order_sent'; ts: string; campaignId: string; childId: string; order: string }
  | { type: 'report_received'; ts: string; campaignId: string; childId: string; summary: string }
  | { type: 'unit_recalled'; ts: string; campaignId: string; childId: string; reason: string }
  | { type: 'unit_settled'; ts: string; campaignId: string; childId: string; stopReason: string }
  | { type: 'campaign_closed'; ts: string; campaignId: string; outcome: string }
  /** V4-R2 direct messaging (troop-mailbox flag): durable first, delivery retried. */
  | { type: 'message_logged'; ts: string; campaignId: string; messageId: string; from: string; to: string; text: string }
  | { type: 'message_delivered'; ts: string; campaignId: string; messageId: string }
  /** V4-R3 intra-task subtask graph (troop-scheduler flag): attempt tokens,
   * dependency gating, blocked-back-to-pool semantics. */
  | { type: 'subtask_created'; ts: string; campaignId: string; subtaskId: string; title: string; detail?: string; deps: string[] }
  | { type: 'subtask_claimed'; ts: string; campaignId: string; subtaskId: string; claimedBy: string; attemptId: string; attempt: number }
  | { type: 'subtask_updated'; ts: string; campaignId: string; subtaskId: string; attemptId: string; status: 'in_progress' | 'completed' | 'blocked'; note?: string }
  /** V4-R4 (troop-park flag): an interrupted owner KEEPS its attempt and
   * token — parked, not revoked. Any valid token-carrying update unparks. */
  | { type: 'subtask_parked'; ts: string; campaignId: string; subtaskId: string; reason?: string }

/** The tiny global war state. Task history lives in the append-only event
 * logs; only this pointer state is a plain JSON file. */
export interface WarGlobalState {
  version: 2
  /** War mode on/off — gates the secretary persona and the war_* tool surface. */
  active: boolean
  /** Session id of the 参谋部 (the conversation where /war first ran). */
  hqSessionId?: string
  /** The single durable commander child-session id (lazy-spawned on first publish). */
  commanderChildId?: string
}

/** Live descendant entry from ctx.subagents.listDescendants (structural slice). */
export interface DescendantFace {
  readonly kind: string
  readonly id: string
  readonly activity?: 'running' | 'inactive'
  readonly mode?: 'one-shot' | 'continuable'
  readonly label?: string
  readonly parentId?: string
  readonly depth?: number
}
