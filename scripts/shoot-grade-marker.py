"""取证：起草器档位开关把 !!/?? 标记拼进命令文本（任务 20260827-004113-7d3c）.

机制（代码实现的标记格式，取证以此为准）：
  src/client/preflight.ts applyGradeMarker
    L0 档 -> `!!直接做 <正文>` 前缀
    L2 档 -> `??先看方案 <正文>` 前缀
    auto 档 -> 原文（无前缀）
  src/client/views.tsx CommandComposer: createCommand(applyGradeMarker(text, grade))
  src/dashboard.ts POST /warroom/api/commands -> directives.jsonl
    directive_created 落账原文 verbatim。

断言链（全部机检）：
  浏览器起草器三档卡（.war-grade-card ×3：auto/L0/L2）提交
  → 磁盘级 directives.jsonl directive_created 原文 verbatim（前缀逐字比对）
  → 命令卡文本前缀（.war-command-card .war-command-text）
  → GET /warroom/api/board 投影 text 双通道复核
  → 阴性对照：auto 档落账文本不含 !!/?? 标记
  → 幂等回归：正文已手打同标记再选同档，全链只落一个标记
  → 空体守卫：纯空白正文提交键 disabled。
取证命令逐个 directive_cancelled 收尾；evidence 目录内归档
directives.jsonl 片段 + 板投影 JSON + 截图 + REPORT.md（含一行结论）。

Usage: python scripts/shoot-grade-marker.py [outDir] [baseUrl] [stateDir]
  baseUrl 默认 http://127.0.0.1:3099（cordis.forensic.yml 烟服）
  stateDir 默认 .forensic-state（护栏：路径不含 .forensic-state 一律拒跑）。
约定：domcontentloaded + 选择器等待（SSE 挡 networkidle）。
"""
import json
import shutil
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

CMD_NO = "20260827-004113-7d3c"
REPO = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else f".goal/evidence/grade-marker-{CMD_NO[-4:]}")
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3099"
STATE = Path(sys.argv[3] if len(sys.argv) > 3 else ".forensic-state").resolve()

# 护栏：只准动隔离取证目录（.smoke-state 是 playground 演示板、默认目录是真实数据）。
if ".forensic-state" not in str(STATE):
    sys.exit(f"refusing to run against non-forensic state dir: {STATE}")
OUT = REPO / OUT if not OUT.is_absolute() else OUT
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


# --- Phase 0: 清空隔离取证态（只动 .forensic-state）。 ---
shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
print(f"forensics for command {CMD_NO} | server {BASE} | state {STATE}")
print(f"cleared forensic state: {STATE}")

# --- Phase 0b: 等烟服就绪（最多 120s）。 ---
deadline = time.time() + 120
while True:
    try:
        with urllib.request.urlopen(f"{BASE}/warroom/api/board", timeout=3) as r:
            if r.status == 200:
                print("server ready")
                break
    except Exception:
        if time.time() > deadline:
            sys.exit(f"server not ready on {BASE} after 120s")
        time.sleep(1.5)


def ledger_lines() -> list[dict]:
    p = STATE / "directives.jsonl"
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def ledger_events(ev_type: str) -> list[dict]:
    return [e for e in ledger_lines() if e.get("type") == ev_type]


def cancel_command(command_id: str) -> None:
    with open(STATE / "directives.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps({"type": "directive_cancelled", "ts": now_iso(),
                            "directiveId": command_id, "reason": f"取证收尾（{CMD_NO}）：命令卡取消"},
                           ensure_ascii=False) + "\n")


touched_ids: list[str] = []
projection_rows: list[dict] = []

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

    def compose(body: str, card_index: int):
        """打开起草器 → 填正文 → 选档位卡（0=auto/1=L0/2=L2）。不提交。"""
        page.locator(".war-dispatch-add").click()
        page.wait_for_selector(".war-modal", timeout=3000)
        check(page.locator(".war-grade-card").count() == 3, "起草器三档卡在位（.war-grade-card ×3）")
        check("on" in (page.locator(".war-grade-card").nth(0).get_attribute("class") or ""),
              "auto 档为默认选中态")
        page.locator(".war-composer").fill(body)
        if card_index > 0:
            page.locator(".war-grade-card").nth(card_index).click()
            page.wait_for_timeout(150)

    def submit_composer():
        page.locator(".war-modal-actions button.primary").click()
        page.wait_for_timeout(1500)

    def case(name: str, body: str, card_index: int, marker: str, shots: tuple[str, str]):
        """一档取证：提交 → 落账逐字断言 → 卡文本前缀断言 → 板投影复核 → 取消收尾。
        marker='' 表 auto 阴性对照（断言不含任何标记）。"""
        compose(body, card_index)
        page.screenshot(path=f"{OUT}/{shots[0]}")
        print(f"shot: {shots[0]}")
        submit_composer()
        expected_text = f"{marker} {body}" if marker else body
        created = [e for e in ledger_events("directive_created") if e.get("text") == expected_text]
        check(len(created) == 1, f"{name}：落账 directive_created 原文 verbatim（{expected_text!r}）")
        if not created:
            return
        command_id = created[0]["directiveId"]
        touched_ids.append(command_id)
        # 浏览器级：命令卡文本前缀。
        open_board()
        card = page.locator(".war-command-card", has_text=body).first
        appeared = True
        try:
            card.wait_for(timeout=10000)
        except Exception:
            appeared = False
        check(appeared and card.count() == 1, f"{name}：命令卡上板（文本含「{body}」）")
        card_text = card.locator(".war-command-text").inner_text()
        if marker:
            check(card_text.startswith(f"{marker} "), f"{name}：卡文本以「{marker} 」开头")
        else:
            check(L0M not in card_text and L2M not in card_text and "??" not in card_text,
                  f"{name}：阴性对照——卡文本不含 !!/?? 标记")
        page.screenshot(path=f"{OUT}/{shots[1]}")
        print(f"shot: {shots[1]}")
        # 投影级：GET /warroom/api/board 双通道复核（浏览器 fetch，避免 curl 乱码坑）。
        commands = page.evaluate("() => fetch('/warroom/api/board').then(r => r.json())").get("commands", [])
        proj = [c for c in commands if c.get("commandId") == command_id]
        check(len(proj) == 1 and proj[0].get("text") == expected_text,
              f"{name}：板投影 text 与账本逐字一致")
        if proj:
            projection_rows.append(proj[0])
        cancel_command(command_id)
        print(f"  cancelled {command_id}（取证收尾）")

    # --- Case L0：!!直接做 前缀。 ---
    case("L0", "取证L0：给工具箱加每日格言", 1, L0M, ("composer-L0.png", "board-L0.png"))

    # --- Case L2：??先看方案 前缀。 ---
    case("L2", "取证L2：重构配置层", 2, L2M, ("composer-L2.png", "board-L2.png"))

    # --- Case auto 阴性对照：无前缀、落账不含 !!/??。 ---
    case("auto", "取证auto：做个记账小工具", 0, "", ("composer-auto.png", "board-auto.png"))

    # --- Case 幂等回归：正文已手打 !! 标记再选 L0 档 → 全链只落一个标记。 ---
    idem_body = "!!直接做 取证幂等：同标记不重复拼"
    compose(idem_body, 1)
    page.screenshot(path=f"{OUT}/composer-idem.png")
    print("shot: composer-idem.png")
    submit_composer()
    created = [e for e in ledger_events("directive_created") if e.get("text") == idem_body]
    check(len(created) == 1 and created[0]["text"].count(L0M) == 1,
          "幂等：落账文本与输入逐字相同，「!!直接做」恰出现 1 次")
    if created:
        touched_ids.append(created[0]["directiveId"])
        cancel_command(created[0]["directiveId"])
        print(f"  cancelled {created[0]['directiveId']}（取证收尾）")

    # --- Case 空体守卫：纯空白正文 → 提交键 disabled。 ---
    page.locator(".war-dispatch-add").click()
    page.wait_for_selector(".war-modal", timeout=3000)
    page.locator(".war-composer").fill("   ")
    page.wait_for_timeout(150)
    check(page.locator(".war-modal-actions button.primary").is_disabled(),
          "空体：纯空白正文提交键 disabled（不产出只有标记的命令）")
    page.screenshot(path=f"{OUT}/composer-empty-guard.png")
    print("shot: composer-empty-guard.png")
    page.locator(".war-modal-actions button", has_text="取消").click()
    page.wait_for_timeout(200)

    # --- 终盘：取证命令全部 directive_cancelled。 ---
    open_board()
    cancelled_ids = {e["directiveId"] for e in ledger_events("directive_cancelled")}
    struck = page.locator(".war-command-text.struck").count()
    check(len(cancelled_ids) >= 4 and struck >= 4,
          f"收尾：取证命令全部 directive_cancelled（卡面 struck ×{struck}）")
    page.screenshot(path=f"{OUT}/board-final-cancelled.png")
    print("shot: board-final-cancelled.png")

    browser.close()

check(errors == [], f"浏览器 console 无错误泄漏（{errors[:5]}）")

# --- 归档：directives.jsonl 片段 + 板投影 JSON + 结论报告。 ---
fragment = [e for e in ledger_lines() if e.get("directiveId") in touched_ids
            or e.get("type") == "directive_created"]
(OUT / "ledger-fragment.jsonl").write_text(
    "\n".join(json.dumps(e, ensure_ascii=False) for e in fragment) + "\n", encoding="utf-8")
(OUT / "board-projection.json").write_text(
    json.dumps(projection_rows, ensure_ascii=False, indent=2), encoding="utf-8")

verdict = "生效" if not failures else "不生效"
report = [
    f"# 取证报告：起草器档位开关标记拼接（{CMD_NO}）",
    "",
    f"## 结论：{verdict}",
    "",
    f"- 机检断言 {n_checks} 项，失败 {len(failures)} 项。",
    "- 标记格式（代码实现，`src/client/preflight.ts:24-29` applyGradeMarker）："
    f"L0 档前缀 `!!直接做 `、L2 档前缀 `??先看方案 `、auto 档原文不加前缀。",
    "- 链路：起草器三档卡（views.tsx CommandComposer）→ createCommand(applyGradeMarker)"
    "→ POST /warroom/api/commands → directives.jsonl directive_created 原文 verbatim 落账"
    "（dashboard.ts）→ /warroom/api/board 投影同文。",
    "- 覆盖：L0/L2 档前缀逐字断言（账本+卡面+投影三通道）、auto 阴性对照（不含 !!/??）、"
    "幂等回归（手打同标记不重复拼）、空体守卫（纯空白提交键 disabled）。",
    "- 证据：ledger-fragment.jsonl（directives.jsonl 片段）、board-projection.json"
    "（板投影）、composer-*.png / board-*.png（截图）。",
    "- 环境：cordis.forensic.yml 隔离 state（.forensic-state），端口 3099，工作树构建。",
]
if failures:
    report += ["", "## 失败项", ""] + [f"- {f}" for f in failures]
(OUT / "REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")

print(f"console errors: {len(errors)}")
print(f"checks: {n_checks}, failures: {len(failures)}")
print(f"evidence dir: {OUT}")
if failures:
    print("FAILED:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"GRADE-MARKER FORENSICS OK ({CMD_NO}) -> {verdict}")
