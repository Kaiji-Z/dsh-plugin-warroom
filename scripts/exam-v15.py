# -*- coding: utf-8 -*-
"""v15 实弹考题驱动（真实 LLM：两代续接链，验 V15 三件套的行为价值）。

考题设计（因果链）：
  代1 命令（带【战场：】标记 + !!直接做）→ 参谋 L0 直发 → 指挥官在真实工作区
      创建 manifest/v15-manifest.json（token 由 LLM 现场随机生成——任何命令原文
      都不含它）→ 提交 evidence.files → KillCredit 自动收官。
  代2 命令（continuesFrom 代1 + 战线名「exam战线」）→ deepen 续接：
      参谋收【战线档案】（buildChainNote：上代战报摘要+产物路径）、指挥官收
      【战线前情】（buildCommanderChainBrief）→ 产出 summary/v15-summary.md
      引用上代 token → 自动收官。
  机检断言见 assert-v15.py：T1 值出现在下游 = 链档案注入真实送达并被使用。

用法: python scripts/exam-v15.py <stage>
stages:
  issue   下代1命令（POST /warroom/api/commands）→ 等 received → 拍板照
  track1  轮询板直到代1收官/失败 → 落盘板 JSON + 战役账本 + 读盘提取 T1
  issue2  下代2命令（continuesFrom=代1 + name）→ 等 received
  track2  轮询板直到代2收官/失败 → 落盘
  close   终拍（战线组头命名 + Ⅱ 徽标）+ 全量账本归档

环境: 服务器 http://127.0.0.1:3080（smoke overlay，.smoke-state 已清空）；
考题工作区 C:/Users/kaiji/vibecodingKJ/temp/exam-v15-ws（脚本外先删旧）。
证据落 .goal/evidence/v15/。SSE 长连接在，一律 domcontentloaded。
"""
import sys, io, time, json, os, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
EV = '.goal/evidence/v15'
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS = 'C:/Users/kaiji/vibecodingKJ/temp/exam-v15-ws'
TAG1 = 'V15代1考题'
TAG2 = 'V15代2考题'

CMD1 = (f'【战场：{WS}】V15代1考题：在本工作区创建 manifest/v15-manifest.json，'
        '内容是一个 JSON 对象，含字段 token（现场随机生成的 8 位十六进制字符串）、'
        'items（数字 3）、note（一行中文说明）。'
        '验收：文件存在、JSON 可解析、token 字段是 8 位十六进制。!!直接做')
CMD2 = ('V15代2考题：续接这条战线——先看懂上代战况与产物（战线档案），'
        '再基于上代清单新增 summary/v15-summary.md：引用上代 token 与 items 数值，'
        '并写一句说明本任务如何续在上代成果上。'
        '验收：summary 文件存在且引用了上代 token 数值。!!直接做')


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
    pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
    pg.wait_for_timeout(1500)
    pg.click('[data-dsh-warroom-entry]')
    pg.wait_for_selector('.war-root', timeout=10000)


def poll(pg, pred, what, timeout=1500):
    t0 = time.time()
    while time.time() - t0 < timeout:
        b = board_api(pg)
        r = pred(b)
        if r is not None:
            return r
        time.sleep(10)
    raise SystemExit(f'TIMEOUT: {what}（{int(timeout)}s）')


def dump_campaign(task_id):
    src = f'.smoke-state/campaigns/{task_id}.jsonl'
    if os.path.exists(src):
        shutil.copy(src, f'{EV}/r15-campaign-{task_id}.jsonl')
        log('campaign dumped:', task_id)


def dump_directives():
    if os.path.exists('.smoke-state/directives.jsonl'):
        shutil.copy('.smoke-state/directives.jsonl', f'{EV}/r15-directives.jsonl')
        log('directives dumped')


def cmd_with_task(b, tag):
    c = find_cmd(b, tag)
    if c is not None and c.get('taskId'):
        return c
    return None


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else 'issue'
    os.makedirs(EV, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={'width': 1680, 'height': 980})
        open_board(pg)

        if stage == 'issue':
            # 考场目录预建（真实语义：【战场：】=元首显式选一个已存在的工作区）。
            os.makedirs(WS, exist_ok=True)
            r = post(pg, '/warroom/api/commands', {'text': CMD1})
            log('gen1 issue:', json.dumps(r, ensure_ascii=False))
            assert r.get('ok'), f'gen1 下令失败: {r}'
            # 等参谋接收（有 taskId 前先看 staffSessionId）
            poll(pg, lambda b: find_cmd(b, TAG1) is not None and find_cmd(b, TAG1).get('staffSessionId'), '代1 参谋接收', 300)
            shot(pg, 'r15-01-gen1-received.png')

        elif stage == 'track1':
            # 终态判据：命令 approved 且任务已成形（taskId 在板）；或整令失败/取消。
            def gen1_done(b):
                c = find_cmd(b, TAG1)
                if c is None:
                    return None
                if c.get('status') in ('failed', 'cancelled'):
                    return c
                if c.get('status') == 'approved' and c.get('taskId'):
                    task = next((t for t in b.get('tasks', []) if t.get('taskId') == c['taskId']), None)
                    if task is not None and task.get('status') in ('closed', 'failed'):
                        return c
                return None
            poll(pg, gen1_done, '代1 终态', 1500)
            c = find_cmd(board_api(pg), TAG1)
            log('gen1 final:', json.dumps({k: c.get(k) for k in ('commandId', 'status', 'taskId')}, ensure_ascii=False))
            b = board_api(pg)
            with open(f'{EV}/r15-board-gen1.json', 'w', encoding='utf-8') as f:
                json.dump(b, f, ensure_ascii=False, indent=1)
            if c.get('taskId'):
                dump_campaign(c['taskId'])
            dump_directives()
            # 读盘提取 T1（token 由代1 LLM 现场生成）
            manifest = os.path.join(WS, 'manifest', 'v15-manifest.json')
            if os.path.exists(manifest):
                shutil.copy(manifest, f'{EV}/r15-manifest.json')
                tok = json.load(open(manifest, encoding='utf-8')).get('token', '')
                open(f'{EV}/r15-token.txt', 'w').write(tok)
                log('T1 extracted:', tok)
            else:
                log('WARN: manifest 未落盘（代1 未收官或未建文件）')
            shot(pg, 'r15-02-gen1-closed.png')

        elif stage == 'issue2':
            tok = open(f'{EV}/r15-token.txt').read().strip()
            assert len(tok) == 8, f'T1 缺失或形状不对: {tok!r}'
            b = board_api(pg)
            c1 = find_cmd(b, TAG1)
            assert c1 is not None, '板上找不到代1命令'
            r = post(pg, '/warroom/api/commands', {'text': CMD2, 'continuesFrom': c1['commandId'], 'name': 'exam战线'})
            log('gen2 issue:', json.dumps(r, ensure_ascii=False))
            assert r.get('ok'), f'gen2 下令失败: {r}'
            log('continuationMode:', r.get('continuationMode'))
            poll(pg, lambda b: find_cmd(b, TAG2) is not None and find_cmd(b, TAG2).get('staffSessionId'), '代2 参谋接收', 300)
            shot(pg, 'r15-03-gen2-received.png')

        elif stage == 'track2':
            # 终态判据与 track1 同构（命令 approved+taskId 且任务 closed/failed；
            # 或整令失败/取消）。注意谓词返回命令对象或 None——布尔会让 poll 把
            # 任何非 None 当成功（首版实锤：received 态即退出，证据全拍早了）。
            def gen2_done(b):
                c = find_cmd(b, TAG2)
                if c is None:
                    return None
                if c.get('status') in ('failed', 'cancelled'):
                    return c
                if c.get('status') == 'approved' and c.get('taskId'):
                    task = next((t for t in b.get('tasks', []) if t.get('taskId') == c['taskId']), None)
                    if task is not None and task.get('status') in ('closed', 'failed'):
                        return c
                return None
            poll(pg, gen2_done, '代2 终态', 1500)
            b = board_api(pg)
            with open(f'{EV}/r15-board-gen2.json', 'w', encoding='utf-8') as f:
                json.dump(b, f, ensure_ascii=False, indent=1)
            c2 = find_cmd(b, TAG2)
            if c2.get('taskId'):
                dump_campaign(c2['taskId'])
            dump_directives()
            summary = os.path.join(WS, 'summary', 'v15-summary.md')
            if os.path.exists(summary):
                shutil.copy(summary, f'{EV}/r15-summary.md')
                log('summary copied')
            else:
                log('WARN: summary 未落盘')
            shot(pg, 'r15-04-gen2-closed.png')

        elif stage == 'close':
            shot(pg, 'r15-05-final-board.png')
            dump_directives()
            b = board_api(pg)
            with open(f'{EV}/r15-board-final.json', 'w', encoding='utf-8') as f:
                json.dump(b, f, ensure_ascii=False, indent=1)
            log('final board dumped; commands:', len(b.get('commands', [])))

        browser.close()


if __name__ == '__main__':
    main()
