/**
 * Feature flags (VERIFICATION.md §8.3, P0-3). The closed-loop SOP demands every
 * new feature ship behind a flag whose OFF state is byte-identical to the
 * pre-change behavior — so the same regression suite can run flag=on/off and
 * diff what changed.
 *
 * Discipline:
 * - Flags only ever ENABLE behavior; absence from the env means OFF.
 * - OFF must equal the old code path exactly — no "off but slightly new".
 * - A flag graduates (flag deleted, behavior unconditional) only after the
 *   feature's regression + supervisor thresholds hold (§6 DoD).
 *
 * Read once at startup (or per-call in tests) — never hot-reloaded.
 * @module dsh-plugin-warroom/flags
 */

/** A frozen name → enabled map. Unknown names are simply absent (falsy). */
export type FeatureFlags = Readonly<Record<string, boolean>>

export const FEATURE_FLAGS_ENV = 'WARROOM_FEATURES'

/**
 * Parse the `WARROOM_FEATURES` environment variable: a comma-separated flag
 * name list (`WARROOM_FEATURES=thread-paging,button-relay`). Empty/unset →
 * all flags OFF. Whitespace around names is tolerated; empty segments are
 * dropped; duplicates collapse.
 */
export function readFeatureFlags(env: Record<string, string | undefined> = process.env): FeatureFlags {
  const raw = env[FEATURE_FLAGS_ENV] ?? ''
  const flags: Record<string, boolean> = {}
  for (const part of raw.split(',')) {
    const name = part.trim()
    if (name !== '') flags[name] = true
  }
  return flags
}

/** The gate check: false unless the flag was explicitly enabled. */
export function featureEnabled(flags: FeatureFlags, name: string): boolean {
  return flags[name] === true
}

/**
 * 开发期政策（2026-08-25 舰长定调）：**全部已交付特性旗默认 ON**——「我们还在
 * 开发期，等正式版发布了再在新功能开发时用 flag 模式」。因此运行面默认即全量
 * 行为；`v5-spike` 是运维探针不是特性，仍 opt-in（默认 off）。
 *
 * **例外（舰长令 2026-09-01）：`staff-auto-close` 默认 OFF**——所有回报强制
 * 人工验收，KillCredit 只做机械复核不再自动收官。机制保留为 opt-in 能力
 * （`WARROOM_FEATURES=staff-auto-close` 或 overlay 的 `extraFeatures`），
 * e2e 考题环境（cordis.smoke.yml）用它继续覆盖收官机制本身。
 *
 * `readFeatureFlags` 保持纯显式语义（单测用它精确控旗，不受本政策影响）；
 * 插件装配走 `runtimeFlags`（默认开 + env/extraFeatures 覆盖）。
 */
export const DEFAULT_ON_FLAGS: readonly string[] = [
  // V4 四旗
  'troop-llm-routing', 'troop-mailbox', 'troop-scheduler', 'troop-park',
  // V5 六旗（staff-auto-close 除外——舰长令 2026-09-01 强制人工验收，见上注）
  'staff-triage', 'staff-plan', 'staff-goal', 'staff-wake', 'quota-recovery',
  // V6
  'staff-decompose',
]

/**
 * Runtime flag set: DEFAULT_ON 为底，`WARROOM_FEATURES` 覆盖——`name` 显式开
 * （探针旗如 v5-spike 仍走这里），`!name` 显式关（回归对照/临时熔断用）。
 * `extra` 是装配层的附加显式开清单（config.extraFeatures，逗号分隔——overlay
 * 自带考题旗用，免环境变量记忆）；env 的 `!name` 仍可压掉它（env 最后解析）。
 */
export function runtimeFlags(env: Record<string, string | undefined> = process.env, extra = ''): FeatureFlags {
  const flags: Record<string, boolean> = {}
  for (const name of DEFAULT_ON_FLAGS) flags[name] = true
  const raw = [extra, env[FEATURE_FLAGS_ENV] ?? ''].filter(x => x !== '').join(',')
  for (const part of raw.split(',')) {
    const name = part.trim()
    if (name === '') continue
    if (name.startsWith('!')) flags[name.slice(1)] = false
    else flags[name] = true
  }
  return flags
}
