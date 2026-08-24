/**
 * V5-R4 参谋唤醒管线（flag staff-wake）：分级推 + 去抖。
 *
 * 分级（SPEC §0）：reported/failed 推（有判定/重派要参谋跟）；普通进展
 * （claim/deploy/progress）不推。去抖：同任务同类别在窗口内（默认 30s）
 * 的重复唤醒合并（丢重放——战报本质一条，迟到的重复不需要再吵醒参谋）。
 *
 * 唤醒目标 = 拥有该任务的命令卡之参谋会话（secretarySessionId），兜底
 * 全局 HQ 会话；都没有则记 ledger 说明跳过（可审计，不静默）。成功投递
 * 落 `staff_woken` 账本事件（崩溃恢复：reported/failed 未醒的任务由巡检
 * sweep 补推——事件晚于最近一次结算才算已醒）。提示词带板摘要注入
 * （C 轻版：在役 + 近期结局）——防参谋失忆重复立案。
 * @module dsh-plugin-warroom/wake
 */

import { appendEvent, listCampaignIds, loadCampaign, readEvents } from './events.ts'
import { loadDirectives } from './directives.ts'
import type { SessionsApiFace } from './relay.ts'

/** The wake engine's wiring. */
export interface WakeDeps {
  stateDir: string
  /** 惰性取 sessions 面（apiProxy 晚绑定——与命令引信同一形态）。 */
  sessions(): SessionsApiFace | undefined
  /** HQ 兜底会话（v2 遗留参谋部）。 */
  hqSessionId(): string | undefined
  /** 可注入时钟（测试去抖窗口）。 */
  now(): number
}

/** 板摘要（C 轻版上下文注入）：在役 + 近期结局，一段可嵌提示词的文字。纯函数。 */
export function boardDigest(stateDir: string, maxRows = 6): string {
  const active: string[] = []
  const settled: string[] = []
  for (const id of listCampaignIds(stateDir)) {
    let task
    try {
      task = loadCampaign(stateDir, id)
    } catch {
      continue
    }
    const title = (task.title ?? task.intent ?? '').slice(0, 18)
    if (task.status === 'in_progress' || task.status === 'published') {
      active.push(`${id}「${title}」${task.status === 'in_progress' ? '进行中' : '待领取'}`)
    } else if (task.status === 'closed' || task.status === 'failed') {
      settled.push(`${id}「${title}」${task.status === 'closed' ? '收官' : '失败'}`)
    }
  }
  const lines = ['【板摘要】']
  lines.push(active.length > 0 ? `在役 ${active.length}：${active.slice(0, maxRows).join('；')}` : '当前无在役任务。')
  if (settled.length > 0) lines.push(`近期结局 ${settled.length}：${settled.slice(-maxRows).join('；')}`)
  return lines.join('\n')
}

/** 唤醒提示词：战报 + 板摘要 + 档位纪律。纯函数。 */
export function wakeMessageFor(input: { taskId: string; title: string; kind: 'reported' | 'failed' | 'closed'; detail: string }, digest: string): string {
  const head = input.kind === 'reported'
    ? `【战报】任务 ${input.taskId}「${input.title}」已提交汇报，等你的下一步判定`
    : input.kind === 'failed'
      ? `【战报】任务 ${input.taskId}「${input.title}」尝试失败`
      : `【战报】任务 ${input.taskId}「${input.title}」已收官`
  return `${head}：
${input.detail}

${digest}
参谋：按分诊档位跟下一步（L0 全绿自动收官已由系统判定；存疑进会话复核；失败按重派/重新立案处置）。这是系统唤醒，无需回话除非要主动做事。`
}

export interface WakeEngine {
  /** 分级唤醒入口（tools 结算点调用）。去抖窗口内同任务同类别 → 合并跳过。 */
  wake(taskId: string, kind: 'reported' | 'failed', detail: string): void
  /** 巡检补推：reported/failed 但账本无对应 staff_woken 的任务（崩溃恢复）。 */
  sweep(): void
}

/** 内部：找到任务归属的参谋会话（命令卡 > HQ 兜底）。 */
function staffSessionFor(stateDir: string, taskId: string, hq: string | undefined): { sessionId: string; via: 'command' | 'hq' } | undefined {
  const directive = loadDirectives(stateDir).find(d => d.taskId === taskId && d.secretarySessionId !== undefined)
  if (directive?.secretarySessionId !== undefined) return { sessionId: directive.secretarySessionId, via: 'command' }
  if (hq !== undefined) return { sessionId: hq, via: 'hq' }
  return undefined
}

/** 造唤醒引擎（index 装配；纯逻辑可测——sessions 面由 deps 惰性给）。 */
export function createWakeEngine(deps: WakeDeps, opts: { windowMs?: number } = {}): WakeEngine {
  const windowMs = opts.windowMs ?? 30_000
  const lastWake = new Map<string, number>()
  /** 该任务自最近一次结算以来是否已醒（staff_woken 晚于最近 submitted/failed）。 */
  const wokenSinceLastSettle = (taskId: string): { woken: boolean; kind?: 'reported' | 'failed'; summary: string } => {
    let woken = false
    let kind: 'reported' | 'failed' | undefined
    let summary = ''
    for (const e of readEvents(deps.stateDir, taskId)) {
      if (e.type === 'task_submitted') { woken = false; kind = undefined; summary = e.report.slice(0, 200) }
      if (e.type === 'task_failed') { woken = false; kind = undefined; summary = e.reason.slice(0, 200) }
      if (e.type === 'staff_woken') { woken = true; kind = e.kind }
    }
    return { woken, kind, summary }
  }
  const deliver = (taskId: string, kind: 'reported' | 'failed', detail: string): void => {
    void (async () => {
      try {
        const sessions = deps.sessions()
        if (sessions === undefined) return // 面未绑定——sweep 补推。
        const task = loadCampaign(deps.stateDir, taskId)
        const target = staffSessionFor(deps.stateDir, taskId, deps.hqSessionId())
        if (target === undefined) {
          appendEvent(deps.stateDir, { type: 'staff_woken', ts: new Date().toISOString(), campaignId: taskId, kind, sessionId: '', note: 'no staff session (command without secretary / no HQ)' })
          return
        }
        const text = wakeMessageFor({ taskId, title: task.title ?? task.intent ?? '', kind, detail }, boardDigest(deps.stateDir))
        const prompted = await sessions.prompt({
          rpcId: `warroom-wake-${taskId}-${deps.now()}`,
          payload: { sessionId: target.sessionId, mode: 'queue', content: [{ type: 'text', text }] },
        })
        appendEvent(deps.stateDir, {
          type: 'staff_woken', ts: new Date().toISOString(), campaignId: taskId, kind,
          sessionId: prompted.result.ok ? target.sessionId : '',
          ...(prompted.result.ok ? {} : { note: `prompt failed: ${prompted.result.error.code}` }),
        })
      } catch (err) {
        try {
          appendEvent(deps.stateDir, { type: 'staff_woken', ts: new Date().toISOString(), campaignId: taskId, kind, sessionId: '', note: `error: ${err instanceof Error ? err.message : String(err)}` })
        } catch {
          // 账本写失败不再传播。
        }
      }
    })()
  }
  return {
    wake(taskId, kind, detail) {
      const now = deps.now()
      const key = `${taskId}:${kind}`
      const last = lastWake.get(key)
      if (last !== undefined && now - last < windowMs) return // 去抖：窗口内合并。
      lastWake.set(key, now)
      deliver(taskId, kind, detail)
    },
    sweep() {
      try {
        for (const id of listCampaignIds(deps.stateDir)) {
          let task
          try {
            task = loadCampaign(deps.stateDir, id)
          } catch {
            continue
          }
          if (task.status !== 'reported' && task.status !== 'failed') continue
          const state = wokenSinceLastSettle(id)
          if (state.woken && state.kind === (task.status === 'reported' ? 'reported' : 'failed')) continue
          this.wake(id, task.status === 'reported' ? 'reported' : 'failed', state.summary)
        }
      } catch {
        // 巡检永不抛。
      }
    },
  }
}
