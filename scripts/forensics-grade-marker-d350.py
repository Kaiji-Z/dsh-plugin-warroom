"""Grade-marker forensics — 取证 20260827-044935-d350.

取证命题：V7 起草器档位开关提交时是否把「!!直接做 」(L0) /「??先看方案 」(L2)
标记拼进命令文本；「让参谋定」(auto) 档不拼；幂等分支（正文已带同标记不重复拼）
是否生效。浏览器实测（UI 全链）+ 双通道读回（directives.jsonl 账本原文 +
板 API commands 投影原文）。取证不改产品代码。

退出码语义（与验收对齐：结论为「不符」不算失败，取证完成即达标）：
  exit 0 = 取证完成（四案全部落账 + 双通道原文捕获齐全）；行为判定见 CONCLUSION.md
           （符合/不符都可能是 exit 0）。
  exit 1 = 取证本身失败（命令未落账 / 读回通道断裂 / UI 入口缺失等证据链断点）。

被取证机制链（纯取证，零改动）：
  src/client/preflight.ts  applyGradeMarker —— 档位→标记拼装（幂等 + 空体硬化）
  src/client/views.tsx     CommandComposer submit —— createCommand(applyGradeMarker(text, grade), …)
  src/client/data.ts       createCommand —— POST /warroom/api/commands
  src/directives.ts        overrideMarkerOf —— 服务端识别标记强制改档
  src/dashboard.ts         POST 落 directive_created → directives.jsonl 原文

API 读回通道说明：当前构建无 GET /warroom/api/commands 路由（404，脚本如实探测
记录）；命令投影的权威读回通道是 GET /warroom/api/board 的 commands 数组
（src/dashboard.ts:293 directiveProjection）。每案附该投影返回的命令对象原文。

取证正文全部用 stand-down 措辞（请勿成案，直接 war_abandon_command）——
POST 即 tickNow 中继给真实参谋会话，措辞把 LLM 弹药钉在一两轮。

Usage: python scripts/forensics-grade-marker-d350.py [outDir] [baseUrl] [stateDir]
Assumes the forensic-overlay server (cordis.forensic.yml, isolated .forensic-state)
is running on BASE. 安全边界：按端口拒跑 3080 主服；state 目录名必须是
.forensic-state。约定：domcontentloaded + 选择器等待（SSE 挡 networkidle，勿用）。
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

CMD_NO = "20260827-044935-d350"
REPO = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/v7-forensics-grade-marker")
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3099"
STATE = Path(sys.argv[3] if len(sys.argv) > 3 else ".forensic-state").resolve()
OUT = OUT if OUT.is_absolute() else REPO / OUT

# --- 边界守卫：绝不动 3080 主服；state 目录只认隔离 .forensic-state（其余目录是真实数据）。 ---
_u = urllib.parse.urlparse(BASE)
if (_u.port or (443 if _u.scheme == "https" else 80)) == 3080:
    raise SystemExit("refusing BASE on port 3080 (main server) — boot an isolated forensic server instead")
if STATE.name != ".forensic-state":
    raise SystemExit(f"refusing state dir {STATE!r} — must be the isolated .forensic-state directory")

M_L0, M_L2 = "!!直接做", "??先看方案"
STAND_DOWN = "取证占位：请勿成案，直接 war_abandon_command"
B1 = f"{STAND_DOWN}（档位标记取证 1/4 · L0 拼前缀）"
B2 = f"{STAND_DOWN}（档位标记取证 2/4 · L2 拼前缀）"
B3 = f"{M_L0} {STAND_DOWN}（档位标记取证 3/4 · 幂等回归：正文已带标记再选 L0）"
B4 = f"{STAND_DOWN}（档位标记取证 4/4 · 负控：让参谋定不拼标记）"

OUT.mkdir(parents=True, exist_ok=True)
behavior_checks: list[dict] = []   # 行为判定（符合/不符 → verdict；不影响退出码）
evidence_failures: list[str] = []  # 证据链断点（取证失败 → exit 1）


def bcheck(name: str, ok: bool, detail: str = "") -> None:
    behavior_checks.append({"name": name, "passed": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))


def efatal(name: str, detail: str = "") -> None:
    evidence_failures.append(f"{name} — {detail}")
    print(f"[EVIDENCE-BREAK] {name}" + (f" — {detail}" if detail else ""))


# --- Phase 0: 清空隔离取证态（只动 .forensic-state；运行中服务器的内存旧态可能回写，轮询等板真空）。 ---
shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
(STATE / ".demo-woven.json").unlink(missing_ok=True)
print(f"forensics {CMD_NO} | server {BASE} | state {STATE}")
print(f"cleared forensic state: {STATE}")
for _ in range(30):
    try:
        _body = json.loads(urllib.request.urlopen(f"{BASE}/warroom/api/board", timeout=5).read())
        if not _body.get("commands") and not _body.get("tasks"):
            break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit("board did not drain after clearing forensic state")
print("board drained (empty, onboarding-ready)")


# --- API 通道探测 + 读回：GET /warroom/api/commands（预期 404，如实记录）→ 回退 board 投影 commands。 ---
def probe_commands_endpoint() -> dict:
    try:
        with urllib.request.urlopen(BASE + "/warroom/api/commands", timeout=10) as r:
            return {"path": "/warroom/api/commands", "status": r.status, "note": "dedicated GET commands endpoint EXISTS"}
    except urllib.error.HTTPError as e:
        return {"path": "/warroom/api/commands", "status": e.code,
                "note": "no dedicated GET route in current build; board projection (GET /warroom/api/board) is the read channel"}
    except Exception as e:  # noqa: BLE001
        return {"path": "/warroom/api/commands", "status": -1, "note": f"probe error: {e}"}


CHANNEL_PROBE = probe_commands_endpoint()
print(f"api channel probe: {CHANNEL_PROBE}")


def api_channel() -> tuple[str, list[dict]]:
    """命令投影读回：专用 commands 端点优先，回退 board 投影的 commands 数组。"""
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


def wait_new_created(n0: int, timeout_s: float = 15.0) -> dict:
    """等第 n0+1 条 directive_created 落账——不预设文本，实况捕获（「不符」也能优雅取证）。"""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        evs = read_created()
        if len(evs) > n0:
            return evs[n0]
        time.sleep(0.5)
    raise AssertionError(f"no new directive_created within {timeout_s}s (had {n0})")


console_errors: list[str] = []
cases: list[dict] = []
shots: list[str] = []


def run_case(page, *, key: str, body: str, expected: str, grade_label: str | None,
             idem: bool = False, negative: bool = False, empty_guard: bool = False) -> None:
    """开起草器 → 档位选中态机检 → 空体守卫(可选) → 填正文 → UI 提交 → 双通道实况读回。

    证据链断点（落账失败/读回断裂）记 evidence_failures；文本是否符合设计记 behavior_checks。
    """
    try:
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
        bcheck(f"{key}: composer offers 3 grade cards, auto default-on",
               cards.nth(auto_idx).get_attribute("aria-pressed") == "true", f"names={names!r}")

        if grade_label is not None:
            card = page.locator(".war-composer-modal .war-grade-card", has_text=grade_label)
            assert card.count() == 1, f"grade card {grade_label!r} not unique: {card.count()}"
            card.click()
            page.wait_for_timeout(250)
            bcheck(f"{key}: picked「{grade_label}」flips aria-pressed",
                   card.get_attribute("aria-pressed") == "true" and cards.nth(auto_idx).get_attribute("aria-pressed") == "false",
                   "grade switch state did not flip")

        if empty_guard:
            page.locator(".war-composer").fill("   ")
            page.wait_for_timeout(150)
            btn = page.locator(".war-modal-actions .war-btn.primary")
            bcheck(f"{key}: empty-body guard — submit disabled on whitespace-only text", btn.is_disabled())

        page.locator(".war-composer").fill(body)
        page.screenshot(path=str(OUT / f"{key}-composer.png"))
        shots.append(f"{key}-composer.png")
        print(f"shot: {key}-composer.png")

        n0 = len(read_created())
        page.locator(".war-modal-actions .war-btn.primary").click()
        page.wait_for_selector(".war-composer-modal", state="detached", timeout=15000)

        ev = wait_new_created(n0)
        api = api_find(ev["directiveId"])
        stored, api_text = ev["text"], api.get("text")
        cases.append({
            "case": key, "gradeCard": grade_label or "让参谋定(auto·默认)",
            "typed": body, "expected": expected, "actual": {"jsonl": stored, "api": api_text},
            "jsonl": {"directiveId": ev["directiveId"], "ts": ev.get("ts"), "text": stored},
            "api": {"commandId": api.get("commandId"), "text": api_text},
            "apiCommandRaw": api,
        })

        bcheck(f"{key}: directives.jsonl text == expected", stored == expected, f"jsonl={stored!r}")
        bcheck(f"{key}: API projection text == expected", api_text == expected, f"api={api_text!r}")
        bcheck(f"{key}: API commandId == jsonl directiveId", api.get("commandId") == ev["directiveId"],
               f"api={api.get('commandId')!r} jsonl={ev['directiveId']!r}")
        if idem:
            bcheck(f"{key}: idempotent — single {M_L0} prefix, no double glue",
                   stored.count(M_L0) == 1 and not stored.startswith(f"{M_L0} {M_L0}"),
                   f"stored={stored!r} occurrences={stored.count(M_L0)}")
        if negative:
            bcheck(f"{key}: negative control — auto grade adds no marker",
                   M_L0 not in stored and M_L2 not in stored, f"stored={stored!r}")
        # 板上命令卡显示拼装后的文本（UI 全链可见）。
        page.locator(".war-command-card", has_text=stored).first.wait_for(timeout=10000)
        page.screenshot(path=str(OUT / f"{key}-board.png"))
        shots.append(f"{key}-board.png")
        print(f"shot: {key}-board.png")
    except AssertionError as e:
        efatal(f"{key}: evidence chain broke", str(e))
        raise


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
        print("onboarding shown on empty forensic board")
        run_case(page, key="01-l0-marker", body=B1, expected=f"{M_L0} {B1}", grade_label="直接做", empty_guard=True)

        # --- Phase 2:「?? 先看方案」档（L2 标记）。 ---
        run_case(page, key="02-l2-marker", body=B2, expected=f"{M_L2} {B2}", grade_label="先看方案")

        # --- Phase 3: 幂等回归——正文已带「!!直接做」开头再选 L0，不得重复拼接。 ---
        run_case(page, key="03-idempotent", body=B3, expected=B3, grade_label="直接做", idem=True)

        # --- Phase 4: 负控——「让参谋定」auto 档零标记。 ---
        run_case(page, key="04-auto-negative", body=B4, expected=B4, grade_label=None, negative=True)

        browser.close()
    bcheck("console errors: none", console_errors == [], f"{console_errors[:5]}")
finally:
    # 终态 API commands 投影全量原文（命令对象 verbatim）。
    try:
        _channel, _cmds = api_channel()
        (OUT / "api-commands-raw.json").write_text(
            json.dumps({"channel": _channel, "probe": CHANNEL_PROBE, "commands": _cmds},
                       ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        efatal("final API raw dump", str(e))
    behavior_failures = [c for c in behavior_checks if not c["passed"]]
    verdict = "符合" if not behavior_failures else "不符"
    ledger = {
        "script": "scripts/forensics-grade-marker-d350.py",
        "task": CMD_NO,
        "base": BASE,
        "forensicState": str(STATE),
        "apiChannelProbe": CHANNEL_PROBE,
        "regression-of": "取证 20260825-41e3 缺陷①（!! 前缀重复拼接）",
        "cases": cases,
        "behaviorChecks": behavior_checks,
        "evidenceFailures": evidence_failures,
        "screenshots": shots,
        "consoleErrors": len(console_errors),
    }
    (OUT / "forensics-ledger.json").write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    passed = sum(1 for c in behavior_checks if c["passed"])
    core_ok = not behavior_failures
    report = [
        f"# 取证报告：起草器档位开关把 !!/?? 标记拼进命令文本（{CMD_NO}）",
        "",
        f"**结论：{verdict}** — 行为断言 {passed}/{len(behavior_checks)} passed；证据链断点 {len(evidence_failures)}。",
        "",
        ("一句话判定：档位开关在提交时把「!!直接做 」/「??先看方案 」前缀拼进命令文本（L0/L2 档），"
         "「让参谋定」auto 档不拼标记，幂等分支生效（正文已带同标记时不重复拼接）——"
         "UI 提交 → directives.jsonl 账本 → 板 API commands 投影三通道一致。"
         if core_ok else "一句话判定：存在与设计不符的行为，详见失败项与代码定位。"),
        "",
        "## 机制链（被取证代码，零改动）",
        "- src/client/preflight.ts:24-29 applyGradeMarker —— L0 拼 `!!直接做 ` / L2 拼 `??先看方案 ` / auto 原文；幂等（startsWith 同标记不重拼）；空体硬化（纯空白返回 ''）。",
        "- src/client/views.tsx:515 CommandComposer submit —— createCommand(applyGradeMarker(text, grade), …)。",
        "- src/client/data.ts:131-136 createCommand —— POST /warroom/api/commands（客户端拼装后落 POST body）。",
        "- src/dashboard.ts:308 POST 落 directive_created → directives.jsonl 原文 verbatim。",
        "",
        "## API 读回通道（如实记录）",
        f"- GET /warroom/api/commands 探测：HTTP {CHANNEL_PROBE['status']}（{CHANNEL_PROBE['note']}）。",
        "- 命令投影权威读回通道：GET /warroom/api/board 的 commands 数组（src/dashboard.ts:293 directiveProjection）。"
        "每案命令对象原文见 forensics-ledger.json 的 cases[].apiCommandRaw 与 api-commands-raw.json。",
        "",
        "## 断言链（行为判定）",
        "- 浏览器起草器（.war-composer-modal）三档卡：auto 默认选中、点选 L0/L2 后 aria-pressed 翻转。",
        "- UI 提交（立即下达）→ directives.jsonl directive_created 原文 verbatim + API 投影原文双通道一致。",
        "- L0 档拼「!!直接做 」前缀；L2 档拼「??先看方案 」；auto 档零标记（负控）。",
        "- 幂等回归（20260825-41e3 ①）：正文手打「!!直接做」开头 + L0 档 → 全链单标记，无重复前缀。",
        "- 空体守卫：纯空白正文提交键 disabled（views.tsx:625）。",
        "- 板上命令卡文本展示拼装结果（UI 全链可见）。",
        "",
        "## 证据",
        "- forensics-ledger.json — 逐 case 的 typed/expected/actual（jsonl+api 双通道）/apiCommandRaw 命令对象原文 + 全部 behaviorChecks。",
        "- api-commands-raw.json — 终态 API commands 投影全量原文（verbatim）。",
        "- 0X-*-composer.png — 选档后、提交前的起草器截图（档位卡选中态可见）。",
        "- 0X-*-board.png — 提交后板上命令卡截图（标记文本可见）。",
        f"- 环境：cordis.forensic.yml 隔离 state（{STATE.name}），BASE={BASE}，未触碰 3080 主服。",
    ]
    if behavior_failures:
        report += ["", "## 行为失败项（不符证据）", ""] + [f"- {c['name']} — {c['detail']}" for c in behavior_failures]
        report += ["", "## 代码定位（不符时下钻）", "",
                   "- src/client/preflight.ts:24-29 applyGradeMarker —— 档位→标记拼装与幂等分支本体",
                   "- src/client/views.tsx:509-526 CommandComposer submit —— applyGradeMarker 调用点（拼装是否真的进了 POST body）"]
    if evidence_failures:
        report += ["", "## 证据链断点（取证失败，与行为判定无关）", ""] + [f"- {f}" for f in evidence_failures]
    (OUT / "REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    (OUT / "CONCLUSION.md").write_text(
        f"# 结论（{CMD_NO}）\n\n"
        f"**{verdict}** — "
        + ("起草器档位开关把「!!直接做 」/「??先看方案 」标记拼进命令文本（L0/L2 档），「让参谋定」auto 档不拼，"
           "幂等分支生效（正文已带同标记时不重复拼接）；证据 = UI 全链 + directives.jsonl 账本原文 + 板 API commands "
           "投影原文三通道一致（取证脚本退出码 0，四案命令对象原文见 api-commands-raw.json）。"
           if core_ok else "存在不符项，详见 REPORT.md 行为失败项与代码定位（API 原文佐证见 api-commands-raw.json）。")
        + f"\n\n机制代码：src/client/preflight.ts:24-29（applyGradeMarker）→ src/client/views.tsx:515（submit 拼装调用点）。\n"
          f"证据目录：{OUT}\n", encoding="utf-8")
    print(f"ledger: {OUT / 'forensics-ledger.json'} (behavior {passed}/{len(behavior_checks)}, evidence-breaks {len(evidence_failures)})")

if evidence_failures:
    print("EVIDENCE CHAIN BROKEN (forensics itself failed):")
    for f in evidence_failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"GRADE-MARKER FORENSICS COMPLETE ({CMD_NO}) -> verdict={verdict} (exit 0 per acceptance)")
