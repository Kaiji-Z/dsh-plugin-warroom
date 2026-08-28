"""v13 evidence shooter — 战线一等公民（血脉∩战场拆分 / 未分组行星 / 世代环）.

Usage: python scripts/shoot-v13.py [outDir] [baseUrl]
Assumes: smoke-overlay server running on BASE, board seeded via seed-playground.py
（停服→播种→起服 三步协议；本脚本不改种子，只断言 + 截图）。
Phases:
  L 列表态：六代链按「血脉∩战场」新规拆两段——两个战线组头（Ⅰ 文本与
    Ⅳ 文本各自带队 = 同血脉不同战线的活证）；调度坞同血脉两卡组分列
    （data-war-group=血脉/段头键）；未分组战线任务卡在场。
  M 战区 3D：世代环锚定单战场（环数==锚定战线数、标记==代数和、末代放大）、
    未分组行星在场、世代标记 pick→front→rootCommandId 可达。
  F 2D 回退：WebGL 掐灭 → SVG 战线环层（circle 环 + 代点）。
  T 双主题目检截图（深/浅 × 列表/战区，落 evidence/v13/）。
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3080"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else ".goal/evidence/v13")
OUT.mkdir(parents=True, exist_ok=True)

G1_TEXT = "一键部署脚本"   # Ⅰ 代（WS_C1 段头）
G4_TEXT = "docker compose"  # Ⅳ 代（跨战场后新段头）
G7_TEXT = "相册"            # 未分组合成沙盒战线

fails: list[str] = []


def ok(name: str, cond, detail: str = "") -> None:
    print(f"{'ok  ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


pageerrors: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # --- L 列表态：血脉∩战场拆分双证 -------------------------------------------
    page = browser.new_page(viewport={"width": 1720, "height": 940})
    page.on("pageerror", lambda e: pageerrors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
    page.wait_for_timeout(1500)
    page.evaluate("() => document.body.setAttribute('data-ds-dark-theme', '')")
    page.wait_for_timeout(600)
    heads = page.locator(".war-front-head")
    n_heads = heads.count()
    ok("L1 任务列战线组头 ≥2", n_heads >= 2, f"heads={n_heads}")
    texts = [heads.nth(i).inner_text() for i in range(min(n_heads, 10))]
    # V15：Ⅳ 段带元首命名「compose 迁移」——head 显示命名而非原文；拆段双证改为
    # Ⅰ 段原文 + 组键分列（L3）+ 命名（L5）三证。
    ok("L2 拆段活证：Ⅰ 段原文带队 + 两个以上组头",
       any(G1_TEXT in t for t in texts) and len(texts) >= 2,
       " / ".join(t.replace("\n", " ")[:22] for t in texts[:6]))
    groups = page.evaluate(
        "() => [...document.querySelectorAll('.war-dispatch [data-war-group]')].map(e => e.getAttribute('data-war-group'))")
    roots: dict[str, int] = {}
    for g in groups:
        roots[g.split("/")[0]] = roots.get(g.split("/")[0], 0) + 1
    ok("L3 调度坞同血脉两卡组分列（血脉/段头组键）", any(v >= 2 for v in roots.values()), str(groups)[:160])
    ok("L5 命名战线（Ⅳ 段元首命名）：组头显示「compose 迁移」而非命令原文",
       any("compose 迁移" in t for t in texts), " / ".join(t.replace(chr(10), " ")[:20] for t in texts[:6]))
    ok("L4 未分组战线任务卡在场", page.locator(".war-task-card", has_text=G7_TEXT).count() >= 1
       or page.locator(".war-command-card", has_text=G7_TEXT).count() >= 1)
    page.screenshot(path=str(OUT / "v13-list-dark.png"))

    # --- M 战区 3D：世代环 + 未分组行星 -----------------------------------------
    page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
    page.wait_for_selector(".war-wz", timeout=20000)
    page.wait_for_timeout(2500)
    page.evaluate("() => document.body.setAttribute('data-ds-dark-theme', '')")
    page.keyboard.press("v")
    page.wait_for_timeout(1500)
    fr = page.evaluate("""() => { const s = window.__wz.scene; const fronts = s.lastFronts || [];
      const planetWs = new Set(s.planets.map(p => p.wsPath));
      const anchored = fronts.filter(f => planetWs.has(f.battlefield));
      let markers = 0, lastBig = 0;
      for (const g of s.frontGroup.children) for (const m of g.children)
        if (m.geometry && m.geometry.type === 'OctahedronGeometry') { markers++; if (m.geometry.parameters.radius >= 2.4) lastBig++; }
      const un = s.planets.find(p => p.wsPath === '__war_ungrouped__');
      let pickFront = null;
      if (s.frontPickables.length > 0) {
        const m = s.frontPickables[s.frontPickables.length - 1];
        const v = m.position.clone().project(s.camera);
        const hit = s.pick(v.x, v.y);
        pickFront = hit && hit.kind === 'front' ? hit.rootCommandId : null; }
      return { fronts: fronts.length, anchored: anchored.length, rings: s.frontGroup.children.length,
               markers, gens: anchored.reduce((n, f) => n + Math.max(f.gens, 1), 0), lastBig,
               pick: s.frontPickables.length, ungrp: un ? un.name : null, pickFront } }""")
    ok("M1 世代环条数==锚定战场的战线数（单战场锚定）", fr["rings"] == fr["anchored"] and fr["rings"] >= 3, str(fr))
    ok("M2 世代标记==代数和（末代放大在场）", fr["markers"] == fr["gens"] and fr["lastBig"] >= 1, str(fr))
    ok("M3 未分组行星在场（合成沙盒聚合）", fr["ungrp"] is not None and "未分组" in fr["ungrp"], str(fr["ungrp"]))
    ok("M4 世代标记可拾取（pick→front→源命令）", fr["pick"] == fr["markers"] and fr["pickFront"] is not None, str(fr))
    page.screenshot(path=str(OUT / "v13-warzone-dark.png"))
    page.evaluate("() => document.body.removeAttribute('data-ds-dark-theme')")
    page.wait_for_timeout(1800)
    page.screenshot(path=str(OUT / "v13-warzone-light.png"))
    page.close()

    # --- F 2D 回退（WebGL 掐灭 → SVG 战线环） -----------------------------------
    ctx2 = browser.new_context(viewport={"width": 1480, "height": 900})
    ctx2.add_init_script("""
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
        return orig.call(this, type, ...rest);
      };
    """)
    pg2 = ctx2.new_page()
    pg2.on("pageerror", lambda e: pageerrors.append(str(e)))
    pg2.goto(BASE, wait_until="domcontentloaded")
    pg2.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    pg2.goto(BASE, wait_until="domcontentloaded")
    pg2.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
    pg2.wait_for_timeout(1800)
    sf = pg2.locator(".war-starfield")
    ok("F1 WebGL 掐灭→2D 回退画布", sf.count() == 1 and sf.get_attribute("data-war-3d") != "1")
    rings2d = pg2.locator(".war-front-svg circle").count()
    ok("F2 SVG 战线环在场（环+代点）", rings2d >= 3, f"circles={rings2d}")
    ok("F3 未分组标签在场（2D 回退同语义）", sf.inner_text().count("未分组") >= 1)
    pg2.screenshot(path=str(OUT / "v13-2d-fallback.png"))
    ctx2.close()
    browser.close()

if pageerrors:
    print("PAGEERRORS:", pageerrors)
ok("Z 无页面错误", not pageerrors, str(pageerrors[:3]))
print("shoot-v13:", "PASS" if not fails else f"FAIL {fails}")
sys.exit(0 if not fails and not pageerrors else 1)
