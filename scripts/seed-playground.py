"""模拟作战室播种器 — 给元首一个可随手把玩的演示板。

Usage: python scripts/seed-playground.py [stateDir]

Protocol（必须按序，否则运行中的服务器会用内存旧态把种子覆盖掉）:
  1. 停服（netstat 找 :3080 PID kill）
  2. python scripts/seed-playground.py   # 只动隔离目录 .smoke-state，绝碰默认目录
  3. 起服（cordis.smoke.yml overlay）
与 shoot-v7.py 的 Phase 0+C 完全同源：清隔离态 → seed-smoke.ts 全要素
演示板（五状态命令/史诗悬赏/进行中会话/打赢+失败战报/依赖锁链/每日悬赏）
→ 追加一条 L1 计划待批命令（收件箱「等你发落」+ 夜间预检演示）。
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

STATE = Path(sys.argv[1] if len(sys.argv) > 1 else ".smoke-state")
D5 = "cmd-20260823-0930-ff06"

ts = lambda mins_ago: (datetime.now(timezone.utc) - timedelta(minutes=mins_ago)).isoformat(timespec="milliseconds")

shutil.rmtree(STATE / "campaigns", ignore_errors=True)
(STATE / "directives.jsonl").unlink(missing_ok=True)
# 织换标记一并清——下次开机 demo-weave 重织（换一批新真会话）。
(STATE / ".demo-woven.json").unlink(missing_ok=True)
print(f"cleared playground state: {STATE}")

subprocess.run(
    ["node", "--import", "tsx", "scripts/seed-smoke.ts", str(STATE.resolve())],
    check=True, capture_output=True, text=True,
)
with open(STATE / "directives.jsonl", "a", encoding="utf-8") as f:
    for ev in [
        {"type": "directive_created", "ts": ts(46), "directiveId": D5, "text": "把 projB 的小工具改成支持多本账本"},
        {"type": "directive_received", "ts": ts(45.5), "directiveId": D5, "staffSessionId": "sec-d5"},
        {"type": "directive_triaged", "ts": ts(45), "directiveId": D5, "grade": "L1", "reason": "涉及旧数据迁移，先看方案再动", "confidence": 0.82},
        {"type": "directive_plan_opened", "ts": ts(44), "directiveId": D5, "plan": "1) 设计账本数据结构\n2) 写迁移脚本\n3) 兼容旧数据并补测试"},
    ]:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")

# D5 的演示会话号也要进 manifest（V9.12 ④ 每命令独立参谋会话）。
manifest_path = STATE / ".demo-sessions.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["sec-d5"] = "参谋·多本账本"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

n = sum(1 for _ in open(STATE / "directives.jsonl", encoding="utf-8"))
print(f"playground seeded: {n} directive events (smoke board + L1 plan-pending)")
print("now start the smoke server (see AGENTS.md 本地起服) and refresh the board")
