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
