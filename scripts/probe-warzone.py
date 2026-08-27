# V11.4 warzone demo 全要素进驻探针：DOM 件在场 / __wz 句柄断言（16 星/编队/日志
# 演化）/ 信息卡 / 指挥室切换（按钮+V）/ 帧差 / 浮舱几何 / 有头 fps。
# 只读探针；截图落 .goal/evidence/v11/。
import json
import pathlib
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.goal' / 'evidence' / 'v11'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:3080'
BOARD = f'{BASE}/?warroom=1'

results = []

def ok(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + ((' - ' + detail) if detail else ''))

with sync_playwright() as p:
    browser = p.chromium.launch()

    def open_map(viewport):
        ctx = browser.new_context(viewport=viewport)
        page = ctx.new_page()
        page.goto(BOARD, wait_until='domcontentloaded')
        page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
        page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
        page.wait_for_selector('.war-wz', timeout=20000)
        page.wait_for_timeout(3000)
        return ctx, page

    # --- 主探针（1720）---
    ctx, page = open_map({'width': 1720, 'height': 900})
    ok('warzone 容器+3D 画布', page.locator('.war-wz .war-wz-3d').count() == 1 and page.locator('[data-war-3d="1"]').count() == 1)
    for sel, name in [('.war-wz-hud', 'HUD 标题'), ('.war-wz-legend', '图例'), ('.war-wz-hint', '操作提示'), ('.war-wz-toggle button[data-wz-mode="3d"]', '切换钮-现实'), ('.war-wz-toggle button[data-wz-mode="cmd"]', '切换钮-指挥室'), ('.war-wz-vig', '暗角')]:
        ok(f'{name} 在场', page.locator(sel).count() >= 1 and page.locator(sel).first.is_visible())
    # __wz 句柄：16 星 / 分级 3-6-7 / 编队在途
    st = page.evaluate("() => { const w = window.__wz; const ps = w.scene.planets; return { n: ps.length, large: ps.filter(p => p.cls === 'large').length, med: ps.filter(p => p.cls === 'medium').length, small: ps.filter(p => p.cls === 'small').length, squads: w.scene.squads.length, statuses: Object.entries(ps.reduce((a, p) => (a[p.status] = (a[p.status] || 0) + 1, a), {})) } }")
    ok('16 星球', st['n'] == 16, json.dumps({k: st[k] for k in ('n', 'large', 'med', 'small')}, ensure_ascii=False))
    ok('分级 3/6/7', st['large'] == 3 and st['med'] == 6 and st['small'] == 7)
    ok('编队在途', st['squads'] >= 1, f"squads={st['squads']}")
    # 战争演化：12s 后日志新增（出击/接敌事件流）
    log0 = page.evaluate("() => window.__wz.scene.log.length")
    page.wait_for_timeout(12000)
    log1 = page.evaluate("() => window.__wz.scene.log.length")
    statuses1 = page.evaluate("() => window.__wz.scene.planets.map(p => p.status).join(',')")
    ok('战争模拟演化（日志/状态）', log1 >= log0 and (log1 > 0), f'log {log0}->{log1}')
    ok('状态机在跑', statuses1.count('待进攻') + statuses1.count('已占领') + statuses1.count('作战中') == 16)
    # 信息卡：悬停画面中心（HQ 在原点，初始机位投影近中心）
    bb = page.locator('.war-wz').bounding_box()
    page.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    page.wait_for_timeout(700)
    tip_vis = page.locator('.war-wz-tip').is_visible()
    tip_txt = page.locator('.war-wz-tip').inner_text() if tip_vis else ''
    ok('悬停信息卡（HQ/星球/编队任一）', tip_vis and len(tip_txt) > 20, tip_txt.split('\n')[0][:30] if tip_vis else 'not visible')
    page.mouse.move(8, 8)
    page.wait_for_timeout(300)
    # 帧差（引擎在动）
    s1 = page.locator('.war-wz-3d').screenshot()
    time.sleep(1.1)
    s2 = page.locator('.war-wz-3d').screenshot()
    ok('帧差>0（战争模拟在跑）', s1 != s2)
    page.screenshot(path=str(OUT / 'v114-3d.png'))
    # 指挥室切换（按钮）
    page.locator('.war-wz-toggle button[data-wz-mode="cmd"]').click()
    page.wait_for_timeout(600)
    ok('指挥室 2D 画布现身', page.locator('.war-wz-tac').is_visible())
    ok('指挥室模式浮舱让位', page.evaluate("() => document.querySelector('.war-board').classList.contains('wz-cmd') && getComputedStyle(document.querySelector('.war-dispatch')).visibility === 'hidden'"))
    ok('HUD/图例指挥室隐退', not page.locator('.war-wz-hud').is_visible() and not page.locator('.war-wz-foot').is_visible())
    page.screenshot(path=str(OUT / 'v114-cmd.png'))
    # V 键切回
    page.keyboard.press('v')
    page.wait_for_timeout(600)
    ok('V 键切回现实视图', page.evaluate("() => window.__wz.mode()") == '3d' and not page.locator('.war-wz-tac').is_visible())
    # 浮舱几何（星域为底，舱压图，坞压底）
    sf_bb = page.locator('.war-wz').bounding_box()
    ok('浮舱压图+坞压底', page.locator('.war-dispatch').bounding_box()['y'] > 500 and all(page.locator(s).bounding_box()['x'] >= sf_bb['x'] - 2 for s in ('.war-zone.war-tasks', '.war-zone.war-report')))
    ctx.close()

    # --- 窄视口冒烟（1280：引擎照常挂载）---
    ctx2, page2 = open_map({'width': 1280, 'height': 860})
    ok('1280 warzone 在场', page2.locator('.war-wz .war-wz-3d').count() == 1 and page2.evaluate("() => window.__wz.scene.planets.length") == 16)
    page2.screenshot(path=str(OUT / 'v114-1280.png'))
    ctx2.close()

    # --- 有头 fps（真 GPU；headless SwiftShader 是假象）---
    bh = p.chromium.launch(headless=False)
    hctx = bh.new_context(viewport={'width': 1280, 'height': 800})
    hp = hctx.new_page()
    hp.goto(BOARD, wait_until='domcontentloaded')
    hp.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    hp.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    hp.wait_for_selector('.war-wz', timeout=20000)
    hp.wait_for_timeout(3500)
    fps = hp.evaluate("""async () => {
      let n = 0; const t0 = performance.now()
      await new Promise(res => { const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(null) }; requestAnimationFrame(tick) })
      return n / ((performance.now() - t0) / 1000)
    }""")
    ok('fps>=45（有头真 GPU）', fps >= 45, f'{fps:.1f}fps')
    hctx.close(); bh.close()
    browser.close()

fails = [r for r in results if not r[1]]
print(f"\nprobe-warzone: {len(results) - len(fails)}/{len(results)} pass")
raise SystemExit(1 if fails else 0)
