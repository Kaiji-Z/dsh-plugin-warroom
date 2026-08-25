"""v7 evidence shooter — 到访式工作流六件套（收件箱/摘要卡/悬停聚焦/起草器/预检/引导）.

Usage: python scripts/shoot-v7.py [outDir] [baseUrl] [smokeStateDir]
Assumes the smoke-overlay server is running on BASE (isolated statePath).
Phases: clear smoke state → empty-board onboarding → set last-seen → seed
(+ append an L1 plan-pending command) → full assertions + screenshots.
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/v7"
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"
STATE = Path(sys.argv[3] if len(sys.argv) > 3 else ".smoke-state")
D5 = "cmd-20260823-0930-ff06"

Path(OUT).mkdir(parents=True, exist_ok=True)

# --- Phase 0: 清空 smoke 态（只动隔离目录——默认目录绝不能碰，v6 事故教训）。 ---
shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
print(f"cleared smoke state: {STATE}")

ts = lambda mins_ago: (datetime.now(timezone.utc) - timedelta(minutes=mins_ago)).isoformat(timespec="milliseconds")

errors: list[str] = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1720, "height": 940})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    def open_board():
        page.goto(BASE)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
        page.wait_for_timeout(1200)

    # --- Phase A: 空板 → 首用引导屏。 ---
    open_board()
    assert page.locator(".war-onboard").count() >= 1, "onboarding panel missing on empty board"
    assert page.locator(".war-onboard-cta").count() == 1, "onboarding CTA missing"
    assert page.locator(".war-board").count() == 0, "three-zone board should not render on empty state"
    page.screenshot(path=f"{OUT}/v7-onboard.png")
    print("shot: v7-onboard.png (empty-board first-visit guide)")

    # --- Phase B: 注入 last-seen（两小时前）→ 摘要卡应算出夜间增量。 ---
    page.evaluate("t => localStorage.setItem('warroom-last-seen', t)", ts(120))

    # --- Phase C: 种子 + V7 补充事件（L1 计划待批 → 收件箱批计划 + 夜间预检）。 ---
    subprocess.run(
        ["node", "--import", "tsx", "scripts/seed-smoke.ts", str(STATE.resolve())],
        check=True, capture_output=True, text=True,
    )
    with open(STATE / "directives.jsonl", "a", encoding="utf-8") as f:
        for ev in [
            {"type": "directive_created", "ts": ts(46), "directiveId": D5, "text": "把 projB 的小工具改成支持多本账本"},
            {"type": "directive_received", "ts": ts(45.5), "directiveId": D5, "staffSessionId": "sec-smoke-session"},
            {"type": "directive_triaged", "ts": ts(45), "directiveId": D5, "grade": "L1", "reason": "涉及旧数据迁移，先看方案再动", "confidence": 0.82},
            {"type": "directive_plan_opened", "ts": ts(44), "directiveId": D5, "plan": "1) 设计账本数据结构\n2) 写迁移脚本\n3) 兼容旧数据并补测试"},
        ]:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    print("seeded smoke board + L1 plan-pending command")

    # --- Phase D: 重开板 → 收件箱 + 摘要 + 等待解释。 ---
    open_board()
    assert page.locator(".war-onboard").count() == 0, "onboarding should retire once data exists"
    for kind, label in [("k-clarify", "答澄清"), ("k-plan", "批计划"), ("k-review", "翻战报"), ("k-retry", "决重试")]:
        n = page.locator(f".war-inbox-item .{kind}").count()
        assert n >= 1, f"inbox missing {label} ({kind})"
    assert page.locator(".war-inbox-wait").first.inner_text() != "", "inbox items lack wait duration"
    items = page.locator(".war-inbox-item").count()
    print(f"inbox: {items} items, all four kinds present")

    visit = page.locator(".war-visit")
    assert visit.count() == 1, "visit digest banner missing"
    banner = visit.inner_text()
    assert "收官 1" in banner, f"visit banner closed delta wrong: {banner!r}"
    assert "折戟 1" in banner, f"visit banner failed delta wrong: {banner!r}"
    assert "新命令" in banner and "等你发落" in banner, f"visit banner segments missing: {banner!r}"
    print(f"visit banner: {banner.splitlines()[0]!r}")

    hints = page.locator(".war-waithint").all_inner_texts()
    assert any("排队中" in h for h in hints), f"queue wait-hint missing: {hints}"
    assert any("等待指挥官领取" in h for h in hints), f"awaiting-claim hint missing: {hints}"
    print(f"wait hints: {len(hints)}")

    pre = page.locator(".war-preflight")
    assert pre.count() == 1, f"preflight row expected on the L1 plan-pending command, got {pre.count()}"
    assert page.locator(".war-preflight-btn", has_text="改直发").count() == 1, "preflight 改直发 action missing"
    page.screenshot(path=f"{OUT}/v7-inbox.png")
    print("shot: v7-inbox.png (inbox + visit digest + wait hints + preflight)")

    # --- Phase E: 悬停族系高亮（瞬态）。 ---
    t1_card = page.locator(".war-col.zone-tasks .war-card", has_text="每日一句").first
    t1_card.hover()
    page.wait_for_timeout(400)
    same = page.locator(".war-rel-same").count()
    dim = page.locator(".war-rel-dim").count()
    assert same >= 3, f"hover family highlight too thin: same={same}"
    assert dim >= 3, f"hover dimming missing: dim={dim}"
    page.screenshot(path=f"{OUT}/v7-hover-family.png")
    print(f"shot: v7-hover-family.png (same={same}, dim={dim})")
    page.locator(".war-head").hover()
    page.wait_for_timeout(400)
    assert page.locator(".war-rel-same").count() == 0 and page.locator(".war-rel-dim").count() == 0, "hover trace did not clear on mouse leave"

    # --- Phase F: 聚焦模式（常驻 + Esc 退出）。 ---
    page.locator(".war-command-card", has_text="能记每日一句的命令行小工具").locator(".war-focus-btn").click()
    page.wait_for_timeout(400)
    assert page.locator(".war-focusbar").count() == 1, "focus bar missing"
    assert page.locator(".war-rel-same").count() >= 3, "focus family highlight missing"
    assert page.locator(".war-rel-dim").count() >= 3, "focus dimming missing"
    page.screenshot(path=f"{OUT}/v7-focus.png")
    print("shot: v7-focus.png (persistent focus mode)")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator(".war-focusbar").count() == 0, "focus mode did not exit on Escape"

    # --- Phase G: 起草器档位开关 + 最近命令重发。 ---
    page.locator(".war-plus").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-grade-seg").count() == 3, "composer autonomy toggles missing"
    page.locator(".war-composer").fill("取证：档位开关应把标记拼进命令文本")
    page.locator(".war-grade-seg", has_text="直接做").click()
    page.screenshot(path=f"{OUT}/v7-composer.png")
    print("shot: v7-composer.png (grade toggles + recent re-send)")
    page.locator(".war-modal-actions button.primary").click()
    page.wait_for_timeout(1500)
    assert page.locator(".war-command-card", has_text="!!直接做 取证").count() == 1, "grade marker did not ride the created command"
    page.locator(".war-plus").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-recent-item").count() >= 1, "recent commands row missing"
    page.locator(".war-recent-item").first.click()
    assert page.locator(".war-composer").input_value() != "", "recent re-send did not fill the composer"
    page.locator(".war-modal-actions button", has_text="取消").click()
    page.wait_for_timeout(200)

    # --- Phase H: 收尾。 ---
    pre.screenshot(path=f"{OUT}/v7-preflight.png")
    print("shot: v7-preflight.png (L1 command preflight + 改直发)")

    browser.close()

assert errors == [], f"console errors leaked: {errors[:10]}"
print("console errors: none")
print("V7 SHOTS OK")
