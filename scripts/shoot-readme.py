# -*- coding: utf-8 -*-
"""README screenshot shooter — ALL shots dark + starfield view (元首令 2026-08-30).

Server must run the playground seed (scripts/seed-playground.py) on :3080.
Shots land in docs/readme-*.png. The auto starfield capture goes to
.goal/evidence/ — the README hero is the 元首's own screenshot, never overwritten.
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
    page.wait_for_timeout(400)
    page.wait_for_timeout(800)
    page.evaluate("""() => {
      const root = document.querySelector('.war-root')
      for (let el = root.parentElement; el !== document.body; el = el.parentElement) {
        el.style.background = '#0b0d12'
      }
    }""")
    page.wait_for_timeout(200)


def enter_map3d(page):
    """map view + 3D mode + zoomed out a touch for framing."""
    enter(page, 'map')
    page.wait_for_selector('canvas', timeout=20000)
    page.evaluate("() => document.querySelector('[data-wz-mode=\"3d\"]').click()")
    page.wait_for_timeout(2500)
    page.mouse.move(720, 450)
    for _ in range(2):
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(140)
    page.mouse.move(120, 950)  # park off-canvas (dispatch area)
    page.wait_for_timeout(2600)


def root_shot(page, path):
    page.locator('.war-root').first.screenshot(path=path)
    print(f'shot: {path}')


PAGER_WS = 'D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-stardeck/.smoke-state/ws/projB/pager'

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 1000})

    # ---- shot 1: starfield board (pods over the 3D field) ----
    enter_map3d(page)
    root_shot(page, 'docs/readme-board.png')

    # ---- shot 2: composer modal over the starfield ----
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

    # ---- shot 3: focus page over the starfield (L1 plan-pending) ----
    page.locator('.war-dispatch .war-command-card', has_text='多本账本').first.click()
    page.wait_for_selector('.war-modal', timeout=3000)
    page.wait_for_timeout(500)
    root_shot(page, 'docs/readme-focus.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(250)

    # ---- shot 4: planet hover -> family highlight (starfield native) ----
    ppos = page.evaluate("""(ws) => {
      const root = document.querySelector('.war-starfield')
      const r = root.getBoundingClientRect()
      const p = window.__wz.planetScreen(ws)
      return p === null ? null : { x: r.x + p.x, y: r.y + p.y }
    }""", PAGER_WS)
    assert ppos is not None, 'pager planet not on screen'
    page.mouse.move(ppos['x'], ppos['y'], steps=4)
    page.wait_for_timeout(1500)
    root_shot(page, 'docs/readme-hover.png')
    page.mouse.move(120, 950)
    page.wait_for_timeout(400)

    # ---- shot 5: island pinned over the starfield ----
    page.locator('.war-island').hover()
    page.wait_for_timeout(700)
    page.locator('.war-island').click()
    page.wait_for_timeout(700)
    box = page.locator('.war-island').first.bounding_box()
    clip = {'x': max(0, box['x'] - 8), 'y': max(0, box['y'] - 8),
            'width': min(1700 - box['x'], box['width'] + 760),
            'height': min(box['y'] + box['height'] + 560, 990 - box['y'])}
    page.screenshot(path='docs/readme-island.png', clip=clip)
    print('shot: docs/readme-island.png')

    # ---- shot 6: 2D tactical radar ----
    enter(page, 'map')
    page.wait_for_selector('canvas', timeout=20000)
    page.wait_for_timeout(2500)
    root_shot(page, 'docs/readme-2d.png')

    browser.close()
