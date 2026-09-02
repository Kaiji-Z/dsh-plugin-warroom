# -*- coding: utf-8 -*-
"""Final assertion: exam task sits in the 已完成 zone; 已失败 zone intact."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
ENTRY = '[data-dsh-warroom-entry]'

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 1680, 'height': 980})
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector(ENTRY, timeout=20000)
    pg.wait_for_timeout(1500)
    pg.click(ENTRY)
    pg.wait_for_selector('.war-board', timeout=10000)
    pg.wait_for_timeout(2500)
    # API 态
    b = pg.evaluate("fetch('/warroom/api/board').then(r=>r.json())")
    t = next(x for x in b['tasks'] if x['taskId'] == '20260824-142032-032a')
    print('API task status:', t['status'])
    # DOM 分区: 已完成列(今天组)含考题卡; 已失败列仍在
    done_card = pg.locator('.war-field .war-col:has-text("已完成") .war-card', has_text='每日格言')
    fail_col = pg.locator('.war-field .war-col', has_text='已失败')
    print('done-zone has exam card:', done_card.count() > 0)
    print('fail-zone exists:', fail_col.count() > 0)
    if fail_col.count() > 0:
        print('fail-zone cards:', fail_col.locator('.war-card').count())
    ok = t['status'] == 'closed' and done_card.count() > 0 and fail_col.count() > 0
    print('FINAL:', 'PASS' if ok else 'FAIL')
    br.close()
    sys.exit(0 if ok else 1)
