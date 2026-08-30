# -*- coding: utf-8 -*-
"""HQ modal fix probe: click HQ on 3D map -> modal must be backdrop-centered."""
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 1000})
    page.goto('http://127.0.0.1:3080/', wait_until='domcontentloaded')
    page.evaluate("""() => {
      window.__themeHoldMode = 'dark'
      const f = () => { if (!document.body.hasAttribute('data-ds-dark-theme')) document.body.setAttribute('data-ds-dark-theme', '') }
      f()
      if (window.__themeObs === undefined) { window.__themeObs = new MutationObserver(f); window.__themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] }) }
    }""")
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1600)
    page.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'map'); localStorage.setItem('warroom-map-hint-seen', String(Date.now())) }")
    page.reload(wait_until='domcontentloaded')
    page.evaluate("""() => {
      window.__themeHoldMode = 'dark'
      const f = () => { if (!document.body.hasAttribute('data-ds-dark-theme')) document.body.setAttribute('data-ds-dark-theme', '') }
      f()
      if (window.__themeObs === undefined) { window.__themeObs = new MutationObserver(f); window.__themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] }) }
    }""")
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1600)
    page.wait_for_selector('canvas', timeout=20000)
    page.evaluate("() => document.querySelector('[data-wz-mode=\"3d\"]').click()")
    page.wait_for_timeout(2500)
    # click HQ via the debug handle: hqScreen -> elementFromPoint verify -> mouse
    pos = page.evaluate("""() => {
      const hq = window.__wz.hqScreen()
      if (hq === null) return null
      const root = document.querySelector('.war-starfield')
      const r = root.getBoundingClientRect()
      return { x: r.x + hq.x, y: r.y + hq.y }
    }""")
    assert pos is not None, 'hq screen pos unavailable'
    page.mouse.click(pos['x'], pos['y'])
    page.wait_for_timeout(600)
    state = page.evaluate("""() => {
      const bd = document.querySelector('.war-modal-backdrop')
      const modal = document.querySelector('.war-modal')
      if (bd === null || modal === null) return { ok: false }
      const br = bd.getBoundingClientRect(), mr = modal.getBoundingClientRect()
      return {
        ok: true,
        backdropFixed: getComputedStyle(bd).position === 'fixed',
        centered: Math.abs((mr.x + mr.width / 2) - (br.x + br.width / 2)) < 40 && Math.abs((mr.y + mr.height / 2) - (br.height / 2)) < 80,
        title: (modal.querySelector('.war-hq-picker-title') || {}).textContent ?? null,
        rows: modal.querySelectorAll('.war-hq-picker-row').length,
      }
    }""")
    print('HQ modal state:', state)
    assert state.get('ok') and state['backdropFixed'] and state['centered'], 'HQ modal is not a proper backdrop modal'
    page.locator('.war-root').first.screenshot(path='.goal/evidence/v18/hq-modal-fixed.png')
    print('shot: hq-modal-fixed.png')
    browser.close()
