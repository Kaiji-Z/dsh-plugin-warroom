"""composer-grade forensics — 起草器三档开关端到端取证（任务 20260825-225952-2771 复验轮）.

前轮（cmd-20260825-211902-94b6）抓到缺陷①②（标记重复拼/空体产出），已修于
0a53c5a；本轮对修复后构建复跑同一断言链。

断言链（全部机检，无体感）：
  浏览器起草器（views.tsx CommandComposer：applyGradeMarker 拼标记 → POST）
  → 落账 directives.jsonl（directive_created 原文 verbatim，磁盘级断言）
  → 真实 war_triage 工具（scripts/triage-probe.ts，宿主侧 overrideMarkerOf
    强制档位：参谋建议故意与标记相反，验证 !!/?? 压过建议）
  → 命令卡档位 chip（.war-chip.gr-L0/L1/L2，浏览器级断言）
  → GET /warroom/api/board 投影（text/grade 双通道复核）。

覆盖：L0 档（!!直接做 前缀 + 强制 L0）、L2 档（??先看方案 + 强制 L2）、
auto 档（无前缀 + 建议档原样生效无 override）、幂等（正文已手打同标记，
全链只落一个标记）、空体 UI 守卫（纯空白提交键 disabled）。
取证命令逐个 directive_cancelled 收尾（终态守卫冻结，不留任务令空烧）。

Usage: python scripts/shoot-composer.py [outDir] [baseUrl] [smokeStateDir]
  baseUrl 默认 http://127.0.0.1:3099（烟服 overlay，勿指向真实 statePath 的实例）
  smokeStateDir 默认 .smoke-state（脚本带护栏：路径不含 .smoke-state 一律拒跑）。
约定与 scripts/shoot-v7.py 相同：domcontentloaded + 选择器等待（SSE 挡
networkidle）；起服前只清空隔离 .smoke-state。
"""
import json
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

CMD_NO = "20260825-225952-2771"
REPO = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/grades-2771")
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3099"
STATE = Path(sys.argv[3] if len(sys.argv) > 3 else ".smoke-state").resolve()

# 护栏：绝不动真实 statePath（v6 事故教训——默认目录是真实数据）。
if ".smoke-state" not in str(STATE):
    sys.exit(f"refusing to run against non-smoke state dir: {STATE}")
OUT.mkdir(parents=True, exist_ok=True)

L0M, L2M = "!!直接做", "??先看方案"
failures: list[str] = []
n_checks = 0


def check(cond: bool, label: str) -> bool:
    global n_checks
    n_checks += 1
    mark = "PASS" if cond else "FAIL"
    print(f"[{mark}] {label}")
    if not cond:
        failures.append(label)
    return cond


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# --- Phase 0: 清空隔离烟态（只动 .smoke-state，绝不碰真实目录）。 ---
shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
print(f"forensics for command {CMD_NO} | server {BASE} | state {STATE}")
print(f"cleared smoke state: {STATE}")

# --- Phase 0b: 等烟服就绪（最多 90s）。 ---
deadline = time.time() + 90
while True:
    try:
        with urllib.request.urlopen(f"{BASE}/warroom/api/board", timeout=3) as r:
            if r.status == 200:
                print("server ready")
                break
    except Exception:
        if time.time() > deadline:
            sys.exit(f"server not ready on {BASE} after 90s")
        time.sleep(1.5)


def ledger_events(ev_type: str) -> list[dict]:
    p = STATE / "directives.jsonl"
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == ev_type:
            out.append(ev)
    return out


def run_probe(command_id: str, suggested: str, reason: str) -> dict:
    proc = subprocess.run(
        ["node", "--import", "tsx", str(REPO / "scripts" / "triage-probe.ts"),
         str(STATE), command_id, suggested, reason],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=str(REPO),
    )
    stdout = proc.stdout.strip()
    if proc.returncode != 0 or not stdout:
        return {"ok": False, "error": f"probe exit {proc.returncode}: {proc.stderr.strip()[:300]}"}
    return json.loads(stdout.splitlines()[-1])


def cancel_command(command_id: str) -> None:
    with open(STATE / "directives.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps({"type": "directive_cancelled", "ts": now_iso(),
                            "directiveId": command_id, "reason": f"取证收尾（{CMD_NO}）：命令卡取消"},
                           ensure_ascii=False) + "\n")


def board_commands(page) -> list[dict]:
    return page.evaluate("() => fetch('/warroom/api/board').then(r => r.json())").get("commands", [])


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

    def compose(body: str, seg_index: int):
        """打开起草器 → 填正文 → 选档位段（0=auto/1=L0/2=L2）。不提交。"""
        page.locator(".war-island-compose").click()
        page.wait_for_selector(".war-modal", timeout=3000)
        check(page.locator(".war-grade-seg").count() == 3, "起草器三档开关在位（.war-grade-seg ×3）")
        check("on" in (page.locator('.war-grade-seg').nth(0).get_attribute("class") or ""),
              "auto 档为默认选中态")
        page.locator(".war-composer").fill(body)
        page.locator(".war-grade-seg").nth(seg_index).click()
        page.wait_for_timeout(150)
        return page

    def submit_composer():
        page.locator(".war-modal-actions button.primary").click()
        page.wait_for_timeout(1500)

    def case(name: str, body: str, seg_index: int, marker: str, suggested: str,
             forced: str | None, probe_reason: str, shots: tuple[str, str]):
        """一档取证全链：提交 → 落账断言 → 真实 triage 强制断言 → 卡档位断言 → 取消收尾。
        marker='' 表 auto（无前缀）；forced=None 表建议档原样生效。"""
        compose(body, seg_index)
        if marker == "":
            check("on" not in (page.locator(".war-grade-seg").nth(1).get_attribute("class") or ""),
                  f"{name}：L0 段未被误选")
        page.screenshot(path=f"{OUT}/{shots[0]}")
        print(f"shot: {shots[0]}")
        submit_composer()
        expected_text = f"{marker} {body}" if marker else body
        card = page.locator(".war-command-card", has_text=body).first
        appeared = True
        try:
            card.wait_for(timeout=10000)
        except Exception:
            appeared = False
        check(appeared and card.count() == 1, f"{name}：命令卡上板（文本含「{body}」）")
        # 磁盘级：directive_created 原文 verbatim 落账。
        created = [e for e in ledger_events("directive_created") if e.get("text") == expected_text]
        check(len(created) == 1, f"{name}：落账 directive_created 原文 verbatim（{expected_text!r}）")
        if not created:
            return
        command_id = created[0]["directiveId"]
        # 真实 war_triage：参谋建议故意与标记相反（auto 则给建议档），宿主侧强制改档。
        probe = run_probe(command_id, suggested, probe_reason)
        print(f"  probe({command_id}, suggested={suggested}) -> {json.dumps(probe, ensure_ascii=False)}")
        if probe.get("already"):
            print(f"  WARN: {command_id} 已被在线大副先行分诊（同一宿主强制路径），回读落账档位")
        check(probe.get("ok") is True and probe.get("grade") == (forced or suggested),
              f"{name}：真实 war_triage 生效档位 == {forced or suggested}（建议 {suggested}）")
        if forced is not None and not probe.get("already"):
            check(probe.get("suggested") == suggested and probe.get("override") == ("!!" if marker == L0M else "??"),
                  f"{name}：override 痕入账（建议 {suggested} 被标记压过）")
        # 浏览器级：重开板，命令卡档位 chip + 文本。
        open_board()
        card = page.locator(".war-command-card", has_text=body).first
        expect_grade = forced or suggested
        check(card.locator(f".war-chip.gr-{expect_grade}").count() == 1,
              f"{name}：命令卡档位 chip .gr-{expect_grade}")
        if marker:
            check(card.locator(".war-command-text").inner_text().startswith(f"{marker} "),
                  f"{name}：卡文本以「{marker} 」开头")
        else:
            card_text = card.locator(".war-command-text").inner_text()
            check(L0M not in card_text and L2M not in card_text, f"{name}：卡文本无档位标记前缀")
        if not probe.get("already"):
            title = card.locator(f".war-chip.gr-{expect_grade}").get_attribute("title") or ""
            check(probe_reason in title, f"{name}：chip title 带分诊理由（{probe_reason[:18]}…）")
        page.screenshot(path=f"{OUT}/{shots[1]}")
        print(f"shot: {shots[1]}")
        # 投影级：GET /warroom/api/board 双通道复核。
        proj = [c for c in board_commands(page) if c.get("commandId") == command_id]
        check(len(proj) == 1 and proj[0].get("grade") == expect_grade
              and proj[0].get("text") == expected_text,
              f"{name}：板投影 text/grade 与账本一致（grade={expect_grade}）")
        cancel_command(command_id)
        print(f"  cancelled {command_id}（取证收尾）")

    # --- Case L0：!!直接做 前缀 + 强制 L0（大副建议故意 L2）。 ---
    case("L0", "取证L0：给工具箱加每日格言", 1, L0M, "L2", "L0",
         "取证：大副建议 L2 被 !! 标记强制 L0",
         ("composer-L0.png", "board-L0-forced.png"))

    # --- Case L2：??先看方案 前缀 + 强制 L2（大副建议故意 L0）。 ---
    case("L2", "取证L2：重构配置层", 2, L2M, "L0", "L2",
         "取证：大副建议 L0 被 ?? 标记强制 L2",
         ("composer-L2.png", "board-L2-forced.png"))

    # --- Case auto：无前缀 + 建议档原样生效（无 override）。 ---
    case("auto", "取证auto：做个记账小工具", 0, "", "L1", None,
         "取证：无标记，大副建议档原样生效",
         ("composer-auto.png", "board-auto-L1.png"))

    # --- Case 幂等：正文已手打 !! 标记再选 L0 档 → 全链只落一个标记。 ---
    idem_body = "!!直接做 取证幂等：同标记不重复拼"
    compose(idem_body, 1)
    page.screenshot(path=f"{OUT}/composer-idem.png")
    print("shot: composer-idem.png")
    submit_composer()
    created = [e for e in ledger_events("directive_created") if e.get("text") == idem_body]
    check(len(created) == 1 and created[0]["text"].count(L0M) == 1,
          "幂等：落账文本与输入逐字相同，「!!直接做」恰出现 1 次")
    if created:
        cancel_command(created[0]["directiveId"])
        print(f"  cancelled {created[0]['directiveId']}（取证收尾）")

    # --- Case 空体守卫：纯空白正文 → 提交键 disabled（UI 第一道守卫）。 ---
    page.locator(".war-island-compose").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    page.locator(".war-composer").fill("   ")
    page.wait_for_timeout(150)
    check(page.locator(".war-modal-actions button.primary").is_disabled(),
          "空体：纯空白正文提交键 disabled（不产出只有标记的命令）")
    page.screenshot(path=f"{OUT}/composer-empty-guard.png")
    print("shot: composer-empty-guard.png")
    page.locator(".war-modal-actions button", has_text="取消").click()
    page.wait_for_timeout(200)

    # --- 终盘：全部取证命令已取消（struck），不留任务令空烧。 ---
    open_board()
    cancelled_ids = {e["directiveId"] for e in ledger_events("directive_cancelled")}
    struck = page.locator(".war-command-text.struck").count()
    check(len(cancelled_ids) == 4 and struck >= 4,
          f"收尾：4 条取证命令全部 directive_cancelled（卡面 struck ×{struck}）")
    page.screenshot(path=f"{OUT}/board-final-cancelled.png")
    print("shot: board-final-cancelled.png")

    browser.close()

check(errors == [], f"浏览器 console 无错误泄漏（{errors[:5]}）")
print(f"console errors: {len(errors)}")
print(f"checks: {n_checks}, failures: {len(failures)}")
if failures:
    print("FAILED:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"COMPOSER FORENSICS OK ({CMD_NO})")
