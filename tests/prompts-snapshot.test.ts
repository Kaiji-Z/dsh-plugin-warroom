/**
 * B1-件① 提示词快照门——宿主侧提示词资产的全文精确快照。改任何措辞都必须
 * 显式更新快照才能过 verify：跑 `WARROOM_UPDATE_SNAPSHOTS=1 node --import tsx
 * --test tests/prompts-snapshot.test.ts` 再生成（或手工改 fixtures），随后
 * 连同快照一起提交评审。这是「改提示词=高风险变更」的机检门。
 *
 * 出口协议段（war_claim 令牌 / war_submit 证据 / war_fail / war_comment /
 * KillCredit）是不可裁剪内容——本文件单独点名断言，任何「瘦身」动了即 FAIL。
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { bountyDraftingSkillContent } from '../src/prompts.ts'
import {
  chainArchiveSection, chainDigest, chainOutcomeOf, commanderOrderFor, pivotPromptFor, relayPromptFor, rescueNudgeFor,
} from '../src/prompts.ts'
import { commanderPersonaText, commanderReportHint, conscriptBriefing, mailboxDiscipline, planApprovedNotice, planRejectedNotice, schedulerDiscipline, staffPersonaText, troopBriefing, troopReportDiscipline, warKickoffPrompt, wakeCommanderPrompt } from '../src/prompts.ts'
import type { Directive } from '../src/directives.ts'

const FIXTURE_DIR = join(import.meta.dirname, 'prompts-snapshots')
const UPDATE = process.env.WARROOM_UPDATE_SNAPSHOTS === '1'

const demoDirective: Directive = {
  id: 'cmd-demo-0001', text: '帮我做个记账小工具', createdAt: '2026-01-01T00:00:00.000Z', status: 'draft',
}

const cases: ReadonlyArray<readonly [name: string, text: string]> = [
  ['staff-persona.txt', staffPersonaText(4)],
  ['commander-persona.txt', commanderPersonaText(3)],
  ['conscript-briefing.txt', conscriptBriefing({ taskId: 't-0001', title: '示例任务', workspacePath: '/w/proj', acceptance: '验收一；验收二', dossier: '（无历史档案。）' })],
  ['relay-base.txt', relayPromptFor(demoDirective)],
  ['relay-full-flags.txt', relayPromptFor(demoDirective, { 'staff-triage': true, 'staff-plan': true, 'staff-decompose': true })],
  ['relay-plan-only.txt', relayPromptFor(demoDirective, { 'staff-triage': true, 'staff-plan': true })],
  ['pivot.txt', pivotPromptFor('父代命令原文比较长需要截断展示', 'cmd-2', '插播：改用方案 B', '【父代速览】已收官，产物 deploy/run.ps1')],
  ['pivot-no-slice.txt', pivotPromptFor('短父令', 'cmd-3', '插播指令')],
  ['chain-digest.txt', chainDigest([
    { generation: 1, text: '初代命令文本', outcome: '已收官：验收通过' },
    { generation: 2, text: '这是一个特别长的二代命令文本用于截断展示效果' },
  ])],
  ['chain-archive.txt', chainArchiveSection(3, 'Ⅰ 代……\nⅡ 代……')],
  ['rescue-nudge.txt', rescueNudgeFor('t-0707')],
  // B2：troop 侧五件入册（此前散在 persona.ts 无快照门——本次起进门禁防散改）。
  ['troop-report-discipline.txt', troopReportDiscipline()],
  ['troop-briefing.txt', troopBriefing({ label: '工兵A', front: 'src/', mission: '修分页逻辑', intent: '列表页分页修复' })],
  ['mailbox-discipline.txt', mailboxDiscipline({ 'troop-mailbox': true })],
  ['scheduler-discipline.txt', schedulerDiscipline({ 'troop-scheduler': true })],
  ['commander-report-hint.txt', commanderReportHint()],
  ['commander-order-plain.txt', commanderOrderFor({ maxUnits: 3, taskId: 't-0009', title: '深挖性能', workspacePath: '/w/x', acceptance: '验收一；验收二', dossier: '（新星球，尚无历史档案。）' })],
  ['commander-order-chain.txt', commanderOrderFor({ maxUnits: 3, taskId: 't-0009', title: '续接深挖', workspacePath: '/w/x', acceptance: '验收', dossier: '档案', chainBrief: '【Ⅰ 代】近况摘要……' })],
  ['kickoff.txt', warKickoffPrompt()],
  ['wake-commander.txt', wakeCommanderPrompt([{ taskId: 't-1', title: '任务甲', priority: 'high' }])],
  ['plan-approved.txt', planApprovedNotice('尽快')],
  ['plan-rejected.txt', planRejectedNotice('方案太重')],
  ['drafting-skill.txt', bountyDraftingSkillContent()],
]

test('件①: 提示词资产全文快照（改词必须显式更新 fixtures）', () => {
  if (UPDATE) mkdirSync(FIXTURE_DIR, { recursive: true })
  for (const [name, text] of cases) {
    const file = join(FIXTURE_DIR, name)
    if (UPDATE) {
      writeFileSync(file, text, 'utf8')
      continue
    }
    const expected = readFileSync(file, 'utf8')
    assert.equal(text, expected, `提示词快照不符：${name}（确认改词后用 WARROOM_UPDATE_SNAPSHOTS=1 再生成并随改动一并评审）`)
  }
})

test('件①: 出口协议段是不可裁剪内容（点名断言）', () => {
  const commander = commanderPersonaText(3)
  assert.ok(commander.includes('attemptId'), '条令必须教 attemptId 令牌')
  assert.ok(commander.includes('war_submit'), '条令必须教 war_submit')
  assert.ok(commander.includes('war_fail'), '条令必须教 war_fail')
  assert.ok(commander.includes('evidence'), '条令必须教证据纪律（KillCredit 的验收面）')
  const briefing = conscriptBriefing({ taskId: 't', title: 'x', acceptance: 'a', dossier: 'd' })
  assert.ok(briefing.includes('war_claim'), '简报必须教 war_claim（令牌发放点）')
  assert.ok(briefing.includes('war_submit'), '简报必须教 war_submit')
  assert.ok(briefing.includes('war_fail'), '简报必须教 war_fail')
  assert.ok(briefing.includes('令牌'), '简报必须点明令牌')
  const staff = staffPersonaText(4)
  assert.ok(staff.includes('war_comment'), '大副条令必须教 war_comment 批注转达')
  assert.ok(staff.includes('war_close_task'), '大副条令必须教 war_close_task 收官')
  assert.ok(bountyDraftingSkillContent().includes('KillCredit'), '起草法必须点名 KillCredit 验收纪律')
  // 续接令的「直接读工作区文件」纪律不得丢（V16.5 e2e 实锤回归线）。
  const order = commanderOrderFor({ maxUnits: 3, taskId: 't', title: 'x', acceptance: 'a', dossier: 'd', chainBrief: '摘要' })
  assert.ok(order.includes('不要去检索宿主会话记录'), '续接令必须点明直接读工作区文件')
})

test('件①: chainOutcomeOf 全态措辞在快照管辖下稳定', () => {
  assert.equal(chainOutcomeOf(undefined), '未成形（尚未发布成任务）')
  assert.ok(chainOutcomeOf({ status: 'closed', closedVerdict: '通过' }).startsWith('已收官'))
  assert.ok(chainOutcomeOf({ status: 'failed', lastError: '超时' }).includes('败因'))
})

test('B2: 契约一致性——camelCase 参数族逐字对齐 schema（publish/triage/plan/decompose）', () => {
  const full = relayPromptFor(demoDirective, { 'staff-triage': true, 'staff-plan': true, 'staff-decompose': true })
  const hits = full.match(/commandId=cmd-demo-0001/g) ?? []
  assert.ok(hits.length >= 4, `publish/分诊/计划/拆解四处都应教 commandId=（实得 ${hits.length} 处）`)
  assert.ok(!full.includes('command_id='), 'snake_case 教学会被 schema additionalProperties:false 剥参（war_abandon_command 除外，提示词不教其参数名）')
})
