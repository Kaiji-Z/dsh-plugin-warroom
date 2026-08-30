# -*- coding: utf-8 -*-
"""Repro: hover pager planet -> hover other planets -> pipe stuck?"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
OUT = '.goal/evidence/v18'

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def api(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.load(r)


board = api('/warroom/api/board')
ws_paths = sorted({t['workspacePath'] for t in board.get('tasks', []) if t.get('workspacePath')})
print('ws candidates:', len(ws_paths))

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 980})
    errors = []
    page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    page.on('console', lambda m: errors.append('CONSOLE-ERR: ' + m.text) if m.type == 'error' else None)
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1500)
    page.wait_for_selector('.war-dispatch', timeout=20000)
    page.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'map'); localStorage.setItem('warroom-map-hint-seen', String(Date.now())) }")
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1500)
    page.wait_for_selector('canvas', timeout=20000)
    page.locator('[data-wz-mode="3d"]').click()
    page.wait_for_timeout(2500)

    def pipe_state(tag):
        return page.evaluate("""(tag) => {
          const svg = document.querySelector('.war-pipe-svg')
          const on = document.querySelectorAll('.war-pipe-svg g.on')
          const hues = Array.from(on).map(g => g.getAttribute('class'))
          return { tag, hasSvg: svg !== null, activeN: on.length, hues }
        }""", tag)

    # map ws -> screen pos (3D)
    positions = page.evaluate("""(wsList) => {
      const out = []
      for (const ws of wsList) {
        const p = window.__wz.planetScreen(ws)
        if (p !== null) out.push({ ws, x: p.x, y: p.y })
      }
      return out
    }""", ws_paths)
    print('planets on screen:', [(p['ws'].split('\\\\')[-1].split('/')[-1], round(p['x']), round(p['y'])) for p in positions])
    if len(positions) < 2:
        print('FAIL: fewer than 2 planets projected')
        sys.exit(1)

    root_box = page.locator('.war-starfield').bounding_box()
    print('starfield box:', root_box)

    def hover(ws, tag):
        pos = page.evaluate("""(ws) => {
          const p = window.__wz.planetScreen(ws)
          return p === null ? null : { x: p.x, y: p.y }
        }""", ws)
        if pos is None:
            print(f'  [{tag}] planet not on screen')
            return False
        page.mouse.move(root_box['x'] + pos['x'], root_box['y'] + pos['y'], steps=4)
        page.wait_for_timeout(700)
        st = pipe_state(tag)
        print(f'  [{tag}] activeN={st["activeN"]} hues={st["hues"]}')
        return True

    # baseline: hover first planet (before any pager hover)
    others = [p['ws'] for p in positions if not p['ws'].endswith('pager') and p['y'] < root_box['height'] - 40]
    pager = next((p['ws'] for p in positions if p['ws'].endswith('pager')), None)
    print('pager ws:', pager)
    if others:
        hover(others[0], 'baseline:' + others[0].split('/')[-1])
    # hover pager
    if pager is not None:
        hover(pager, 'hover-pager')
    # now hover others again
    for ws in others[:3]:
        hover(ws, 'after:' + ws.split('/')[-1])
    # leave to void
    page.mouse.move(root_box['x'] + root_box['width'] - 60, root_box['y'] + 60, steps=4)
    page.wait_for_timeout(700)
    st = pipe_state('void')
    print(f'  [void] activeN={st["activeN"]} hues={st["hues"]}')
    page.screenshot(path=f'{OUT}/pipe-bug-repro.png')
    print('shot: pipe-bug-repro.png')
    # frame-loop liveness: simT advancing?
    a = page.evaluate("() => window.__wz.scene.simT")
    page.wait_for_timeout(1500)
    b = page.evaluate("() => window.__wz.scene.simT")
    print('frame liveness simT:', a, '->', b, 'ALIVE' if b > a else 'FROZEN')
    # hover-family setting at mount
    print('hover-family cfg:', page.evaluate("() => localStorage.getItem('warroom-cfg-hover-family')"))
    # tip content after moving to another planet
    hover(others[0], 'tip-check')
    tip = page.evaluate("() => { const t = document.querySelector('.war-wz-tip'); return t === null ? null : t.textContent.slice(0, 60) }")
    print('tip now:', tip)
    # double-mount check
    dom = page.evaluate("""() => ({
      roots: document.querySelectorAll('.war-root').length,
      svgs: document.querySelectorAll('.war-pipe-svg').length,
      boards: document.querySelectorAll('.war-board').length,
      dispatches: document.querySelectorAll('.war-dispatch').length,
      onPerSvg: Array.from(document.querySelectorAll('.war-pipe-svg')).map(svg => svg.querySelectorAll('g.on').length),
    })""")
    print('DOM:', dom)
    print('ERRORS:', errors if errors else 'none')
    browser.close()
