# -*- coding: utf-8 -*-
"""sd 回流批4 DOM 探针：--war-fs 字体缩放——滑杆在场/持久化生效/滑杆事件回写。"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3080'

async def main():
    items = []
    def ok(name, cond, detail=''):
        items.append((name, bool(cond), detail))
        print(('PASS ' if cond else 'FAIL ') + name + (' | ' + detail if detail else ''))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1600, 'height': 900})
        await page.goto(BASE, wait_until='domcontentloaded')
        await page.wait_for_selector('[data-dsh-warroom-entry]', timeout=15000)
        # 预置 1.2 倍率（读取路径：war-root 内联变量）——板可能已在载入时自开
        #（localStorage 恢复），状态初值化发生在页面加载：先写再重载才能被读到。
        await page.evaluate("() => localStorage.setItem('warroom-cfg-zoom', '1.2')")
        await page.reload(wait_until='domcontentloaded')
        await page.wait_for_timeout(1500)
        if not await page.locator('.war-dispatch').is_visible():
            await page.locator('[data-dsh-warroom-entry]').click()
        await page.wait_for_selector('.war-dispatch', state='visible', timeout=15000)
        await page.wait_for_timeout(800)

        fs = await page.evaluate("() => document.querySelector('.war-root')?.style.getPropertyValue('--war-fs')")
        ok('war-root inline --war-fs from localStorage', fs == '1.2', repr(fs))
        sample = await page.evaluate("""() => {
          const el = document.querySelector('.war-island-title') || document.querySelector('.war-root')
          return el ? getComputedStyle(el).fontSize : null
        }""")
        # 基准 14px × 1.2 = 16.8px（island-title）
        ok('computed font-size scaled', sample is not None and sample.endswith('px') and abs(parseFloatSafe(sample) - 16.8) < 0.4, sample)

        # 滑杆交互：开设置抽屉，拖值+读数+回写
        gear = page.locator('.war-island-actions, [title*="设置"], .war-island-gear').first
        opened = False
        try:
          btns = await page.evaluate("""() => {
            const candidates = [...document.querySelectorAll('button')]
            const g = candidates.find(b => (b.title || '').includes('设置') || (b.getAttribute('aria-label') || '').includes('设置'))
            if (g) { g.click(); return true }
            return false
          }""")
          opened = bool(btns)
        except Exception:
          opened = False
        ok('settings drawer opened', opened)
        try:
            await page.wait_for_selector('.war-font-row input[type=range]', timeout=5000)
            slider_ok = True
        except Exception:
            slider_ok = False
        ok('font slider present', slider_ok)
        if slider_ok:
            val0 = await page.evaluate("() => document.querySelector('.war-font-val')?.textContent")
            await page.evaluate("""() => {
              const r = document.querySelector('.war-font-row input[type=range]')
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
              setter.call(r, '1.35')
              r.dispatchEvent(new Event('input', { bubbles: true }))
              r.dispatchEvent(new Event('change', { bubbles: true }))
            }""")
            await page.wait_for_timeout(400)
            val1 = await page.evaluate("() => document.querySelector('.war-font-val')?.textContent")
            fs1 = await page.evaluate("() => document.querySelector('.war-root')?.style.getPropertyValue('--war-fs')")
            ok('slider drag updates readout+root', val1 == '×1.35' and fs1 == '1.35', f'{val0} -> {val1}, --war-fs={fs1}')
            stored = await page.evaluate("() => localStorage.getItem('warroom-cfg-zoom')")
            ok('slider persists to localStorage', stored == '1.35', repr(stored))
            await page.evaluate("""() => {
              const b = [...document.querySelectorAll('button')].find(x => x.textContent === '重置')
              if (b) b.click()
            }""")
            await page.wait_for_timeout(300)
            fs2 = await page.evaluate("() => document.querySelector('.war-root')?.style.getPropertyValue('--war-fs')")
            ok('reset returns to ×1.00', fs2 == '1', repr(fs2))
        await browser.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

def parseFloatSafe(s):
    try:
        return float(s.replace('px', ''))
    except Exception:
        return -1

asyncio.run(main())
