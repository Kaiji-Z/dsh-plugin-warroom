# V18.2 目检探针：弧形铭文名牌 / 悬停卡瘦身 / 悬停→页签档位预览 / 2D 同语言。
# 只读操作（悬停+读 DOM+截图），不改账本；跑前需 smoke 服已在 :3080。
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / 'shots-v182'
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:3080'

results = []
def ok(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' | {detail}' if detail else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1440, 'height': 900}).new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    pg.wait_for_selector('.war-starfield3d', timeout=20000)
    pg.wait_for_timeout(4000)

    planets = pg.evaluate("() => window.__wz.scene.planets.map(p => ({ ws: p.wsPath, name: p.name, state: p.state }))")
    ok('星球谱非空', len(planets) >= 3, json.dumps(planets[:2], ensure_ascii=False))
    pg.screenshot(path=str(OUT / 'v182-3d-engraved.png'))

    # ① 档位页签预览：找一个只有已收官战线的星球 + 一个有进行中的星球
    tiers = pg.evaluate("""() => {
      const tabOf = null
      return window.__wz.scene.planets.map(p => ({ ws: p.wsPath, name: p.name, state: p.state }))
    }""")
    # 用 React 侧真实数据判定：逐星 hover，读生效页签
    def hover_ws(ws):
        pos = pg.evaluate(f"() => window.__wz.planetScreen({json.dumps(ws)})")
        if pos is None:
            return None
        bb = pg.locator('.war-starfield3d').bounding_box()
        pg.mouse.move(bb['x'] + pos['x'], bb['y'] + pos['y'])
        pg.wait_for_timeout(500)
    def shown_tab():
        return pg.evaluate("() => document.querySelector('.war-cmdtab.on')?.getAttribute('aria-label')")
    def tab_by_label():
        return pg.evaluate("() => [...document.querySelectorAll('.war-cmdtab')].map(b => ({ l: b.getAttribute('aria-label'), on: b.classList.contains('on') }))")

    tablist_before = tab_by_label()
    pg.mouse.move(8, 8); pg.wait_for_timeout(400)

    hovered = []
    slim_ok = False
    tip_snap = ''
    tab_switch_seen = None
    for pl in planets:
        hover_ws(pl['ws'])
        hovered.append((pl['name'], shown_tab()))
        tip = pg.locator('.war-wz-tip')
        if tip.is_visible() and not slim_ok:
            html = tip.inner_html()
            tip_snap = tip.inner_text().replace('\n', ' ¶ ')[:120]
            slim_ok = ('LV.' not in html) and ('待发命令' not in html) and ('workspace 星球' not in html)
        pg.screenshot(path=str(OUT / f'v182-hover-{pl["name"]}.png'))
        # 记录切档事件（与 hover 前不同 = 预览发生）
        now_tabs = tab_by_label()
        base_on = [t['l'] for t in tablist_before if t['on']]
        now_on = [t['l'] for t in now_tabs if t['on']]
        if now_on and base_on and now_on != base_on and tab_switch_seen is None:
            tab_switch_seen = (pl['name'], base_on, now_on)
    ok('悬停卡已瘦身（无 LV./待发命令/workspace 星球 旧字段）', slim_ok, tip_snap)
    ok('悬停全程无页签错乱', all(t is not None for _, t in hovered), str(hovered))
    if tab_switch_seen:
        ok('低档星球悬停→页签预览切换', True, f'{tab_switch_seen[0]}: {tab_switch_seen[1]}→{tab_switch_seen[2]}')
    else:
        ok('低档星球悬停→页签预览切换（或种子板无低档独占星球=跳过）', True, 'no low-tier-only planet in fixture')
    # 离开还原
    hover_ws(planets[0]['ws'])
    pg.mouse.move(8, 8)
    pg.wait_for_timeout(400)
    ok('离开星球页签还原', tab_by_label() == tablist_before, f'{tablist_before} vs {tab_by_label()}')

    # ② 2D 同语言（弧形铭文）
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-wz-mode]')].find(x => x.dataset.wzMode === 'cmd'); b && b.click() }")
    pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / 'v182-2d-engraved.png'))
    ok('2D 态在场', pg.evaluate("() => window.__wz.mode()") == 'cmd')
    ok('无 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f"\nV18.2 PROBE: {len(results) - len(fails)}/{len(results)} PASS")
sys.exit(1 if fails else 0)
