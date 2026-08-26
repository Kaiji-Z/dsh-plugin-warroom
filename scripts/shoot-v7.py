"""v7 evidence shooter — 到访式工作流六件套（收件箱/摘要卡/悬停聚焦/起草器/预检/引导）.

Usage: python scripts/shoot-v7.py [outDir] [baseUrl] [smokeStateDir]
Assumes the smoke-overlay server is running on BASE (isolated statePath).
Phases: clear smoke state → empty-board onboarding → set last-seen → seed
(+ append an L1 plan-pending command) → full assertions + screenshots.
V8 适配：收件箱/摘要/聚焦条进 hero 灵动岛（hover 展开 + 点击钉住，浮层不
推挤列区）；＋下达/挂载进岛；悬停自动滚动断言（小视口下族系卡滚进视野）。
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
# 清盘后服务端的折叠缓存可能短暂回旧内容（实测竞态）——轮询等板真空再开测。
import time as _time
import urllib.request as _ur
for _ in range(20):
    try:
        _body = json.loads(_ur.urlopen(f"{BASE}/warroom/api/board", timeout=5).read())
        if not _body.get("commands") and not _body.get("tasks"):
            break
    except Exception:
        pass
    _time.sleep(1)
else:
    raise SystemExit("board did not drain after clearing smoke state")
print("board drained")

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

    def leave_island():
        # 鼠标挪到左下空白处——既离开岛也不悬停任何卡。
        page.mouse.move(8, 900)

    # --- Phase A: 空板 → 首用引导屏（岛在引导屏之上仍常驻，操作件可用）。 ---
    open_board()
    assert page.locator(".war-onboard").count() >= 1, "onboarding panel missing on empty board"
    assert page.locator(".war-onboard-cta").count() == 1, "onboarding CTA missing"
    assert page.locator(".war-board").count() == 0, "three-zone board should not render on empty state"
    assert page.locator(".war-island-pill").count() == 1, "hero island pill missing on empty board"
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

    # --- Phase D: 重开板 → 灵动岛（收起仪表 → hover 展开 → 收件箱/摘要在岛内）。 ---
    open_board()
    assert page.locator(".war-onboard").count() == 0, "onboarding should retire once data exists"
    assert page.locator(".war-island-pill").count() == 1, "island pill missing"
    assert page.locator(".war-island-counts").first.inner_text() != "", "island counts meter empty"
    assert page.locator(".war-island-panel").count() == 0, "island should be collapsed at rest"
    # V9.2：岛只留 ⚙——下达进调度坞、挂载/图例/皮肤进设置抽屉。
    assert page.locator(".war-island-gear").count() == 1, "settings gear missing in island pill"
    assert page.locator(".war-dispatch-add").count() == 1, "compose ＋ missing at dispatch lead"
    assert page.locator(".war-island .war-attach-btn").count() == 0, "attach button must be gone from the island"
    assert page.locator(".war-island .war-legend-btn").count() == 0, "legend button must be gone from the island"
    assert page.locator(".war-island .war-skin-btn").count() == 0, "skin button must be gone from the island"

    # 展开不推挤：hover 岛前后，三区板的位置纹丝不动（浮层盖列区）。
    board_y = page.locator(".war-board").bounding_box()["y"]
    page.locator(".war-island-pill").hover()
    page.wait_for_timeout(350)
    assert page.locator(".war-island-panel").count() == 1, "island panel did not open on hover"
    assert page.locator(".war-board").bounding_box()["y"] == board_y, "island expansion must not push the board"

    for kind, label in [("k-clarify", "答澄清"), ("k-plan", "批计划"), ("k-review", "翻战报"), ("k-retry", "决重试")]:
        n = page.locator(f".war-inbox-item .{kind}").count()
        assert n >= 1, f"inbox missing {label} ({kind})"
    assert page.locator(".war-inbox-wait").first.inner_text() != "", "inbox items lack wait duration"
    items = page.locator(".war-inbox-item").count()
    print(f"inbox (in island): {items} items, all four kinds present")

    visit = page.locator(".war-visit")
    assert visit.count() == 1, "visit digest banner missing"
    banner = visit.inner_text()
    assert "收官 1" in banner, f"visit banner closed delta wrong: {banner!r}"
    assert "折戟 1" in banner, f"visit banner failed delta wrong: {banner!r}"
    assert "新命令" in banner and "等你发落" in banner, f"visit banner segments missing: {banner!r}"
    print(f"visit banner (in island): {banner.splitlines()[0]!r}")

    hints = page.locator(".war-waithint").all_inner_texts()
    assert any("排队中" in h for h in hints), f"queue wait-hint missing: {hints}"
    assert any("等待指挥官领取" in h for h in hints), f"awaiting-claim hint missing: {hints}"
    print(f"wait hints: {len(hints)}")

    pre = page.locator(".war-preflight")
    assert pre.count() == 1, f"preflight row expected on the L1 plan-pending command, got {pre.count()}"
    assert page.locator(".war-preflight-btn", has_text="改直发").count() == 1, "preflight 改直发 action missing"

    # V9 结构断言：三列局势墙 + 底部命令调度条（命令不再是列）。
    assert page.locator(".war-ops").count() == 1, "ops wall grid container missing"
    assert page.locator(".war-dispatch").count() == 1, "bottom command dispatch strip missing"
    # 几何断言：调度条必须横贯板体全宽（= 局势墙宽；宿主侧栏会占掉视口一部
    # 分，故不能拿 window.innerWidth 当基准）。曾误把调度条塞进三列 grid，
    # 宽度只剩一列——此断言专防该类回归。
    ow = page.locator(".war-ops").bounding_box()["width"]
    dw = page.locator(".war-dispatch").bounding_box()["width"]
    # V9.4 容器化：坞与三列墙同为 10px 内缩的圆角容器（宽度差恰 20px）。
    assert abs((ow - dw) - 20) <= 4, f"dispatch container must sit inset like the ops wall: dock {dw:.0f}px vs ops {ow:.0f}px"
    n_cmds = page.locator(".war-dispatch .war-command-card").count()
    assert n_cmds >= 5, f"dispatch strip should carry all commands, got {n_cmds}"
    # V9.1 交互断言：垂直滚轮在调度条上换算成横移（wheel 监听 passive:false）。
    scrollable = page.evaluate(
        "() => { const el = document.querySelector('.war-dispatch-track'); return el.scrollWidth - el.clientWidth; }"
    )
    assert scrollable > 40, f"dispatch strip should overflow for the wheel test, slack={scrollable}"
    sl = page.evaluate(
        """() => { const el = document.querySelector('.war-dispatch-track');
          el.scrollLeft = 0;
          el.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, cancelable: true }));
          return el.scrollLeft; }"""
    )
    assert sl > 0, f"mouse wheel must scroll the dispatch strip horizontally, scrollLeft={sl}"
    # V9.1 视觉断言：铭牌在场 + 坞带底色与三列底色拉开（物种差可机检）。
    # V9.4 容器化：铭牌退役；＋ 瓦片在场；卡片进 track 轨道；动态 can-scroll mask。
    assert page.locator(".war-dispatch-tag").count() == 0, "placard must be gone (V9.4 containerized)"
    assert page.locator(".war-dispatch-track").count() == 1, "dispatch card track missing"
    assert page.evaluate("() => document.querySelector('.war-dispatch-track').classList.contains('can-scroll')"), "dynamic can-scroll mask not set while overflow exists"
    bg = lambda sel: page.evaluate(
        "s => getComputedStyle(document.querySelector(s)).backgroundColor", sel
    )
    assert bg(".war-dispatch") != bg(".war-zone.war-tasks"), (
        f"dispatch dock bg must differ from column zone bg: {bg('.war-dispatch')} vs {bg('.war-zone.war-tasks')}"
    )
    page.evaluate("() => { document.querySelector('.war-dispatch-track').scrollLeft = 0 }")
    assert page.locator(".war-col.zone-commands").count() == 0, "commands column should be gone (V9: dispatch strip)"
    assert page.locator(".war-day-head").count() == 0, "day grouping should be gone (V9: merged report column)"
    report_chips = page.locator(".war-col.zone-report .war-chip").all_inner_texts()
    assert any("打赢" in c for c in report_chips) and any("失败" in c for c in report_chips), f"report column must merge succeeded+failed: {report_chips}"
    assert any("待翻阅" in c for c in page.locator(".war-col.zone-tasks .war-chip").all_inner_texts()), "tasks column should hold non-terminal tasks"
    page.screenshot(path=f"{OUT}/v7-inbox.png")
    print(f"shot: v7-inbox.png (island + V9 ops wall + dispatch strip, {n_cmds} commands)")

    # V9.9 导航断言：点上方任务卡 = 打开源命令的聚焦页（四段导览 + 底部双跳钮）。
    leave_island()  # 面板收起，别让它盖住任务卡
    page.wait_for_timeout(350)
    # 选带 ↩ 溯源 chip 的卡（孤儿任务无源命令，直跳末次会话——另一条路径）。
    page.locator(".war-col.zone-tasks .war-card", has_text="↩").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-modal-title").inner_text().startswith("「"), f"task card should open the FOCUS page titled by command text, got {page.locator('.war-modal-title').inner_text()!r}"
    assert page.locator(".war-modal .war-cd-stage").count() == 4, "focus tour must carry four stages"
    assert page.locator(".war-modal [data-stage='task'] .war-tour-cards .war-card").count() >= 1, "task stage must carry main-UI task cards"
    assert page.locator(".war-modal .war-tour-jumps .war-jump-btn").count() == 2, "bottom dual session-jump buttons missing"
    assert "任务会话" in page.locator(".war-modal .war-tour-jumps .war-jump-btn").nth(0).inner_text(), "first jump button must be 任务会话"
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)

    # V9.9 收件箱直达段：批计划条目 → 聚焦页任务段在视口内（计划 ghost 卡在场）。
    page.locator(".war-island-pill").hover()
    page.wait_for_timeout(300)
    page.locator(".war-inbox-item", has_text="批计划").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-modal [data-stage='task'] .war-tour-ghost").count() == 1, "plan-pending command must show the planning ghost card"
    ghost_box = page.locator(".war-modal .war-tour-ghost").bounding_box()
    body_box = page.locator(".war-modal .war-detail-body").bounding_box()
    assert ghost_box["y"] >= body_box["y"] - 2 and ghost_box["y"] <= body_box["y"] + body_box["height"], "task stage should be scrolled into view (plan segment)"
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    print("V9 navigation: task card → focus tour (4 stages + dual jumps); inbox plan → task-stage ghost")

    # 钉住/取消钉住：鼠标离开岛仍展开；再点收起。
    page.locator(".war-island-pill").click()
    page.wait_for_timeout(200)
    leave_island()
    page.wait_for_timeout(350)
    assert page.locator(".war-island-panel").count() == 1, "pinned island must stay open after mouse leaves"
    assert page.locator(".war-island-pinned").count() == 1, "pin indicator missing"
    page.locator(".war-island-pill").click()
    page.wait_for_timeout(200)
    leave_island()
    page.wait_for_timeout(350)
    assert page.locator(".war-island-panel").count() == 0, "unpin did not collapse the island (mouse away, not pinned)"
    print("island pin/unpin: ok")

    # --- Phase E: 悬停族系高亮（瞬态）+ 自动滚动（小视口下族系卡滚进视野）。 ---
    page.set_viewport_size({"width": 1720, "height": 640})  # 压矮视口逼出列内滚动
    page.wait_for_timeout(300)
    t1_card = page.locator(".war-col.zone-tasks .war-card", has_text="每日一句").first
    t1_card.hover()
    page.wait_for_timeout(700)  # 300ms 防抖 + smooth 滚动余量
    same = page.locator(".war-rel-same").count()
    dim = page.locator(".war-rel-dim").count()
    assert same >= 3, f"hover family highlight too thin: same={same}"
    assert dim >= 3, f"hover dimming missing: dim={dim}"

    def card_visible_in_col(sel: str, container_sel: str) -> bool:
        card = page.locator(sel).first
        box = card.bounding_box()
        if box is None:
            return False
        body = page.locator(container_sel).first.bounding_box()
        if body is None:
            return False
        v_ok = box["y"] >= body["y"] - 1 and box["y"] + box["height"] <= body["y"] + body["height"] + 1
        h_ok = box["x"] >= body["x"] - 1 and box["x"] + box["width"] <= body["x"] + body["width"] + 1
        return v_ok and h_ok

    # V9：高亮卡可能落在上方两列，也可能落在底部调度条（横向滚动容器）。
    for col_sel, body_sel in [(".war-col.zone-tasks", ".war-col.zone-tasks .war-col-body"), (".war-col.zone-live", ".war-col.zone-live .war-col-body"), (".war-col.zone-report", ".war-col.zone-report .war-col-body")]:
        n = page.locator(f"{col_sel} .war-rel-same").count()
        if n > 0:
            assert card_visible_in_col(f"{col_sel} .war-rel-same", body_sel), f"auto-scroll failed: highlighted card in {col_sel} still out of view"
    nd = page.locator(".war-dispatch .war-rel-same").count()
    if nd > 0:
        assert card_visible_in_col(".war-dispatch .war-rel-same", ".war-dispatch"), "auto-scroll failed: highlighted command card still out of horizontal view"
    print("auto-scroll: every highlighted card in a scrollable column is in view")
    page.set_viewport_size({"width": 1720, "height": 940})
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/v7-hover-family.png")
    print(f"shot: v7-hover-family.png (same={same}, dim={dim})")
    leave_island()
    page.wait_for_timeout(400)
    assert page.locator(".war-rel-same").count() == 0 and page.locator(".war-rel-dim").count() == 0, "hover trace did not clear on mouse leave"

    # --- Phase F: 聚焦模式（V9.2：聚焦不弹岛——pill 中间显示聚焦 chip，点空白退出）。 ---
    page.locator(".war-command-card", has_text="能记每日一句的命令行小工具").locator(".war-focus-btn").click()
    page.wait_for_timeout(400)
    assert page.locator(".war-island-panel").count() == 0, "V9.2: focus must NOT auto-expand the island"
    assert page.locator(".war-island-focus").count() == 1, "focus chip missing in island pill"
    assert page.locator(".war-rel-same").count() >= 3, "focus family highlight missing"
    assert page.locator(".war-rel-dim").count() >= 3, "focus dimming missing"
    page.screenshot(path=f"{OUT}/v7-focus.png")
    print("shot: v7-focus.png (focus = pill chip, board stays visible)")
    page.locator(".war-island-focus").click()
    page.wait_for_timeout(300)
    assert page.locator(".war-island-focus").count() == 0, "focus chip click did not exit focus"
    # 再聚焦一次 → 点列间空白（zone 边框区域）也应退出（元首指令：点空即退）。
    page.locator(".war-command-card", has_text="能记每日一句的命令行小工具").locator(".war-focus-btn").click()
    page.wait_for_timeout(300)
    page.locator(".war-ops").click(position={"x": 8, "y": 300}, force=True)
    page.wait_for_timeout(300)
    assert page.locator(".war-island-focus").count() == 0, "blank click did not exit focus mode"

    # --- Phase G: 起草器重设计（入口=调度坞左端 ＋；档位/时机选项卡 + cron 定时）。 ---
    page.locator(".war-dispatch-add").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-grade-card").count() == 3, "composer autonomy option cards missing"
    assert page.locator(".war-sched-card").count() == 2, "composer schedule option cards missing"
    page.locator(".war-composer").fill("取证：档位开关应把标记拼进命令文本")
    page.locator(".war-grade-card", has_text="直接做").click()
    page.screenshot(path=f"{OUT}/v7-composer.png")
    print("shot: v7-composer.png (option cards + cron scheduling)")
    page.locator(".war-modal-actions button.primary").click()
    page.wait_for_timeout(1500)
    assert page.locator(".war-command-card", has_text="!!直接做 取证").count() == 1, "grade marker did not ride the created command"
    # 定时下达：preset 选中 → cron 输入同步 → 提交后调度坞出现 ⏰ 待发卡。
    page.locator(".war-dispatch-add").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-recent-item").count() >= 1, "recent commands row missing"
    page.locator(".war-sched-card", has_text="定时").click()
    assert page.locator(".war-cron-presets").count() == 1, "cron presets missing after choosing 定时"
    page.locator(".war-cron-preset").first.click()
    assert page.locator(".war-cron-input").input_value().strip() == "0 9 * * *", "preset did not fill the cron input"
    assert page.locator(".war-cron-next").count() == 1, "next-run preview missing for a valid cron"
    # 非法 cron 就地报错且提交被禁（错误预防）。
    page.locator(".war-cron-input").fill("99 * * * *")
    page.wait_for_timeout(200)
    assert page.locator(".war-err").count() >= 1, "invalid cron must show an inline error"
    assert page.locator(".war-modal-actions button.primary").is_disabled(), "submit must be disabled on invalid cron"
    page.locator(".war-cron-input").fill("0 9 * * *")
    page.locator(".war-composer").fill("取证：定时命令到点自动下达")
    page.locator(".war-modal-actions button.primary").click()
    page.wait_for_timeout(1500)
    assert page.locator(".war-chip.sched").count() >= 1, "scheduled command card must carry the ⏰ chip"
    # 最近命令重发仍可用。
    page.locator(".war-dispatch-add").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    page.locator(".war-recent-item").first.click()
    assert page.locator(".war-composer").input_value() != "", "recent re-send did not fill the composer"
    page.locator(".war-modal-actions button", has_text="取消").click()
    page.wait_for_timeout(200)

    # --- Phase G2: 设置抽屉（⚙：皮肤/图例/行为开关/连接）。 ---
    page.locator(".war-island-gear").click()
    page.wait_for_selector(".war-settings-drawer", timeout=3000)
    assert page.locator(".war-skin-opt").count() == 2, "skin options missing in settings drawer"
    assert page.locator(".war-legend-rows").count() >= 1, "legend rows missing in settings drawer"
    assert page.locator(".war-switch").count() == 2, "behavior toggles missing in settings drawer"
    assert page.locator(".war-set-conn-dot").count() == 1, "connection status missing in settings drawer"
    # 开关翻转要落 localStorage（刷新后仍生效）。
    page.locator(".war-switch").first.click()
    page.wait_for_timeout(200)
    assert page.evaluate("() => localStorage.getItem('warroom-cfg-hover-family')") == "0", "hover-family toggle did not persist"
    page.screenshot(path=f"{OUT}/v7-settings.png")
    print("shot: v7-settings.png (gear drawer: skins/legend/toggles/conn)")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator(".war-settings-drawer").count() == 0, "settings drawer did not close on Escape"

    # --- Phase G3: 对比度机检（审查 P1-2：语义色 chip 文本 ≥4.5:1）。 ---
    contrast = page.evaluate(
        "() => {"
        "  const el = document.querySelector('.war-chip.st-published');"
        "  if (!el) return null;"
        "  const cs = getComputedStyle(el);"
        "  const lum = (spec) => {"
        "    let r, g, b, a = 1;"
        # color-mix 计算值形如 color(srgb r g b / a)；用 split 解析，正则里不能带斜杠。
        "    if (spec.startsWith('color(')) {"
        "      const body = spec.slice(spec.indexOf('(') + 1, spec.lastIndexOf(')'));"
        "      const nums = body.replace(/[^0-9. ]/g, ' ').trim().split(/\\s+/).map(Number);"
        "      r = nums[0] * 255; g = nums[1] * 255; b = nums[2] * 255;"
        "      if (nums.length > 3) a = nums[3];"
        "    } else if (spec.startsWith('#')) {"
        "      r = parseInt(spec.slice(1, 3), 16); g = parseInt(spec.slice(3, 5), 16); b = parseInt(spec.slice(5, 7), 16);"
        "    } else {"
        "      const m2 = /rgba?\\(([^)]+)\\)/.exec(spec);"
        "      if (!m2) return null;"
        "      const p = m2[1].split(',').map(Number);"
        "      r = p[0]; g = p[1]; b = p[2]; a = p.length > 3 ? p[3] : 1;"
        "    }"
        "    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };"
        "    const l = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);"
        "    return l * a + 1.0 * (1 - a);"
        "  };"
        "  const fg = lum(cs.color);"
        "  const bg = lum(cs.backgroundColor);"
        "  if (fg === null || bg === null) return null;"
        "  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);"
        "}"
    )

    assert contrast is not None and contrast == contrast and contrast >= 4.5, (
        f"st-published chip contrast {contrast} below 4.5:1"
    )
    print(f"contrast: st-published chip {contrast:.2f}:1 (>=4.5)")

    # --- Phase G4: V9.3 整改机检（warn 文本对比度批 + Esc 层序 + dialog 语义 +
    #     has-inbox 染色 + 批准决策块）。 ---
    def contrast_of(sel: str):
        return page.evaluate(
            "(sel) => {"
            "  const el = document.querySelector(sel);"
            "  if (!el) return null;"
            "  const cs = getComputedStyle(el);"
            "  const lum = (spec) => {"
            "    let r, g, b, a = 1;"
            "    if (spec.startsWith('color(')) {"
            "      const body = spec.slice(spec.indexOf('(') + 1, spec.lastIndexOf(')'));"
            "      const nums = body.replace(/[^0-9. ]/g, ' ').trim().split(/\\s+/).map(Number);"
            "      r = nums[0] * 255; g = nums[1] * 255; b = nums[2] * 255;"
            "      if (nums.length > 3) a = nums[3];"
            "    } else if (spec.startsWith('#')) {"
            "      r = parseInt(spec.slice(1, 3), 16); g = parseInt(spec.slice(3, 5), 16); b = parseInt(spec.slice(5, 7), 16);"
            "    } else {"
            "      const m2 = /rgba?\\(([^)]+)\\)/.exec(spec);"
            "      if (!m2) return null;"
            "      const p = m2[1].split(',').map(Number);"
            "      r = p[0]; g = p[1]; b = p[2]; a = p.length > 3 ? p[3] : 1;"
            "    }"
            "    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };"
            "    const l = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);"
            "    return l * a + 1.0 * (1 - a);"
            "  };"
            "  const fg = lum(cs.color);"
            "  const bg = lum(cs.backgroundColor);"
            "  if (fg === null || bg === null) return null;"
            "  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);"
            "}",
            sel,
        )
    for sel in (".war-life-status.warn", ".war-preflight-text", ".war-dispatch-add"):
        c = contrast_of(sel)
        assert c is not None and c == c and c >= 4.5, f"{sel} contrast {c} below 4.5:1"
        print(f"contrast: {sel} {c:.2f}:1")

    # Esc 层协调：聚焦 + 弹窗叠加时，一次 Esc 只关最顶层（复评 P1-3）。
    page.locator(".war-command-card", has_text="能记每日一句的命令行小工具").locator(".war-focus-btn").click()
    page.wait_for_timeout(300)
    page.locator(".war-command-card", has_text="能记每日一句的命令行小工具").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-modal[role='dialog'][aria-modal='true']").count() >= 1, "modal lacks dialog semantics"
    assert page.evaluate("() => document.querySelector('.war-modal').contains(document.activeElement)"), "focus not moved into modal"
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator(".war-modal").count() == 0, "first Esc must close the top layer (modal)"
    assert page.locator(".war-island-focus").count() == 1, "first Esc must NOT exit focus underneath"
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator(".war-island-focus").count() == 0, "second Esc should exit focus mode"
    print("Esc layering: modal > focus, one layer per press")

    # 非零收件箱 = 岛的主导信号（胶囊染警示）。
    assert page.locator(".war-island-pill.has-inbox").count() == 1, "island pill must wear has-inbox tint when inbox non-empty"

    # V9.8 决策带 + 阶段导航：计划待批的详情顶部即是「等你发落」带（后果一句话
    # + 批准/驳回），下方四段导航在位；标题=命令原话（不再是 cmd- 机码开头）。
    leave_island()
    page.wait_for_timeout(300)
    page.locator(".war-island-pill").hover()
    page.wait_for_timeout(300)
    page.locator(".war-inbox-item", has_text="批计划").click()
    page.wait_for_selector(".war-cd-band", timeout=3000)
    assert page.locator(".war-cd-band .war-btn.primary", has_text="批准计划").count() == 1, "approve button missing in decision band"
    assert "放权" in page.locator(".war-cd-band-hint").inner_text(), "consequence hint missing in band"
    assert page.locator(".war-modal .war-cd-step").count() == 0, "V9.10: stage jump-nav buttons must be retired"
    assert page.locator(".war-modal-title").inner_text().startswith("「"), "detail title must lead with the command text, not cmd-id"
    assert page.locator(".war-cd-stage").count() == 4, "four journey stages missing"
    # V9.9/V9.10 聚焦页机检：ghost 卡点开=计划原文+批准/驳回+进任务会话（读到哪批到哪）；
    # 命令卡点开=下达配置+改档钮组；底部双跳钮一启用一占位；✕ 关窗。
    page.locator(".war-modal .war-tour-ghost").click()
    page.wait_for_timeout(250)
    assert page.locator(".war-modal .war-subdetail").count() == 1, "ghost click should expand the plan panel beneath it"
    sub_text = page.locator(".war-modal .war-subdetail").inner_text()
    assert "最终计划" in sub_text and "正在计划中" in sub_text, "plan panel must carry the final-plan title + planning note"
    assert page.locator(".war-modal .war-subdetail .war-btn", has_text="进入任务会话").count() == 1, "enter-task-session button missing on pending plan"
    assert page.locator(".war-modal .war-subdetail .war-btn", has_text="批准计划").count() == 1, "approve must also live in the plan panel (read-where-you-decide)"
    assert page.locator(".war-modal .war-subdetail .war-btn", has_text="驳回重呈").count() == 1, "reject must also live in the plan panel"
    jumps = page.locator(".war-modal .war-tour-jumps .war-jump-btn")
    assert jumps.count() == 2 and "任务会话" in jumps.nth(0).inner_text() and "执行会话" in jumps.nth(1).inner_text(), "jump buttons must be 任务会话 + 执行会话"
    assert jumps.nth(0).is_enabled() and jumps.nth(1).is_disabled(), "plan-pending command: staff jump enabled, exec jump placeholder"
    page.locator(".war-modal [data-stage='command'] .war-command-card").click()
    page.wait_for_timeout(250)
    cfg = page.locator(".war-modal [data-stage='command'] .war-subdetail")
    assert cfg.count() == 1, "command card click should expand the dispatch-config panel"
    cfg_text = cfg.inner_text()
    assert "发布时机" in cfg_text and "自主度" in cfg_text and "命令原文" in cfg_text, "config panel must list timing/autonomy/text"
    assert "改档" in cfg_text, "V9.10: config panel must carry the regrade row"
    assert page.locator(".war-modal [data-stage='command'] .war-sub-btns .war-btn").count() == 2, "L1 command should offer L0/L2 regrade buttons"
    page.screenshot(path=f"{OUT}/v9-focus-config.png")
    page.locator(".war-modal [data-stage='command'] .war-command-card").click()
    page.wait_for_timeout(250)
    assert page.locator(".war-modal [data-stage='command'] .war-subdetail").count() == 0, "second click should collapse the config panel"
    assert page.locator(".war-modal .war-cd-x").count() == 1, "top-right close missing (footer retired)"
    page.locator(".war-modal .war-cd-x").click()
    page.wait_for_timeout(250)
    assert page.locator(".war-modal").count() == 0, "✕ should close the focus page"
    print("focus page V9.9: ghost→plan panel + dual jumps + inline config expand/collapse + ✕ ok")

    # --- Phase G5: V9.5 整改机检（统一卡点击 + n 快捷键 + 草稿续写 + 对话 chip）。 ---
    # received/talking 命令卡：点击开详情（不再瞬移出板），对话走视觉独立的 chip。
    received_card = page.locator(".war-command-card.clickable.pulse", has_text="等下帮我把 projA 的依赖全部升到最新").first
    received_card.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-modal .war-tour-jumps .war-jump-btn").count() == 2, "received card click must open the focus page (V9.5 unified, V9.9 tour)"
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    # V9.9/V9.10 全生命周期导览（approved→t1 已呈报）：任务卡展开=计划+任务书+验收
    # +去处理；执行段无 live 只给提示行；战报卡展开=最新战报+战利品+历次作战；双跳钮可点。
    page.locator(".war-dispatch .war-command-card", has_text="要一个能记每日一句的命令行小工具").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    assert page.locator(".war-modal [data-stage='task'] .war-tour-cards .war-card").count() >= 1, "task stage must show the chain task card"
    assert page.locator(".war-modal [data-stage='battle'] .war-card").count() == 0, "no live attempt → no battle card"
    assert page.locator(".war-modal [data-stage='battle'] .war-tour-hint").count() == 1, "battle stage must carry the done hint instead"
    page.locator(".war-modal [data-stage='task'] .war-tour-cards .war-card").first.click()
    page.wait_for_timeout(250)
    tp = page.locator(".war-modal [data-stage='task'] .war-subdetail")
    assert tp.count() == 1, "task card click should expand brief/acceptance panel"
    tp_text = tp.inner_text()
    assert "任务书" in tp_text and "Node 单包小工具" in tp_text, "task panel must carry the ring's brief"
    assert "验收标准" in tp_text and "今日晴" in tp_text, "task panel must carry the ring's acceptance"
    assert page.locator(".war-modal [data-stage='task'] .war-subdetail .war-btn", has_text="去处理").count() == 1, "reported ring must offer the staff-session handle action"
    page.locator(".war-modal [data-stage='report'] .war-card").first.click()
    page.wait_for_timeout(250)
    rep = page.locator(".war-modal [data-stage='report'] .war-subdetail")
    assert rep.count() == 1 and "最新战报" in rep.inner_text(), "report card click must expand the report panel"
    rep_text = rep.inner_text()
    assert "战利品" in rep_text and "npm test 8/8 全绿" in rep_text, "report panel must carry the deliverables row"
    assert "历次作战" in rep_text, "report panel must carry the attempts section"
    assert page.locator(".war-modal .war-sub-attempts .war-cd-session").count() == 1, "t1 has exactly one attempt session row"
    assert page.locator(".war-modal [data-stage='report'] .war-subdetail .war-btn", has_text="去处理").count() == 1, "reported command report panel must offer the handle action"
    jumps2 = page.locator(".war-modal .war-tour-jumps .war-jump-btn")
    assert jumps2.nth(0).is_enabled() and jumps2.nth(1).is_enabled(), "reported command: both jumps must target real sessions"
    page.screenshot(path=f"{OUT}/v9-focus-report.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    assert page.locator(".war-dispatch .war-enter-chip").count() >= 1, "enter-session chip missing on conversational card"
    # n = 新建命令（无弹窗层、非输入焦点）；草稿 Esc 不焚、重开续写。
    page.keyboard.press("n")
    page.wait_for_selector(".war-modal", timeout=3000)
    page.locator(".war-composer").fill("草稿续写取证：这句不该被 Esc 焚掉")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator(".war-modal").count() == 0, "Esc should close composer (draft persisted)"
    page.keyboard.press("n")
    page.wait_for_selector(".war-modal", timeout=3000)
    assert "草稿续写取证" in page.locator(".war-composer").input_value(), "draft did not survive Esc"
    page.locator(".war-composer").fill("")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    print("V9.5: unified card click + n shortcut + draft persistence ok")

    # --- Phase G6: V9.10 任务段状态机机检（talking ghost / 已取消分岔 / 定时待发分岔）。 ---
    # talking 命令（d2）：任务段 = warn ghost 卡，点开给「进入对话回答」——任务成形
    # 车间（参谋会话）的就地入口，不再只有命令卡可点。
    page.locator(".war-dispatch .war-command-card", has_text="顺便给小工具加个导出 csv").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    ghost = page.locator(".war-modal [data-stage='task'] .war-tour-ghost.warn")
    assert ghost.count() == 1, "talking command must show the warn ghost card in task stage"
    assert "等你回答" in ghost.inner_text(), "talking ghost label must name the answer-wait"
    assert "起草" not in page.locator(".war-modal [data-stage='task']").inner_text(), "talking state must not show the drafting copy"
    ghost.click()
    page.wait_for_timeout(250)
    tg = page.locator(".war-modal [data-stage='task'] .war-subdetail")
    assert tg.count() == 1 and "参谋在等你回答" in tg.inner_text(), "talking ghost panel must explain the wait"
    assert page.locator(".war-modal .war-subdetail .war-btn", has_text="进入对话回答").count() == 1, "talking panel must offer the answer-in-dialog action"
    page.screenshot(path=f"{OUT}/v9-focus-talking.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    # 已取消命令（d4）：任务段灰提示分岔——「已取消」，不再出现「起草」。
    page.locator(".war-dispatch .war-command-card", has_text="算了，先不要动 CI").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    ctask = page.locator(".war-modal [data-stage='task']").inner_text()
    assert "已取消" in ctask and "起草" not in ctask, f"cancelled command task hint must split: {ctask!r}"
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    # 定时待发分岔：起草器下达一条 cron 命令 → 聚焦页任务段给 ⏰ 提示（非「起草」）。
    page.keyboard.press("n")
    page.wait_for_selector(".war-modal", timeout=3000)
    page.locator(".war-composer").fill("定时取证：每周一早看看依赖有没有新版本")
    page.locator(".war-sched-card", has_text="定时").click()
    page.locator(".war-cron-preset", has_text="每周一 9 点").click()
    page.locator(".war-modal-actions .war-btn.primary", has_text="定时下达").click()
    page.wait_for_selector(".war-command-card:has-text('定时取证')", timeout=8000)
    page.locator(".war-command-card", has_text="定时取证").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    stask = page.locator(".war-modal [data-stage='task']").inner_text()
    assert "定时待发" in stask and "起草" not in stask, f"scheduled command task hint must split: {stask!r}"
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    print("V9.10 state machine: talking ghost→answer action + cancelled/scheduled hint splits ok")

    # --- Phase H: 收尾。 ---
    pre.screenshot(path=f"{OUT}/v7-preflight.png")
    print("shot: v7-preflight.png (L1 command preflight + 改直发)")

    browser.close()

assert errors == [], f"console errors leaked: {errors[:10]}"
print("console errors: none")
print("V7 SHOTS OK")
