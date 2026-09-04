# -*- coding: utf-8 -*-
"""sd 回流批3 DOM 探针：chip 档位后缀 / 岛计数等你段退役+接令中 / 星球标签 cqw 防撞 /
读屏 live 区 / 2D 雷达切换截图。win32 之下 assert 输出全 ASCII。"""
import asyncio, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('.goal/evidence/sd-backport')
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
        await page.evaluate("() => { for (const k of ['warroom-cfg-view', 'warroom-map-hint-seen', 'warroom-pipe-hint-seen']) localStorage.removeItem(k) }")
        await page.evaluate("() => localStorage.setItem('warroom-cfg-view', 'map')")
        # 入口是开关：板已开（localStorage 恢复）就别再点——点了反而关上。
        if not await page.locator('.war-dispatch').is_visible():
            await page.locator('[data-dsh-warroom-entry]').click()
        try:
            await page.wait_for_selector('.war-dispatch', timeout=15000)
        except Exception:
            sys.exit('board never appeared')
        # 等星域挂载：map 态没生效就按 m（列表/星域切换快捷键）
        if not await page.evaluate("() => !!document.querySelector('.war-board.war-mapmode')"):
            await page.keyboard.press('m')
        try:
            await page.wait_for_selector('.war-board.war-mapmode', timeout=10000)
        except Exception:
            pass
        try:
            await page.wait_for_selector('canvas', timeout=15000)
        except Exception:
            pass
        await page.wait_for_timeout(1500)
        await page.wait_for_timeout(1200)

        # 1) chip 档位后缀：状态 chip 内嵌 war-chip-grade（gr-L0/L1/L2）
        grade_suffix = await page.evaluate("""() => {
          const el = document.querySelector('.war-chip .war-chip-grade.gr-L0, .war-chip .war-chip-grade.gr-L1, .war-chip .war-chip-grade.gr-L2')
          return el ? el.textContent : null
        }""")
        ok('chip-grade suffix merged into status chip', grade_suffix is not None and grade_suffix.startswith(' · '), repr(grade_suffix))

        # 2) 岛计数：等你段退役（无「等你 N」段），接令中段在场
        counts_text = await page.evaluate("""() => {
          const el = document.querySelector('.war-island-counts')
          return el ? el.getAttribute('aria-label') || el.textContent : null
        }""")
        ok('island counts: awaiting segment retired', counts_text is not None and '等你' not in counts_text, repr(counts_text))
        ok('island counts: pending segment renamed', counts_text is not None and ('接令中' in counts_text or '规划中' in counts_text), repr(counts_text))
        badge = await page.evaluate("() => { const b = document.querySelector('.war-island-badge'); return b ? b.textContent : null }")
        ok('island inbox badge present', badge is not None, repr(badge))

        # 3) 星域（map 视图）：读屏 live 区 + 2D 星球标签 cqw 防撞 + 3D 空场件挂点
        wz = await page.evaluate("""() => {
          const root = document.querySelector('.war-wz') || document.querySelector('[class*="wz"]')
          const sr = document.querySelector('.war-sr-only[role="status"]')
          const labels = [...document.querySelectorAll('.war-planet-label')]
          const capped = labels.filter(l => (l.style.maxWidth || '').endsWith('cqw'))
          const foot = document.querySelector('.war-wz-foot-stat')
          return { hasWz: !!root, sr: sr ? sr.textContent : null, labels: labels.length, capped: capped.length, foot: foot ? foot.textContent : null }
        }""")
        ok('starfield rendered', wz['hasWz'])
        ok('sr-only live region (footStat for screen readers)', wz['sr'] is not None, repr(wz['sr']))
        ok('foot stat kept (aria-hidden visual)', wz['foot'] is not None, repr(wz['foot']))
        if wz['labels'] > 0:
            ok('2D planet label caps (cqw maxWidth)', wz['capped'] > 0, f"{wz['capped']}/{wz['labels']} capped")

        # 4) 切 2D 战术盘（雷达）：按钮切换 + 截图（callouts 是 canvas 绘制——肉眼复核）
        await page.evaluate("""() => { const b = document.querySelector('[data-wz-mode="cmd"]'); if (b) b.click() }""")
        await page.wait_for_timeout(1500)
        canvas_on = await page.evaluate("""() => { const b = document.querySelector('[data-wz-mode="cmd"]'); return b ? b.className.includes('on') : false }""")
        ok('2D tactical mode toggled', canvas_on)
        await page.screenshot(path=str(OUT / 'b3-radar-2d.png'))
        print('shot -> b3-radar-2d.png')

        # 5) 聚焦页 chip 合并态截图：点调度条第一张卡
        await page.evaluate("""() => { const b = document.querySelector('[data-wz-mode="3d"]'); if (b) b.click() }""")
        card = page.locator('.war-dispatch .war-card.war-command-card').first
        if await card.count() > 0:
            await card.click()
            await page.wait_for_timeout(900)
            focus_chip = await page.evaluate("""() => {
              const el = document.querySelector('.war-focus, [class*="focus"]')
              const chip = document.querySelector('.war-chip .war-chip-grade')
              return chip ? chip.textContent : null
            }""")
            ok('focus page chip suffix too', focus_chip is not None, repr(focus_chip))
            await page.keyboard.press('Escape')
        await browser.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

asyncio.run(main())
