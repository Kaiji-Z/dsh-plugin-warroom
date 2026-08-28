/**
 * V5-R4 配额自愈（flag quota-recovery）：插件熔断正管（SPEC §0 定案）。
 *
 * 检测（R1 定案④）：`ctx.on('agent/error')` 事件 + `HarnessError.code`
 * provider 中性码（QUOTA 等，官方要求 route on code 不解析 message）。
 * 宿主面插件 ctx 能否收到该事件 = R5 实弹定案项；收不到则降级为纯主动
 * 探测（fuse 轮询）。
 *
 * 语义红线（SPEC §5）：不烧 maxAttempts、不换令牌、原地续作——配额是
 * 环境问题不是任务失败。全局 `quotaBlocked {since,code}`（flag on 才写）
 * + 在役任务逐个 `task_paused_quota`（fold 只翻 quotaPaused 位，不动
 * status/attempt）；恢复探测通过 → `task_resumed_quota` + followup 原会话
 * 「继续任务」（外勤任务简报牌/attempt 原样保留）。
 *
 * 探测本身花配额：probe 是一次近零 token 的 1 轮 prompt（专用探针会话，
 * 复用不新建），节奏 5min 起步指数退避（上限 30min）。
 * @module dsh-plugin-warroom/quota
 */

import { appendEvent, listCampaignIds, loadCampaign } from './events.ts'
import type { SessionsApiFace } from './relay.ts'
import type { WarStore } from './state.ts'

/** R1 定案④：错误分类器——只认 code，绝不解析 message（宿主官方契约）。 */
export function isQuotaError(error: unknown): boolean {
  const e = error as { code?: unknown; name?: unknown } | undefined
  if (typeof e?.code === 'string') return e.code === 'QUOTA'
  // 防御：宿主某层把 code 折进 name（形状漂移容错，非 message 解析）。
  return typeof e?.name === 'string' && e.name === 'QUOTA'
}

export interface QuotaDeps {
  stateDir: string
  store: WarStore
  /** 惰性 sessions 面（探测调用 + 恢复续作提示）。 */
  sessions(): SessionsApiFace | undefined
  /** 探针会话号（index 装配时 lazily 建一次；复用不新建）。 */
  probeSessionId(): string | undefined
}

export interface QuotaFuse {
  /** agent/error 事件入口（宿主面可收时即被动检测）。 */
  onAgentError(error: unknown): void
  /** 主动探测：近零成本 1 轮 prompt。返回 'blocked' | 'open' | 'unknown'。 */
  probe(): Promise<'blocked' | 'open' | 'unknown'>
  /** 熔断标记：全局 flag + 在役任务逐个 paused（幂等——已熔断为 no-op）。 */
  markBlocked(code: string): void
  /** 恢复：清全局标记 + paused 任务逐个 resume + 原会话续作提示。 */
  markResumed(): Promise<void>
  /** 是否处于熔断（读全局标记）。 */
  isBlocked(): boolean
}

export function createQuotaFuse(deps: QuotaDeps): QuotaFuse {
  const pauseAll = (): void => {
    for (const id of listCampaignIds(deps.stateDir)) {
      try {
        const task = loadCampaign(deps.stateDir, id)
        if (task.status === 'in_progress' && task.quotaPaused !== true) {
          appendEvent(deps.stateDir, { type: 'task_paused_quota', ts: new Date().toISOString(), campaignId: id })
        }
      } catch {
        // 一个坏日志不拖垮熔断扫描。
      }
    }
  }
  return {
    onAgentError(error) {
      if (isQuotaError(error)) this.markBlocked('QUOTA')
    },
    async probe() {
      const sessions = deps.sessions()
      const sessionId = deps.probeSessionId()
      if (sessions === undefined || sessionId === undefined) return 'unknown'
      try {
        const asked = await sessions.prompt({
          rpcId: `warroom-quota-probe-${Date.now()}`,
          payload: { sessionId, mode: 'queue', content: [{ type: 'text', text: 'ping（配额探测，请只回 pong）' }] },
        })
        if (asked.result.ok) return 'open'
        const code = asked.result.error.code
        return code.toLowerCase().includes('quota') || code.toLowerCase().includes('insufficient') ? 'blocked' : 'unknown'
      } catch {
        return 'unknown'
      }
    },
    markBlocked(code) {
      const war = deps.store.get()
      if (war.quotaBlocked !== undefined) return // 幂等。
      war.quotaBlocked = { since: new Date().toISOString(), code }
      deps.store.save()
      pauseAll()
    },
    async markResumed() {
      const war = deps.store.get()
      if (war.quotaBlocked === undefined) return
      delete war.quotaBlocked
      deps.store.save()
      const sessions = deps.sessions()
      for (const id of listCampaignIds(deps.stateDir)) {
        let task
        try {
          task = loadCampaign(deps.stateDir, id)
        } catch {
          continue
        }
        if (task.status !== 'in_progress' || task.quotaPaused !== true) continue
        appendEvent(deps.stateDir, { type: 'task_resumed_quota', ts: new Date().toISOString(), campaignId: id })
        // 原地续作：把「配额已恢复」投回外勤小队会话（attempt/令牌原样）。
        if (sessions !== undefined && task.claimedBy !== undefined) {
          try {
            await sessions.prompt({
              rpcId: `warroom-quota-resume-${id}-${Date.now()}`,
              payload: {
                sessionId: task.claimedBy, mode: 'queue',
                content: [{ type: 'text', text: `【系统】配额已恢复：任务 ${id}「${task.title ?? ''}」原尝试令牌仍然有效，请原地继续（勿重新 war_claim）。` }],
              },
            })
          } catch {
            // 续作投递失败——外勤小队会话常驻，goal/巡检会再推。
          }
        }
      }
    },
    isBlocked() {
      return deps.store.get().quotaBlocked !== undefined
    },
  }
}

/** 退避节奏：5min 起步 ×2，上限 30min（探测自身花配额——节奏必须保守）。 */
export function probeBackoffMs(attempt: number): number {
  return Math.min(5 * 60_000 * 2 ** attempt, 30 * 60_000)
}
