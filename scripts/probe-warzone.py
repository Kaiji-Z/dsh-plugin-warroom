# V11.5 连线探针：warzone 由真实板数据驱动（宇宙=元首+workspace，编队=agent 会话，
# 雷达值班默认态）。断言全部对着 /warroom/api/board 真值核对；截图落 evidence/v11/。
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

    ctx, page = open_map({'width': 1720, 'height': 900})
    board = page.evaluate("async () => await (await fetch('/warroom/api/board')).json()")
    ws_set = sorted({t['workspacePath'] for t in board['tasks'] if t.get('workspacePath')})
    live_n = sum(1 for t in board['tasks'] for a in (t.get('attemptLog') or []) if a.get('outcome') is None)
    reported_n = sum(1 for t in board['tasks'] if t['status'] == 'reported')

    # 雷达=值班默认态（V11.5 元首定）：挂载即 cmd，浮舱/坞恒在场
    ok('雷达值班默认态', page.evaluate("() => window.__wz.mode()") == 'cmd' and page.locator('.war-wz-tac').is_visible())
    ok('浮舱/坞在雷达态在场（操作面恒在）', page.locator('.war-zone.war-tasks').is_visible() and page.locator('.war-dispatch').is_visible())
    ok('切换钮/图例在场', page.locator('.war-wz-toggle').is_visible() or page.locator('.war-wz-legend').count() == 1)
    # V11.5f 元首令：HUD 撤除 + 面板退役 + 按钮改名 3D 视图/2D 视图 + 执行卡覆盖层
    ok('HUD 已撤除（V11.5f）', page.locator('.war-wz-hud').count() == 0)
    tbt = page.locator('.war-wz-toggle').inner_text()
    ok('切换钮=3D 视图/2D 视图', '3D 视图' in tbt and '2D 视图' in tbt, tbt.replace('\n', '/'))
    ok('执行卡数==live attempts（卡钉星球屏位）', page.locator('.war-wz-xcard').count() == live_n, f"{page.locator('.war-wz-xcard').count()} vs {live_n}")
    # V11.5g（元首令）：卡索引线=实线琥珀（与 HQ 虚线青双通道区分）+ 2D 卡可拖、线随卡
    if live_n > 0 and page.locator('.war-wz-xcard').count() > 0:
        ls = page.evaluate("() => { const l = document.querySelector('.war-wz-xline'); if (!l) return ''; const cs = getComputedStyle(l); return cs.strokeDasharray + '|' + cs.stroke }")
        ok('卡索引线=实线琥珀（≠HQ 虚线青）', 'none' in ls.split('|')[0] and '255, 179, 92' in ls.split('|')[1], ls[:48])
        el = page.locator('.war-wz-xcard').first
        bb1 = el.bounding_box()
        xy1 = page.evaluate("() => { const l = document.querySelector('.war-wz-xline'); return [Number(l.getAttribute('x2')), Number(l.getAttribute('y2'))] }")
        page.mouse.move(bb1['x'] + bb1['width'] / 2, bb1['y'] + 8)
        page.mouse.down()
        page.mouse.move(bb1['x'] + bb1['width'] / 2 + 140, bb1['y'] + 8 + 90, steps=8)
        page.mouse.up()
        page.wait_for_timeout(300)
        bb2 = el.bounding_box()
        xy2 = page.evaluate("() => { const l = document.querySelector('.war-wz-xline'); return [Number(l.getAttribute('x2')), Number(l.getAttribute('y2'))] }")
        ok('2D 执行卡可拖（自由摆放）', bb2['x'] - bb1['x'] > 60 or bb2['y'] - bb1['y'] > 40, f"Δcard=({bb2['x']-bb1['x']:.0f},{bb2['y']-bb1['y']:.0f})")
        ok('拖后实线随卡（端点同步星球→卡）', abs(xy2[0] - xy1[0]) > 60 or abs(xy2[1] - xy1[1]) > 40, f"Δline=({xy2[0]-xy1[0]:.0f},{xy2[1]-xy1[1]:.0f})")
    page.screenshot(path=str(OUT / 'v115-radar.png'))

    # 真实数据核对
    wz = page.evaluate("""() => { const s = window.__wz.scene; return {
      planets: s.planets.length, names: s.planets.map(p => p.name), ws: s.planets.map(p => p.wsPath),
      statuses: s.planets.map(p => p.status), garrisons: s.planets.map(p => p.garrison),
      squads: s.squads.length, phases: s.squads.map(q => q.phase), log: s.log.length, active: true } }""")
    ok('星球数==去重 workspace 数', wz['planets'] == len(ws_set), f"{wz['planets']} vs {len(ws_set)}")
    ok('星球名=目录名·W-编号', all(' · W-' in n for n in wz['names']), wz['names'][:3].__repr__())
    ok('编队数==live+reported 会话', wz['squads'] == live_n + reported_n, f"{wz['squads']} vs live {live_n}+reported {reported_n}")
    ok('相位词汇合法', all(ph in ('outbound', 'battle', 'deployed', 'holding', 'return') for ph in wz['phases']), str(set(wz['phases'])))
    ok('WAR LOG 非空（真实事件流）', wz['log'] > 0, f"log={wz['log']}")

    # 板面状态一致性：作战中 ⇔ 有 live 编队进驻（reported 驻泊编队可停在非交战星
    # 球——待验收≠作战中，不算状态说谎）
    board_status = page.evaluate("""(wsSet) => { const s = window.__wz.scene; const out = [];
      for (const p of s.planets) { const hasLive = s.squads.some(q => q.live && q.target === p && q.phase !== 'return'); out.push(p.status === '作战中' ? hasLive : !hasLive) } return out.every(Boolean) }""", ws_set)
    ok('星球状态与 live 编队一致（红线：状态不说谎）', board_status)
    # V11.5h：星球=NASA 自然色六原型材质（map+bumpMap+壳层组）
    nasa = page.evaluate("() => window.__wz.scene.planets.every(p => { const s = p.mesh.children.find(c => c.material && c.material.bumpMap); return s !== undefined })")
    ok('星球=NASA 材质（bumpMap 高度场在）', nasa)

    # V11.5a 地形恒定：公转停——星球坐标跨时间纹丝不动（空间记忆根基）
    pos1 = page.evaluate("() => window.__wz.scene.planets.map(p => [p.mesh.position.x.toFixed(2), p.mesh.position.y.toFixed(2), p.mesh.position.z.toFixed(2)])")
    page.wait_for_timeout(2500)
    pos2 = page.evaluate("() => window.__wz.scene.planets.map(p => [p.mesh.position.x.toFixed(2), p.mesh.position.y.toFixed(2), p.mesh.position.z.toFixed(2)])")
    ok('星球坐标 2.5s 恒定（公转已停）', pos1 == pos2)

    # V 切 3D 战略态：真实星球+编队可见、帧差在动
    page.keyboard.press('v')
    page.wait_for_timeout(800)
    ok('V 切 3D 战略态', page.evaluate("() => window.__wz.mode()") == '3d' and not page.locator('.war-wz-tac').is_visible())
    # V11.5g：缩放界随战场动态（外沿/星体实时）——狂拉两头都停在自己的界上
    info = page.evaluate("() => window.__wz.scene.camInfo()")
    page.evaluate("() => window.__wz.scene.zoomBy(99999)")
    page.wait_for_timeout(5000)
    far = page.evaluate("() => window.__wz.scene.camInfo()")
    page.evaluate("() => window.__wz.scene.zoomBy(-99999)")
    page.wait_for_timeout(5000)
    near = page.evaluate("() => window.__wz.scene.camInfo()")
    ok('缩放远界=动态 max（狂拉被封）', abs(far['dist'] - far['distMax']) < 8 and far['distMax'] >= 350 and far['distMax'] <= 3200, f"dist={far['dist']:.0f} max={far['distMax']:.0f}")
    ok('缩放近界=动态 min（狂推不穿模）', abs(near['dist'] - near['distMin']) < 8 and near['distMin'] >= 40, f"dist={near['dist']:.0f} min={near['distMin']:.0f}")
    page.evaluate("() => window.__wz.scene.resetCam()")
    page.wait_for_timeout(5000)
    ok('复位机位在动态界内', abs(page.evaluate("() => window.__wz.scene.camInfo()")['dist'] - 350) < 8)
    s1 = page.locator('.war-wz-3d').screenshot()
    time.sleep(1.2)
    s2 = page.locator('.war-wz-3d').screenshot()
    ok('3D 帧差>0（编队飞行/星闪）', s1 != s2)
    ok('3D 态浮舱仍在', page.locator('.war-zone.war-tasks').is_visible() and page.locator('.war-dispatch').is_visible())
    page.screenshot(path=str(OUT / 'v115-3d.png'))
    # V11.5f 高亮联动：悬停执行卡 → 对应星球亮起 + 名签 + HQ↔星球虚线轨迹
    xc = page.locator('.war-wz-xcard').first
    if page.locator('.war-wz-xcard').count() > 0 and xc.is_visible():
        xc.hover()
        page.wait_for_timeout(400)
        hl = page.evaluate("() => ({ n: window.__wz.scene.hlWs.size, lines: window.__wz.scene.hlLines.length })")
        ok('悬停执行卡→星球高亮+HQ 轨迹线', hl['n'] >= 1 and hl['lines'] >= 1, f"hlWs={hl['n']} lines={hl['lines']}")
        ok('高亮名签在场（工作区名）', page.locator('.war-wz-pname').is_visible() and ' · W-' in page.locator('.war-wz-pname').inner_text())
        page.mouse.move(8, 8)
        page.wait_for_timeout(400)
        ok('移出后高亮退场', page.evaluate("() => window.__wz.scene.hlWs.size") == 0)
    else:
        ok('悬停执行卡→星球高亮+HQ 轨迹线（无 live 跳过）', live_n == 0, 'no live attempts in fixture')
    # 信息卡（3D 中心=HQ）：真实字段
    bb = page.locator('.war-wz').bounding_box()
    page.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    page.wait_for_timeout(700)
    tip = page.locator('.war-wz-tip')
    ok('HQ 信息卡（真实战力行）', tip.is_visible() and '战区' in tip.inner_text() and '凯旋' in tip.inner_text(), tip.inner_text().split('\n')[0][:24] if tip.is_visible() else '-')
    page.mouse.move(8, 8)
    ctx.close()

    # 有头 fps
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
print(f"\nprobe-warzone(bridge): {len(results) - len(fails)}/{len(results)} pass")
raise SystemExit(1 if fails else 0)
