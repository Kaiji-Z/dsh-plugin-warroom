"""v6 evidence shooter — 三区板 + 命令全生命周期（impeccable 重设计轮）.

Usage: python scripts/shoot-v6.py [outDir] [baseUrl]
Captures: three-zone board, command lifecycle detail (chain section),
lineage chip navigation, plain-skin toggle. Machine assertions throughout.
"""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/v6"
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"

errors: list[str] = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1720, "height": 940})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE)
    page.wait_for_load_state("domcontentloaded")

    row = page.wait_for_selector("[data-dsh-warroom-entry]", timeout=15000)
    row.click()
    page.wait_for_timeout(1200)
    assert page.evaluate("document.documentElement.getAttribute('data-dsh-warroom-active')") is not None, "board did not activate"

    # ① 三区：指挥中心 / 星球 / 任务回报。
    assert page.query_selector(".war-hq") is not None, "war-hq missing"
    assert page.query_selector(".war-field") is not None, "war-field missing"
    assert page.query_selector(".war-report") is not None, "war-report (third zone) missing"
    zones = page.locator(".war-zone-head").count()
    assert zones == 3, f"expected 3 zone heads, got {zones}"
    field_cols = page.locator(".war-field .war-col").count()
    report_cols = page.locator(".war-report .war-col").count()
    print(f"zones=3 ok; field cols={field_cols} (expect 1), report cols={report_cols} (expect 2)")

    # ② 命令卡全生命周期阶段条。
    strips = page.locator(".war-life").count()
    bars = page.locator(".war-life-bar").count()
    assert strips >= 1, "no lifecycle strip on command cards"
    assert bars >= strips * 4, f"expected 4 bars/strip, got {bars} bars / {strips} strips"
    now_bars = page.locator(".war-life-bar.now").count()
    done_bars = page.locator(".war-life-bar.done").count()
    print(f"lifecycle strips={strips}, bars={bars}, now={now_bars}, done={done_bars}")

    # ③ 任务卡溯源 chip（种子板有 approved 命令→任务链接）。
    lineage = page.locator(".war-lineage").count()
    print(f"lineage chips on board: {lineage}")

    page.screenshot(path=f"{OUT}/v6-three-zones.png")
    print("shot: v6-three-zones.png")

    # ④ 命令详情 = 追踪中枢：点一张非 received/talking 命令卡（无 pulse 的）。
    detail_card = page.locator(".war-command-card:not(.pulse):not(.clickable)").first
    detail_card.click()
    page.wait_for_timeout(400)
    modal = page.wait_for_selector(".war-modal", timeout=3000)
    assert modal is not None, "command detail modal did not open"
    assert page.locator("text=任务链进展").count() >= 1, "chain section missing in command detail"
    page.screenshot(path=f"{OUT}/v6-command-lifecycle.png")
    print("shot: v6-command-lifecycle.png (lifecycle detail hub)")
    # CommandDetail 是普通函数浮层（无 Escape 绑定）——用关闭按钮收起。
    page.locator(".war-modal-actions button", has_text="关闭").last.click()
    page.wait_for_timeout(300)

    # ⑤ 溯源导航：任务卡上的 ↩ chip 应打开命令详情。
    if lineage > 0:
        page.locator(".war-lineage").first.click()
        page.wait_for_timeout(400)
        assert page.locator(".war-modal").count() >= 1, "lineage chip did not open command detail"
        page.screenshot(path=f"{OUT}/v6-lineage-jump.png")
        print("shot: v6-lineage-jump.png (task → source command)")
        page.locator(".war-modal-actions button", has_text="关闭").last.click()
        page.wait_for_timeout(300)

    # ⑥ 皮肤切换：平话皮肤下「打赢了」应变「已完成」。
    if page.locator("text=打赢了").count() > 0:
        page.locator(".war-skin-btn").click()
        page.wait_for_timeout(300)
        assert page.locator("text=已完成").count() > 0, "plain skin copy did not apply"
        assert page.locator("text=打赢了").count() == 0, "war skin copy still present after toggle"
        page.screenshot(path=f"{OUT}/v6-plain-skin.png")
        print("shot: v6-plain-skin.png (plain-language skin, three zones)")
        page.locator(".war-skin-btn").click()
        page.wait_for_timeout(200)

    browser.close()

print("console errors:", errors[:10] if errors else "none")
print("V6 SHOTS OK")
