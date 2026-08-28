# -*- coding: utf-8 -*-
"""v15 实弹考题机检（读证据档 + 考题工作区磁盘，零服务器依赖）。

判据（全过 = PASS）：
  C1  代1 收官：task_closed + verdict 含 KillCredit 自动收官 + evidence.files
      含 e2e-manifest（产物进了证据链——链档案的原料）
  C2  T1 因果纯净：token 是 8 位十六进制，且不出现于代1/代2 命令原文
      （token 由代1 LLM 现场生成——下游出现只能经链档案）
  C3  续接挂链：代2 directive continuation={mode:deepen, parentId:代1} + name=e2e战线
  C4  战线同一性：代2 chain.generation==2、rootId==代1；两代任务同一 workspacePath
  C5  workspaceKind：两代任务都是 'bound'（真实路径绑定，Phase B 投影真值）
  C6  链档案送达并使用（行为核心）：代2 任务书 brief 或 指挥官战报 提及
      'e2e-manifest' 或 T1（参谋/指挥官不可能从命令原文或板摘要得知）
  C7  续在成果上（结果核心）：summary/e2e-summary.md 存在且含 T1 数值
  C8  代2 收官：task_closed + KillCredit 自动收官（续接代全链走通）
附注（不 gate）：参谋侧（任务书提及）vs 指挥官侧（战报提及）归因、代2 evidence.files。
"""
import sys, io, os, json, re, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

EV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.goal', 'evidence', 'e2e')
WS = 'C:/Users/kaiji/vibecodingKJ/temp/e2e-exam-ws'
TAG1, TAG2 = 'E2E代1考题', 'E2E代2考题'

fails, notes = [], []


def check(name, ok, detail=''):
    print(('ok  ' if ok else 'FAIL') + f' {name}' + (f' — {detail}' if detail else ''))
    if not ok:
        fails.append(name)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def campaign_events(task_id):
    path = os.path.join(EV, f'r-e2e-campaign-{task_id}.jsonl')
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def ev_of(events, etype):
    return [e for e in events if e.get('type') == etype]


board1 = load_json(os.path.join(EV, 'r-e2e-board-gen1.json'))
board2 = load_json(os.path.join(EV, 'r-e2e-board-gen2.json'))
created2 = [json.loads(l) for l in open(os.path.join(EV, 'r-e2e-directives.jsonl'), encoding='utf-8') if '"directive_created"' in l]
c1 = next(c for c in board1['commands'] if TAG1 in c['text'])
c2 = next(c for c in board2['commands'] if TAG2 in c['text'])
t1 = next(t for t in board1['tasks'] if t['taskId'] == c1['taskId'])
t2 = next(t for t in board2['tasks'] if t['taskId'] == c2['taskId'])
ev1 = campaign_events(c1['taskId'])
ev2 = campaign_events(c2['taskId'])
T1 = open(os.path.join(EV, 'r-e2e-token.txt')).read().strip()

# C1 代1 收官与证据链
closed1 = ev_of(ev1, 'task_closed')
check('C1a 代1 task_closed', len(closed1) == 1, closed1[0]['verdict'][:60] if closed1 else '无')
check('C1b KillCredit 自动收官', bool(closed1) and 'KillCredit' in closed1[0]['verdict'])
sub1 = ev_of(ev1, 'task_submitted')
files1 = []
for s in sub1:
    files1 += (s.get('evidence') or {}).get('files') or []
check('C1c 代1 evidence.files 含 e2e-manifest', any('e2e-manifest' in f for f in files1), str(files1))

# C2 token 因果纯净
check('C2a token 8位十六进制', bool(re.fullmatch(r'[0-9a-fA-F]{8}', T1)), T1)
created_texts = [e.get('text', '') for e in created2]
check('C2b token 不在两代命令原文', all(T1 not in t for t in created_texts), '下游出现只能经链档案')

# C3 续接挂链（原始事件是平铺字段：continuationMode + continuesFrom；fold 才合成 continuation 对象）
d2 = next(e for e in created2 if TAG2 in e.get('text', ''))
check('C3a continuationMode=deepen', d2.get('continuationMode') == 'deepen', str(d2.get('continuationMode')))
check('C3b continuesFrom=代1', d2.get('continuesFrom') == c1['commandId'], f"{d2.get('continuesFrom')} vs {c1['commandId']}")
check('C3c 战线名 name=exam战线', d2.get('name') == 'e2e战线', str(d2.get('name')))

# C4 战线同一性
check('C4a 代2 generation==2', c2['chain']['generation'] == 2, str(c2['chain']))
check('C4b rootId==代1', c2['chain']['rootId'] == c1['commandId'])
norm = lambda p: os.path.normpath(p).lower() if p else p
check('C4c 两代同一战场', norm(t1['workspacePath']) == norm(t2['workspacePath']) == norm(WS), f"{t1['workspacePath']} | {t2['workspacePath']}")

# C5 workspaceKind（V15 Phase B 真值）
check('C5 workspaceKind 两代皆 bound', t1.get('workspaceKind') == 'bound' and t2.get('workspaceKind') == 'bound',
      f"gen1={t1.get('workspaceKind')} gen2={t2.get('workspaceKind')}")

# C6 链档案送达并使用（参谋任务书 或 指挥官战报 提及上代产物/token）
brief2 = ' '.join(e.get('brief', '') + ' ' + e.get('title', '') for e in ev_of(ev2, 'task_created'))
reports2 = ' '.join(e.get('report', '') for e in ev_of(ev2, 'task_submitted'))
files2 = []
for s in ev_of(ev2, 'task_submitted'):
    files2 += (s.get('evidence') or {}).get('files') or []
needle = lambda s: ('e2e-manifest' in s) or (T1 in s)
staff_pipe, cmdr_pipe = needle(brief2), needle(reports2 + ' ' + ' '.join(files2))
check('C6 链档案送达（任务书或战报提及上代产物）', staff_pipe or cmdr_pipe,
      f"staff_pipe={staff_pipe} commander_pipe={cmdr_pipe}")
notes.append(f'归因：参谋侧任务书提及={staff_pipe}；指挥官侧战报/证据提及={cmdr_pipe}')
notes.append(f'代2 evidence.files={files2}')

# C7 续在成果上
summary_path = os.path.join(EV, 'r-e2e-summary.md')
check('C7a summary 落盘', os.path.exists(summary_path))
if os.path.exists(summary_path):
    body = open(summary_path, encoding='utf-8').read()
    check('C7b summary 引用上代 token', T1 in body, f' summary {len(body)} 字')
else:
    check('C7b summary 引用上代 token', False, 'summary 缺失')

# C8 代2 收官
closed2 = ev_of(ev2, 'task_closed')
check('C8 代2 自动收官', bool(closed2) and 'KillCredit' in closed2[0]['verdict'], closed2[0]['verdict'][:60] if closed2 else '无')

print()
for n in notes:
    print('note:', n)
print()
print('EXAM-E2E: ' + ('PASS — 两代续接全链真实 LLM 走通，链档案注入有行为证据' if not fails else f'FAIL — {len(fails)} 项: {fails}'))
sys.exit(0 if not fails else 1)
