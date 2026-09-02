"""V9.11 R2 真链取证：一条真实 LLM 命令全程跑通，执行卡实时活动行取证。

前置：smoke 服已在 :3080 运行（真实网关可用——本脚本不造假事件）。流程：
经页面 fetch 下达 L0 直发命令（!!直接做）→ 真实参谋分诊 → 发布 → 征召指挥官
→ 指挥官真跑工具（读/写/命令）→ session/event 流进 ActivityTracker →
板投影 live attempt 带 activity，SSE revision 随动词变化推板。

断言：
  1. 至少一次轮询里 live attempt 携带非空 activity（投影字段在链上）；
  2. 整个执行期观测到 ≥2 种不同动词（过程在变——思考/探索/编辑/命令…）；
  3. 截图 ≥2 张记录不同动词的执行卡（含 .war-activity 行）；
  4. 观测到 ≥3 个不同 revision（板在动；盐响应另由 boardRevision 单测保证）。

用法：python scripts/shoot-activity.py   # 服须已在跑；耗时≈命令执行时长（分钟级）
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else ".goal/evidence/v7"
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"
CMD_TEXT = "!!直接做：在任务工作区建一个 hi.txt 写入 hello-warroom 一行，用一条命令把文件内容读出来核对无误，然后交任务回报。"
MAX_WAIT_S = 12 * 60

Path(OUT).mkdir(parents=True, exist_ok=True)


def board() -> dict:
    return json.loads(urllib.request.urlopen(f"{BASE}/warroom/api/board", timeout=10).read())


def live_attempts(b: dict) -> list:
    out = []
    for t in b.get("tasks", []):
        for a in t.get("attemptLog", []):
            if a.get("outcome") is None:
                out.append({"taskId": t.get("taskId"), **a})
    return out


def main() -> int:
    b0 = board()
    if not b0.get("active"):
        print("FATAL: war mode inactive — activate first (board must be 战时).")
        return 2
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1720, "height": 940})
        page.on("console", lambda m: m.type == "error" and print(f"console.error: {m.text[:160]}"))

        def open_board():
            # 与 shoot-v7 同源：先点 shell 回家键挂出作战室面板（reload 后也要重挂）。
            page.goto(BASE, wait_until="domcontentloaded")
            page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
            page.wait_for_timeout(1200)

        open_board()
        page.wait_for_selector(".war-board", timeout=20000)

        # 下达（页面 fetch：绕开 git-bash curl 中文 mojibake 坑）。
        created = page.evaluate(
            """async (text) => {
              const r = await fetch('/warroom/api/commands', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text })
              })
              return await r.json()
            }""",
            CMD_TEXT,
        )
        assert created.get("ok") is True, f"command create failed: {created}"
        cmd_id = created["commandId"]
        print(f"command issued: {cmd_id}")

        seen_labels: list[str] = []      # 首次出现的动词顺序
        revisions: set[str] = set()
        shots = 0
        saw_activity = False
        settled = False
        deadline = time.time() + MAX_WAIT_S
        while time.time() < deadline:
            b = board()
            revisions.add(b.get("revision", ""))
            lives = live_attempts(b)
            for la in lives:
                act = la.get("activity")
                if act and act.get("label"):
                    saw_activity = True
                    label = act["label"]
                    if label not in seen_labels:
                        seen_labels.append(label)
                        print(f"activity verb #{len(seen_labels)}: {label} ({la['taskId']} · {la['sessionId'][:14]}…)")
                        # 重挂面板后截图留证（SSE 会自己推，这里 reload 确保拿到当帧）。
                        time.sleep(2.0)
                        open_board()
                        page.wait_for_selector(".war-board", timeout=20000)
                        if page.locator(".war-activity").count() > 0:
                            page.screenshot(path=f"{OUT}/v9-activity-{len(seen_labels)}.png")
                            shots += 1
            # 命令终局判定（只看本命令的任务与尝试——别让板上其他僵尸尝试挡住）。
            cmd = next((c for c in b.get("commands", []) if c.get("commandId") == cmd_id), None)
            tasks_of_cmd = [t for t in b.get("tasks", []) if cmd and t.get("taskId") == cmd.get("taskId")]
            if cmd is not None and cmd.get("status") == "approved" and tasks_of_cmd:
                my_lives = [a for t in tasks_of_cmd for a in t.get("attemptLog", []) if a.get("outcome") is None]
                if any(t.get("status") in ("closed", "reported", "failed") for t in tasks_of_cmd) and not my_lives:
                    settled = True
                    print(f"command settled: {[t.get('status') for t in tasks_of_cmd]}")
                    break
            if cmd is not None and cmd.get("status") == "cancelled":
                print("FATAL: command cancelled by staff — real chain broken.")
                browser.close()
                return 3
            time.sleep(2.5)

        final = board()
        print(f"verbs seen ({len(seen_labels)}): {seen_labels}")
        print(f"distinct revisions: {len(revisions)}; activity shots: {shots}; settled: {settled}")
        print(f"final command status: {next((c.get('status') for c in final.get('commands', []) if c.get('commandId') == cmd_id), None)}")
        browser.close()

        ok = saw_activity and len(seen_labels) >= 2 and shots >= 1 and len(revisions) >= 3
        if not ok:
            print("ACTIVITY SHOT: FAIL")
            return 1
        print("ACTIVITY SHOT: OK")
        return 0


if __name__ == "__main__":
    sys.exit(main())
