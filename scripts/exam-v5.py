# -*- coding: utf-8 -*-
"""v5 R5 AFK 收官考题驱动（真实 LLM：L0 直发全自动收官 + L2 计划呈批链）。

用法: python scripts/exam-v5.py <stage>
stages:
  issue   下两道命令（L0 带 !!直接做 / L2 带 ??先看方案）→ 等 received → 拍板照
  decide  元首回席：等两张卡分诊（档位徽章）；L2 呈计划后进会话拍计划卡；
          经 API 批准计划（POST /warroom/api/commands/plan）→ 等 approved+taskId
  track   轮询战役账本捕获里程碑：claimed→commander_goal_armed→submitted→
          自动收官（KillCredit 全绿）→ 拍板照
  close   终拍 + 板 JSON 落盘（供 assert-v5 机检）

环境: 服务器 3080 已带 V5 六旗（staff-* + quota-recovery）启动（smoke 州）；
截图落 .goal/evidence/v5/。配额断/续：宿主无注入手段 → 诚实降级为
tests/quota-recovery.test.ts 代码级证明（见 r5-afk-exam.md）。
"""
import sys, io, time, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
EV = '.goal/evidence/v5'
ENTRY = '[data-dsh-warroom-entry]'
TAG_L0 = 'V5-L0'
TAG_L2 = 'V5-L2'
CAMPAIGNS = '.smoke-state/campaigns'
DIRECTIVES = '.smoke-state/directives.jsonl'

CMD_L0 = ('V5-L0 考题：在 @new:exam-v5-l0 工作区建 hello.txt，内容一行 hello warroom v5。'
          '验收：文件存在且内容正确；node -e "require(\'fs\').readFileSync(\'hello.txt\',\'utf8\').includes(\'hello warroom v5\')" 退出码 0。!!直接做')
CMD_L2 = ('V5-L2 考题：??先看方案 在 @new:exam-v5-l2 工作区建 notes.md（两行：一行计划摘要、一行 done 标记）。'
          '验收：notes.md 存在且有两行内容；node -e 读取校验退出码 0。')


def log(*a):
    print(*a, flush=True)


def shot(pg, name):
    pg.screenshot(path=f'{EV}/{name}')
    log('shot:', name)


def board_api(pg):
    return pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")


def post(pg, path, body):
    return pg.evaluate("([p, b]) => fetch(p, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)}).then(r=>r.json())", [path, body])


def find_cmd(b, tag):
    for c in b['commands']:
        if tag in c['text']:
            return c
    return None


def open_board(pg):
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector(ENTRY, timeout=20000)
    pg.wait_for_timeout(1500)
    pg.click(ENTRY)
    pg.wait_for_selector('.war-board', timeout=10000)


def issue_one(pg, text):
    pg.click('button.war-plus')
    pg.wait_for_selector('.war-modal textarea', timeout=5000)
    pg.fill('.war-modal textarea', text)
    pg.click('.war-modal button.war-btn.primary')
    pg.wait_for_selector('.war-modal', state='hidden', timeout=10000)


def campaign_events(task_id):
    path = f'{CAMPAIGNS}/{task_id}.jsonl'
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except Exception:
                    pass
    return out


def wait_board(pg, pred, timeout_s, tag):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        b = board_api(pg)
        if pred(b):
            return b
        time.sleep(3)
    log('TIMEOUT waiting for', tag)
    return None


def stage_issue():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        shot(pg, 'r5-01-board-clean.png')
        issue_one(pg, CMD_L0)
        log('L0 issued')
        pg.wait_for_timeout(1500)
        issue_one(pg, CMD_L2)
        log('L2 issued')
        shot(pg, 'r5-02-two-commands.png')
        b = wait_board(pg, lambda b: find_cmd(b, TAG_L0) and find_cmd(b, TAG_L2)
                       and find_cmd(b, TAG_L0)['status'] in ('received', 'talking')
                       and find_cmd(b, TAG_L2)['status'] in ('received', 'talking'), 120, 'both received')
        shot(pg, 'r5-03-received.png')
        if b:
            json.dump({'L0': find_cmd(b, TAG_L0), 'L2': find_cmd(b, TAG_L2)}, open(f'{EV}/r5-commands.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            log('received:', find_cmd(b, TAG_L0)['commandId'], find_cmd(b, TAG_L2)['commandId'])
        br.close()


def stage_decide():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        # 1) 等两张卡分诊（档位徽章 + L2 的 disarm goal 已开）。
        def triaged(b):
            l0, l2 = find_cmd(b, TAG_L0), find_cmd(b, TAG_L2)
            return l0 and l2 and l0.get('grade') == 'L0' and l2.get('grade') == 'L2'
        b = wait_board(pg, triaged, 300, 'both triaged')
        shot(pg, 'r5-04-graded-cards.png')
        if not b:
            br.close()
            sys.exit(2)
        log('triaged: L0 =', find_cmd(b, TAG_L0)['gradeReason'], '| L2 =', find_cmd(b, TAG_L2)['gradeReason'])
        # 2) 等 L2 呈计划（plan.pending）——进会话拍计划卡（真实 UI）。
        b = wait_board(pg, lambda b: ((find_cmd(b, TAG_L2) or {}).get('plan') or {}).get('status') == 'pending', 420, 'L2 plan pending')
        if b:
            card = pg.locator(f'.war-hq .war-card:has-text("{TAG_L2}")').first
            card.click(timeout=8000)
            pg.wait_for_timeout(6000)
            shot(pg, 'r5-05-plan-in-session.png')
            pg.goto(BASE, wait_until='domcontentloaded')
            pg.wait_for_selector(ENTRY, timeout=20000)
            pg.wait_for_timeout(1200)
            pg.click(ENTRY)
            pg.wait_for_selector('.war-board', timeout=10000)
            # 3) 元首批准计划（决策面 = plan 路由）。
            l2 = find_cmd(board_api(pg), TAG_L2)
            r = post(pg, '/warroom/api/commands/plan', {'commandId': l2['commandId'], 'decision': 'approve', 'note': '按计划执行'})
            log('plan approve →', json.dumps(r, ensure_ascii=False))
        else:
            log('WARN: L2 plan not presented in time — continuing (may publish via L1-ish fallback)')
        # 4) 等两张卡 approved + taskId（L0 直发免批；L2 批后发布）。
        def approved(b):
            l0, l2 = find_cmd(b, TAG_L0), find_cmd(b, TAG_L2)
            return l0 and l2 and l0['status'] == 'approved' and l2['status'] == 'approved'
        b = wait_board(pg, approved, 600, 'both approved')
        shot(pg, 'r5-06-approved.png')
        if b:
            json.dump({'L0': find_cmd(b, TAG_L0), 'L2': find_cmd(b, TAG_L2)}, open(f'{EV}/r5-approved.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            log('taskIds:', find_cmd(b, TAG_L0)['taskId'], find_cmd(b, TAG_L2)['taskId'])
        br.close()


def find_chat_input(pg):
    ta = pg.locator('textarea').all()
    for el in ta:
        if el.is_visible():
            return el
    ce = pg.locator('[contenteditable="true"]').all()
    for el in ce:
        if el.is_visible():
            return el
    return None


def send_chat(pg, text):
    box = find_chat_input(pg)
    if box is None:
        raise RuntimeError('找不到聊天输入框')
    box.click()
    pg.keyboard.type(text, delay=15)
    pg.keyboard.press('Enter')
    log('sent:', text[:60])


def transcript_tail(pg, n=700):
    return pg.evaluate("document.body.innerText.slice(-%d)" % n)


def stage_nudge():
    """元首回席：进 L2 参谋会话发话推发布（批准只落事件——参谋在等回音，
    这正是回席的自然动作）。随后等两张卡 approved 并写 r5-approved.json。"""
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        card = pg.locator(f'.war-hq .war-card:has-text("{TAG_L2}")').first
        card.click(timeout=8000)
        pg.wait_for_selector('.war-board', state='hidden', timeout=10000)
        pg.wait_for_timeout(6000)
        send_chat(pg, '计划已批准（元首在命令卡上点了批准）。请按已批计划立即 war_publish 发布任务，务必带参数 commandId。')
        pg.wait_for_timeout(3000)
        shot(pg, 'r5-06a-nudged.png')
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_selector(ENTRY, timeout=20000)
        pg.wait_for_timeout(1500)
        pg.click(ENTRY)
        pg.wait_for_selector('.war-board', timeout=10000)
        def approved(b):
            l0, l2 = find_cmd(b, TAG_L0), find_cmd(b, TAG_L2)
            return l0 and l2 and l0['status'] == 'approved' and l2['status'] == 'approved'
        b = wait_board(pg, approved, 600, 'both approved (after nudge)')
        shot(pg, 'r5-06-approved.png')
        if b:
            json.dump({'L0': find_cmd(b, TAG_L0), 'L2': find_cmd(b, TAG_L2)}, open(f'{EV}/r5-approved.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            log('taskIds:', find_cmd(b, TAG_L0)['taskId'], find_cmd(b, TAG_L2)['taskId'])
        else:
            log('WARN: still not both approved')
        br.close()


def stage_track():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        if not os.path.exists(f'{EV}/r5-approved.json'):
            log('missing r5-approved.json — run decide first')
            br.close()
            sys.exit(2)
        ap = json.load(open(f'{EV}/r5-approved.json', encoding='utf-8'))
        ids = {'L0': ap['L0']['taskId'], 'L2': ap['L2']['taskId']}
        log('tracking', ids)
        seen = set()
        t0 = time.time()
        finals = {}
        while time.time() - t0 < 1500:
            for tag, tid in ids.items():
                ev = campaign_events(tid)
                types = [e['type'] for e in ev]
                if tid not in finals and 'task_closed' in types:
                    verdict = [e for e in ev if e['type'] == 'task_closed'][0].get('verdict', '')
                    auto = '自动收官' in verdict
                    finals[tid] = {'verdict': verdict, 'auto': auto}
                    shot(pg, f'r5-07-closed-{tag}.png')
                    log(f'{tag} CLOSED auto={auto} verdict={verdict[:60]}')
                for m in ('task_claimed', 'commander_goal_armed', 'task_submitted'):
                    if m in types and (tag, m) not in seen:
                        seen.add((tag, m))
                        log(f'{tag} milestone: {m}')
            if len(finals) == 2:
                break
            time.sleep(5)
        json.dump(finals, open(f'{EV}/r5-finals.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        shot(pg, 'r5-08-final-board.png')
        br.close()


def stage_close():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        b = board_api(pg)
        json.dump(b, open(f'{EV}/r5-final-board.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        shot(pg, 'r5-09-evidence-board.png')
        if os.path.exists(DIRECTIVES):
            import shutil
            shutil.copy(DIRECTIVES, f'{EV}/r5-directives.jsonl')
            log('directives log copied')
        for tid in os.listdir(CAMPAIGNS) if os.path.isdir(CAMPAIGNS) else []:
            if tid.startswith('task-'):
                import shutil
                shutil.copy(f'{CAMPAIGNS}/{tid}', f'{EV}/r5-campaign-{tid}')
        log('close stage done')
        br.close()


if __name__ == '__main__':
    os.makedirs(EV, exist_ok=True)
    stage = sys.argv[1] if len(sys.argv) > 1 else ''
    {'issue': stage_issue, 'decide': stage_decide, 'nudge': stage_nudge, 'track': stage_track, 'close': stage_close}[stage]()
