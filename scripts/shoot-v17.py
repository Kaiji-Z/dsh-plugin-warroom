"""V17 evidence shooter — 三页签全局切片 + 命令归档（A-②/A-③ 机检）.

Usage: python scripts/shoot-v17.py [outDir] [baseUrl]
前置：smoke 服已按「停服→清 .smoke-state→seed-smoke.ts→起服」编排重启
（demoWeave 在起服时把种子假会话号织换成宿主真会话——归档扇出打的是真会话）。
只读导航 + 一次归档写（走 /warroom/api/archive，SPEC 锁定动作）。
"""
import json
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv[1] if len(sys.argv) > 1 else '') else ".goal/evidence/v17")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".goal/evidence/v17")
OUT.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"

errors: list[str] = []


def api(path: str):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=300) as r:
        return json.loads(r.read())


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1720, "height": 940})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    net_log: list[str] = []
    page.on("request", lambda r: net_log.append(f"REQ {r.method} {r.url.split('3080')[-1]} {r.post_data or ''}") if "/api/archive" in r.url else None)
    page.on("response", lambda r: net_log.append(f"RESP {r.status} {r.url.split('3080')[-1]}") if "/api/archive" in r.url else None)

    def open_board():
        page.goto(BASE)
        page.wait_for_load_state("domcontentloaded")
        page.evaluate("() => document.body.removeAttribute('data-ds-dark-theme')")
        page.wait_for_timeout(400)
        # 归档链路诊断钩：抓 fetch 请求/响应体 + 未处理拒绝（客户端拿到什么、
        # .then 走了哪支——net 事件只证明浏览器收到，不证明页面处理了）。
        page.evaluate("() => { window.__arch = []; const f = window.fetch; window.fetch = (...a) => { const p = f(...a); if (String(a[0]).includes('/api/archive')) { window.__arch.push('req ' + (a[1] && a[1].body || '')); p.then(r => r.clone().text().then(t => window.__arch.push('resp ' + r.status + ' ' + t))).catch(e => window.__arch.push('fetcherr ' + e)) } return p }; window.addEventListener('unhandledrejection', e => window.__arch.push('unhandled ' + e.reason)) }")
        page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
        page.wait_for_timeout(1500)

    def tab_labels():
        return [t.text_content().strip() for t in page.locator(".war-cmdtab").all()]

    def click_tab(label: str):
        for i, l in enumerate(tab_labels()):
            if label in (l or ""):
                page.locator(".war-cmdtab").nth(i).click()
                page.wait_for_timeout(700)
                return
        raise AssertionError(f"tab {label} not found in {tab_labels()}")

    open_board()

    # --- ① 页签组在场 + 缺省进行中 ------------------------------------------
    tabs = tab_labels()
    assert len(tabs) == 3, f"三页签缺席：{tabs}"
    on_labels = [page.locator(".war-cmdtab.on").all_text_contents()]
    assert page.locator('.war-cmdtab.on:has-text("进行中")').count() == 1, f"缺省应进行中：{on_labels}"
    print(f"① tabs ok: {tabs}")

    # --- ② 已收官页签：全板只含终局卡 ---------------------------------------
    click_tab("已收官")
    assert page.locator('.war-cmdtab.on:has-text("已收官")').count() == 1
    body_text = page.locator(".war-root").inner_text()
    assert "修复分页参数 off-by-one" in body_text, "已收官页签应含 t6 收官卡"
    assert "等你回答" not in body_text and "成形中" not in body_text and "起草中" not in body_text, \
        "已收官页签不得出现进行中卡（成形 ghost 全族隐退）"
    page.screenshot(path=str(OUT / "v17-settled-tab.png"))
    print("② settled tab ok")

    # --- ③ 已归档页签：空态（尚未归档任何命令） ------------------------------
    click_tab("已归档")
    n_cards = page.locator(".war-dispatch .war-command-card").count()
    assert n_cards == 0, f"已归档页签初始应为空，got {n_cards}"
    page.screenshot(path=str(OUT / "v17-archived-empty.png"))
    print("③ archived empty ok")

    # --- ④ 非终局命令：归档按钮禁用 -----------------------------------------
    click_tab("进行中")
    page.locator(".war-dispatch .war-command-card", has_text="顺便给小工具加个导出 csv").first.click()
    page.wait_for_selector(".war-cd-modal", timeout=5000)
    btn = page.locator(".war-archive-btn")
    assert btn.count() == 1, "归档按钮缺席"
    assert btn.is_disabled(), "非终局命令的归档按钮应禁用"
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    print("④ gate on non-terminal ok")


    # --- ⑥ A-② 星域星球集合随页签过滤 --------------------------------------
    def planet_count():
        page.keyboard.press("m")
        page.wait_for_timeout(2600)
        n = page.evaluate("() => window.__wz ? window.__wz.scene.planets.length : -1")
        page.keyboard.press("m")
        page.wait_for_timeout(1200)
        return n

    click_tab("进行中")  # ⑥ 在归档（⑤）之前跑——已归档页签此刻为空态
    n_active = planet_count()
    click_tab("已归档")
    n_arch = planet_count()
    click_tab("进行中")
    assert n_active > 0 and n_arch == 0 and n_arch < n_active, \
        f"星域星球数应随页签过滤（空归档页签=0 星球）：active={n_active} archived={n_arch}"
    print(f"⑥ starfield filter ok: active={n_active} archived={n_arch}")

    # --- ⑧ B-② 列表态：overlay 在场 + 常显管段不穿卡体 ------------------------
    pipe = page.locator(".war-pipe-svg")
    assert pipe.count() == 1, "列表态管网 overlay 缺席"
    assert page.locator(".war-pipe-svg.war-pipe-map").count() == 0, "列表态不该有 map 弦类"
    n_paths = page.evaluate("""() => {
      const svg = document.querySelector('.war-pipe-svg')
      return svg ? svg.querySelectorAll('path[d]').length : -1
    }""")
    assert n_paths >= 2, f"列表态管路径数异常：{n_paths}"
    crosses = page.evaluate("""() => {
      const svg = document.querySelector('.war-pipe-svg')
      const box = svg.getBoundingClientRect()
      // 卡矩形按滚动容器裁剪（overflow 列体里 rect 报全长——不可见下半截不算障碍）
      const visRect = (el) => {
        let r = el.getBoundingClientRect()
        let n = el.parentElement
        while (n && n !== document.body) {
          const o = getComputedStyle(n).overflowY
          if ((o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip')) {
            const c = n.getBoundingClientRect()
            const top = Math.max(r.top, c.top), bot = Math.min(r.bottom, c.bottom)
            const lef = Math.max(r.left, c.left), rig = Math.min(r.right, c.right)
            r = { top, bottom: bot, left: lef, right: rig, width: rig - lef, height: bot - top }
          }
          n = n.parentElement
        }
        return r
      }
      const cards = [...document.querySelectorAll('[data-pipe-cmd],[data-pipe-task],[data-pipe-sess],[data-pipe-forming]')]
        .map(el => { const r = visRect(el)
          return { x1: r.left - box.left + 2, y1: r.top - box.top + 2, x2: r.right - box.left - 2, y2: r.bottom - box.top - 2 } })
      const INS = 2  // 2px 内缩：端口/圆角贴边不算穿卡
      let hits = 0
      for (const path of svg.querySelectorAll('path[d]')) {
        const dattr = path.getAttribute('d') || ''
        if (!dattr.trim()) continue
        const L = path.getTotalLength()
        for (let i = 0; i <= 120; i++) {
          const p = path.getPointAtLength(L * i / 120)
          for (const c of cards)
            if (p.x > c.x1 + INS && p.x < c.x2 - INS && p.y > c.y1 + INS && p.y < c.y2 - INS) { hits += 1; break }
        }
      }
      return hits
    }""")
    assert crosses == 0, f"管段穿卡体采样命中 {crosses} 次（管走沟槽不许穿卡）"
    page.screenshot(path=str(OUT / "v17-pipes-list.png"))
    print(f"⑧ list pipes ok: {n_paths} paths, 0 card-crossings")

    # --- ⑨ B-② hover：族管 100% / 其余 5%；reduced-motion 流动动画 none -------
    page.locator(".war-dispatch .war-command-card", has_text="顺便给小工具加个导出 csv").first.hover()
    page.wait_for_timeout(700)
    ops_ = page.evaluate("""() => {
      const on = document.querySelector('.war-pipe-svg g.on path')
      const off = document.querySelector('.war-pipe-svg g:not(.on) path')
      return { on: on ? getComputedStyle(on).opacity : null, off: off ? getComputedStyle(off).opacity : null }
    }""")
    assert ops_["on"] == "1", f"hover 族管应 100%：{ops_}"
    assert ops_["off"] is not None and float(ops_["off"]) <= 0.06, f"其余族管应压 5%：{ops_}"
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(300)
    anim = page.evaluate("() => { const p = document.querySelector('.war-pipe-flowing'); return p ? getComputedStyle(p).animationName : 'absent' }")
    assert anim in ("none", "absent"), f"reduced-motion 下流动动画应停：{anim}"
    page.emulate_media(reduced_motion="no-preference")
    page.mouse.move(860, 60)  # 移出卡——退出 hover 态
    page.wait_for_timeout(500)
    print(f"⑨ hover/reduced-motion ok: on={ops_['on']} off={ops_['off']} anim={anim}")

    # --- ⑩ B-② map 态：overlay+弦在场、压暗乘数、流动弦对齐 ------------------
    page.keyboard.press("m")
    page.wait_for_timeout(2600)
    assert page.locator(".war-pipe-svg.war-pipe-map").count() == 1, "map 态管网 overlay 缺席"
    hq = page.evaluate("() => window.__wz ? window.__wz.hqScreen() : null")
    assert hq is not None, "HQ 投影出口不可用（2D 盘心）"
    near_hq = page.evaluate("""(hq) => {
      let best = 1e9
      for (const path of document.querySelectorAll('.war-pipe-svg path[d]')) {
        const dattr = path.getAttribute('d') || ''
        if (!dattr.trim()) continue
        const L = path.getTotalLength()
        for (let i = 0; i <= 160; i++) {
          const p = path.getPointAtLength(L * i / 160)
          best = Math.min(best, Math.hypot(p.x - hq.x, p.y - hq.y))
        }
      }
      return Math.round(best)
    }""", hq)
    assert near_hq < 25, f"map 态管应过 HQ（弦锚）：最近距离 {near_hq}px"

    # 压暗：hover 命令卡 → dimActive + 非命中星球像素变暗（2D tac 帧绘 ×0.35）。
    # 全星球前/后采样再择差——星球序不假定，命中星球（亮起）不误判。
    def lum_of(ws: str) -> float:
        return page.evaluate("""(ws) => {
          const wz = window.__wz
          const pt = wz.planetScreen(ws)
          if (pt === null) return -1
          const cv = document.querySelector('.war-wz-tac')
          const g = cv.getContext('2d')
          const dpr = cv.width / cv.clientWidth
          const x = Math.round(pt.x * dpr), y = Math.round(pt.y * dpr)
          const d = g.getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data
          let lum = 0
          for (let i = 0; i < d.length; i += 4) lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          return lum / (d.length / 4)
        }""", ws)
    all_ws = page.evaluate("() => window.__wz.scene.planets.map(p => p.wsPath)")
    pre = {ws: lum_of(ws) for ws in all_ws}
    # 有真任务（有星球）的族才能点亮 highlightWs——成形 ghost 族无星球可连。
    card = page.locator(".war-dispatch .war-command-card", has_text="认证模块重构").first
    card.hover()
    page.wait_for_timeout(900)
    dim_on = page.evaluate("() => window.__wz.scene.dimActive === true")
    assert dim_on, "hover 族时 scene.dimActive 应为 true"
    hl_set = page.evaluate("() => [...window.__wz.scene.hlWs]")
    post = {ws: lum_of(ws) for ws in all_ws}
    page.mouse.move(860, 60)
    page.wait_for_timeout(900)
    far = [ws for ws in all_ws if ws not in hl_set and pre.get(ws, -1) > 0 and post.get(ws, -1) > 0]
    drops = {ws: abs(pre[ws] - post[ws]) for ws in far}
    # 浅色主题下星球填充是亮纸面上的暗叠加——alpha×0.35 = 像素变亮（暗主题相反）；
    # 断言取变化幅度而非方向。
    assert drops, f"可采样的非命中星球缺席：all={all_ws} hl={hl_set} pre={pre} post={post}"
    best_drop = max(drops.values())
    assert best_drop > 4, f"非命中星球应被压暗/提亮（|亮度差|）：{ {k: round(v, 1) for k, v in drops.items()} }"
    print(f"⑩ map overlay/dim ok: hq dist={near_hq}px, best far-planet lum drop={best_drop:.1f}")

    # 3D 半边：切暗色主题（浅色主题 3D 行星环分支是死代码——ring 恒 null），
    # 非命中光晕 ×0.35、命中光晕 0.58 增亮（halo lerp 0.1/帧，留收敛时间）。
    page.evaluate("() => document.body.setAttribute('data-ds-dark-theme', '')")
    page.wait_for_timeout(1200)
    page.evaluate("() => window.__wz.setMode('3d')")
    page.wait_for_timeout(600)
    card.hover()
    page.wait_for_timeout(1600)
    halo = page.evaluate("""() => {
      const s = window.__wz.scene
      const dimmed = s.planets.filter(p => !s.hlWs.has(p.wsPath)).map(p => p.halo.material.opacity)
      const lit = s.planets.filter(p => s.hlWs.has(p.wsPath)).map(p => p.halo.material.opacity)
      return { dim: dimmed.length ? Math.max(...dimmed) : null, lit: lit.length ? Math.min(...lit) : null }
    }""")
    page.mouse.move(860, 60)
    page.evaluate("() => window.__wz.setMode('cmd')")
    page.evaluate("() => document.body.removeAttribute('data-ds-dark-theme')")
    page.keyboard.press("m")
    page.wait_for_timeout(1200)
    assert halo["dim"] is not None and halo["dim"] < 0.25, f"3D 非命中光晕应 ×0.35：{halo}"
    assert halo["lit"] is None or halo["lit"] >= 0.5, f"3D 命中光晕应保持增亮：{halo}"
    page.screenshot(path=str(OUT / "v17-pipes-map.png"))
    print(f"⑩ 3d halo ok: dimmed<={halo['dim']:.2f} lit>={(halo['lit'] or 0):.2f}")

    # --- ⑤ 终局命令归档：确认窗含「不可逆」→ 确认 → 自动切已归档页签 ---------
    click_tab("已收官")  # failed 命令住已收官页签
    # 宿主 RPC 冷启动窗：起服后 sessions/registry 首扫可达 1-3 分钟（本机实测）。
    # 归档放全脚本最后（此刻宿主已暖），且先等 host-sessions 完成一次应答。
    def wait_rpc_warm(budget_s: int = 900) -> None:
        import time as _t
        deadline = _t.time() + budget_s
        while _t.time() < deadline:
            import urllib.request as _u
            try:
                t0 = _t.time()
                with _u.urlopen(f"{BASE}/warroom/api/host-sessions", timeout=300) as r:
                    r.read()
                if True:
                    return
            except Exception:
                pass
            page.wait_for_timeout(5000)
        raise AssertionError("宿主 RPC 冷启动窗未在预算内变暖，归档会假败")
    wait_rpc_warm()
    page.locator(".war-dispatch .war-command-card", has_text="查清楚登录重定向测试为什么老挂").first.click()
    page.wait_for_selector(".war-cd-modal", timeout=5000)
    btn = page.locator(".war-archive-btn")
    assert btn.count() == 1 and btn.is_enabled(), "终局命令的归档按钮应可点"
    btn.click()
    page.wait_for_timeout(400)  # React 换装确认条——立即点会 down/up 跨节点丢合成 click
    confirm = page.locator(".war-archive-confirm")
    assert confirm.count() == 1, "确认条未出现"
    assert "不可逆" in confirm.inner_text(), "确认条必须含「不可逆」警示"
    page.screenshot(path=str(OUT / "v17-archive-confirm.png"))
    confirm.locator("button", has_text="确认归档").click()
    # 归档扇出逐会话过宿主 workspace-registry 串行操作队（enqueueOperation——
    # 每步落盘）；演示板 fuse/织换/征召同时在排队时，整链实测可达数十秒
    # （RPC 已 15s 有界，路由并行+诚实记账）。90s 轮询等窗关+页签切。
    def archived_done() -> bool:
        return page.locator(".war-cd-modal").count() == 0 and page.locator('.war-cmdtab.on:has-text("已归档")').count() == 1
    try:
        page.wait_for_function(
            "() => document.querySelector('.war-cd-modal') === null && !!document.querySelector('.war-cmdtab.on') && document.querySelector('.war-cmdtab.on').textContent.includes('已归档')",
            timeout=90000,
        )
    except Exception:
        pass
    assert archived_done(), (f"归档后应关窗并自动切到已归档页签",
        {"net": net_log, "modal": page.locator(".war-cd-modal").count(),
         "confirm": page.locator(".war-archive-confirm").count(),
         "btn": page.locator(".war-archive-btn").count(),
         "tab": page.locator(".war-cmdtab.on").text_content(),
         "arch": page.evaluate("() => window.__arch"),
         "lsTab": page.evaluate("() => localStorage.getItem('warroom-cmd-tab')"),
         "actionerr": page.locator(".war-actionerr").count() and page.locator(".war-actionerr").inner_text(),
         "errs": errors[-3:]})
    assert page.locator(".war-dispatch .war-command-card", has_text="查清楚登录重定向测试为什么老挂").count() == 1, \
        "已归档页签应含刚归档的命令卡"
    # 归档后星球随页签过滤（后半：归档页签现在应有该命令的星球）
    click_tab("已归档")
    n_arch2 = planet_count()
    click_tab("进行中")
    assert n_arch2 >= 1, f"归档后已归档页签星球应 ≥1：{n_arch2}"
    page.screenshot(path=str(OUT / "v17-archived-after.png"))
    print(f"⑤ archive flow ok (archived-tab planets={n_arch2})")

    # --- ⑦ A-③ 归档实证：账面会话已从宿主清单消失 ---------------------------
    board = api("/warroom/api/board")
    archived = [c for c in board["commands"] if c.get("archived")]
    assert archived, "板面应含已归档命令"
    ledger_sessions = sorted({s for c in archived for s in (c["archived"]["sessions"] or [])})
    assert ledger_sessions, "账面应冻结归档会话清单"
    host = api("/warroom/api/host-sessions")
    assert host.get("ok") and host.get("sessions") is not None, "宿主清单核查通道不可用"
    leaked = [s for s in ledger_sessions if s in set(host["sessions"])]
    assert not leaked, f"归档会话仍出现在宿主清单：{leaked}"
    print(f"⑦ A-③ ok: {len(ledger_sessions)} archived sessions gone from host list")

    browser.close()

print("console errors:", errors if errors else "none")
assert not errors, f"console/page errors: {errors}"
print("V17 SHOTS OK")
