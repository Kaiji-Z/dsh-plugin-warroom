"""v3 evidence shooter — Playwright against the running smoke board.

Usage: python scripts/shoot-board.py [outDir] [baseUrl]
Captures: two-zone board, battlefield detail modal, external thread card.
Also re-verifies the sidebar-row click path (the IAB-era anomaly).
"""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/v3"
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"

errors: list[str] = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE)
    page.wait_for_load_state("domcontentloaded")
    # NOTE: networkidle never fires here — the board's SSE stream holds a
    # persistent connection. Wait on concrete selectors instead.

    row = page.wait_for_selector("[data-dsh-warroom-entry]", timeout=15000)
    row.click()
    page.wait_for_timeout(1200)
    active = page.evaluate("document.documentElement.getAttribute('data-dsh-warroom-active')")
    print("sidebar click -> active attr:", active)
    assert active is not None, "board did NOT activate: real v3 regression"
    assert page.query_selector(".war-hq") is not None, "war-hq missing"
    assert page.query_selector(".war-field") is not None, "war-field missing"
    assert page.query_selector(".war-zone-head") is not None, "zone heads missing"
    assert page.query_selector(".war-plus") is not None, "command + button missing"
    assert page.query_selector(".war-attach-btn") is not None, "attach button missing"
    assert page.query_selector("text=开设参谋部") is None, "HQ-create button still present"
    page.screenshot(path=f"{OUT}/r1-two-zones.png")
    print("shot: r1-two-zones.png")

    card = page.wait_for_selector(".war-session-card", timeout=5000)
    card.click()
    page.wait_for_timeout(600)
    page.wait_for_selector("text=进入会话复盘", timeout=3000)
    page.wait_for_selector(".war-modal.wide", timeout=3000)
    page.screenshot(path=f"{OUT}/r1-session-detail.png")
    print("shot: r1-session-detail.png (detail-first modal + jump button)")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    ext = page.wait_for_selector(".war-external-card", timeout=5000)
    badge = ext.query_selector(".ext-badge")
    detach = ext.query_selector(".war-detach")
    print("external card: badge=%r detach=%r" % (badge.inner_text() if badge else None, detach is not None))
    page.screenshot(path=f"{OUT}/r2-external-card.png")
    print("shot: r2-external-card.png")

    handle = page.locator(".war-card button", has_text="去处理").count()
    print("去处理 buttons visible:", handle)
    day = page.locator(".war-day-head").count()
    print("day-group headers:", day)
    dock = page.locator(".war-dock-home").count()
    print("dock home pill present:", dock)

    browser.close()

print("console errors:", errors[:10] if errors else "none")
print("ALL SHOTS OK")
