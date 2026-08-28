"""Grade-marker forensics — 起草器档位开关把 !!/?? 标记拼进命令文本（取证 20260828-050245-2a8e）.

证明 V7 起草器档位开关在当前构建真实生效（机检、UI 全链、隔离环境）：
  ① UI 选「!! 直接做」(L0) 档提交 → 命令文本拼入「!!直接做」前缀；
  ② UI 选「?? 先看方案」(L2) 档提交 → 同理拼入「??先看方案」；
  ③ 幂等回归（取证 20260825-41e3 缺陷①）：正文手打「!!直接做」开头提交，
     不产生重复前缀（不得落「!!直接做 !!直接做 …」）；
  ④ 负控：参谋分诊(auto)档正文零标记——证明标记来自档位开关而非其他通道；
  ⑤ 空体守卫：纯空白正文时提交键 disabled（applyGradeMarker 空体硬化的 UI 面）。

被取证机制链（本脚本不改产品代码，纯取证）：
  src/client/preflight.ts:24-29  applyGradeMarker —— 档位→标记拼装（幂等 + 空体硬化）
  src/client/views.tsx:681       CommandComposer submit —— createCommand(applyGradeMarker(text, grade), …)
  src/client/views.tsx:126       GRADE_MARKER —— 档位→标记的显示映射（协议 token 同源）
  src/directives.ts              overrideMarkerOf —— 服务端识别标记强制改档
  src/dashboard.ts               POST /warroom/api/commands —— directive_created 落 directives.jsonl 原文

读回双通道：隔离 state 的 directives.jsonl（append-only 账本原文）+ 板 API commands
投影（GET /warroom/api/commands 不存在则回退 GET /warroom/api/board）。
取证正文显式「请勿成案，直接 war_abandon_command」——引信会把命令中继给真实
参谋会话（POST 即 tickNow），stand-down 措辞把 LLM 弹药消耗钉在一两轮。

Usage: python scripts/shoot-grade-marker-2a8e.py [outDir] [baseUrl] [smokeStateDir]
Assumes the smoke-overlay server (cordis.smoke.yml, isolated statePath .smoke-state)
is running on BASE. 安全边界：按端口拒跑 3080 主服；state 目录名必须是 .smoke-state。
约定：domcontentloaded + 选择器等待（SSE 挡 networkidle，勿用）。
"""
import json
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

CMD_NO = "20260828-050245-2a8e"
REPO = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/grade-marker-2a8e")
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3181"
STATE = Path(sys.argv[3] if len(sys.argv) > 3 else ".smoke-state").resolve()
OUT = OUT if OUT.is_absolute() else REPO / OUT

# --- 边界守卫：绝不动 3080 主服；state 目录只认隔离 .smoke-state（默认目录是真实数据）。 ---
_u = urllib.parse.urlparse(BASE)
if (_u.port or (443 if _u.scheme == "https" else 80)) == 3080:
    raise SystemExit("refusing BASE on port 3080 (main server) — boot an isolated smoke server instead")
if STATE.name != ".smoke-state":
    raise SystemExit(f"refusing state dir {STATE!r} — must be the isolated .smoke-state directory")

M_L0, M_L2 = "!!直接做", "??先看方案"
B1 = "取证占位：请勿成案，直接 war_abandon_command（档位标记取证 2a8e · 1/4）"
B2 = "取证占位：请勿成案，直接 war_abandon_command（档位标记取证 2a8e · 2/4）"
B3 = f"{M_L0} 取证占位：请勿成案，直接 war_abandon_command（档位标记取证 2a8e · 3/4，幂等回归）"
B4 = "取证占位：请勿成案，直接 war_abandon_command（档位标记取证 2a8e · 4/4，负控）"

# 拼接逻辑代码位置（结论须附文件:行号——行号以本轮 grep/read 实测为准）。
CODE_LOCS = [
    "src/client/preflight.ts:24-29 — applyGradeMarker：档位→标记拼装本体（L0 拼 !!直接做 / L2 拼 ??先看方案 / 已带前缀原样返回 / 空体返回 ''）",
    "src/client/views.tsx:681 — CommandComposer 提交：createCommand(applyGradeMarker(text, grade), …)",
    "src/client/views.tsx:126 — GRADE_MARKER 显示映射（' · !!直接做' / ' · ??先看方案'，与拼装 token 同源）",
]

OUT.mkdir(parents=True, exist_ok=True)
checks: list[dict] = []
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append({"name": name, "passed": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} — {detail}")


# --- Phase 0: 清空隔离 smoke 态（只动 .smoke-state——默认目录绝不能碰，v6 事故教训）。 ---
shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
(STATE / ".demo-woven.json").unlink(missing_ok=True)
print(f"forensics {CMD_NO} | server {BASE} | state {STATE}")
print(f"cleared smoke state: {STATE}")
# 清盘后服务端折叠缓存可能短暂回旧内容（shoot-v7 实测竞态）——轮询等板真空再开测。
for _ in range(30):
    try:
        _body = json.loads(urllib.request.urlopen(f"{BASE}/warroom/api/board", timeout=5).read())
        if not _body.get("commands") and not _body.get("tasks"):
            break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit("board did not drain after clearing smoke state")
print("board drained (empty, onboarding-ready)")


def read_created() -> list[dict]:
    events: list[dict] = []
    p = STATE / "directives.jsonl"
    if not p.exists():
        return events
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "directive_created":
            events.append(ev)
    return events


def wait_created(text: str, timeout_s: float = 15.0) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for ev in read_created():
            if ev.get("text") == text:
                return ev
        time.sleep(0.5)
    raise AssertionError(f"directive_created for {text!r} not found in {STATE / 'directives.jsonl'}")


def api_channel() -> tuple[str, list[dict]]:
    """板 API 读回：专用 commands 端点优先，回退 board 投影的 commands 数组。"""
    for path in ("/warroom/api/commands", "/warroom/api/board"):
        try:
            with urllib.request.urlopen(BASE + path, timeout=10) as r:
                body = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError:
            continue
        cmds = body.get("commands")
        if isinstance(cmds, list):
            return path, cmds
    raise AssertionError("no API channel returned a commands array")


def api_find(command_id: str, timeout_s: float = 10.0) -> dict:
    deadline = time.time() + timeout_s
    seen = 0
    while time.time() < deadline:
        _, cmds = api_channel()
        seen = len(cmds)
        for c in cmds:
            if c.get("commandId") == command_id:
                return c
        time.sleep(0.5)
    raise AssertionError(f"command {command_id!r} missing from API projection (saw {seen})")


console_errors: list[str] = []
cases: list[dict] = []
shots: list[str] = []


def run_case(page, *, key: str, body: str, expected: str, grade_label: str | None,
             idem: bool = False, negative: bool = False, empty_guard: bool = False) -> None:
    """开起草器 → 档位选中态机检 → 空体守卫(可选) → 填正文 → UI 提交 → 双通道读回断言。"""
    if page.locator(".war-dispatch-add").count() == 1:
        page.locator(".war-dispatch-add").click()
    else:
        assert page.locator(".war-onboard-cta").count() == 1, "no compose entry (neither dispatch-add nor onboarding CTA)"
        page.locator(".war-onboard-cta").click()
    page.wait_for_selector(".war-composer-modal", timeout=8000)

    # 起草器三档卡在场；默认选中 auto（不含 直接做/先看方案 字样的那张）。
    cards = page.locator(".war-composer-modal .war-grade-card")
    assert cards.count() == 3, f"expected 3 grade cards, got {cards.count()}"
    names = [cards.nth(i).inner_text() for i in range(3)]
    auto_idx = next(i for i, n in enumerate(names) if "直接做" not in n and "先看方案" not in n)
    check(f"{key}: composer offers 3 grade cards, auto default-on",
          cards.nth(auto_idx).get_attribute("aria-pressed") == "true", f"names={names!r}")

    if grade_label is not None:
        card = page.locator(".war-composer-modal .war-grade-card", has_text=grade_label)
        assert card.count() == 1, f"grade card {grade_label!r} not unique: {card.count()}"
        card.click()
        page.wait_for_timeout(250)
        check(f"{key}: picked「{grade_label}」flips aria-pressed",
              card.get_attribute("aria-pressed") == "true" and cards.nth(auto_idx).get_attribute("aria-pressed") == "false",
              "grade switch state did not flip")

    if empty_guard:
        page.locator(".war-composer").fill("   ")
        page.wait_for_timeout(150)
        btn = page.locator(".war-modal-actions .war-btn.primary")
        check(f"{key}: empty-body guard — submit disabled on whitespace-only text", btn.is_disabled())

    page.locator(".war-composer").fill(body)
    page.screenshot(path=str(OUT / f"{key}-composer.png"))
    shots.append(f"{key}-composer.png")
    print(f"shot: {key}-composer.png")

    page.locator(".war-modal-actions .war-btn.primary").click()
    page.wait_for_selector(".war-composer-modal", state="detached", timeout=15000)

    ev = wait_created(expected)
    api = api_find(ev["directiveId"])
    stored, api_text = ev["text"], api.get("text")
    cases.append({
        "case": key, "gradeCard": grade_label or "参谋分诊(auto·默认)",
        "typed": body, "expected": expected,
        "jsonl": {"directiveId": ev["directiveId"], "ts": ev.get("ts"), "text": stored},
        "api": {"commandId": api.get("commandId"), "text": api_text},
    })

    check(f"{key}: directives.jsonl text == expected", stored == expected, f"jsonl={stored!r}")
    check(f"{key}: API projection text == expected", api_text == expected, f"api={api_text!r}")
    if idem:
        check(f"{key}: idempotent — single {M_L0} prefix (20260825-41e3 ① regression)",
              stored.count(M_L0) == 1 and not stored.startswith(f"{M_L0} {M_L0}"),
              f"stored={stored!r} occurrences={stored.count(M_L0)}")
    if negative:
        check(f"{key}: negative control — auto grade adds no marker",
              M_L0 not in stored and M_L2 not in stored, f"stored={stored!r}")
    # 板上命令卡显示拼装后的文本（UI 全链可见）。
    page.locator(".war-command-card", has_text=expected).first.wait_for(timeout=10000)
    page.screenshot(path=str(OUT / f"{key}-board.png"))
    shots.append(f"{key}-board.png")
    print(f"shot: {key}-board.png")


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1720, "height": 940})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        # --- Phase 1: 空板引导 → 起草器 →「!! 直接做」档（L0 标记 + 空体守卫）。 ---
        page.goto(BASE)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("[data-dsh-warroom-entry]", timeout=30000).click()
        page.wait_for_timeout(1500)
        assert page.locator(".war-onboard").count() == 1, "empty board must show onboarding (no seed needed)"
        print("onboarding shown on empty smoke board")
        run_case(page, key="01-l0-marker", body=B1, expected=f"{M_L0} {B1}", grade_label="直接做", empty_guard=True)

        # --- Phase 2:「?? 先看方案」档（L2 标记）。 ---
        run_case(page, key="02-l2-marker", body=B2, expected=f"{M_L2} {B2}", grade_label="先看方案")

        # --- Phase 3: 幂等回归（取证 20260825-41e3 缺陷①）。 ---
        run_case(page, key="03-idempotent", body=B3, expected=B3, grade_label="直接做", idem=True)

        # --- Phase 4: 负控——auto 档零标记。 ---
        run_case(page, key="04-auto-negative", body=B4, expected=B4, grade_label=None, negative=True)

        browser.close()
    check("console errors: none", console_errors == [], f"{console_errors[:5]}")
finally:
    ledger = {
        "script": "scripts/shoot-grade-marker-2a8e.py",
        "task": CMD_NO,
        "base": BASE,
        "smokeState": str(STATE),
        "regression-of": "取证 20260825-41e3 缺陷①（!! 前缀重复拼接）",
        "codeLocations": CODE_LOCS,
        "cases": cases,
        "checks": checks,
        "screenshots": shots,
        "consoleErrors": len(console_errors),
    }
    (OUT / "grade-marker-forensics.json").write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    passed = sum(1 for c in checks if c["passed"])
    verdict = "拼进（BEHAVIOR CONFIRMED）" if not failures else "未拼进（BEHAVIOR BROKEN / FORENSIC FAILED）"
    report = [
        f"# 取证报告：起草器档位开关把 !!/?? 标记拼进命令文本（{CMD_NO}）",
        "",
        f"**结论：{verdict}** — {passed}/{len(checks)} checks passed.",
        "",
        "档位开关在提交时把「!!直接做 」/「??先看方案 」前缀拼进命令文本（L0/L2 档），"
        "「让参谋定」auto 档不拼，正文已带前缀时不重复拼接（幂等）。",
        "",
        "## 拼接逻辑代码位置",
        *[f"- {loc}" for loc in CODE_LOCS],
        "",
        "## 断言链",
        "- 浏览器起草器（.war-composer-modal）三档卡：auto 默认选中、点选 L0/L2 后 aria-pressed 翻转。",
        "- UI 提交（立即下达）→ POST /warroom/api/commands → directives.jsonl directive_created 原文 verbatim。",
        "- 双通道读回：directives.jsonl 账本原文 + 板 API commands 投影（/warroom/api/commands 缺席回退 /warroom/api/board）。",
        "- L0 档拼「!!直接做 」前缀；L2 档拼「??先看方案 」；auto 档零标记（负控）。",
        "- 幂等回归（20260825-41e3 ①）：正文手打「!!直接做」开头 + L0 档 → 全链单标记，无重复前缀。",
        "- 空体守卫：纯空白正文提交键 disabled。",
        "- 板上命令卡文本展示拼装结果（UI 全链可见）。",
        "",
        "## 证据",
        "- grade-marker-forensics.json — 逐 case 的 typed/expected/jsonl/api 四元组 + 全部 checks + 代码位置。",
        "- 0X-*-composer.png — 选档后、提交前的起草器截图（档位卡选中态可见）。",
        "- 0X-*-board.png — 提交后板上命令卡截图（标记文本可见）。",
        f"- 环境：cordis.smoke.yml 隔离 state（{STATE.name}），BASE={BASE}，未触碰 3080 主服。",
    ]
    if failures:
        report += ["", "## 失败项", ""] + [f"- {f}" for f in failures]
    (OUT / "REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"ledger: {OUT / 'grade-marker-forensics.json'} ({passed}/{len(checks)} checks passed)")

if failures:
    print("FAILED:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"GRADE-MARKER FORENSICS OK ({CMD_NO}) -> {verdict}")
