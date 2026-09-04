# -*- coding: utf-8 -*-
"""sd 回流批3/批1 补强探针（completion verifier 缺口闭合）：

Part A（判据③）：路由拦截 /warroom/api/board → 0 星球 + 活体编队（工作区因此全部
  未注册）——断言 .war-wz-empty 常驻水印渲染（且 15s 后 hqGuide toast 退场它仍在）、
  执行卡未被隐藏、SVG 线星球端（x1,y1）锚在 __wz.hqScreen()（HQ 兜底锚位）。
Part B（判据①）：路由拦截把「保留星」以外的全部任务翻 closed → 其余星球档位变
  settled（跨页签前提）——canvas 实点低档星球：页签 commit 到已收官页且停住不弹回、
  粘性聚焦卡钉住、族系管线在场（.war-pipe-svg.war-pipe-map g.on path>0）。

win32 之下 assert 输出全 ASCII。独立 commit 取证用。
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3080'

async def open_board(pg, timeout=25000):
    if not await pg.locator('.war-dispatch').is_visible():
        await pg.locator('[data-dsh-warroom-entry]').click()
    await pg.wait_for_selector('.war-dispatch', state='visible', timeout=timeout)
    await pg.wait_for_timeout(1500)

async def main():
    items = []
    def ok(name, cond, detail=''):
        items.append((name, bool(cond), detail))
        print(('PASS ' if cond else 'FAIL ') + name + (' | ' + detail if detail else ''))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ---------- Part A: 0 星球 + 未注册编队 ----------
        ctx = await browser.new_context(viewport={'width': 1600, 'height': 900})
        pg = await ctx.new_page()
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
        await pg.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'map'); localStorage.setItem('warroom-cfg-zoom', '1') }")

        async def strip_planets(route):
            resp = await route.fetch()
            body = await resp.json()
            body['planets'] = []
            await route.fulfill(response=resp, json=body)
        await pg.route('**/warroom/api/board*', strip_planets)
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2500)
        await open_board(pg)
        try:
            await pg.wait_for_selector('.war-wz', timeout=15000)
        except Exception:
            ok('empty-state: warzone mounted', False, 'no .war-wz')
            await ctx.close(); await browser.close(); sys.exit(1)

        wm = await pg.evaluate("""() => {
          const el = document.querySelector('.war-wz-empty')
          return el ? { role: el.getAttribute('role'), text: el.textContent } : null
        }""")
        ok('empty-state: .war-wz-empty watermark rendered', wm is not None and wm['role'] == 'status' and len(wm['text']) > 0, json.dumps(wm, ensure_ascii=False)[:80])

        toast = await pg.evaluate("""() => {
          const el = [...document.querySelectorAll('.war-map-hint')].find(x => x.textContent.includes('🪐'))
          return el ? el.textContent : null
        }""")
        ok('empty-state: hqGuide toast fires (squads out, zero planets)', toast is not None, repr(toast)[:80])

        cards = await pg.evaluate("""() => {
          const els = [...document.querySelectorAll('.war-wz-xcard')]
          return els.map(el => ({ sid: el.dataset.wzSid, hidden: el.style.visibility === 'hidden', w: el.offsetWidth }))
        }""")
        ok('empty-state: live squad exec cards present', len(cards) >= 1, json.dumps(cards)[:100])
        ok('empty-state: cards NOT hidden despite unregistered ws', len(cards) >= 1 and not any(c['hidden'] for c in cards), json.dumps(cards)[:100])

        # 线语义：x1,y1=星球锚（hqScreen 兜底位），x2,y2=卡 attach 端。
        anchor = await pg.evaluate("""() => {
          const hq = window.__wz ? window.__wz.hqScreen() : null
          const line = document.querySelector('line[data-wz-sid]')
          if (hq === null || line === null) return { hq, x1: null, y1: null }
          return { hq, x1: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')) }
        }""")
        d = None
        if anchor['hq'] is not None and anchor['x1'] is not None:
            d = ((anchor['x1'] - anchor['hq']['x']) ** 2 + (anchor['y1'] - anchor['hq']['y']) ** 2) ** 0.5
        ok('empty-state: exec-card line planet-end anchored at HQ screen pos', d is not None and d <= 8.0, f'dist={d} hq={anchor["hq"]} x1,y1=({anchor["x1"]},{anchor["y1"]})')

        # 水印「常驻」：hqGuide toast 15s 自动退场后水印仍在
        await pg.wait_for_timeout(16500)
        after = await pg.evaluate("""() => ({
          toast: [...document.querySelectorAll('.war-map-hint')].some(x => x.textContent.includes('🪐')),
          watermark: !!document.querySelector('.war-wz-empty'),
        })""")
        ok('empty-state: watermark persists after toast retires (15s)', after['watermark'] and not after['toast'], json.dumps(after))
        await ctx.close()

        # ---------- Part B: 点击低档星球 → 页签 commit + 管线在场 ----------
        ctx2 = await browser.new_context(viewport={'width': 1600, 'height': 900})
        pg = await ctx2.new_page()
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
        await pg.evaluate("() => localStorage.setItem('warroom-cfg-view', 'map')")

        # 造跨页签前提：保留星=有活体 attempt 的第一颗星球；其余星球任务全翻
        # closed → 那些星球的档位变 settled（页签目标页 ≠ 当前 active 页）。
        keep = {}
        async def demote_other_planets(route):
            resp = await route.fetch()
            body = await resp.json()
            tasks = body.get('tasks') or []
            keep_ws = None
            for t in tasks:
                for a in (t.get('attemptLog') or []):
                    if a.get('outcome') is None and a.get('endedAt') is None:
                        keep_ws = t.get('workspacePath')
                        break
                if keep_ws:
                    break
            if keep_ws is None:
                keep_ws = (body.get('planets') or [{}])[0].get('path')
            keep['ws'] = keep_ws
            for t in tasks:
                if t.get('workspacePath') != keep_ws:
                    t['status'] = 'closed'
            await route.fulfill(response=resp, json=body)
        await pg.route('**/warroom/api/board*', demote_other_planets)
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2500)
        await open_board(pg)
        await pg.wait_for_selector('.war-wz', timeout=15000)

        tab0 = await pg.evaluate("() => document.querySelector('.war-cmdtab.on')?.getAttribute('aria-label')")
        planets = await pg.evaluate("() => fetch('/warroom/api/board').then(r => r.json()).then(d => d.planets.map(p => p.path))")
        low_ws = [w for w in planets if w != keep.get('ws')]
        ok('planet-click: cross-tab premise built', len(low_ws) > 0 and tab0 is not None, f'keep={keep.get("ws")} lowPlanets={len(low_ws)} initialTab={tab0}')

        switched = None
        for ws in low_ws:
            pos = await pg.evaluate("(ws) => { const p = window.__wz && window.__wz.planetScreen(ws); return p ? { x: p.x, y: p.y } : null }", ws)
            if pos is None:
                continue
            rect = await pg.evaluate("""() => { const r = document.querySelector('.war-wz-3d').getBoundingClientRect(); return { x: r.x, y: r.y } }""")
            await pg.mouse.click(rect['x'] + pos['x'], rect['y'] + pos['y'])
            await pg.wait_for_timeout(500)
            tab1 = await pg.evaluate("() => document.querySelector('.war-cmdtab.on')?.getAttribute('aria-label')")
            if tab1 != tab0:
                # 停住不弹回：再等一拍复查（批1 bug 的签名就是点击落定后弹回原页签）
                await pg.wait_for_timeout(1200)
                tab2 = await pg.evaluate("() => document.querySelector('.war-cmdtab.on')?.getAttribute('aria-label')")
                if tab2 == tab1:
                    switched = {'ws': ws, 'from': tab0, 'to': tab1}
                    break
            # 未切页签的点击可能已把粘性聚焦钉在别处——点空处退出聚焦再试下一颗
            await pg.evaluate("() => document.body.click()")
            await pg.wait_for_timeout(300)
        ok('planet-click: tab commits to target tier page and stays', switched is not None, json.dumps(switched, ensure_ascii=False))

        pins = await pg.evaluate("""() => ({
          tip: (() => { const t = document.querySelector('.war-wz-tip'); return t ? t.style.display !== 'none' && t.textContent.length > 0 : false })(),
          pipes: (() => { const s = document.querySelector('.war-pipe-svg.war-pipe-map'); return s ? s.querySelectorAll('g.on path').length : 0 })(),
        })""")
        ok('planet-click: lineage pipeline present in map mode', pins['pipes'] > 0, json.dumps(pins))
        ok('planet-click: sticky focus card pinned', pins['tip'], json.dumps(pins)[:100])
        await ctx2.close()
        await browser.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

asyncio.run(main())
