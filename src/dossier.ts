/**
 * Per-workspace dossier (履历档案) — v2.0 征召制. One markdown file per bound
 * workspace under `<stateDir>/dossiers/`: campaign history, pitfalls,
 * acceptance-style notes. The HOST writes it from event data when tasks
 * close/fail (never agent self-report); the conscription briefing injects it
 * so a fresh commander arrives already knowing the theatre's history — the
 * "garrison commander with memory" without paying for an idle session.
 * @module dsh-plugin-warroom/dossier
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { normalizeWorkspaceKey } from './rules.ts'
import type { CampaignState } from './types.ts'

/** Filesystem-safe unique slug for a workspace path (name + short hash). */
export function dossierSlug(workspacePath: string): string {
  const base = basename(workspacePath.trim()).replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '')
  const hash = createHash('sha1').update(normalizeWorkspaceKey(workspacePath)).digest('hex').slice(0, 6)
  return `${base === '' ? 'ws' : base}-${hash}`
}

export function dossierPath(stateDir: string, workspacePath: string): string {
  return join(stateDir, 'dossiers', `${dossierSlug(workspacePath)}.md`)
}

const DOSSIER_TEMPLATE = [
  '# 工作区履历档案',
  '',
  '本档案由舰桥维护：任务收官/失败时自动追加一节。征召外勤小队时会随外勤任务简报注入——新任外勤小队应先读档案，避免重蹈覆辙。',
  '',
].join('\n')

/** Read the dossier, initializing the template on first touch. */
export function readDossier(stateDir: string, workspacePath: string): string {
  const file = dossierPath(stateDir, workspacePath)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  mkdirSync(join(stateDir, 'dossiers'), { recursive: true })
  appendFileSync(file, DOSSIER_TEMPLATE, 'utf8')
  return DOSSIER_TEMPLATE
}

/** Append one history section (host-written, from folded event data). */
export function appendDossierEntry(stateDir: string, workspacePath: string, title: string, entry: string, ts: string): void {
  mkdirSync(join(stateDir, 'dossiers'), { recursive: true })
  appendFileSync(dossierPath(stateDir, workspacePath), `\n## ${ts} · ${title}\n\n${entry}\n`, 'utf8')
}

/** The history line for a settled task. Pure. */
export function dossierEntryFor(task: CampaignState): string {
  const loot = task.deliverables.map(d => d.summary).join('；')
  if (task.status === 'closed') {
    return `结果：收官（${task.closedVerdict ?? ''}）。${loot !== '' ? `任务产出：${loot}。` : ''}尝试 ${task.attempts} 次。`
  }
  if (task.status === 'failed') {
    return `结果：失败（重试用尽）。败因：${task.lastError ?? '未记录'}。尝试 ${task.attempts} 次。建议：拆小重发或补充上下文。`
  }
  return `结果：${task.status}。`
}
