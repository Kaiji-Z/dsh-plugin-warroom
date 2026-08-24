# -*- coding: utf-8 -*-
"""v3 R3 收官考题驱动（真实 LLM 八步）。

用法: python scripts/exam-v3.py <stage>
stages:
  issue   步1-3: 下命令(经板 UI composer) → 草稿卡 → 参谋接收(received+独立会话)
  open    步2前置: 打开参谋会话(经板卡「去处理」) 并 dump dsh 聊天 DOM 概况
  reply   步3: 以元首身份在参谋会话输入框发送澄清答复(--text "...")
  track   步4-6: 轮询板直到任务 reported, 途中在 任务落栏/进行中/待翻阅 各拍一张
  close   步7-8: 经 reported 卡「去处理」跳回参谋会话发收官令(--text), 轮询任务
           已完成, 终拍 已完成/已失败 分区

环境: 服务器 http://127.0.0.1:3080 (smoke overlay, .smoke-state)。
截图落 .goal/evidence/v3/。SSE 长连接在, 一律 domcontentloaded, 禁 networkidle。
"""
import sys, io, time, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
EV = '.goal/evidence/v3'
ENTRY = '[data-dsh-warroom-entry]'
EXAM_TAG = '每日格言'   # 考题命令的特征词, 用于在板上定位考题卡


def log(*a):
    print(*a, flush=True)


def open_board(pg, shot=None):
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector(ENTRY, timeout=20000)
    # 水合竞态已修, 但仍稍等 app 稳定再点
    pg.wait_for_timeout(1500)
    pg.click(ENTRY)
    pg.wait_for_selector('.war-board', timeout=10000)
    pg.wait_for_function("document.documentElement.getAttribute('data-dsh-warroom-active') !== null", timeout=5000)
    if shot:
        pg.screenshot(path=f'{EV}/{shot}')
        log('shot:', shot)
    return pg


def board_api(pg):
    return pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")


def find_exam(b):
    """板上含 EXAM_TAG 的命令卡。"""
    for c in b['commands']:
        if EXAM_TAG in c['text']:
            return c
    return None


def wait_board_card(pg, pred, what, timeout=240):
    """轮询板 API 直到 pred(命令卡) 成立。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        b = board_api(pg)
        c = find_exam(b)
        if c and pred(c):
            return c, b
        time.sleep(2)
    raise TimeoutError(f'等待{what}超时')


def find_chat_input(pg):
    """dsh 聊天输入框: 可见 textarea 或 contenteditable。"""
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
        raise RuntimeError('找不到聊天输入框(textarea/contenteditable 均无)')
    box.click()
    pg.keyboard.type(text, delay=15)
    pg.keyboard.press('Enter')
    log('sent:', text[:60], '...')


def transcript_tail(pg, n=700):
    return pg.evaluate("document.body.innerText.slice(-%d)" % n)


# ---------------------------------------------------------------- stages

def stage_issue():
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_selector(ENTRY, timeout=20000)
        pg.wait_for_timeout(1500)
        pg.click(ENTRY)
        pg.wait_for_selector('.war-board', timeout=10000)
        pg.screenshot(path=f'{EV}/r3-01-command-zone.png')
        log('shot: r3-01-command-zone.png')

        # 步1: 经板 UI 下达命令(故意含糊, 逼参谋澄清)
        pg.click('button.war-plus')
        pg.wait_for_selector('.war-modal textarea', timeout=5000)
        cmd = ('给日常工具箱加一个每日格言小工具，先做出能用的最小版本')
        pg.fill('.war-modal textarea', cmd)
        pg.screenshot(path=f'{EV}/r3-02-composer.png')
        log('shot: r3-02-composer.png')
        pg.click('.war-modal button.war-btn.primary')
        pg.wait_for_selector('.war-modal', state='detached', timeout=10000)

        # 步1落账: 卡出现(草稿)
        c, b = wait_board_card(pg, lambda c: True, '考题卡出现', 30)
        log('command created:', c['commandId'], c['status'])
        pg.wait_for_timeout(1200)
        pg.screenshot(path=f'{EV}/r3-03-command-draft.png')
        log('shot: r3-03-command-draft.png')

        # 步2前置: 等参谋接收(独立会话)
        c, b = wait_board_card(pg, lambda c: c['status'] == 'received' and c['secretarySessionId'], '参谋接收', 60)
        log('received by session:', c['secretarySessionId'])
        pg.wait_for_timeout(2500)  # SSE 刷新卡面
        pg.screenshot(path=f'{EV}/r3-04-command-received.png')
        log('shot: r3-04-command-received.png')

        with open('.goal/evidence/v3/r3-exam-command.json', 'w', encoding='utf-8') as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
        br.close()


def stage_open():
    """打开参谋会话: received 命令卡点击=直达会话(纯跳转设计), dump 聊天与输入框。"""
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        # received 命令卡本身就是邀请: 点击 → markTalking + sessions.open → 板自动关
        card = pg.locator(f'.war-hq .war-card:has-text("{EXAM_TAG}")').first
        card.click()
        pg.wait_for_selector('.war-board', state='hidden', timeout=8000)  # 切会话自动关板
        pg.wait_for_timeout(6000)  # 等参谋会话与首批回复加载
        log('--- transcript tail ---')
        log(transcript_tail(pg, 1600))
        box = find_chat_input(pg)
        log('chat input found:', box is not None)
        pg.screenshot(path=f'{EV}/r3-05-staff-session.png')
        log('shot: r3-05-staff-session.png')
        br.close()


def stage_reply(text):
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        # 直接在当前(参谋)会话页发话: 重新进入后 dsh 默认恢复上次会话
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_timeout(6000)
        before = transcript_tail(pg, 400)
        send_chat(pg, text)
        pg.wait_for_timeout(1500)
        # 等参谋回应: 转录变长且出现新内容
        t0 = time.time()
        while time.time() - t0 < 240:
            pg.wait_for_timeout(5000)
            now = transcript_tail(pg, 4000)
            if len(now) > 0 and now != before and time.time() - t0 > 30:
                # 稳定判定: 再等 10s 无变化
                snap = transcript_tail(pg, 4000)
                pg.wait_for_timeout(10000)
                if transcript_tail(pg, 4000) == snap:
                    break
        pg.screenshot(path=f'{EV}/r3-07-staff-reply.png')
        log('shot: r3-07-staff-reply.png')
        log('--- transcript tail ---')
        log(transcript_tail(pg, 1500))
        br.close()


def stage_track():
    """轮询板: 任务落栏(published) → 进行中 → 待翻阅(reported), 各拍一张。"""
    shots = {'published': False, 'in_progress': False, 'reported': False}
    with open(f'{EV}/r3-exam-command.json', encoding='utf-8') as f:
        cmd = json.load(f)
    task_id = cmd.get('taskId')
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        # 若命令还没 approved, 先等批准落 taskId
        t0 = time.time()
        while task_id is None and time.time() - t0 < 300:
            b = board_api(pg)
            for c in b['commands']:
                if c['commandId'] == cmd['commandId'] and c.get('taskId'):
                    task_id = c['taskId']
            time.sleep(3)
        if task_id is None:
            raise TimeoutError('命令未被批准为任务(300s)')
        log('task landed:', task_id)
        t0 = time.time()
        while time.time() - t0 < 900:
            b = board_api(pg)
            t = next((x for x in b['tasks'] if x['taskId'] == task_id), None)
            st = t['status'] if t else None
            log(f'[{int(time.time()-t0)}s] task status = {st}')
            if st in ('published', 'in_progress') and not shots[st]:
                pg.wait_for_timeout(2000)
                pg.screenshot(path=f'{EV}/r3-0{8 if st=="published" else 9}-task-{st}.png')
                log('shot: task', st)
                shots[st] = True
            if st == 'reported':
                pg.wait_for_timeout(2500)
                pg.screenshot(path=f'{EV}/r3-10-task-reported.png')
                log('shot: r3-10-task-reported.png')
                shots['reported'] = True
                break
            time.sleep(6)
        if not shots['published']:
            log('WARN: published 阶段未捕获(可能直接跳进行中)')
        if not all(shots.values()):
            raise TimeoutError(f'任务未到 reported: {shots}')
        br.close()


def stage_close(text):
    """步7-8: 待翻阅卡「去处理」跳参谋会话收官 → 任务入已完成。"""
    with open(f'{EV}/r3-exam-command.json', encoding='utf-8') as f:
        cmd = json.load(f)
    task_id = cmd.get('taskId')
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg, shot='r3-11-before-close.png')
        # reported 卡: 战场「待翻阅」组 → 点卡 → 详情浮层「去处理 · 参谋会话」
        card = pg.locator(f'.war-field .war-card:has-text("{EXAM_TAG}")').first
        card.click()
        pg.wait_for_selector('.war-modal', timeout=5000)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=f'{EV}/r3-12-reported-detail.png')
        log('shot: r3-12-reported-detail.png')
        pg.locator('.war-modal button', has_text='去处理').first.click()
        pg.wait_for_selector('.war-board', state='hidden', timeout=8000)
        pg.wait_for_timeout(5000)
        log('--- transcript tail before close order ---')
        log(transcript_tail(pg, 800))
        send_chat(pg, text)
        # 等参谋执行收官(任务翻 closed)
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
            raise TimeoutError('收官超时(600s)')
        # 终拍: 回板看已完成/已失败分区
        pg.wait_for_timeout(2000)
        pg.goto(BASE, wait_until='domcontentloaded')
        pg.wait_for_selector(ENTRY, timeout=20000)
        pg.wait_for_timeout(1500)
        pg.click(ENTRY)
        pg.wait_for_selector('.war-board', timeout=10000)
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{EV}/r3-13-final-board.png')
        log('shot: r3-13-final-board.png')
        log('--- final transcript tail ---')
        br.close()


def stage_decide(option_text, fallback_text):
    """步3 批准: 在决策卡上点选项(优先)或聊天文字兜底, 等参谋发布悬赏。"""
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)
        card = pg.locator(f'.war-hq .war-card:has-text("{EXAM_TAG}")').first
        card.click()
        pg.wait_for_selector('.war-board', state='hidden', timeout=8000)
        pg.wait_for_timeout(5000)
        clicked = False
        try:
            opt = pg.locator(f'div:has-text("{option_text}")').last
            opt.click(timeout=4000)
            clicked = True
            log('decision card option clicked:', option_text)
        except Exception as e:
            log('option click failed ->', type(e).__name__, '; fallback to chat')
        if not clicked:
            send_chat(pg, fallback_text)
        # 等参谋下一轮(发布悬赏): 命令翻 approved + taskId
        t0 = time.time()
        ok = False
        while time.time() - t0 < 420:
            pg.wait_for_timeout(8000)
            b = pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")
            c = find_exam(b)
            if c and c['status'] == 'approved' and c.get('taskId'):
                log('APPROVED -> task', c['taskId'], f'({int(time.time()-t0)}s)')
                ok = True
                break
            log(f'[{int(time.time()-t0)}s] command status = {c and c["status"]}')
        pg.screenshot(path=f'{EV}/r3-06-staff-published.png')
        log('shot: r3-06-staff-published.png')
        log('--- transcript tail ---')
        log(transcript_tail(pg, 900))
        if not ok:
            raise TimeoutError('参谋未在 420s 内发布悬赏')
        # 回写考题命令档案(带 taskId)
        with open(f'{EV}/r3-exam-command.json', 'w', encoding='utf-8') as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
        br.close()


def live_buttons(pg):
    return pg.evaluate("() => [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim().replace(/\\n/g, ' | ')).filter(t => t && !t.startsWith('DSH'))")


def click_option_button(pg, needle):
    """决策卡选项是 <button>: 文本如 '1 | @new:daily-toolbox | 推荐 | …'。"""
    btns = pg.locator(f'button:has-text("{needle}")')
    n = btns.count()
    if n == 0:
        return False
    btns.first.click()
    log('clicked option button:', needle)
    return True


def enter_staff_session(pg):
    """显式经板卡切进参谋会话(不依赖页面恢复的 current)。"""
    open_board(pg)
    card = pg.locator(f'.war-hq .war-card:has-text("{EXAM_TAG}")').first
    card.click()
    # 已是 current 时不关板(无切换), 两种都接受; 等会话视图就绪
    pg.wait_for_timeout(5000)
    # 若板还开着(挡住聊天), 用 Escape/再点侧栏行关掉
    if pg.locator('.war-board').first.is_visible():
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(1000)


def stage_decide2(opt1, opt2):
    """步3 批准(分页提问卡版): 经板卡进参谋会话, 逐题点选项(必要时「下一题」),
    有「提交」就提交, 等命令翻 approved+taskId。"""
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 1680, 'height': 980})
        enter_staff_session(pg)
        done1 = done2 = False
        t0 = time.time()
        ok = False
        c = None
        while time.time() - t0 < 600:
            if not done1 and click_option_button(pg, opt1):
                done1 = True
                pg.wait_for_timeout(4000)
                # 分页卡: 选项点完可能要「下一题」
                nxt = pg.locator('button', has_text='下一题')
                if nxt.count() > 0:
                    nxt.first.click()
                    log('clicked 下一题')
                pg.wait_for_timeout(4000)
                continue
            if done1 and opt2 and not done2 and click_option_button(pg, opt2):
                done2 = True
                pg.wait_for_timeout(3000)
                sub = pg.locator('button', has_text='提交')
                if sub.count() > 0:
                    sub.first.click()
                    log('clicked 提交')
                pg.wait_for_timeout(5000)
                pg.screenshot(path=f'{EV}/r3-06-approval-submitted.png')
                log('shot: r3-06-approval-submitted.png')
                continue
            b = pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")
            c = find_exam(b)
            st = c and c['status']
            log(f'[{int(time.time()-t0)}s] cmd={st} cards={done1}/{done2}')
            if c and c['status'] == 'approved' and c.get('taskId'):
                log('APPROVED -> task', c['taskId'])
                ok = True
                break
            pg.wait_for_timeout(10000)
        pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{EV}/r3-06-staff-published.png')
        log('shot: r3-06-staff-published.png')
        log('--- live buttons ---')
        for t in live_buttons(pg):
            log('  btn:', t[:100])
        log('--- transcript tail ---')
        log(transcript_tail(pg, 1400))
        if not ok:
            raise TimeoutError(f'未 approved: cards {done1}/{done2}')
        with open(f'{EV}/r3-exam-command.json', 'w', encoding='utf-8') as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
        br.close()


if __name__ == '__main__':
    stage = sys.argv[1] if len(sys.argv) > 1 else ''
    if stage == 'issue':
        stage_issue()
    elif stage == 'open':
        stage_open()
    elif stage == 'decide':
        stage_decide(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '选推荐项，批准任务书。')
    elif stage == 'decide2':
        stage_decide2(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
    elif stage == 'reply':
        stage_reply(sys.argv[2])
    elif stage == 'track':
        stage_track()
    elif stage == 'close':
        stage_close(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
