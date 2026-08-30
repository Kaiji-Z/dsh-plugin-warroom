# -*- coding: utf-8 -*-
"""V18.9.5 pipe-fix verification (list view). 自洽纯 DOM——不依赖调试出口。

修复内容：族系去重（一根一族）、面板卡不做锚、沟带被面板全占→腿不画、
顶沟钳到列头下、弯头 rr 死代码修复、React 键撞车残留（ae9174b）。
前置：playground 种子（seed-playground.py）+ smoke 服；列表视图。

断言（V17.5 可见性规则是前提：滚出视界的站=缺席，不画空管）：
  A. 基线普查：坞内去重命令锚 ≥ 10；存在 forming 族（任务锚 id=命令锚 id，
  　　data-pipe-forming）两端都可见。
  B. hover 该可见族 → 恰好 1 个 g.on；其管线路径采样与 .war-card 相交 = 0
  　　（管只走沟不穿卡；端口触点已修剪）。
  C. hover compose 链尾卡（组面板开）→ 面板开；亮起的 g 色相=链尾卡的战线
  　　色相（族系按根寻址）；全部 g 路径采样与 .war-card（含面板卡）相交 = 0。
  D. 鼠标移回空白 → g.on = 0（无残留；ae9174b 键撞车回归针）。
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DARK_HOLD = """() => {
  const f = () => { if (!document.body.hasAttribute('data-ds-dark-theme')) document.body.setAttribute('data-ds-dark-theme', '') }
  f()
  if (window.__themeObs === undefined) { window.__themeObs = new MutationObserver(f); window.__themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] }) }
}"""

CENSUS = """() => {
  const vis = (el) => {
    if (el === null || el === undefined) return false
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    let n = el.parentElement
    while (n && n !== document.body) {
      const o = n.style.overflowY !== '' ? n.style.overflowY : getComputedStyle(n).overflowY
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
        const c = n.getBoundingClientRect()
        const iv = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)
        const ih = Math.min(r.right, c.right) - Math.max(r.left, c.left)
        if (iv < 24 || ih < 24) return false
      }
      n = n.parentElement
    }
    return true
  }
  const cmdIds = new Set()
  const cmdVis = {}
  for (const el of document.querySelectorAll('.war-dispatch [data-pipe-cmd]')) {
    const id = el.getAttribute('data-pipe-cmd')
    cmdIds.add(id)
    if (vis(el)) cmdVis[id] = true
  }
  const formingVis = {}
  for (const el of document.querySelectorAll('[data-pipe-forming]')) {
    const id = el.getAttribute('data-pipe-forming')
    if (vis(el)) formingVis[id] = true
  }
  return { cmdCount: cmdIds.size, cmdVis, formingVis, panelCount: document.querySelectorAll('.war-group-panel').length }
}"""

# 采样全部 g 的 path：M/L 顶点折线插值（Q 角按直线近似，剪两端端口触点）。
SAMPLE = """() => {
  const offenders = []
  let samples = 0
  for (const g of document.querySelectorAll('.war-pipe-svg g')) {
    const on = (g.getAttribute('class') || '').includes('on')
    for (const path of g.querySelectorAll('path')) {
      const d = path.getAttribute('d') || ''
      const subs = d.split('M').filter(s => s.trim() !== '')
      for (const sub of subs) {
        const nums = sub.match(/-?\\d+(?:\\.\\d+)?/g)
        if (nums === null) continue
        const pts = []
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])])
        if (pts.length < 2) continue
        const svg = g.closest('svg')
        const sr = svg.getBoundingClientRect()
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x0, y0] = pts[i]
          const [x1, y1] = pts[i + 1]
          const len = Math.hypot(x1 - x0, y1 - y0)
          const steps = Math.max(2, Math.ceil(len / 8))
          for (let t = 1; t < steps; t++) {
            const k = t / steps
            if (k < 0.06 || k > 0.94) continue  // 修剪端口触点（管贴卡缘进出是合法的）
            const px = sr.x + x0 + (x1 - x0) * k
            const py = sr.y + y0 + (y1 - y0) * k
            samples += 1
            const el = document.elementFromPoint(px, py)
            if (el !== null && el.closest('.war-card') !== null) {
              offenders.push({ g: g.getAttribute('class'), on, px: Math.round(px), py: Math.round(py) })
            }
          }
        }
      }
    }
  }
  return { samples, offenders: offenders.slice(0, 12), offenderCount: offenders.length }
}"""

fails = []
def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (' | ' + detail if detail else ''))
    if not ok:
        fails.append(name)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1720, 'height': 1000})
    page.goto('http://127.0.0.1:3080/', wait_until='domcontentloaded')
    page.evaluate("() => localStorage.setItem('warroom-cfg-view', 'list')")
    page.reload(wait_until='domcontentloaded')
    page.evaluate(DARK_HOLD)
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=30000).click()
    page.wait_for_timeout(1600)
    page.wait_for_selector('.war-dispatch', timeout=20000)
    page.wait_for_timeout(3000)

    # A. 基线普查（纯 DOM）
    c = page.evaluate(CENSUS)
    check('A1 坞内命令锚（去重后）>= 10', c['cmdCount'] >= 10, f"cmdCount={c['cmdCount']}")
    # 候选重试：forming 卡 id=命令 id 只说明「该命令这代有 forming 任务」，
    # 链尾卡的族任务锚却在链头（charlie）——依次 hover，取首个恰好亮 1 管的族。
    candidates = [cid for cid in c['formingVis'] if c['cmdVis'].get(cid)]
    check('A2 存在两端可见的 forming 族', len(candidates) > 0,
          f'candidates={candidates}')
    lit_pick = None
    on_gs = []
    if candidates:
        for cid in candidates[:4]:
            page.hover(f'.war-dispatch [data-pipe-cmd="{cid}"]')
            page.wait_for_timeout(1800)
            on_gs = page.evaluate("""() => Array.from(document.querySelectorAll('.war-pipe-svg g.on')).map(g => g.getAttribute('class'))""")
            if len(on_gs) == 1:
                lit_pick = cid
                break
    check('B1 hover 可见族 → 恰 1 个 g.on', lit_pick is not None,
          f'on={on_gs} candidates_tried={candidates[:4]}')

    if lit_pick is not None:
        s = page.evaluate(SAMPLE)
        check('B2 管线不穿卡（含面板卡）', s['offenderCount'] == 0,
              f"samples={s['samples']} offenders={json.dumps(s['offenders'], ensure_ascii=False)}")

    # C. compose 链尾 hover（组面板开态）
    compose = page.locator('.war-dispatch [data-pipe-cmd$="-f606"]').first
    compose.hover()
    page.wait_for_timeout(2200)
    c2 = page.evaluate(CENSUS)
    check('C1 hover 链尾 → 组面板开', c2['panelCount'] >= 1, f'panel={c2["panelCount"]}')
    hue_ok = page.evaluate("""() => {
      const card = document.querySelector('.war-dispatch [data-pipe-cmd$="-f606"]')
      const hue = Array.from(card.classList).find(cl => cl.startsWith('war-chain-hue-'))
      const ons = Array.from(document.querySelectorAll('.war-pipe-svg g.on'))
      if (ons.length === 0) return 'no-lit (任务锚不在场=合法，面板即族表达)'
      return ons.every(g => g.classList.contains(hue)) ? 'hue-ok' : 'hue-mismatch:' + ons.map(g => g.getAttribute('class'))
    }""")
    check('C1b 亮起族色相=链尾战线色相', str(hue_ok).startswith(('hue-ok', 'no-lit')), f'{hue_ok}')
    s2 = page.evaluate(SAMPLE)
    check('C2 面板开态管线不穿卡（面板卡不做锚）', s2['offenderCount'] == 0,
          f"samples={s2['samples']} offenders={json.dumps(s2['offenders'], ensure_ascii=False)}")

    # D. 残留断言（ae9174b 键撞车回归针）
    page.mouse.move(60, 500)
    page.wait_for_timeout(1200)
    on_after = page.evaluate("""() => document.querySelectorAll('.war-pipe-svg g.on').length""")
    check('D 鼠标离开 → 无 .on 残留', on_after == 0, f'on_after={on_after}')

    b.close()

print('---')
print('RESULT: ' + ('ALL PASS' if not fails else f'FAIL ({len(fails)}): ' + ', '.join(fails)))
sys.exit(0 if not fails else 1)
