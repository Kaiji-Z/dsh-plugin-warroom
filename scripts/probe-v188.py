# -*- coding: utf-8 -*-
"""V18.8 composer probe: fused planet->front selector + alarm scheduling + templates."""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

OUT = '.goal/evidence/v18'
BASE = 'http://127.0.0.1:3080'


def api(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.load(r)


board = api('/warroom/api/board')
planets = sorted({t['workspacePath'] for t in board.get('tasks', []) if t.get('workspacePath')})
print('planets on board:', len(planets))

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1720, 'height': 980})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000).click()
    page.wait_for_timeout(1500)
    page.wait_for_selector('.war-dispatch', timeout=20000)

    page.locator('.war-dispatch-add').click()
    page.wait_for_selector('.war-composer-modal', timeout=3000)
    page.wait_for_timeout(300)

    # structure
    assert page.locator('.war-tpl').count() == 5, 'template chips x5'
    assert page.locator('[data-war-bf-auto]').count() == 1, 'planet auto chip'
    assert page.locator('[data-war-bf]').count() >= 1, 'planet chips'
    assert page.locator('[data-war-front-pick]').count() == 0, 'front rows hidden before planet pick'
    assert page.locator('.war-recent-toggle, .war-recent-item').count() == 0, 'recent retired'
    assert page.locator('.war-cron-presets').count() == 0, 'cron presets retired'
    page.screenshot(path=f'{OUT}/v188-composer-initial.png')

    # template fills textarea
    page.locator('.war-tpl').first.click()
    assert page.locator('.war-composer').input_value() != '', 'template did not fill draft'

    # planet pick -> front chips (new front on by default)
    page.locator('[data-war-bf]').first.click()
    page.wait_for_timeout(150)
    nfront = page.locator('[data-war-front-pick]').count()
    assert page.locator('[data-war-front-new]').count() == 1, 'front-new chip missing'
    print('front chips after planet pick:', nfront)
    page.screenshot(path=f'{OUT}/v188-composer-planet.png')

    # front pick highlights
    if nfront > 0:
        page.locator('[data-war-front-pick]').first.click()
        page.wait_for_timeout(150)
        onchips = page.locator('.war-continue-chip.on[data-war-front-pick]').count()
        assert onchips == 1, f'front pick highlight expected 1, got {onchips}'
        # planet chip must be on too (fused control)
        assert page.locator('.war-continue-chip.on[data-war-bf]').count() == 1, 'planet not highlighted with front'
        # back to new front
        page.locator('[data-war-front-new]').click()
        page.wait_for_timeout(100)
        assert page.locator('.war-continue-chip.on[data-war-front-new]').count() == 1

    # auto chip clears
    page.locator('[data-war-bf-auto]').click()
    page.wait_for_timeout(100)
    assert page.locator('[data-war-front-pick]').count() == 0, 'front block must close on auto'

    # alarm: default mode once -> date+time visible
    page.locator('.war-sched-card', has_text='定时').click()
    page.wait_for_timeout(150)
    assert page.locator('.war-alarm-mode').count() == 4, 'alarm modes x4'
    assert page.locator('.war-alarm-date').count() == 1 and page.locator('.war-alarm-time').count() == 1, 'once shows date+time'
    assert page.locator('.war-cron-next').count() == 1, 'next-run preview for valid default alarm'
    page.screenshot(path=f'{OUT}/v188-composer-alarm-once.png')

    # invalid past date -> inline error + disabled submit
    page.locator('.war-alarm-date').fill('2020-01-01')
    page.wait_for_timeout(150)
    assert page.locator('.war-err').count() >= 1, 'past-time error missing'
    assert page.locator('.war-modal-actions button.primary').is_disabled(), 'submit must disable on past once'

    # daily -> date gone, time stays
    page.locator('[data-war-alarm="daily"]').click()
    page.wait_for_timeout(150)
    assert page.locator('.war-alarm-date').count() == 0 and page.locator('.war-alarm-time').count() == 1
    assert page.locator('.war-cron-next').count() == 1, 'daily next preview'

    # weekly -> dow chips; uncheck all -> submit disabled; cron adv reflects
    page.locator('[data-war-alarm="weekly"]').click()
    page.wait_for_timeout(150)
    assert page.locator('.war-dow-row .war-dow').count() == 7, 'dow chips x7'
    page.screenshot(path=f'{OUT}/v188-composer-alarm-weekly.png')
    # 周一默认已开（dows=[1]）——点掉它=零选中；cron 空 → 无预览 + 提交禁用。
    page.locator('.war-dow-row .war-dow').nth(0).click()
    page.wait_for_timeout(150)
    assert page.locator('.war-dow-row .war-dow.on').count() == 0, 'all dows off'
    assert page.locator('.war-cron-next').count() == 0, 'zero dows = empty cron, no preview'
    assert page.locator('.war-modal-actions button.primary').is_disabled(), 'zero dows must disable submit'
    page.locator('.war-dow-row .war-dow').nth(0).click()  # 复开周一（后续每周提交流程用）
    page.wait_for_timeout(150)

    # advanced override: bad cron -> error; good cron -> preview
    page.locator('.war-cron-adv summary').click()
    page.locator('.war-cron-input').fill('99 * * * *')
    page.wait_for_timeout(150)
    assert page.locator('.war-err').count() >= 1, 'bad cron error missing'
    assert page.locator('.war-modal-actions button.primary').is_disabled(), 'bad cron must disable submit'
    page.locator('.war-cron-input').fill('0 9 * * *')
    page.wait_for_timeout(150)
    assert page.locator('.war-cron-next').count() == 1, 'override next preview'
    page.screenshot(path=f'{OUT}/v188-composer-advanced.png')

    # submit a scheduled command end-to-end
    page.locator('.war-composer').fill('V188 探针：每周一早看看依赖有没有新版本')
    page.locator('.war-alarm-mode', has_text='每周').click()
    page.wait_for_timeout(100)
    page.locator('.war-modal-actions button.primary').click()
    page.wait_for_selector('.war-command-card:has-text("V188 探针")', timeout=8000)

    # trek + plain skins: composer wording rides lexicon
    for skin, expect_auto, expect_front in [('trek', '大副', '战线'), ('plain', '自动', '事项线')]:
        page.evaluate(f"() => localStorage.setItem('warroom-skin', '{skin}')")
        page.reload(wait_until='domcontentloaded')
        page.wait_for_selector('[data-dsh-warroom-entry]', timeout=15000).click()
        page.wait_for_timeout(1200)
        page.wait_for_selector('.war-dispatch', timeout=15000)
        page.locator('.war-dispatch-add').click()
        page.wait_for_selector('.war-composer-modal', timeout=3000)
        page.wait_for_timeout(200)
        auto_txt = page.locator('[data-war-bf-auto]').inner_text()
        assert expect_auto in auto_txt, f'{skin} auto chip wording: {auto_txt}'
        page.locator('.war-sched-card', has_text='定').click()
        page.wait_for_timeout(100)
        assert page.locator('.war-alarm-mode').count() == 4, f'{skin} alarm modes'
        page.screenshot(path=f'{OUT}/v188-composer-{skin}.png')
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)

    assert not errors, f'pageerrors: {errors}'
    print('PROBE-V188: ALL PASS')
    browser.close()
