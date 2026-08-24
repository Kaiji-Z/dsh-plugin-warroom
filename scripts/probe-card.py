# -*- coding: utf-8 -*-
"""Probe decision-card DOM: dump clickable nodes around the approval card."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080'
ENTRY = '[data-dsh-warroom-entry]'
TAG = '每日格言'

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 1680, 'height': 980})
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector(ENTRY, timeout=20000)
    pg.wait_for_timeout(1500)
    pg.click(ENTRY)
    pg.wait_for_selector('.war-board', timeout=10000)
    pg.locator(f'.war-hq .war-card:has-text("{TAG}")').first.click()
    pg.wait_for_selector('.war-board', state='hidden', timeout=8000)
    pg.wait_for_timeout(4000)
    info = pg.evaluate("""() => {
      const out = {buttons: [], hits: []}
      for (const b of document.querySelectorAll('button')) {
        const t = (b.innerText || '').trim().replace(/\\n/g, ' | ')
        if (t) out.buttons.push(t.slice(0, 80))
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n
      while ((n = walker.nextNode())) {
        if (n.textContent.includes('批准，发布')) {
          let el = n.parentElement
          for (let i = 0; i < 5 && el; i++) {
            out.hits.push({i, tag: el.tagName, cls: String(el.className).slice(0,120), role: el.getAttribute('role'), html: el.outerHTML.slice(0, 260)})
            el = el.parentElement
          }
          break
        }
      }
      return out
    }""")
    print('BUTTONS:', *info['buttons'], sep='\n  ')
    print('HITS around 批准，发布:')
    for h in info['hits']:
        print(' ', h['i'], h['tag'], h['cls'], 'role=', h['role'])
        print('    ', h['html'].replace('\n', ' ')[:240])
    br.close()
