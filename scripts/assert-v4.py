# -*- coding: utf-8 -*-
"""V4 R5 机检断言：对战役账本逐项核对 SPEC R5 考点（不靠截图像素）。"""
import sys, io, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

TASK = sys.argv[1] if len(sys.argv) > 1 else json.load(open('.goal/evidence/v4/r5-command.json', encoding='utf-8'))['taskId']
PATH = f'.smoke-state/campaigns/{TASK}.jsonl'
evs = [json.loads(l) for l in open(PATH, encoding='utf-8') if l.strip()]

results = []
def check(name, ok, detail=''):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}: {name}" + (f' — {detail}' if detail else ''))

deployed = [e for e in evs if e['type'] == 'unit_deployed']
units = {e['unitName']: e['childId'] for e in deployed}
created = [e for e in evs if e['type'] == 'subtask_created']
claims = [e for e in evs if e['type'] == 'subtask_claimed']
msgs = [e for e in evs if e['type'] == 'message_logged']
delivered = {e['messageId'] for e in evs if e['type'] == 'message_delivered'}
recalls = [e for e in evs if e['type'] == 'unit_recalled']
parks = [e for e in evs if e['type'] == 'subtask_parked']
blocked = [e for e in evs if e['type'] == 'subtask_updated' and e['status'] == 'blocked']
submitted = [e for e in evs if e['type'] == 'task_submitted']
closed = [e for e in evs if e['type'] == 'task_closed']

troop_ids = set(units.values())
check('① 双兵种部署（≥2，含 scout-routed 与 engineer）', len(deployed) >= 2 and 'scout-routed' in units and 'engineer' in units,
      f"units={sorted(units)}")
check('② 队内任务图：≥2 子任务创建 + ≥2 认领（调度器自动认领）', len(created) >= 2 and len(claims) >= 2,
      f'created={len(created)} claimed={len(claims)}')
troop_msgs = [m for m in msgs if m['from'] in troop_ids and m['to'] in troop_ids]
check('③ 部队↔部队直讯（发收双方均为部队会话）', len(troop_msgs) >= 1,
      f'troop-to-troop={len(troop_msgs)}/{len(msgs)} 条, 已投递 {sum(1 for m in msgs if m["messageId"] in delivered)} 条')

# ⑤ park/换手事件链：撤退 engineer → 其在役子任务 parked → 吊销(blocked 改派) → 非原主再认领
eng = units.get('engineer')
eng_recalled = any(r['childId'] == eng for r in recalls)
parked_after_recall = any(p['ts'] >= next((r['ts'] for r in recalls if r['childId'] == eng), '9') for p in parks)
reassign_blocked = any('改派' in (b.get('note') or '') for b in blocked)
owners_seq = {}
last_owner = {}
for c in claims:
    owners_seq.setdefault(c['subtaskId'], []).append(c['claimedBy'])
rotated = any(len(set(seq)) >= 2 for seq in owners_seq.values())
check('④ park/换手链：撤退→parked→改派吊销→非原主接手', eng_recalled and parked_after_recall and reassign_blocked and rotated,
      f'recalled={eng_recalled} parked={len(parks)} 改派={reassign_blocked} 换手={rotated} (认领轮次={ {k: len(v) for k, v in owners_seq.items()} })')

check('⑤ KillCredit：提交带真实测试退出码', bool(submitted) and all(s.get('evidence', {}).get('tests', {}).get('exitCode') == 0 for s in submitted),
      f'submissions={len(submitted)}, exitCodes={[s.get("evidence", {}).get("tests", {}).get("exitCode") for s in submitted]}')
check('⑥ 收官判定含「通过」', bool(closed) and all('通过' in c['verdict'] for c in closed), closed[0]['verdict'] if closed else 'none')

print()
ok = all(results)
print('V4 R5 FINAL:', 'PASS' if ok else 'FAIL', f'({sum(results)}/{len(results)})')
sys.exit(0 if ok else 1)
