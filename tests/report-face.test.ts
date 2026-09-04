import assert from 'node:assert/strict'
import { test } from 'node:test'
import { looksLikeFilePath, parseMd, pinFinalMessage, splitInline } from '../src/client/report-face.ts'

/** V19 战报可读性·纯函数层（stardeck 回流）：路径判定/行内切词/md-lite 块解析/
 *  最终汇报置顶。宁拙勿崩的解析契约在这里钉死。 */

test('looksLikeFilePath：路径形判定——真实扩展名收、版本号/URL/空白拒', () => {
  assert.equal(looksLikeFilePath('report.md'), true)
  assert.equal(looksLikeFilePath('deploy/run.ps1'), true)
  assert.equal(looksLikeFilePath('./src/api/user.ts'), true)
  assert.equal(looksLikeFilePath('repo\\notes.txt'), true, '相对反斜杠路径收')
  assert.equal(looksLikeFilePath('C:\\repo\\notes.txt'), false, '盘符冒号不在路径字符集（绝对路径本就该拒）')
  assert.equal(looksLikeFilePath('产物说明.md'), true, 'CJK 路径收')
  assert.equal(looksLikeFilePath('archive.tar.gz'), true, '双扩展收（.gz 字母开头）')
  // V19 铺面轮收紧：纯数字扩展=版本号假阳性（真实 CHANGELOG 计划实抓）。
  assert.equal(looksLikeFilePath('1.0.0'), false, '版本号不是路径')
  assert.equal(looksLikeFilePath('v2.1'), false)
  assert.equal(looksLikeFilePath('3.5'), false)
  assert.equal(looksLikeFilePath('https://x.com/a.md'), false, 'URL 形拒')
  assert.equal(looksLikeFilePath('a b.md'), false, '含空白拒')
  assert.equal(looksLikeFilePath('ab'), false, '无扩展拒')
  assert.equal(looksLikeFilePath('.md'), false, '长度不足拒')
})

test('splitInline：代码/粗体/路径三 token，代码内不二次解析', () => {
  assert.deepEqual(splitInline('纯文本一句话'), [{ t: 'text', v: '纯文本一句话' }])
  const toks = splitInline('跑 `npm test` 通过，见 **报告** 与 deploy/run.ps1 落盘')
  assert.deepEqual(toks.filter(t => t.t !== 'text').map(t => t.t), ['code', 'bold', 'path'])
  const code = toks.find(t => t.t === 'code')!
  assert.equal(code.v, 'npm test')
  // 代码内容是路径形也不链化（不嵌套——路径判定只作用于裸文本段与 code 判定）
  const nested = splitInline('`deploy/run.ps1`')
  assert.equal(nested.length, 1)
  assert.equal(nested[0]!.t, 'code')
})

test('parseMd：标题/列表/围栏代码/引用/段落，未知形态宁拙勿崩', () => {
  const md = [
    '# 结论',
    '首句直接回答问题。',
    '',
    '## 关键发现',
    '- 发现一',
    '- 发现二',
    '',
    '1. 第一步',
    '2. 第二步',
    '',
    '> 引用一行',
    '',
    '```powershell',
    'Get-Content out.txt',
    '```',
    '尾段**粗体**与 `code`。',
  ].join('\n')
  const blocks = parseMd(md)
  assert.deepEqual(blocks.map(b => b.kind), ['h', 'p', 'h', 'ul', 'ol', 'quote', 'code', 'p'])
  const h1 = blocks[0] as { kind: 'h'; level: number }
  assert.equal(h1.level, 1)
  assert.deepEqual((blocks[3] as { items: string[] }).items, ['发现一', '发现二'])
  assert.deepEqual((blocks[4] as { items: string[] }).items, ['第一步', '第二步'])
  assert.equal((blocks[6] as { text: string }).text, 'Get-Content out.txt')
  // 围栏未收口=到文末（宽容）；CRLF 归一。
  assert.equal(parseMd('```js\r\nlet x = 1').length, 1)
})

test('pinFinalMessage：末条含正文 assistant 钉正面，无正文 final=null', () => {
  const msgs = [
    { role: 'user', ts: 1, parts: [{ kind: 'text', text: '下令' }] },
    { role: 'assistant', ts: 2, parts: [{ kind: 'tool', text: '', tool: 'bash' }] },
    { role: 'assistant', ts: 3, parts: [{ kind: 'text', text: '最终汇报正文' }] },
  ]
  const { final, rest } = pinFinalMessage(msgs)
  assert.equal(final?.ts, 3)
  assert.deepEqual(rest.map(m => m.ts), [1, 2])
  const empty = pinFinalMessage([{ role: 'user', ts: 1, parts: [{ kind: 'text', text: 'x' }] }])
  assert.equal(empty.final, null)
  assert.equal(empty.rest.length, 1)
})
