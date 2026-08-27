"""v10 evidence shooter — 战线续接（世代徽标/族谱面包屑/pivot 转向）+ 星域战场底版.

Usage: python scripts/shoot-v10.py [outDir] [baseUrl] [smokeStateDir]
Assumes the smoke-overlay server is ALREADY running on BASE (isolated statePath,
same convention as shoot-v7.py). Phases:
  0 clear smoke state → board drains
  S file-level seed: 3 workspaces / 2 凯旋 closed 仗 / 1 live 执行会话 /
    Ⅱ 代链(deepen) / draft pivot 续战令（宿主 resume 对伪会话必败→留 draft）
  P1 列表视图缺省（三列齐在、星域不在场）
  P2 切星域：开关置 .war-map；星球数==workspace 数；凯旋印记显形；
     hover 活体光点 → 调度条出现 war-rel-same 族链高亮
  P3 切回列表：星域卸载
  P4 世代徽标 + 聚焦页战线族谱（面包屑 length=2、续战令·深化副行）
  P5 pivot 双证：API deriveMode=pivot + 已令聚焦页「续战令·转向」tag
"""
import json
import shutil
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/v10")
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"
STATE = Path(sys.argv[3] if len(sys.argv) > 3 else ".smoke-state")
OUT.mkdir(parents=True, exist_ok=True)

isoA = "2026-08-26T06:00:00Z"
ISOS = {"a": isoA}


def stamp(mins_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=mins_ago)).isoformat(timespec="milliseconds")


# --- Phase 0 -----------------------------------------------------------------
shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
(STATE / ".demo-woven.json").unlink(missing_ok=True)
print(f"cleared smoke state: {STATE}")
for _ in range(20):
    try:
        body = json.loads(urllib.request.urlopen(f"{BASE}/warroom/api/board", timeout=5).read())
        if not body.get("commands") and not body.get("tasks"):
            break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit("board did not drain after clearing smoke state")
print("board drained")

# --- Phase S: 文件级播种（与 fold 层字段严格同形） -----------------------------
CAM = STATE / "campaigns"
CAM.mkdir(parents=True, exist_ok=True)

def ev(campaign_id: str, payload: dict) -> None:
    with open(CAM / f"{campaign_id}.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

def task_base(cid: str, title: str, ts: str) -> None:
    ev(cid, {"type": "task_created", "ts": ts, "campaignId": cid, "title": title, "brief": "b", "acceptance": "a", "priority": "normal"})

def close(cid: str, verdict: str, ws: str, t0: float) -> None:
    task_base(cid, title=verdict[:12], ts=stamp(t0))
    ev(cid, {"type": "task_published", "ts": stamp(t0 - 1), "campaignId": cid, "workspacePath": ws})
    ev(cid, {"type": "task_closed", "ts": stamp(t0 - 2), "campaignId": cid, "verdict": verdict})

DIR_PATH = STATE / "directives.jsonl"

def dcmd(payload: dict) -> None:
    with open(DIR_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

def approve(did: str, tid: str, m: int) -> None:
    dcmd({"type": "directive_approved", "ts": stamp(m), "directiveId": did, "taskId": tid})

close("T-A1", "临时目录清空并回归全绿", r"C:\repo\alpha", 90)
close("T-A2", "README 补齐三章", r"C:\repo\alpha", 60)
close("T-G1", "gamma 案情归档完毕", r"C:\repo\gamma", 45)
task_base("T-B1", "beta 前线增援", stamp(30))
ev("T-B1", {"type": "task_published", "ts": stamp(29), "campaignId": "T-B1", "workspacePath": r"C:\repo\beta"})
ev("T-B1", {"type": "task_claimed", "ts": stamp(28), "campaignId": "T-B1", "claimedBy": "sess-demo-live"})

dcmd({"type": "directive_created", "ts": stamp(91), "directiveId": "cmd-seed-a1", "text": "清理 alpha 的临时目录并跑通回归"})
approve("cmd-seed-a1", "T-A1", 88)
dcmd({"type": "directive_created", "ts": stamp(61), "directiveId": "cmd-seed-a2", "text": "顺势补一份 README 章节导航",
      "continuesFrom": "cmd-seed-a1", "continuationMode": "deepen"})
approve("cmd-seed-a2", "T-A2", 59)
dcmd({"type": "directive_created", "ts": stamp(31), "directiveId": "cmd-seed-b1", "text": "盯紧 beta 前线保持推进"})
approve("cmd-seed-b1", "T-B1", 27)
dcmd({"type": "directive_created", "ts": stamp(3), "directiveId": "cmd-seed-b2", "text": "火线加测一键回滚脚本",
      "continuesFrom": "cmd-seed-b1", "continuationMode": "pivot"})
time.sleep(2)
print("seeded")

pageerrors: list[str] = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1720, "height": 940})
    page.on("pageerror", lambda e: pageerrors.append(str(e)))

    def open_board() -> None:
        page.goto(BASE)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
        page.wait_for_timeout(1200)

    open_board()

    # --- P1 列表缺省 + 坞按钮退役（开关迁设置抽屉）------------------------------
    assert page.locator(".war-ops:not(.war-mapmode)").count() == 1, "列表视图应为缺省（war-mapmode 不挂）"
    assert page.locator(".war-zone.war-tasks").is_visible() and page.locator(".war-zone.war-report").is_visible(), "三列布局必须原样在场"
    assert page.locator(".war-starfield").count() == 0, "列表态不应渲染星域"
    assert page.locator("[data-war-view-toggle]").count() == 0, "坞上切换按钮必须退役（V10.1 迁设置）"
    n_badge = page.locator('.war-dispatch .war-gen-badge[data-war-gen="2"]').count()
    assert n_badge >= 1, f"调度条应挂出 Ⅱ 代徽标，got {n_badge}"
    grp = page.locator(".war-cmd-group[data-war-group]")
    assert grp.count() >= 1, "同链命令必须聚成卡牌组"
    g1 = grp.first
    face = g1.locator(".war-cmd-group-face .war-command-card")
    # V10.1 卡组三改：坞里只摆最新代卡面（叠缘 50px 露出机制退役）
    assert face.count() == 1, "组内只应有最新代卡面"
    assert g1.locator(".war-command-card").count() == 1, "未展开时历代卡不应渲染"
    gb = g1.bounding_box(); fb = face.bounding_box()
    assert abs(gb["width"] - fb["width"]) <= 6, f"组宽应≈卡宽（叠缘已退役）：group_w={gb['width']:.0f} card_w={fb['width']:.0f}"
    # 历代状态 pip：Ⅰ/Ⅱ 两枚（罗马数字=代数），最新代带 now 标记
    pips = g1.locator(".war-gen-pips .war-gen-pip")
    assert pips.count() == 2, f"卡面应挂 2 枚历代状态圆点，got {pips.count()}"
    assert (pips.first.text_content() or "").strip() == "", "圆点 pip 不应带文字"
    assert g1.locator(".war-gen-pip.now").count() == 1, "最新代圆点应带 now 描环（卡面=此代）"
    # 五行恒高卡规格：全坞同尺寸 + 零内容溢出
    sizes = page.evaluate("""() => {
      const cs = [...document.querySelectorAll('.war-dispatch .war-command-card')];
      return { ws: [...new Set(cs.map(c => c.clientWidth))], hs: [...new Set(cs.map(c => c.clientHeight))],
               clip: cs.filter(c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).length };
    }""")
    assert len(sizes["ws"]) == 1 and len(sizes["hs"]) == 1, f"命令卡必须同尺寸：{sizes}"
    assert sizes["clip"] == 0, f"有 {sizes['clip']} 张卡内容溢出被裁"
    # 键鼠同权：聚焦卡面即展开历代面板（fixed 悬于卡面上方，新在顶）
    face.focus()
    page.wait_for_timeout(400)
    panel = page.locator(".war-group-panel")  # V10.1 面板 portal 出组挂 war-root——全局 locator
    assert panel.is_visible(), "聚焦组内卡面应展开历代面板（键鼠同权）"
    pcards = panel.locator(".war-command-card")
    assert pcards.count() == 1 and pcards.first.get_attribute("data-war-gen") == "1", "面板只摆历代（最新代由坞上卡面复用，不重复）"
    pb = panel.bounding_box()
    assert pb["y"] + pb["height"] <= fb["y"] + 2, "面板应整体悬于卡面上方（不遮卡面）"
    # 面板内滚轮不得横移轨道（原生 stopPropagation 拦截）
    sl0 = page.evaluate("document.querySelector('.war-dispatch-track').scrollLeft")
    panel.hover(); page.mouse.wheel(0, -200); page.wait_for_timeout(200)  # 从底往上翻（元首定：滚轮从底起步）
    assert page.evaluate("document.querySelector('.war-dispatch-track').scrollLeft") == sl0, "面板滚轮不得横移轨道"
    # 历史卡同形无 R5（过去的命令不再需要操作）；点 Ⅰ 代卡直达该代聚焦页
    assert panel.locator(".war-card-actions").count() == 0, "历史卡不应有 R5 操作行"
    assert panel.locator(".war-group-history").count() == 1, "历史卡应有层叠入场包层"
    pcards.nth(0).click()
    page.wait_for_selector(".war-cd-modal", timeout=5000)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    print("P1 list-default ok")

    # --- P2 星域（localStorage 路径切换——开关 UI 在设置抽屉）-------------------
    page.evaluate("() => localStorage.setItem('warroom-cfg-view','map')")
    open_board()
    sf = page.locator(".war-starfield")
    assert sf.count() == 1 and sf.is_visible(), "星域画布未现身（board 级铺满）"
    # V11.4 warzone demo 全要素进驻：3D 引擎 canvas + demo DOM 件 + __wz 句柄
    assert sf.locator(".war-wz-3d").count() == 1 and page.evaluate("() => document.querySelector('.war-wz-3d').width > 0"), "warzone 3D canvas 未渲染"
    assert sf.get_attribute("data-war-3d") == "1", "3D 星域标记缺席（若为回落态则 WebGL 失败）"
    assert not page.locator(".war-zone.war-field").is_visible(), "地图态战场列必须隐退（CSS 隐藏）"
    # 雷达值班默认态下 HUD/图例/提示按 demo 语义隐退（在场性可查、可见性留给 3D 态）
    for sel, name in [(".war-wz-hud", "HUD"), (".war-wz-legend", "图例"), (".war-wz-hint", "提示"), (".war-wz-toggle", "视图切换")]:
        assert sf.locator(sel).count() == 1, f"warzone {name} 件缺席"
    assert sf.locator(".war-wz-toggle").is_visible(), "视图切换钮必须恒可见"
    wz = page.evaluate("() => { const w = window.__wz; const ps = w.scene.planets; return { n: ps.length, names: ps.map(p=>p.name), squads: w.scene.squads.length, log: w.scene.log.length, modes: ps.map(p=>p.status) } }")
    ws_n = page.evaluate("async () => { const b = await (await fetch('/warroom/api/board')).json(); return new Set(b.tasks.map(t => t.workspacePath).filter(Boolean)).size }")
    assert wz["n"] == ws_n, f"warzone 星球数应==去重 workspace 数 {ws_n}，got {wz['n']}"
    assert all(' · W-' in n for n in wz['names']), f"星球命名应=目录名·W-编号：{wz['names'][:2]}"
    assert wz["squads"] >= 1 and wz["log"] >= 1, f"编队/日志未跑起来：{wz}"
    dock_y = page.locator(".war-dispatch").bounding_box()["y"]
    assert dock_y > 500, f"命令坞必须压底（TITP），got y={dock_y}"
    assert page.evaluate("() => { const t = document.querySelector('.war-dispatch-track'); return t.scrollHeight <= t.clientHeight + 1 }"), "调度坞轨道不得出现纵向滚动（高度须容下所有卡+富余）"
    sf_bb = page.locator(".war-starfield").bounding_box()
    for floater in (".war-zone.war-tasks", ".war-zone.war-report", ".war-dispatch"):
        fb = page.locator(floater).bounding_box()
        inside = fb["x"] >= sf_bb["x"] - 2 and fb["y"] >= sf_bb["y"] - 2 and fb["x"]+fb["width"] <= sf_bb["x"]+sf_bb["width"]+2 and fb["y"]+fb["height"] <= sf_bb["y"]+sf_bb["height"]+2
        assert inside, f"{floater} 必须完整浮于全幅星域之上：{fb} vs {sf_bb}"
    dock_bb = page.locator(".war-dispatch").bounding_box()
    for pod in (".war-zone.war-tasks", ".war-zone.war-report"):
        pb = page.locator(pod).bounding_box()
        gap = dock_bb["y"] - (pb["y"] + pb["height"])
        assert gap >= 7.5, f"{pod} 底部与坞必须留距，gap={gap:.1f}"
    assert abs(page.locator(".war-zone.war-tasks").bounding_box()["x"] - dock_bb["x"]) <= 3, "任务舱左缘须与坞左缘对齐（同 10px 内缩）"
    isl = page.locator(".war-island").first.bounding_box()
    top_el = page.evaluate("() => { const b = document.querySelector('.war-island').getBoundingClientRect(); return document.elementFromPoint(b.x + b.width/2, b.y + b.height/2)?.closest('.war-island') !== null }")
    assert top_el, "灵动岛必须浮于星域之上（岛中心命中岛自身）"
    assert page.locator(".war-zone.war-tasks").is_visible() and page.locator(".war-zone.war-report").is_visible(), "任务/战报浮舱必须压图在场"
    # V11.5 连线：雷达=值班默认态（挂载即 cmd、浮舱/坞恒在场）；V 双向切换
    assert page.locator(".war-wz-tac").is_visible(), "雷达值班默认态未生效（挂载应即指挥室）"
    assert page.locator(".war-zone.war-tasks").is_visible() and page.locator(".war-dispatch").is_visible(), "雷达态浮舱/坞必须在场（操作面恒在）"
    page.screenshot(path=str(OUT / "v10-map-cmd.png"))
    page.keyboard.press("v")
    page.wait_for_timeout(700)
    assert page.evaluate("() => window.__wz.mode()") == "3d" and not page.locator(".war-wz-tac").is_visible(), "V 键未切到 3D 战略态"
    # 3D 悬停信息卡（画面中心=HQ 拾取代理）：真实战力行
    page.mouse.move(sf_bb["x"] + sf_bb["width"] / 2, sf_bb["y"] + sf_bb["height"] / 2)
    page.wait_for_timeout(700)
    assert page.locator(".war-wz-tip").is_visible(), "悬停信息卡未现身（画面中心应命中 HQ 代理）"
    tip_txt = page.locator(".war-wz-tip").inner_text()
    assert "HEADQUARTERS" in tip_txt and "凯旋" in tip_txt, f"HQ 卡应带真实战力行：{tip_txt[:40]}"
    page.mouse.move(8, 300)
    # V11.4 相机（demo OrbitControls 正案）：左键旋转/滚轮缩放（中键推拉）。
    spot = page.evaluate("""() => {
      const box = document.querySelector('.war-starfield3d').getBoundingClientRect();
      for (let fy = 0.25; fy <= 0.7; fy += 0.05)
        for (let fx = 0.3; fx <= 0.65; fx += 0.05) {
          const x = box.x + box.width * fx, y = box.y + box.height * fy;
          const el = document.elementFromPoint(x, y);
          if (el && el.tagName === 'CANVAS') return {x, y};
        }
      return null;
    }""")
    assert spot is not None, "找不到空画布落点（拖拽起点）"
    def cam():
        return page.evaluate("() => { const p = window.__wz.scene.camera.position; return [p.x, p.y, p.z] }")
    def dist(p):
        return (p[0] ** 2 + p[1] ** 2 + p[2] ** 2) ** 0.5
    c0 = cam()
    page.mouse.move(spot["x"], spot["y"]); page.mouse.down()
    page.mouse.move(spot["x"] - 300, spot["y"], steps=12); page.mouse.up()
    page.wait_for_timeout(1000)
    c1 = cam()
    assert sum(abs(a - b) for a, b in zip(c0, c1)) > 10, f"左键拖拽应旋转相机：{c0}->{c1}"
    page.mouse.move(spot["x"], spot["y"]); page.mouse.wheel(0, 500); page.wait_for_timeout(1000)
    d1 = dist(cam())
    page.mouse.move(spot["x"], spot["y"]); page.mouse.wheel(0, -800); page.wait_for_timeout(1000)
    d2 = dist(cam())
    assert abs(d2 - d1) > 5, f"滚轮应缩放（往复距离变化）：{d1:.0f}->{d2:.0f}"
    page.screenshot(path=str(OUT / "v10-map.png"))
    print("P2 map ok")

    # --- P3 回列表 ---------------------------------------------------------------
    page.evaluate("() => localStorage.setItem('warroom-cfg-view','list')")
    open_board()
    assert page.locator(".war-starfield").count() == 0, "回列表后星域应卸载"
    assert page.locator(".war-zone.war-field").is_visible(), "回列表后战场列回归"
    print("P3 back-to-list ok")

    # --- P4 聚焦页族谱 -----------------------------------------------------------
    page.locator(".war-dispatch .war-command-card").filter(has_text="顺势补一份 README").first.click()
    page.wait_for_selector(".war-cd-modal", timeout=5000)
    crumb = page.locator(".war-cd-chain[data-war-chain-length='2']")
    assert crumb.count() == 1, "战线族谱面包屑未显形或代数不对"
    assert crumb.locator(".war-cd-chain-item").first.text_content().strip().startswith("Ⅰ"), "面包屑首枚必须带 Ⅰ 代标识（半套代际正名）"
    subline = page.locator(".war-modal-sub").inner_text()
    assert "续战令·深化" in subline, f"副行缺续接正名：{subline}"
    page.screenshot(path=str(OUT / "v10-focus-chain.png"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    print("P4 focus chain ok")

    # --- P5 pivot 双证 ------------------------------------------------------------
    resp = page.evaluate(
        """async () => {
          const r = await fetch('/warroom/api/commands', { method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: '再补一条回滚演练', continuesFrom: 'cmd-seed-b1' }) });
          return { code: r.status, body: await r.json() };
        }"""
    )
    assert resp["code"] == 200 and resp["body"].get("continuationMode") == "pivot", f"API pivot 推导失守：{resp}"
    card = page.locator(".war-dispatch .war-command-card").filter(has_text="火线加测一键回滚").first
    card.click()
    page.wait_for_selector(".war-cd-modal", timeout=5000)
    sub2 = page.locator(".war-modal-sub").inner_text()
    assert "续战令·转向" in sub2, f"pivot 排队提示行缺失：{sub2}"
    page.screenshot(path=str(OUT / "v10-pivot.png"))
    print("P5 pivot ok")

    browser.close()

assert not pageerrors, f"页面异常：{pageerrors[:3]}"
print(f"SHOOT-V10 PASS — evidence at {OUT}")
