# -*- coding: utf-8 -*-
"""Light-theme 3D starfield probe: nameplate / clouds / HQ / state-pad screenshots.

Usage: python scripts/probe-light3d.py
Server must be running on :3080 with seeded smoke state.
"""
import sys

from playwright.sync_api import sync_playwright

OUT = '.goal/evidence/v18'
BASE = 'http://127.0.0.1:3080'

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOLD_LIGHT = """() => {
  const f = () => document.body.removeAttribute('data-ds-dark-theme')
  f()
  new MutationObserver(f).observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
}"""

def hold_light(page):
    # 宿主 theme-presenter 会异步写回 dark attr（V14 坑）——常驻 observer 压制；
    # reload 会清掉注入件，所以每次进页都要重打一针。
    page.evaluate(HOLD_LIGHT)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 980})
    page.goto(BASE + '/', wait_until='domcontentloaded')
    hold_light(page)
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1500)
    page.wait_for_selector('.war-dispatch', timeout=20000)
    # 3D map view
    page.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'map'); localStorage.setItem('warroom-map-hint-seen', String(Date.now())) }")
    page.reload(wait_until='domcontentloaded')
    hold_light(page)
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1500)
    hold_light(page)
    page.wait_for_timeout(500)
    page.wait_for_selector('canvas', timeout=20000)
    # default is cmd (2D) mode — switch to 3D
    page.locator('[data-wz-mode="3d"]').click()
    page.wait_for_timeout(4500)  # halo lerp + label curvature settle
    page.screenshot(path=f'{OUT}/light3d-after.png')
    print('shot: light3d-after.png')
    # zoom out for the full field (wheel on canvas; deltaY<0 = away)
    page.mouse.move(1000, 400)
    for _ in range(5):
        page.mouse.wheel(0, 320)
        page.wait_for_timeout(120)
    page.wait_for_timeout(3000)
    page.screenshot(path=f'{OUT}/light3d-after-wide.png')
    print('shot: light3d-after-wide.png')
    browser.close()
