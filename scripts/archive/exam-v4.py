# -*- coding: utf-8 -*-
"""v4 R5 收官考题驱动（真实 LLM：双兵种/异路由/直讯/队内调度/park-换手）。

用法: python scripts/exam-v4.py <stage>
stages:
  issue    下命令(经板 UI) → 秒接(r5-01..04)
  decide   经板卡进参谋会话, 逐张点决策卡(@new 路由 → 批准发布), 等 approved+taskId
  track    轮询战役账本(.smoke-state/campaigns/<id>.jsonl)捕获里程碑并拍板照:
           双部队(r5-05) 子任务(r5-06) 直讯(r5-07) park/换手(r5-08) → reported(r5-09)
  close    reported 卡「去处理」→ 收官令 → closed → 终拍(r5-10)

环境: 服务器 3080 已带 WARROOM_FEATURES 四旗启动; 截图落 .goal/evidence/v4/。
"""
import sys, io, time, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
EV = '.goal/evidence/v4'
ENTRY = '[data-dsh-warroom-entry]'
TAG = 'V4 能力考题'
CAMPAIGNS = '.smoke-state/campaigns'


def log(*a):
    print(*a, flush=True)


def shot(pg, name):
    pg.screenshot(path=f'{EV}/{name}')
    log('shot:', name)


def board_api(pg):
    return pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")


def find_exam(b):
    for c in b['commands']:
        if TAG in c['text']:
            return c
    return None


def open_board(pg):
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector(ENTRY, timeout=20000)
    pg.wait_for_timeout(1500)
    pg.click(ENTRY)
    pg.wait_for_selector('.war-board', timeout=10000)


def click_option_button(pg, needle):
    btns = pg.locator(f'button:has-text("{needle}")')
    if btns.count() == 0:
        return False
    btns.first.click()
    log('clicked option button:', needle)
    return True


def live_buttons(pg):
    return pg.evaluate("() => [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim().replace(/\\n/g, ' | ')).filter(t => t)")


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


def counts(events):
    c = {}
    for e in events:
        c[e['type']] = c.get(e['type'], 0) + 1
    return c


def stage_issue():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_selector(ENTRY, timeout=20000)
        pg.wait_for_timeout(1500)
        pg.click(ENTRY)
        pg.wait_for_selector('.war-board', timeout=10000)
        shot(pg, 'r5-01-command-zone.png')
        pg.click('button.war-plus')
        pg.wait_for_selector('.war-modal textarea', timeout=5000)
        cmd = ('V4 能力考题：在 @new 工作区做一个极小的双文件工具集（notes.md 与 check.py）。'
               '要求指挥官：1) 派两支部队——scout-routed 侦察与 engineer 工程；'
               '2) 用 war_troop_task 拆两个可并行子任务（侦察列清单/工程写文件），让调度器自动认领；'
               '3) 部队之间至少一次 war_message 直讯；'
               '4) 演示 park/换手：war_recall 撤退 engineer（其子任务应 park），再 war_troop_reassign 换手完成。'
               '验收以战役账本事件为准。')
        pg.fill('.war-modal textarea', cmd)
        shot(pg, 'r5-02-composer.png')
        pg.click('.war-modal button.war-btn.primary')
        pg.wait_for_selector('.war-modal', state='hidden', timeout=10000)
        t0 = time.time()
        while time.time() - t0 < 60:
            b = board_api(pg)
            c = find_exam(b)
            if c:
                log('command:', c['commandId'], c['status'])
                with open(f'{EV}/r5-command.json', 'w', encoding='utf-8') as f:
                    json.dump(c, f, ensure_ascii=False, indent=1)
                break
            time.sleep(2)
        pg.wait_for_timeout(2500)
        shot(pg, 'r5-03-command-card.png')
        t0 = time.time()
        while time.time() - t0 < 90:
            b = board_api(pg)
            c = find_exam(b)
            if c and c['status'] == 'received' and c['secretarySessionId']:
                log('received by', c['secretarySessionId'])
                break
            time.sleep(2)
        pg.wait_for_timeout(2500)
        shot(pg, 'r5-04-received.png')
        br.close()


def stage_decide():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        pg.locator(f'.war-hq .war-card:has-text("{TAG}")').first.click()
        pg.wait_for_selector('.war-board', state='hidden', timeout=8000)
        pg.wait_for_timeout(5000)
        done1 = done2 = False
        ok = False
        c = None
        t0 = time.time()
        while time.time() - t0 < 900:
            # 两张卡独立尝试：点名 @new 的命令不出现路由卡，批准卡须可直接点。
            if not done1 and click_option_button(pg, '@new:'):
                done1 = True
                pg.wait_for_timeout(3000)
                nxt = pg.locator('button', has_text='下一题')
                if nxt.count() > 0:
                    nxt.first.click()
                    log('clicked 下一题')
                pg.wait_for_timeout(4000)
                continue
            if not done2 and click_option_button(pg, '批准'):
                done2 = True
                pg.wait_for_timeout(2000)
                sub = pg.locator('button', has_text='提交')
                if sub.count() > 0:
                    sub.first.click()
                    log('clicked 提交')
                pg.wait_for_timeout(5000)
                shot(pg, 'r5-05-approval-submitted.png')
                continue
            b = board_api(pg)
            c = find_exam(b)
            st = c and c['status']
            log(f'[{int(time.time()-t0)}s] cmd={st} cards={done1}/{done2}')
            if c and c['status'] == 'approved' and c.get('taskId'):
                log('APPROVED -> task', c['taskId'])
                ok = True
                break
            pg.wait_for_timeout(10000)
        pg.wait_for_timeout(3000)
        shot(pg, 'r5-06-published.png')
        if not ok:
            for t in live_buttons(pg):
                log('  btn:', t[:90])
            raise SystemExit('未 approved')
        with open(f'{EV}/r5-command.json', 'w', encoding='utf-8') as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
        br.close()


def stage_track():
    with open(f'{EV}/r5-command.json', encoding='utf-8') as f:
        cmd = json.load(f)
    task_id = cmd['taskId']
    milestones = {'two_troops': False, 'subtasks': False, 'message': False, 'park': False}
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_selector(ENTRY, timeout=20000)
        t0 = time.time()
        while time.time() - t0 < 1500:
            evs = campaign_events(task_id)
            c = counts(evs)
            deployed = [e for e in evs if e['type'] == 'unit_deployed']
            units = sorted({e.get('unitName') for e in deployed})
            log(f"[{int(time.time()-t0)}s] deployed={len(deployed)}{units} subtask={c.get('subtask_created',0)}/{c.get('subtask_claimed',0)} msg={c.get('message_logged',0)} park={c.get('subtask_parked',0)}")
            if not milestones['two_troops'] and len(deployed) >= 2:
                open_board(pg)
                pg.wait_for_timeout(2500)
                shot(pg, 'r5-07-two-troops.png')
                milestones['two_troops'] = True
            if not milestones['subtasks'] and c.get('subtask_claimed', 0) >= 1:
                open_board(pg)
                pg.wait_for_timeout(2500)
                shot(pg, 'r5-08-subtask-claimed.png')
                milestones['subtasks'] = True
            if not milestones['message'] and c.get('message_logged', 0) >= 1:
                milestones['message'] = True
            if not milestones['park'] and c.get('subtask_parked', 0) >= 1:
                milestones['park'] = True
                shot(pg, 'r5-09-parked.png')
            b = board_api(pg)
            t = next((x for x in b['tasks'] if x['taskId'] == task_id), None)
            if t and t['status'] in ('reported', 'failed', 'closed'):
                log('task terminal:', t['status'])
                break
            time.sleep(10)
        open_board(pg)
        pg.wait_for_timeout(3000)
        shot(pg, 'r5-10-task-endstate.png')
        log('milestones:', milestones)
        br.close()


def stage_close(text):
    with open(f'{EV}/r5-command.json', encoding='utf-8') as f:
        cmd = json.load(f)
    task_id = cmd['taskId']
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        card = pg.locator(f'.war-field .war-card:has-text("{TAG}")').first
        card.click()
        pg.wait_for_selector('.war-modal', timeout=5000)
        pg.wait_for_timeout(1200)
        shot(pg, 'r5-11-reported-detail.png')
        pg.locator('.war-modal button', has_text='去处理').first.click()
        pg.wait_for_selector('.war-board', state='hidden', timeout=8000)
        pg.wait_for_timeout(5000)
        ta = pg.locator('textarea').first
        ta.click()
        pg.keyboard.type(text, delay=15)
        pg.keyboard.press('Enter')
        log('close order sent')
        t0 = time.time()
        closed = False
        while time.time() - t0 < 600:
            pg.wait_for_timeout(8000)
            b = pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")
            t = next((x for x in b['tasks'] if x['taskId'] == task_id), None)
            log(f'[{int(time.time()-t0)}s] task = {t and t["status"]}')
            if t and t['status'] == 'closed':
                closed = True
                break
        if not closed:
            raise SystemExit('收官超时')
        pg.wait_for_timeout(2000)
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_selector(ENTRY, timeout=20000)
        pg.wait_for_timeout(1500)
        pg.click(ENTRY)
        pg.wait_for_selector('.war-board', timeout=10000)
        pg.wait_for_timeout(2500)
        shot(pg, 'r5-12-final-board.png')
        br.close()


if __name__ == '__main__':
    stage = sys.argv[1] if len(sys.argv) > 1 else ''
    if stage == 'issue':
        stage_issue()
    elif stage == 'decide':
        stage_decide()
    elif stage == 'track':
        stage_track()
    elif stage == 'close':
        stage_close(sys.argv[2] if len(sys.argv) > 2 else '验收通过，收官。')
    else:
        print(__doc__)
        sys.exit(2)
