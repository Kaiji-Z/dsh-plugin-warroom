/**
 * V19 战报可读性·纯函数层（stardeck 回流，tests 管辖）：
 * - looksLikeFilePath：战报/产物文本里的「文件路径形」token 判定（链化开关）；
 * - splitInline：行内切词（文本、`代码`、**粗体**、路径四类）；
 * - parseMd：markdown-lite 块解析（标题/段落/无序有序列表/围栏代码/引用）——
 *   战报、任务书与计划铺面共用一个渲染语言；
 * - pinFinalMessage：会话历史「最终汇报置顶」纯函数（末条含正文的 assistant
 *   消息钉正面——消费方是 stardeck 形态的会话历史弹窗；随文件保留，函数本身
 *   零依赖可测）。
 * 渲染壳在 views.tsx（薄层）；本文件零 DOM、零词典——可被 node:test 直测。
 * @module dsh-plugin-stardeck/client/report-face
 */

/** 路径形判定：含字母开头扩展名（≤8 位）、无空白、长度 ≥3；允许 ./ ../ 前缀、
 *  正/反斜杠、字母数字-_%. 与 CJK。URL 形（含 ://）不算；纯数字扩展（1.0.0、
 *  3.5 这类版本号）不算——真实计划文本实抓的假阳性，V19 铺面轮收紧。 */
export function looksLikeFilePath(s: string): boolean {
  if (s.length < 3 || /\s/.test(s)) return false
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false
  return /^[.\-_/@\\@\w\u4e00-\u9fff]+\.([a-z][a-z0-9]{0,7})$/i.test(s)
}

export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'path'; v: string }

/** 行内切词：`code` → **bold** → 裸路径 token（空格/中英标点为界）。
 *  代码/粗体内的内容不再二次解析（不嵌套）。 */
export function splitInline(line: string): InlineToken[] {
  const out: InlineToken[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) pushText(out, line.slice(last, m.index))
    if (m[1] !== undefined) out.push({ t: 'code', v: m[1] })
    else out.push({ t: 'bold', v: m[2] ?? '' })
    last = re.lastIndex
  }
  if (last < line.length) pushText(out, line.slice(last))
  return out
}

/** 文本段再按词界切出路径 token（无词界文字如中文直接并入文本；相邻文本段合并）。 */
function pushText(out: InlineToken[], text: string): void {
  const push = (v: string): void => {
    const lastTok = out[out.length - 1]
    if (lastTok !== undefined && lastTok.t === 'text') lastTok.v += v
    else out.push({ t: 'text', v })
  }
  const re = /[^\s，。；：、（）()《》【】\[\]'"“”]+/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index))
    const word = m[0]
    if (looksLikeFilePath(word)) out.push({ t: 'path', v: word })
    else push(word)
    last = re.lastIndex
  }
  if (last < text.length) push(text.slice(last))
}

export type MdBlock =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; text: string }

/** markdown-lite 块解析：#~#### 标题、-/* 无序列表、1. 有序列表、``` 围栏代码、
 *  > 引用、空行分段。未知形态一律段落——战报是模型自由文本，宁拙勿崩。 */
export function parseMd(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') { i++; continue }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) { buf.push(lines[i]!); i++ }
      i++ // 跳过收口 ```（缺席=到文末，宽容）
      out.push({ kind: 'code', lang, text: buf.join('\n') })
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h !== null) { out.push({ kind: 'h', level: h[1]!.length, text: h[2]! }); i++; continue }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*[-*]\s+/, '')); i++ }
      out.push({ kind: 'ul', items })
      continue
    }
    if (/^\s*\d+[.、]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*\d+[.、]\s+/, '')); i++ }
      out.push({ kind: 'ol', items })
      continue
    }
    if (line.startsWith('> ')) {
      const buf: string[] = []
      while (i < lines.length && lines[i]!.startsWith('> ')) { buf.push(lines[i]!.slice(2)); i++ }
      out.push({ kind: 'quote', text: buf.join('\n') })
      continue
    }
    const buf: string[] = [line]
    i++
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.、]\s|> )/.test(lines[i]!)) { buf.push(lines[i]!); i++ }
    out.push({ kind: 'p', text: buf.join('\n') })
  }
  return out
}

export interface HistoryMsgFace {
  role: string
  ts: number | null
  parts: ReadonlyArray<{ kind: string; text: string; tool?: string }>
}

/** 最终汇报置顶——末条「含非空正文」的 assistant 消息钉正面；过程流
 *  （用户令/工具调用/其余 assistant 消息）按原序全量保留。无 assistant 正文
 *  → final=null（消费方退回全量过程流，不硬造总结）。 */
export function pinFinalMessage<T extends HistoryMsgFace>(messages: ReadonlyArray<T>): { final: T | null; rest: T[] } {
  let idx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'assistant') continue
    if (m.parts.some(p => p.kind === 'text' && p.text.trim() !== '')) { idx = i; break }
  }
  if (idx === -1) return { final: null, rest: [...messages] }
  return { final: messages[idx]!, rest: messages.filter((_, i) => i !== idx) }
}
