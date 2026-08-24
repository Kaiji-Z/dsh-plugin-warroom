# -*- coding: utf-8 -*-
"""Probe the V4 exam staff session: transcript tail + live buttons."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
ENTRY = '[data-dsh-warroom-entry]'
TAG = 'V4 能力考题'

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 1680, 'height': 980})
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector(ENTRY, timeout=20000)
    pg.wait_for_timeout(1500)
    pg.click(ENTRY)
    pg.wait_for_selector('.war-board', timeout=10000)
    pg.locator(f'.war-hq .war-card:has-text("{TAG}")').first.click()
    pg.wait_for_timeout(6000)
    if pg.locator('.war-board').first.is_visible():
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(1000)
    print('--- live buttons ---')
    for t in pg.evaluate("() => [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim().replace(/\\n/g, ' | ')).filter(t => t && !t.startsWith('DSH'))"):
        print('  btn:', t[:110])
    print('--- transcript tail ---')
    print(pg.evaluate("document.body.innerText.slice(-2200)"))
    br.close()
