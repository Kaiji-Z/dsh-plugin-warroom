# V11.2 3D 太空战区探针：母舰/松散星球/派兵战机动画（帧差）/星闪/三键相机/三视口遮挡。
# 只读探针——不改任何状态。截图落 .goal/evidence/v11/。
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
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''))

with sync_playwright() as p:
    browser = p.chromium.launch()

    def open_board(page):
        page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
        page.wait_for_selector('.war-board.war-mapmode, .war-board', timeout=20000)
        page.wait_for_timeout(1200)

    # 明暗两主题都在 1720 下先目检。
    for theme in ('light', 'dark'):
        ctx = browser.new_context(viewport={'width': 1720, 'height': 900})
        page = ctx.new_page()
        if theme == 'dark':
            # 宿主暗色标记（服务端无 ui-theme 时本地注入即可目检——只影响本页）。
            page.add_init_script("() => { document.body && (document.body.dataset.dsDarkTheme = '') }")
        page.goto(BOARD, wait_until='domcontentloaded')
        page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
        open_board(page)
        page.wait_for_selector('.war-starfield3d', timeout=20000)
        page.wait_for_selector('.war-planet[data-ws-index]', timeout=10000)
        page.wait_for_timeout(4500)  # 让起飞动画演一段 + 星闪相位铺开
        canvas = page.locator('.war-s3d-canvas')
        ok(f'[{theme}] canvas 在场', canvas.count() == 1)
        ok(f'[{theme}] data-war-3d 标记', page.locator('[data-war-3d="1"]').count() == 1)
        planets = page.locator('.war-planet[data-ws-index]')
        n = planets.count()
        ws_n = page.evaluate("async () => { const b = await (await fetch('/warroom/api/board')).json(); return new Set(b.tasks.map(t => t.workspacePath).filter(Boolean)).size }")
        ok(f'[{theme}] 星球数==去重战区数', n == ws_n, f'planets={n} workspaces={ws_n}')
        # 母舰标记在场（原点）
        ok(f'[{theme}] 母舰 DOM 标记', page.locator('.war-hq').count() == 1)
        # 派兵动画（帧差）：同机位连拍两张元素截图，字节应不同（战机+星闪在动）。
        s1 = canvas.screenshot()
        time.sleep(1.2)
        s2 = canvas.screenshot()
        ok(f'[{theme}] 帧差>0（派兵/星闪在动）', s1 != s2)
        # 目检截图
        page.screenshot(path=str(OUT / f'v112-{theme}-1720.png'))
        ctx.close()
    # 三视口遮挡零容忍（光主题）
    for w in (1720, 1280, 1000):
        ctx = browser.new_context(viewport={'width': w, 'height': 860 if w != 1000 else 900})
        page = ctx.new_page()
        page.goto(BOARD, wait_until='domcontentloaded')
        page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
        open_board(page)
        page.wait_for_selector('.war-planet[data-ws-index]', timeout=20000)
        page.wait_for_timeout(2500)
        bad = page.evaluate("""() => {
          const pods = ['.war-zone.war-tasks', '.war-zone.war-report', '.war-dispatch'].map(s => document.querySelector(s)).filter(Boolean).map(el => el.getBoundingClientRect())
          const out = []
          for (const sel of ['.war-orb', '.war-planet', '.war-hq', '.war-map-legend', '.war-live-bar']) {
            for (const el of document.querySelectorAll(sel)) {
              const r = el.getBoundingClientRect()
              if (r.width === 0) continue
              const cx = r.x + r.width/2, cy = r.y + r.height/2
              if (pods.some(p => cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height)) out.push(sel)
            }
          }
          return out
        }""")
        ok(f'[{w}px] 零遮挡', bad == [], json.dumps(bad))
        if w == 1280:
            page.screenshot(path=str(OUT / 'v112-light-1280.png'))
        ctx.close()
    # 相机三键（光主题 1720）：中键旋转 / 滚轮缩放 / 双击复位
    ctx = browser.new_context(viewport={'width': 1720, 'height': 900})
    page = ctx.new_page()
    page.goto(BOARD, wait_until='domcontentloaded')
    page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    open_board(page)
    page.wait_for_selector('.war-planet[data-ws-index]', timeout=20000)
    page.wait_for_timeout(2500)
    sf = page.locator('.war-starfield3d')
    bb = sf.bounding_box()
    cx, cy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    # 找 canvas 空白点（避开行星按钮）
    spot = page.evaluate("""(bb) => {
      const pods = ['.war-dispatch'].map(s => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean)
      for (let y = 120; y < bb.height - 200; y += 40) {
        for (let x = 400; x < bb.width - 400; x += 60) {
          const el = document.elementFromPoint(bb.x + x, bb.y + y)
          if (el && el.tagName === 'CANVAS') return {x: bb.x + x, y: bb.y + y}
        }
      }
      return {x: bb.x + bb.width/2, y: bb.y + bb.height/2}
    }""", bb)
    before = planets_box = page.locator('.war-planet[data-ws-index="1"]').bounding_box()
    page.mouse.move(spot['x'], spot['y'])
    page.mouse.down(button='middle')
    page.mouse.move(spot['x'] + 160, spot['y'] + 40, steps=12)
    page.mouse.up(button='middle')
    page.wait_for_timeout(900)
    after = page.locator('.war-planet[data-ws-index="1"]').bounding_box()
    dx = abs(after['x'] - before['x']) + abs(after['y'] - before['y'])
    ok('中键旋转移动行星 >30px', dx > 30, f'd={dx:.0f}')
    # 滚轮缩放：任意行星视觉尺寸变化
    s_before = page.locator('.war-planet[data-ws-index="2"]').bounding_box()
    page.mouse.wheel(0, 400)
    page.wait_for_timeout(900)
    s_after = page.locator('.war-planet[data-ws-index="2"]').bounding_box()
    ok('滚轮缩放生效', abs(s_after['width'] - s_before['width']) > 2, f"{s_before['width']:.1f}->{s_after['width']:.1f}")
    # 双击复位
    page.mouse.dblclick(spot['x'], spot['y'])
    page.wait_for_timeout(1200)
    r = page.locator('.war-planet[data-ws-index="1"]').bounding_box()
    ok('双击复位', abs(r['x'] - before['x']) < 60 and abs(r['y'] - before['y']) < 60, f"back=({r['x']:.0f},{r['y']:.0f}) orig=({before['x']:.0f},{before['y']:.0f})")
    ctx.close()
    browser.close()

fails = [r for r in results if not r[1]]
print(f"\nprobe: {len(results) - len(fails)}/{len(results)} pass")
raise SystemExit(1 if fails else 0)
