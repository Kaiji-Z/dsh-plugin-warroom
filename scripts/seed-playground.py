"""模拟舰桥播种器 — 给舰长一个可随手把玩的演示板。

Usage: python scripts/seed-playground.py [stateDir]

Protocol（必须按序，否则运行中的服务器会用内存旧态把种子覆盖掉）:
  1. 停服（netstat 找 :3080 PID kill）
  2. python scripts/seed-playground.py   # 只动隔离目录 .smoke-state，绝碰默认目录
  3. 起服（cordis.smoke.yml overlay）
与 shoot-v7.py 的 Phase 0+C 完全同源：清隔离态 → seed-smoke.ts 全要素
演示板（五状态命令/史诗任务令/进行中会话/打赢+失败任务回报/依赖锁链/每日任务令）
→ 追加一条 L1 计划待批命令（收件箱「等你定夺」+ 夜间预检演示）。
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

# D5 的演示会话号也要进 manifest（V9.12 ④ 每命令独立大副会话）。
manifest_path = STATE / ".demo-sessions.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["sec-d5"] = "大副·多本账本"

# --- 六代战线「projC 部署」（舰长要体验卡组全机制）---------------------------
# 一条链走完三种续接模式 + 五档状态色：Ⅰ 绿(收官)/Ⅱ 红(再战败)/Ⅲ 灰(转向后
# 取消)/Ⅳ 琥珀(报待定夺)/Ⅴ 蓝(在打·改档演示)/Ⅵ 蓝(最新=分诊中呼吸卡面)。
# pip 恰好 >4 触发「…+最新4」截头；面板 5 张历史卡 > 4 行上限触发滚轮翻看。
CAM = STATE / "campaigns"
CAM.mkdir(parents=True, exist_ok=True)

def cev(cid: str, payload: dict) -> None:
    with open(CAM / f"{cid}.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

def dev(payload: dict) -> None:
    with open(STATE / "directives.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

WS_C1, WS_C2 = "D:/smoke/projC/deploy", "D:/smoke/projC/compose"
g1 = "cmd-20260823-0700-a101"; g2 = "cmd-20260823-0710-b202"; g3 = "cmd-20260823-0720-c303"
g4 = "cmd-20260823-0730-d404"; g5 = "cmd-20260823-0740-e505"; g6 = "cmd-20260823-0750-f606"
tg1, tg2, tg4, tg5 = "20260823-hotel", "20260823-kilo", "20260823-lima", "20260823-mike"

# Ⅰ 部署脚本 v1：打赢收官（绿）。
cev(tg1, {"type": "task_created", "ts": ts(54), "campaignId": tg1, "title": "projC 一键部署脚本 v1", "brief": "背景：手工起环境太繁琐。执行指引：写 deploy.sh 一键拉起测试环境。", "acceptance": "./deploy.sh 后 curl 探活返回 200", "priority": "normal", "quality": "fine", "publishedBy": "sec-g1"})
cev(tg1, {"type": "task_published", "ts": ts(54), "campaignId": tg1, "workspacePath": WS_C1, "publishedBy": "sec-g1", "workspaceKind": "bound"})
cev(tg1, {"type": "task_claimed", "ts": ts(53), "campaignId": tg1, "claimedBy": "cmd-g1-session", "attemptId": "1a2b3c4d-0001-4a5b-8c6d-e0f1a2b3c4d5", "attempt": 1})
cev(tg1, {"type": "task_submitted", "ts": ts(50), "campaignId": tg1, "report": "任务回报：deploy.sh 完成，探活 200，验收全过。", "from": "cmd-g1-session", "evidence": {"checks": [{"item": "./deploy.sh 后 curl 探活返回 200", "passed": True}], "tests": {"command": "npm test", "exitCode": 0, "passed": 6, "failed": 0}, "diffstat": "2 files changed, 88 insertions(+)"}})
cev(tg1, {"type": "task_closed", "ts": ts(48), "campaignId": tg1, "verdict": "通过收官"})
dev({"type": "directive_created", "ts": ts(55), "directiveId": g1, "text": "给 projC 写个一键部署脚本，先能起测试环境"})
dev({"type": "directive_received", "ts": ts(54.5), "directiveId": g1, "staffSessionId": "sec-g1"})
dev({"type": "directive_triaged", "ts": ts(54), "directiveId": g1, "grade": "L0", "reason": "明确脚本任务，直接做", "confidence": 0.93})
dev({"type": "directive_approved", "ts": ts(53.5), "directiveId": g1, "taskId": tg1})

# Ⅱ 再战：Windows 兼容失败（红）——重试上限用尽。
cev(tg2, {"type": "task_created", "ts": ts(46), "campaignId": tg2, "title": "部署脚本 Windows 兼容再战", "brief": "背景：v1 在 Windows 报路径错误。执行指引：跨平台路径处理并复测。", "acceptance": "Windows 上 ./deploy.sh 全绿", "priority": "normal", "publishedBy": "sec-g2"})
cev(tg2, {"type": "task_published", "ts": ts(46), "campaignId": tg2, "workspacePath": WS_C1, "publishedBy": "sec-g2", "workspaceKind": "bound"})
cev(tg2, {"type": "task_claimed", "ts": ts(45), "campaignId": tg2, "claimedBy": "cmd-g2-session", "attemptId": "2b3c4d5e-0002-4a5b-8c6d-e0f1a2b3c4d5", "attempt": 1})
cev(tg2, {"type": "task_attempt_failed", "ts": ts(43), "campaignId": tg2, "reason": "路径分隔符问题修了，但 shell 兼容层缺库", "from": "cmd-g2-session"})
cev(tg2, {"type": "task_failed", "ts": ts(43), "campaignId": tg2, "reason": "第 1 次尝试失败：路径分隔符问题修了，但 shell 兼容层缺库（重试上限 1 已用尽）"})
dev({"type": "directive_created", "ts": ts(47), "directiveId": g2, "text": "部署脚本在 Windows 上起不来，再战一次", "continuesFrom": g1, "continuationMode": "retry"})
dev({"type": "directive_received", "ts": ts(46.5), "directiveId": g2, "staffSessionId": "sec-g2"})
dev({"type": "directive_triaged", "ts": ts(46), "directiveId": g2, "grade": "L0", "reason": "明确兼容性修复，直接做", "confidence": 0.9})
dev({"type": "directive_approved", "ts": ts(45.5), "directiveId": g2, "taskId": tg2})

# Ⅲ 转向后取消（灰）：舰长比完成本后回到脚本路线。
dev({"type": "directive_created", "ts": ts(41), "directiveId": g3, "text": "看看现成的容器部署方案能不能直接拿来用", "continuesFrom": g2, "continuationMode": "pivot"})
dev({"type": "directive_received", "ts": ts(40.5), "directiveId": g3, "staffSessionId": "sec-g3"})
dev({"type": "directive_cancelled", "ts": ts(38), "directiveId": g3, "reason": "比了改造成本，还是回到脚本路线自己写"})

# Ⅳ 转向容器化：报待定夺（琥珀）——收件箱「任务回报待阅」第二件。
cev(tg4, {"type": "task_created", "ts": ts(34), "campaignId": tg4, "title": "docker compose 测试环境", "brief": "背景：脚本路线受跨平台拖累。执行指引：compose 编排起测试环境。", "acceptance": "docker compose up 后探活 200", "priority": "normal", "publishedBy": "sec-g4"})
cev(tg4, {"type": "task_published", "ts": ts(34), "campaignId": tg4, "workspacePath": WS_C2, "publishedBy": "sec-g4", "workspaceKind": "bound"})
cev(tg4, {"type": "task_claimed", "ts": ts(33), "campaignId": tg4, "claimedBy": "cmd-g4-session", "attemptId": "3c4d5e6f-0003-4a5b-8c6d-e0f1a2b3c4d5", "attempt": 1})
cev(tg4, {"type": "task_submitted", "ts": ts(28), "campaignId": tg4, "report": "任务回报：compose 编排完成，探活 200。改动 docker-compose.yml 与 .env.example；遗留：回滚步骤待补。", "from": "cmd-g4-session", "evidence": {"checks": [{"item": "docker compose up 后探活 200", "passed": True}], "tests": {"command": "docker compose config", "exitCode": 0}, "diffstat": "2 files changed, 64 insertions(+)"}})
dev({"type": "directive_created", "ts": ts(35), "directiveId": g4, "text": "转向：用 docker compose 管测试环境（续部署这条线）", "continuesFrom": g3, "continuationMode": "pivot", "name": "compose 迁移"})
dev({"type": "directive_received", "ts": ts(34.5), "directiveId": g4, "staffSessionId": "sec-g4"})
dev({"type": "directive_triaged", "ts": ts(34), "directiveId": g4, "grade": "L1", "reason": "换技术路线，先看编排方案", "confidence": 0.8})
dev({"type": "directive_approved", "ts": ts(33.5), "directiveId": g4, "taskId": tg4})

# Ⅴ 深化：在打（蓝·live 光点）——L1 分诊后舰长改档 L0（改档 chip 演示）。
cev(tg5, {"type": "task_created", "ts": ts(16), "campaignId": tg5, "title": "compose 环境补健康检查与回滚", "brief": "背景：遗留回滚步骤待补。执行指引：healthcheck + 回滚脚本。", "acceptance": "healthcheck 生效；回滚脚本幂等", "priority": "normal", "publishedBy": "sec-g5"})
cev(tg5, {"type": "task_published", "ts": ts(16), "campaignId": tg5, "workspacePath": WS_C2, "publishedBy": "sec-g5", "workspaceKind": "bound"})
cev(tg5, {"type": "task_claimed", "ts": ts(15), "campaignId": tg5, "claimedBy": "cmd-g5-session", "attemptId": "4d5e6f7a-0004-4a5b-8c6d-e0f1a2b3c4d5", "attempt": 1})
cev(tg5, {"type": "unit_deployed", "ts": ts(14), "campaignId": tg5, "childId": "u-g5", "unitName": "engineer", "label": "工程兵", "mission": "补 healthcheck 与回滚", "front": f"{WS_C2}/ops", "writes": True})
dev({"type": "directive_created", "ts": ts(17), "directiveId": g5, "text": "给 compose 环境补上健康检查和一键回滚", "continuesFrom": g4, "continuationMode": "deepen"})
dev({"type": "directive_received", "ts": ts(16.5), "directiveId": g5, "staffSessionId": "sec-g5"})
dev({"type": "directive_triaged", "ts": ts(16), "directiveId": g5, "grade": "L1", "reason": "涉及回滚安全，先看方案", "confidence": 0.78})
dev({"type": "directive_regraded", "ts": ts(15.5), "directiveId": g5, "grade": "L0", "reason": "舰长定：明确补丁活，直改 L0"})
dev({"type": "directive_approved", "ts": ts(15), "directiveId": g5, "taskId": tg5})

# Ⅵ 最新代：分诊中呼吸卡面（蓝）——坞上组面即此代。
dev({"type": "directive_created", "ts": ts(2), "directiveId": g6, "text": "顺手把 compose 用法写进 projC README", "continuesFrom": g5, "continuationMode": "deepen"})
dev({"type": "directive_received", "ts": ts(1.5), "directiveId": g6, "staffSessionId": "sec-g6"})

# Ⅶ 未分组战线：跨全电脑的宽域命令 → 任务落在 warRoot 合成沙盒（非项目文件夹），
# 星域聚合进「未分组」行星（V13 血脉∩星球：合成沙盒也算一个星球键）。
WS_SYN = "D:/smoke/.warroom/tasks/t20260828-01-organize-photos"
g7, tg7 = "cmd-20260823-0800-a707", "task-20260823-0807"
cev(tg7, {"type": "task_created", "ts": ts(12), "campaignId": tg7, "title": "整理相机图片进相册文件夹", "brief": "背景：全盘扫描相机导入目录。执行指引：按年月归档 + 去重。", "acceptance": "相册按年月分层，无重复", "priority": "normal", "publishedBy": "sec-g7"})
cev(tg7, {"type": "task_published", "ts": ts(11.8), "campaignId": tg7, "workspacePath": WS_SYN, "publishedBy": "sec-g7", "workspaceKind": "auto-dir"})
cev(tg7, {"type": "task_claimed", "ts": ts(11), "campaignId": tg7, "claimedBy": "cmd-g7-session", "attemptId": "7e8f9a0b-0001-4b5c-8d9e-f0a1b2c3d4e5", "attempt": 1})
cev(tg7, {"type": "unit_deployed", "ts": ts(10), "campaignId": tg7, "childId": "u-g7", "unitName": "engineer", "label": "工程兵", "mission": "全盘扫描并归档相机图片", "front": f"{WS_SYN}/scan", "writes": True})
dev({"type": "directive_created", "ts": ts(12.5), "directiveId": g7, "text": "把电脑里相机拍摄的图片都整理到相册文件夹", "name": "相册整理"})
dev({"type": "directive_received", "ts": ts(12.2), "directiveId": g7, "staffSessionId": "sec-g7"})
dev({"type": "directive_triaged", "ts": ts(12), "directiveId": g7, "grade": "L0", "reason": "归档活，直接做", "confidence": 0.86})
dev({"type": "directive_approved", "ts": ts(11.8), "directiveId": g7, "taskId": tg7})

manifest.update({
    "sec-g1": "大副·部署脚本", "sec-g2": "大副·Windows 再战", "sec-g3": "大副·容器方案调研",
    "sec-g4": "大副·compose 环境", "sec-g5": "大副·健康检查回滚", "sec-g6": "大副·部署 README", "sec-g7": "大副·相册整理",
    "cmd-g1-session": "外勤·部署 v1", "cmd-g2-session": "外勤·Windows 再战",
    "cmd-g4-session": "外勤·compose", "cmd-g5-session": "外勤·健康检查", "cmd-g7-session": "外勤·相册整理",
})
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

n = sum(1 for _ in open(STATE / "directives.jsonl", encoding="utf-8"))
print(f"playground seeded: {n} directive events (smoke board + L1 plan-pending + 6-gen chain + ungrouped sandbox front)")
print("now start the smoke server (see AGENTS.md 本地起服) and refresh the board")
