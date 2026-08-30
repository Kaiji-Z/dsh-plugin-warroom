# -*- coding: utf-8 -*-
"""README screenshot shooter: dark theme, .war-root element shots (host sidebar
never visible in frame — no layout surgery, zero reflow risk).

Usage: python scripts/shoot-readme.py
Server must run the playground seed (scripts/seed-playground.py) on :3080.
Shots land in docs/readme-*.png.
"""
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOLD_DARK = """() => {
  window.__themeHoldMode = 'dark'
  const f = () => {
    const want = window.__themeHoldMode === 'dark'
    if (want !== document.body.hasAttribute('data-ds-dark-theme')) {
      if (want) document.body.setAttribute('data-ds-dark-theme', '')
      else document.body.removeAttribute('data-ds-dark-theme')
    }
  }
  f()
  if (window.__themeObs === undefined) {
    window.__themeObs = new MutationObserver(f)
    window.__themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  }
}"""


def enter(page, view):
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.evaluate(HOLD_DARK)
    page.evaluate("() => { localStorage.setItem('warroom-cfg-view', '%s'); localStorage.setItem('warroom-map-hint-seen', String(Date.now())) }" % view)
    page.reload(wait_until='domcontentloaded')
    page.evaluate(HOLD_DARK)
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1600)
    page.evaluate(HOLD_DARK)
    page.wait_for_selector('.war-dispatch', timeout=20000)
    page.evaluate("""() => {
      document.querySelectorAll('button').forEach(b => {
        if ((b.textContent || '').includes('忽略')) b.click()
      })
    }""")
    page.wait_for_timeout(500)
    # dim the host shell around the plugin board so element shots have clean edges
    page.evaluate("""() => {
      const root = document.querySelector('.war-root')
      for (let el = root.parentElement; el !== document.body; el = el.parentElement) {
        el.style.background = '#0b0d12'
      }
    }""")
    page.wait_for_timeout(300)


def root_shot(page, path):
    page.locator('.war-root').first.screenshot(path=path)
    print(f'shot: {path}')


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 1000})

    # ---- shot 1: list board (island + three zones + dispatch) ----
    enter(page, 'list')
    assert page.locator('.war-board:not(.war-mapmode)').count() == 1, 'expected list view'
    root_shot(page, 'docs/readme-board.png')

    # ---- shot 2: composer (templates + fused planet/front + alarm) ----
    page.locator('.war-dispatch-add').click()
    page.wait_for_selector('.war-composer-modal', timeout=3000)
    page.wait_for_timeout(250)
    page.locator('.war-tpl').first.click()
    page.locator('[data-war-bf]').first.click()
    page.wait_for_timeout(200)
    page.locator('.war-sched-card', has_text='定时').click()
    page.wait_for_timeout(200)
    root_shot(page, 'docs/readme-composer.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(250)

    # ---- shot 3: focus page (first dock card — plan-pending command) ----
    page.locator('.war-card', has_text='多本账本').first.click()
    page.wait_for_selector('.war-modal', timeout=3000)
    page.wait_for_timeout(500)
    root_shot(page, 'docs/readme-focus.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(250)

    # ---- shot 4: 3D starfield hero ----
    enter(page, 'map')
    assert page.locator('.war-mapmode').count() >= 1, 'expected map view'
    page.wait_for_selector('canvas', timeout=20000)
    page.evaluate("() => document.querySelector('[data-wz-mode=\"3d\"]').click()")
    page.wait_for_timeout(2500)
    page.mouse.move(720, 450)
    for _ in range(4):
        page.mouse.wheel(0, 340)
        page.wait_for_timeout(140)
    page.mouse.move(780, 150)  # park cursor on empty canvas (page coords: root starts at x=280)
    page.wait_for_timeout(3200)
    root_shot(page, '.goal/evidence/v18/shoot-readme-starfield.png')  # 自动镜头不入 docs——README hero 用元首实拍（元首文件重跑会覆盖）

    # ---- shot 5: 2D tactical view (default cmd mode of the map) ----
    enter(page, 'map')
    page.wait_for_selector('canvas', timeout=20000)
    page.wait_for_timeout(2500)
    root_shot(page, 'docs/readme-2d.png')

    # ---- shot 6: hover family (list view; hover a 3-gen chain card -> pipes + highlight) ----
    enter(page, 'list')
    card = page.locator('.war-dispatch .war-command-card', has_text='compose').first
    card.hover()
    page.wait_for_timeout(1200)
    root_shot(page, 'docs/readme-hover.png')

    # ---- shot 7: island pinned/expanded (点击钉住——展开浮层在岛元素框外，须区域裁剪) ----
    enter(page, 'list')
    page.locator('.war-island').hover()
    page.wait_for_timeout(700)
    page.locator('.war-island').click()
    page.wait_for_timeout(700)
    box = page.locator('.war-island').first.bounding_box()
    clip = {'x': max(0, box['x'] - 8), 'y': max(0, box['y'] - 8), 'width': min(1700 - box['x'], box['width'] + 760), 'height': min(box['y'] + box['height'] + 560, 990 - box['y'])}
    page.screenshot(path='docs/readme-island.png', clip=clip)
    print('shot: docs/readme-island.png')

    browser.close()
