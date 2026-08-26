/**
 * Plugin configuration schema (Schemastery).
 * @module dsh-plugin-warroom/config
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
   * 指挥官上限 (v2.0 征召制): maximum concurrently in_progress tasks — each
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
}

/** Schemastery configuration validated at plugin load. */
export const Config: z<Config> = z.object({
  maxUnits: z.natural().max(16).default(6),
  maxAttempts: z.natural().min(1).max(5).default(2),
  maxCommanders: z.natural().min(1).max(8).default(3),
  statePath: z.string().default(''),
  warRoot: z.string().default(''),
  active: z.union(['auto', 'on', 'off'] as const).default('auto'),
  demoWeave: z.boolean().default(false),
})
