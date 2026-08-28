/** V15 chain-note 纯函数测试：截断/代窗/空数据退化/尺寸 cap。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChainNote, buildCommanderChainBrief, pivotChainSlice, type ChainAncestor } from '../src/chain-note.ts'
import type { CampaignState } from '../src/types.ts'

const camp = (over: Partial<CampaignState> = {}): CampaignState => ({
  campaignId: 't1', title: '任务', status: 'closed', attempts: 1,
  attemptLog: [], deliverables: [], reports: [],
  ...over,
} as CampaignState)

const anc = (gen: number, text: string, campaign?: CampaignState): ChainAncestor => ({ generation: gen, text, campaign })

test('chain-note: 详情代带战报摘要+产物路径，老代保持一行式', () => {
  const a4 = anc(4, '第4代命令', camp({
    status: 'closed', closedVerdict: '部署脚本全绿',
    reports: [{ ts: '2026-08-28T09:00:00Z', from: 'u1', text: '完成部署并\n验证  三项检查', evidence: { checks: [], files: ['deploy/run.ps1', 'deploy/README.md'] } }],
  }))
  const a1 = anc(1, '第1代命令', camp({ status: 'failed', lastError: 'Windows 路径炸了' }))
  const note = buildChainNote([a1, a4], 5)
  assert.ok(note.includes('战报：完成部署并 验证 三项检查'), '战报摘要应清洗换行并入场')
  assert.ok(note.includes('deploy/run.ps1'), '证据文件路径应入场')
  assert.ok(note.includes('败退——败因：Windows 路径炸了'), '详情代的败因应带出')
  // gen=5、detailGens=3 → 第 1 代是老代（一行式，无 战报/产物 行）
  assert.ok(!note.includes('- Ⅰ 代「第1代命令」→ 败退——败因：Windows 路径炸了\n  战报'), '第 1 代超出详情窗应保持一行式')
})

test('chain-note: 空祖先/未成形代退化安全', () => {
  assert.equal(buildChainNote([], 2), '')
  const note = buildChainNote([anc(1, 'x')], 2)
  assert.ok(note.includes('未成形'), '未成形代给结论行')
  const cmd = buildCommanderChainBrief([anc(1, 'x')], 2)
  assert.ok(cmd.includes('未成形'))
})

test('chain-note: 尺寸 cap 硬顶（参谋 1500 / 指挥官 600 / pivot 400）', () => {
  const big = anc(1, 'x', camp({ reports: [{ ts: 't', from: 'u', text: '长'.repeat(900) }] }))
  const anc2 = anc(2, 'y', camp({ reports: [{ ts: 't', from: 'u', text: '长'.repeat(900) }] }))
  assert.ok(buildChainNote([big, anc2], 3).length <= 1500 + 20)
  assert.ok(buildCommanderChainBrief([big, anc2], 3).length <= 600 + 20)
  assert.ok(pivotChainSlice(big).length <= 400 + 20)
  assert.ok(buildChainNote([big, anc2], 3, { cap: 100 }).includes('（链档案截断）'))
})

test('chain-note: 指挥官版只给末代详情+产物；pivot 版=父代速览', () => {
  const parent = anc(3, '父代', camp({
    status: 'reported',
    reports: [{ ts: 't', from: 'u', text: '交稿了', evidence: { checks: [], files: ['out/a.md'], diffstat: '+10 -2' } }],
  }))
  const cmd = buildCommanderChainBrief([anc(1, 'a'), anc(2, 'b'), parent], 4)
  assert.ok(cmd.includes('out/a.md') && cmd.includes('diffstat +10 -2'), '末代产物+diffstat 入指挥官摘要')
  assert.ok(!cmd.includes('已交稿，待元首验收\n  产物：'.replace('产物', 'x')), 'sanity')
  const pv = pivotChainSlice(parent)
  assert.ok(pv.startsWith('【父代战况】') && pv.includes('交稿了') && pv.includes('out/a.md'))
})
