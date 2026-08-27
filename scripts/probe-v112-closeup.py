# 母舰特写探针：拉近+换角度拍三张，供目检建模细节。
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(r'C:/Users/kaiji/vibecodingKJ/temp')
BASE = 'http://127.0.0.1:3080'

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.add_init_script("() => { document.body && (document.body.dataset.dsDarkTheme = '') }")
    page.goto(f'{BASE}/?warroom=1', wait_until='domcontentloaded')
    page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_selector('.war-starfield3d', timeout=20000)
    page.wait_for_selector('.war-planet[data-ws-index]', timeout=10000)
    page.wait_for_timeout(4000)
    bb = page.locator('.war-starfield3d').bounding_box()
    cx, cy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2 - 100
    # 1) 默认机位全景
    page.screenshot(path=str(OUT / 'v112_z0_default.png'))
    # 2) 连续滚轮推进（dist 降到近限附近）
    page.mouse.move(cx, cy)
    for _ in range(14):
        page.mouse.wheel(0, -350)
        page.wait_for_timeout(60)
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / 'v112_z1_close.png'))
    # 3) 中键旋转一个角度再拍（看侧舷）
    page.mouse.down(button='middle')
    page.mouse.move(cx + 200, cy + 120, steps=10)
    page.mouse.up(button='middle')
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT / 'v112_z2_angle.png'))
    ctx.close()
    browser.close()
print('done')
