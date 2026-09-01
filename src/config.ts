/**
 * Plugin configuration schema (Schemastery).
 * @module dsh-plugin-stardeck/config
 */

import z from '@deepseek-ai/schemastery'

/** Resolved plugin configuration. */
export interface Config {
  /**
   * 编制上限: maximum simultaneously active troops per campaign
   * Default 6.
   */
  maxUnits: number
  /**
   * 重试上限: attempts per bounty before it lands in `failed` (below the cap
   * a failure auto-requeues back onto the board). Default 2.
   */
  maxAttempts: number
  /**
   * 外勤小队上限 (v2.0 征召制): maximum concurrently in_progress tasks — each
   * holds one conscripted commander. Same-workspace tasks always serialize
   * regardless (the workspace mutex); this caps cross-workspace parallelism.
   * Default 3.
   */
  maxCommanders: number
  /**
   * Absolute path of the global war-state JSON file. Empty resolves to
   * `$DSH_HOME/warroom-plugin/state.json` (`~/.dsh` when `DSH_HOME` is unset);
   * task event logs live in a `campaigns/` sibling directory.
   */
  statePath: string
  /**
   * War root: parent of all per-task workspaces. Empty resolves to
   * `<server cwd>/.warroom` — keep it inside the dsh web process's cwd so
   * the workspace-write sandbox covers troop writes.
   */
  warRoot: string
  /**
   * Boot-time override of war mode for headless compositions: `on`/`off`
   * force at every load; `auto` (default) follows the persisted activation.
   */
  active: 'auto' | 'on' | 'off'
  /**
   * 演示织换（smoke/playground overlay 专用，缺省 false）：开机时把播种器写进
   * 事件流的假会话号按 `.demo-sessions.json` manifest 换成宿主真会话——演示板
   * 上所有「直跳原生会话」的点击才有着落。生产配置绝不开。
   */
  demoWeave: boolean
  /**
   * 装配层附加显式开旗（逗号分隔，缺省空）：overlay 自带考题旗用——如 smoke
   * overlay 开 `staff-auto-close` 让 e2e 考题继续覆盖自动收官机制（该旗默认
   * OFF——舰长令 2026-09-01 强制人工验收）。env 的 `!name` 仍可压掉它。
   */
  extraFeatures: string
}

/** Schemastery configuration validated at plugin load. */
export const Config: z<Config> = z.object({
  maxUnits: z.natural().max(16).default(6),
  maxAttempts: z.natural().min(1).max(5).default(2),
  maxCommanders: z.natural().min(1).max(8).default(3),
  statePath: z.string().default(''),
  warRoot: z.string().default(''),
  /** V18 大副自建工作区的指定默认目录（空=<warRoot 同级 warroom-workspaces/>）。 */
  workspaceRoot: z.string().default(''),
  active: z.union(['auto', 'on', 'off'] as const).default('auto'),
  demoWeave: z.boolean().default(false),
  extraFeatures: z.string().default(''),
})
