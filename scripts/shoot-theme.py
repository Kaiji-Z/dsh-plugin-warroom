"""V9.13 双主题色彩取证 —— 浅色/深色各跑一遍：对比度机检 + 截图。

Usage: python scripts/shoot-theme.py [baseUrl] [outDir]
- 打开演示板（默认 :3080 烟服）
- 浅色轮：断言核心状态前景/容器对 ≥4.5:1（正文级）或 ≥3:1（控件/大字），
  截全板 + 聚焦页
- 深色轮：body 加 data-ds-dark-theme（宿主 theme-presenter 的同一开关），
  同一组断言 + 截图
- 附带令牌冒烟：--war-canvas 在两主题下解析值必须不同（证明令牌层真在切换）
- 层梯可辨断言：深色 canvas/zone/card/well 四级解析值两两不同（目检曾抓到
  dark zone 与 canvas 同落 bg-base、容器只剩边框可辨的塌陷）；浅色至少画布≠容器。
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3080"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else ".goal/evidence/v7")

# (选择器, 最低比) —— optional=True 的选择器不在场时跳过（按需渲染的件）
PAIRS = [
    (".war-chip.st-closed", 4.5, False),        # 善终绿（正文级 12px）
    (".war-chip.st-failed", 4.5, False),        # 败红
    (".war-chip.st-talking", 4.5, False),       # 等你答问（琥珀，V9.13 拆分）
    (".war-chip.st-in_progress", 4.5, False),   # 进行蓝
    (".war-life-status.warn", 4.5, False),      # 生命条警示行
    (".war-life-label.now", 4.5, False),        # 前沿段标签
    (".war-btn.primary", 4.5, False),           # 实心主按钮白字
    (".war-visit-seg.s-closed", 4.5, True),     # 到访摘要收官段（浅色旧纯绿 2.3:1 的修复位）
    (".war-waithint", 4.5, False),              # 解释行（secondary on well）
    (".war-taskid", 4.5, False),                # 卡片次级文本（secondary on card）
]

JS_PAIR = """
(pairs) => pairs.map(([sel, min, optional]) => {
  const el = document.querySelector(sel);
  if (!el) return { sel, min, optional, missing: true };
  const s = getComputedStyle(el);
  // 底 = 元素自身底染 + 祖先链上半透明 tint 逐层合成 + 最近不透明底。
  // （tint 卡底是 alpha 底染——不合成就会拿生色当底，深色下算出 1:1 假失败。）
  const layers = [];
  if (s.backgroundColor !== 'transparent') layers.push(s.backgroundColor);
  let node = el.parentElement, opaque = 'rgb(255, 255, 255)';
  while (node && node !== document.documentElement) {
    const b = getComputedStyle(node).backgroundColor;
    if (b && b !== 'transparent' && !/0, 0, 0, 0\\)$/.test(b) && !/\\/ 0\\)$/.test(b)) {
      const m = b.match(/rgba?\\([^)]*, ([\\d.]+)\\)$/), m2 = b.match(/\\/ ([\\d.]+)\\)$/);
      const a = m ? parseFloat(m[1]) : m2 ? parseFloat(m2[1]) : 1;
      if (a >= 1) { opaque = b; break }
      layers.push(b);
    }
    node = node.parentElement;
  }
  return { sel, min, optional, fg: s.color, layers, opaque }
})
"""

JS_RATIO = """
(items) => items.map(it => {
  // 解析 rgb()/rgba()/color(srgb r g b [/ a]) —— Chromium 两代记法都收。
  const parse = s => {
    if (typeof s !== 'string') return null;
    let m = s.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : parseFloat(m[4]) };
    m = s.match(/^color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)$/);
    if (m) return { r: Math.round(+m[1] * 255), g: Math.round(+m[2] * 255), b: Math.round(+m[3] * 255), a: m[4] === undefined ? 1 : parseFloat(m[4]) };
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return null;
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) });
  const lin = c => ['r', 'g', 'b'].map(k => { const v = c[k] / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 });
  const lum = c => { const [r, g, b] = lin(c); return .2126 * r + .7152 * g + .0722 * b };
  if (it.missing) return { ...it, missing: true };
  const f = parse(it.fg), base = parse(it.opaque);
  if (!base || !f) return { ...it, unparsed: true };
  let bg = base;
  for (const raw of [...(it.layers || [])].reverse()) { const l = parse(raw); if (l && l.a > 0) bg = over(l, bg) }
  const fg = f.a < 1 ? over(f, bg) : f;
  const l1 = lum(fg), l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
  return { ...it, ratio: Math.round(ratio * 100) / 100 };
})
"""


def run_round(page, theme, tag):
    pairs = page.evaluate(JS_PAIR, [[p[0], p[1], p[2]] for p in PAIRS])
    scored = page.evaluate(JS_RATIO, pairs)
    fails = []
    for it in scored:
        if it.get("missing"):
            if it.get("optional"):
                print(f"  [{theme}] {it['sel']}: (optional, not rendered — skipped)")
                continue
            fails.append(f"{it['sel']}: element missing")
            continue
        if it.get("unparsed"):
            fails.append(f"{it['sel']}: color unparsed fg={it['fg']} own={it['own']} bg={it['bg']}")
            continue
        status = "ok" if it["ratio"] >= it["min"] else "FAIL"
        print(f"  [{theme}] {it['sel']}: {it['ratio']}:1 (min {it['min']}) {status}")
        if status == "FAIL":
            fails.append(f"{it['sel']} {it['ratio']}:1 < {it['min']}:1")
    page.screenshot(path=f"{OUT}/v913-theme-{tag}-board.png")
    # 聚焦页深浅各一张（开 d3 报告链）
    page.locator(".war-dispatch .war-command-card", has_text="要一个能记每日一句的命令行小工具").first.click()
    page.wait_for_selector(".war-modal", timeout=3000)
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/v913-theme-{tag}-focus.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    return fails


def read_ladder(page):
    """读 .war-root 上四级容器令牌的解析值（var 链在 computed 阶段已展开）。"""
    return page.evaluate(
        """() => {
          const cs = getComputedStyle(document.querySelector('.war-root'));
          const read = n => cs.getPropertyValue(n).trim();
          return { canvas: read('--war-canvas'), zone: read('--war-zone-bg'),
                   card: read('--war-card-bg'), well: read('--war-well-bg'),
                   pop: read('--war-pop-bg') };
        }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-dsh-warroom-entry]", timeout=20000).click()
    page.wait_for_selector(".war-board", timeout=20000)
    page.wait_for_timeout(1500)
    page.mouse.move(8, 900)
    page.wait_for_timeout(500)

    OUT.mkdir(parents=True, exist_ok=True)

    # --- 浅色轮（宿主缺省即浅色）---
    ladder_light = read_ladder(page)
    canvas_light = ladder_light["canvas"]
    fails_light = run_round(page, "light", "light")

    # --- 深色轮：宿主 theme-presenter 的同一开关 ---
    page.evaluate("() => document.body.setAttribute('data-ds-dark-theme', '')")
    page.wait_for_timeout(400)
    ladder_dark = read_ladder(page)
    canvas_dark = ladder_dark["canvas"]
    fails_dark = run_round(page, "dark", "dark")

    browser.close()

print(f"canvas token light={canvas_light!r} dark={canvas_dark!r}")
assert canvas_light != canvas_dark, "--war-canvas must remap between themes (token layer wired to host switch)"
print(f"ladder light={ladder_light}")
print(f"ladder dark={ladder_dark}")
# 层梯可辨：深色四级两两不同；浅色至少画布≠容器（浅色 zone/card/pop 同白是宿主塌缩使然）
ladder_fails = []
dark_levels = [ladder_dark[k] for k in ("canvas", "zone", "card", "well")]
if len(set(dark_levels)) != len(dark_levels):
    ladder_fails.append(f"dark elevation collapsed: {ladder_dark}")
if ladder_light["canvas"] == ladder_light["zone"]:
    ladder_fails.append(f"light canvas==zone (zone invisible on canvas): {ladder_light}")
all_fails = fails_light + fails_dark + ladder_fails
(OUT / "v913-theme-contrast.json").write_text(
    json.dumps({"ladder_light": ladder_light, "ladder_dark": ladder_dark}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
assert not all_fails, f"contrast failures:\n" + "\n".join(all_fails)
print(f"THEME SHOTS OK: light+dark contrast pairs all pass ({len(PAIRS)} pairs x 2 themes)")
