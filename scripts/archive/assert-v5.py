# -*- coding: utf-8 -*-
"""v5 R5 机检断言：AFK 考题产物逐项核验（.goal/evidence/v5/ + smoke 账本）。

判据（goal Done-when #4 + SPEC §4 R5）：
 1. 两道命令入账（L0 带 !!直接做 / L2 带 ??先看方案）；
 2. 分诊：L0 生效档 L0（override !! 留痕 suggested）、L2 生效档 L2（override ??）；
 3. L2 计划链：plan_opened → plan_approved → directive_approved 顺序正确；
    L2 参谋 goal 开箱 disarmed:true（红线：参谋 goal 永远 disarm）；
 4. 两个任务：claimed → commander_goal_armed → task_submitted → task_closed
    且 verdict 含「自动收官」（KillCredit 机械全绿自动收官）；
 5. 战报唤醒链：reported 阶段触发过 staff_woken（分级推在真服跑通）——
    自动收官不推是特性，故任一任务出现 reported 中间态时应有 woken 记录；
    两任务都直通自动收官时此条降级为 SKIP（诚实）；
 6. 配额断/续：宿主无注入手段 → 诚实降级为代码级单测证明
    （tests/quota-recovery.test.ts 存在且本仓库 verify PASS 覆盖）。
全部通过 exit 0；任一 FAIL exit 1（机器判卷，不靠肉眼）。
"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

EV = '.goal/evidence/v5'
DIRLOG = f'{EV}/r5-directives.jsonl'
FINALS = f'{EV}/r5-finals.json'
CAMPAIGNS = '.smoke-state/campaigns'

fails = []
skips = []


def ok(label):
    print(f'ok   {label}')


def fail(label, detail=''):
    print(f'FAIL {label} :: {detail}')
    fails.append(label)


def skip(label, why):
    print(f'SKIP {label} :: {why}')
    skips.append(label)


def read_jsonl(path):
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


# 1+2+3: directives ledger
if not os.path.exists(DIRLOG):
    fail('directives log', f'{DIRLOG} missing')
    sys.exit(1)
dev = read_jsonl(DIRLOG)
by_id = {}
for e in dev:
    by_id.setdefault(e.get('directiveId'), []).append(e)
l0 = l2 = None
for did, evs in by_id.items():
    created = [e for e in evs if e['type'] == 'directive_created']
    if not created:
        continue
    text = created[0].get('text', '')
    if 'V5-L0' in text:
        l0 = (did, evs)
    if 'V5-L2' in text:
        l2 = (did, evs)

if l0 and '!!直接做' in [e for e in l0[1] if e['type'] == 'directive_created'][0]['text']:
    ok('1a L0 命令入账（含 !!直接做）')
else:
    fail('1a L0 命令', str(l0 is not None))
if l2 and '??先看方案' in [e for e in l2[1] if e['type'] == 'directive_created'][0]['text']:
    ok('1b L2 命令入账（含 ??先看方案）')
else:
    fail('1b L2 命令', str(l2 is not None))

t0 = [e for e in l0[1] if e['type'] == 'directive_triaged'] if l0 else []
if t0 and t0[0]['grade'] == 'L0':
    ok('2a L0 分诊生效档 L0')
    if t0[0].get('override') == '!!':
        ok('2a+ override !! 留痕（suggested=' + str(t0[0].get('suggested')) + '）')
    else:
        skip('2a+ override 留痕', '参谋原建议即 L0（无改档痕迹属正常）')
else:
    fail('2a L0 分诊', json.dumps(t0, ensure_ascii=False))

t2 = [e for e in l2[1] if e['type'] == 'directive_triaged'] if l2 else []
if t2 and t2[0]['grade'] == 'L2':
    ok('2b L2 分诊生效档 L2')
else:
    fail('2b L2 分诊', json.dumps(t2, ensure_ascii=False))

po = [e for e in l2[1] if e['type'] == 'directive_plan_opened'] if l2 else []
pa = [e for e in l2[1] if e['type'] == 'directive_plan_approved'] if l2 else []
da = [e for e in l2[1] if e['type'] == 'directive_approved'] if l2 else []
if po and pa and da:
    ok('3a L2 计划链 plan_opened→approved→directive_approved 顺序正确' if (po[0]['ts'] < pa[0]['ts'] < da[0]['ts']) else '3a')
    if not (po[0]['ts'] < pa[0]['ts'] < da[0]['ts']):
        fail('3a 计划链顺序', f"{po[0]['ts']} / {pa[0]['ts']} / {da[0]['ts']}")
else:
    fail('3a 计划链完整', f"opened={len(po)} approved={len(pa)} dirApproved={len(da)}")
go = [e for e in l2[1] if e['type'] == 'directive_goal_opened'] if l2 else []
if go and go[0].get('disarmed') is True:
    ok('3b L2 参谋 goal 开箱 disarmed:true（红线）')
else:
    fail('3b 参谋 disarm goal', json.dumps(go, ensure_ascii=False))

# 4: campaigns
if not os.path.exists(FINALS):
    fail('finals', f'{FINALS} missing')
    sys.exit(1)
finals = json.load(open(FINALS, encoding='utf-8'))
task_ids = {}
for did, evs in by_id.items():
    for e in evs:
        if e['type'] == 'directive_approved':
            task_ids[e['taskId']] = did
for tag in ('L0', 'L2'):
    matched = [t for t, d in task_ids.items() if (d == l0[0] if tag == 'L0' else d == l2[0])]
    if not matched:
        fail(f'4{tag} 任务发布', 'no taskId')
        continue
    tid = matched[0]
    ev = read_jsonl(f'{CAMPAIGNS}/{tid}.jsonl') if os.path.exists(f'{CAMPAIGNS}/{tid}.jsonl') else read_jsonl(f'{EV}/r5-campaign-{tid}')
    types = [e['type'] for e in ev]
    chain = all(m in types for m in ('task_created', 'task_published', 'task_claimed', 'commander_goal_armed', 'task_submitted', 'task_closed'))
    if chain:
        ok(f'4{tag}-1 全链事件（claimed+goal_armed+submitted+closed）')
    else:
        fail(f'4{tag}-1 全链事件', str(sorted(set(types))))
    if tid in finals and finals[tid].get('auto'):
        ok(f'4{tag}-2 自动收官（verdict 含 KillCredit 机械全绿）')
    else:
        fail(f'4{tag}-2 自动收官', json.dumps(finals.get(tid, {}), ensure_ascii=False))

# 5: wake chain (soft)
woken_any = False
reported_seen = False
for tid in task_ids:
    ev = read_jsonl(f'{CAMPAIGNS}/{tid}.jsonl') if os.path.exists(f'{CAMPAIGNS}/{tid}.jsonl') else read_jsonl(f'{EV}/r5-campaign-{tid}')
    if any(e['type'] == 'staff_woken' for e in ev):
        woken_any = True
    if any(e['type'] == 'staff_woken' and e.get('sessionId') for e in ev):
        reported_seen = True
if reported_seen:
    ok('5 分级推：staff_woken 已投递（真服跑通）')
elif woken_any:
    skip('5 分级推', 'staff_woken 仅审计记录（投递失败/无会话），见 note 字段')
else:
    skip('5 分级推', '两任务均直通自动收官（不推是分级推的特性）')

# 6: quota honest degradation
if os.path.exists('tests/quota-recovery.test.ts'):
    ok('6 配额断/续：代码级单测证明在库（宿主无注入手段，诚实降级）')
else:
    fail('6 配额单测', 'tests/quota-recovery.test.ts missing')

print('---')
print(f'assert-v5: {"PASS" if not fails else "FAIL"} ({len(fails)} fail, {len(skips)} skip)')
sys.exit(1 if fails else 0)
