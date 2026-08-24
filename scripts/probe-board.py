"""Race hunter: click the warroom row, poll the activation sequence, tag nodes."""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3080"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for run in range(1, 4):
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("[data-dsh-warroom-entry]", timeout=15000)

        # instrument: tag the CURRENT row node + count clicks that reach it
        page.evaluate("""(() => {
          const r = document.querySelector('[data-dsh-warroom-entry]')
          r.setAttribute('data-probe-tag', 't1')
          window.__warClicks = 0
          r.addEventListener('click', () => { window.__warClicks += 1 })
        })()""")
        page.wait_for_timeout(1200)  # let React settle / possibly re-render sidebar

        still_tagged = page.evaluate("document.querySelector('[data-dsh-warroom-entry]')?.getAttribute('data-probe-tag') ?? 'node-replaced-or-gone'")
        page.click("[data-dsh-warroom-entry]")

        seq = []
        for _ in range(20):
            seq.append(page.evaluate("document.documentElement.getAttribute('data-dsh-warroom-active')"))
            page.wait_for_timeout(100)
        clicks = page.evaluate("window.__warClicks")
        tag_after = page.evaluate("document.querySelector('[data-dsh-warroom-entry]')?.getAttribute('data-probe-tag') ?? 'node-replaced-or-gone'")
        # collapse the sequence to transitions
        trans = [seq[0]] + [seq[i] for i in range(1, len(seq)) if seq[i] != seq[i - 1]]
        print(f"run {run}: tagged_before_click={still_tagged} clicks_reached_row={clicks} tag_after={tag_after} attr_seq={[('set' if v is not None else 'none') for v in trans]} errors={errors or 'none'}")
        page.close()
    browser.close()
