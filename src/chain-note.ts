/**
 * V15 续接闭环（V13.1 收尾）：战线知识连续性——把上代 CampaignState 里躺着的数据
 * （任务回报/任务产出/证据文件路径/验收结论/败因）折成续接代可读的链档案。
 *
 * 尺寸纪律（dossier 无上限的教训）：大副版 cap 1500 字（最近 3 代详情 + 更老一代
 * 一行式）；外勤小队征召版 cap 600 字；pivot 直插版 cap 400 字。
 * 纯函数：数据由调用方预载（relay 的 campaignOf 缓存 / tools 的 loadCampaign），
 * 本模块不做 IO——单测直接喂结构。
 * @module dsh-plugin-warroom/chain-note
 */
import type { CampaignState } from './types.ts'

/** 一代祖先的预载切片：命令原文 + 该代任务折态（未成形=undefined）。 */
export interface ChainAncestor {
  readonly generation: number
  readonly text: string
  readonly campaign?: CampaignState
}

const romanGen = (n: number): string =>
  ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ'][n] ?? `第${n}代`

const brief = (text: string, w: number): string =>
  text.length > w ? `${text.slice(0, w)}…` : text

function outcomeOf(camp?: CampaignState): string {
  if (camp === undefined) return '未成形（尚未发布成任务）'
  if (camp.status === 'closed') return `已收官：${camp.closedVerdict ?? '验收通过'}`
  if (camp.status === 'failed') return `败退${camp.lastError !== undefined && camp.lastError !== '' ? `——败因：${brief(camp.lastError, 120)}` : ''}`
  switch (camp.status) {
    case 'reported': return '已交稿，待舰长验收'
    case 'in_progress': return '执行进行中'
    case 'published': return '已发布，待外勤小队领令'
    default: return '草稿中'
  }
}

/** 该代的关键产物路径（evidence.files 截 5 + diffstat 一行；纯读，不改写）。 */
function keyPathsOf(camp?: CampaignState): string[] {
  if (camp === undefined) return []
  const out: string[] = []
  const last = camp.reports[camp.reports.length - 1]
  const files = last?.evidence?.files ?? []
  for (const f of files) {
    if (f !== '' && !out.includes(f)) out.push(f)
    if (out.length >= 5) break
  }
  if (last?.evidence?.diffstat !== undefined && last.evidence.diffstat !== '') out.push(`diffstat ${last.evidence.diffstat}`)
  return out
}

/** 该代最新任务回报摘要（≤cap 字；无任务回报=空串）。 */
function reportTailOf(camp: CampaignState | undefined, cap: number): string {
  if (camp === undefined) return ''
  const last = camp.reports[camp.reports.length - 1]
  if (last === undefined) return ''
  return brief(last.text.replace(/\s+/g, ' ').trim(), cap)
}

/** 最近 detailGens 代给详情（结论+任务回报摘要+产物路径），更老各代一行式。 */
export function buildChainNote(ancestors: ReadonlyArray<ChainAncestor>, gen: number, opts: { detailGens?: number; cap?: number } = {}): string {
  const detailGens = opts.detailGens ?? 3
  const cap = opts.cap ?? 1500
  if (ancestors.length === 0) return ''
  const lines: string[] = []
  for (const a of ancestors) {
    const isDetail = a.generation > gen - 1 - detailGens
    const head = `- ${romanGen(a.generation)} 代「${brief(a.text, 18)}」→ ${outcomeOf(a.campaign)}`
    if (!isDetail) {
      lines.push(head)
      continue
    }
    const parts: string[] = [head]
    const tail = reportTailOf(a.campaign, 160)
    if (tail !== '') parts.push(`  任务回报：${tail}`)
    const paths = keyPathsOf(a.campaign)
    if (paths.length > 0) parts.push(`  产物：${paths.join('；')}`)
    lines.push(parts.join('\n'))
  }
  const body = lines.join('\n')
  return body.length > cap ? `${body.slice(0, cap)}…（链档案截断）` : body
}

/** 外勤小队外勤任务简报压缩版（≤600 字）：世代一行式 + 末代详情 + 产物路径。 */
export function buildCommanderChainBrief(ancestors: ReadonlyArray<ChainAncestor>, gen: number, opts: { cap?: number } = {}): string {
  const cap = opts.cap ?? 600
  if (ancestors.length === 0) return ''
  const lines: string[] = []
  for (const a of ancestors) {
    const head = `- ${romanGen(a.generation)} 代「${brief(a.text, 14)}」→ ${outcomeOf(a.campaign)}`
    if (a.generation !== gen - 1) {
      lines.push(head)
      continue
    }
    const parts: string[] = [head]
    const paths = keyPathsOf(a.campaign)
    if (paths.length > 0) parts.push(`  产物：${paths.join('；')}`)
    const tail = reportTailOf(a.campaign, 120)
    if (tail !== '') parts.push(`  任务回报：${tail}`)
    lines.push(parts.join('\n'))
  }
  const body = lines.join('\n')
  return body.length > cap ? `${body.slice(0, cap)}…（链摘要截断）` : body
}

/** pivot 直插执行会话的父代速览（≤400 字：父代结论 + 产物 + 任务回报摘要）。 */
export function pivotChainSlice(parent: ChainAncestor, opts: { cap?: number } = {}): string {
  const cap = opts.cap ?? 400
  const parts = [`【父代战况】${outcomeOf(parent.campaign)}`]
  const paths = keyPathsOf(parent.campaign)
  if (paths.length > 0) parts.push(`关键产物：${paths.join('；')}`)
  const tail = reportTailOf(parent.campaign, 120)
  if (tail !== '') parts.push(`最新任务回报：${tail}`)
  const body = parts.join('\n')
  return body.length > cap ? `${body.slice(0, cap)}…` : body
}
