# -*- coding: utf-8 -*-
"""V18.9 composer dual-theme visual probe: shots in light+dark, alarm expanded.

Theme hold = ONE observer with a switchable mode (two fighting observers
live-locked the page — the lesson this script encodes).
"""
import sys

from playwright.sync_api import sync_playwright

OUT = '.goal/evidence/v18'
BASE = 'http://127.0.0.1:3080'

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

INSTALL = """() => {
  window.__themeHoldMode = 'light'
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

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 980})
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.evaluate(INSTALL)
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1500)
    page.wait_for_selector('.war-dispatch', timeout=20000)

    # ---- light theme ----
    page.locator('.war-dispatch-add').click()
    page.wait_for_selector('.war-composer-modal', timeout=3000)
    page.wait_for_timeout(250)
    page.locator('[data-war-bf]').first.click()
    page.wait_for_timeout(150)
    page.locator('.war-sched-card', has_text='定时').click()
    page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/v189-composer-light.png')
    print('shot: v189-composer-light.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)

    # ---- dark theme ----（切换 hold 模式，同一 observer——两个 observer 会互搏死锁）
    page.evaluate("() => { window.__themeHoldMode = 'dark'; document.body.setAttribute('data-ds-dark-theme', '') }")
    page.wait_for_timeout(500)
    assert page.evaluate("() => document.body.hasAttribute('data-ds-dark-theme')"), 'dark attr lost'
    page.locator('.war-dispatch-add').click()
    page.wait_for_selector('.war-composer-modal', timeout=3000)
    page.wait_for_timeout(250)
    page.screenshot(path=f'{OUT}/v189-composer-dark.png')
    print('shot: v189-composer-dark.png')
    page.keyboard.press('Escape')
    browser.close()
