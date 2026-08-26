"""卡覆盖探针 —— V9.11/V9.12 验收：板上每一张可点卡都必须打开聚焦页。

Usage: python scripts/probe-card-coverage.py [baseUrl] [outJson]
baseUrl 默认 http://127.0.0.1:3080（smoke overlay 织换后的演示板）。
枚举三列局势墙全部 .war-card.clickable + 调度条全部命令卡，逐张点击并断言
.war-modal（FocusPage）出现——任何一张点了没反应（或开别的面）即失败。
stdout 末行输出 JSON：{ cards, opened, failures: [{ selector, text }] }
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3080"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".goal/evidence/v7/card-coverage.json")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
    page.wait_for_selector(".war-board", timeout=20000)
    page.wait_for_timeout(1500)

    # 稳定 DOM：防抖自动滚动后定格再枚举。
    page.mouse.move(8, 900)
    page.wait_for_timeout(600)

    entries = []
    for i, card in enumerate(page.locator(".war-ops .war-card.clickable, .war-dispatch .war-command-card").all()):
        txt = (card.inner_text() or "").replace("\n", " ")[:60]
        cls = (card.get_attribute("class") or "")
        zone = "dispatch" if "war-command-card" in cls else "columns"
        entries.append({"idx": i, "zone": zone, "text": txt})

    failures = []
    opened = 0
    for i, card in enumerate(page.locator(".war-ops .war-card.clickable, .war-dispatch .war-command-card").all()):
        try:
            card.scroll_into_view_if_needed(timeout=3000)
        except Exception:
            pass
        card.click(timeout=5000)
        try:
            page.wait_for_selector(".war-modal", timeout=3000)
            opened += 1
        except Exception:
            failures.append(entries[i])
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

    browser.close()

result = {"cards": len(entries), "opened": opened, "failures": failures}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
assert len(entries) >= 18, f"expected >=18 clickable cards on the full-state demo board, got {len(entries)}"
assert not failures, f"{len(failures)} card(s) failed to open the focus page: {failures}"
print(f"CARD COVERAGE OK: {opened}/{len(entries)} cards all open the focus page")
