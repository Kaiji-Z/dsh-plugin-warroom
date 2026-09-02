# -*- coding: utf-8 -*-
"""三皮肤目检取证（文案审计轮·批次3 挂账）：trek/war/plain 各截一张整板。

前置：playground 三步（停服 → seed-playground.py → cordis.smoke.yml 起服 :3080）。
用法: python scripts/shoot-skins.py [输出目录=证 .goal/evidence/audit-skins]
SSE 长连接在，一律 domcontentloaded + 选择器等待；入口是开关——只在板未开时点。
"""
import sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '.goal/evidence/audit-skins')
SKINS = [('trek', '舰桥（星际迷航，默认）'), ('war', '作战室（军事）'), ('plain', '工作台（平话）')]

def open_board(pg):
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
    pg.wait_for_timeout(600)
    # 入口是开关：板已开（localStorage 恢复）就别再点——点了反而关上。
    if not pg.locator('.war-dispatch').is_visible():
        pg.locator('[data-dsh-warroom-entry]').click()
    pg.wait_for_selector('.war-dispatch', state='visible', timeout=15000)
    pg.wait_for_timeout(2500)  # 等首屏卡片/SSE 首帧落定

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={'width': 1600, 'height': 900})
        for skin, label in SKINS:
            pg.goto(BASE, wait_until='domcontentloaded')
            pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=15000)
            pg.evaluate(f"() => localStorage.setItem('warroom-skin', '{skin}')")
            open_board(pg)
            dest = OUT / f'skin-{skin}.png'
            pg.screenshot(path=str(dest), full_page=False)
            print(f'✓ {skin:5s} {label} → {dest}')
        browser.close()
    print('DONE — 三皮肤截图落盘，请肉眼复核：词表派生/星域地图/证据行/取消原因行')

if __name__ == '__main__':
    main()
