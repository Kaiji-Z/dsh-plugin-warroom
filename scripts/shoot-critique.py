"""critique 取证截图 —— 明暗双主题 × 全视图批量捕获（impeccable critique 输入）。

Usage: python scripts/shoot-critique.py [outDir] [baseUrl]
只读操作：点开视图/抽屉截图，不提交任何表单；主题用 body 属性直切（不持久化）。
顺带收集 console error / pageerror 供 Assessment B 使用。
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3080"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else ".goal/evidence/critique-r16")
OUT.mkdir(parents=True, exist_ok=True)

errors: list[str] = []
log: list[str] = []


def snap(page, name: str) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"))
    log.append(f"shot {name}")


def try_capture(page, name: str, fn) -> None:
    try:
        fn(page)
        snap(page, name)
    except Exception as e:  # 单视图失败不断轮
        log.append(f"FAIL {name}: {type(e).__name__}: {e}")


def open_board(page) -> None:
    page.goto(BASE)
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
    page.wait_for_timeout(1800)
    assert page.evaluate("document.documentElement.getAttribute('data-dsh-warroom-active')") is not None


def leave_focus(page) -> None:
    """从聚焦页/抽屉退回主板（Esc 兜底两次）。"""
    for _ in range(3):
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)


def starfield(page, mode_3d: bool) -> None:
    if page.locator(".war-wz, .war-starfield").count() == 0:
        page.keyboard.press("m")  # V12.2：m = 列表/星域切换
    page.wait_for_timeout(2600)
    page.wait_for_selector(".war-wz, .war-starfield", timeout=8000)
    if not mode_3d:
        page.locator(".war-wz-toggle").click()
        page.wait_for_timeout(1200)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for theme in ("light", "dark"):
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        page.on("console", lambda m: errors.append(f"[{theme}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"[{theme}] pageerror: {e}"))

        open_board(page)
        if theme == "dark":
            page.evaluate("document.body.setAttribute('data-ds-dark-theme','')")
        page.wait_for_timeout(600)

        try_capture(page, f"board-{theme}", lambda pg: None)
        try_capture(page, f"focus-{theme}", lambda pg: (
            pg.locator(".war-dispatch .war-card").first.click(),
            pg.wait_for_timeout(1500),
        )[1])
        leave_focus(page)
        try_capture(page, f"starfield3d-{theme}", lambda pg: starfield(pg, True))
        if theme == "light":
            try_capture(page, "starfield2d-light", lambda pg: starfield(pg, False))
        leave_focus(page)
        try_capture(page, f"composer-{theme}", lambda pg: (
            pg.locator(".war-dispatch-add, .war-plus").first.click(),
            pg.wait_for_timeout(1200),
        )[1])
        leave_focus(page)
        try_capture(page, f"settings-{theme}", lambda pg: (
            pg.locator(".war-island-gear").click(),
            pg.wait_for_timeout(900),
        )[1])
        leave_focus(page)

        if theme == "light":
            pg2 = page
            pg2.set_viewport_size({"width": 900, "height": 700})
            pg2.wait_for_timeout(900)
            try_capture(pg2, "narrow-light", lambda pg: None)

        page.close()

    browser.close()

print("\n".join(log))
print("---CONSOLE/PAGE ERRORS---")
print("\n".join(errors) if errors else "(none)")
