import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeCopy, plainCopy, setSkin, skinId, subscribeSkin, toggleSkin, trekCopy, warCopy, type SkinId } from '../src/client/copy.ts'

/** 皮肤 store 是纯函数层（不引 react/node 专属 API）——node 直测；
 * localStorage 经 typeof 守卫，node 无 localStorage 时缺省星际迷航皮肤。
 * V16 词表派生：星际迷航皮肤 = 军事词典整体过 TREK_LEXICON（词典单一源）。 */

test('皮肤基础：plainCopy 与 warCopy 在关键字段上确实换词（角色扮演出口）', () => {
  assert.equal(warCopy.outcome.succeeded.label, '打赢了')
  assert.equal(plainCopy.outcome.succeeded.label, '已完成')
  assert.equal(plainCopy.outcome.reported.label, '待验收')
  assert.equal(plainCopy.taskStatus.reported, '待验收')
  assert.equal(plainCopy.taskStatus.closed, '已完成')
  // 军事词典保留旧词表（V16 词表派生的源）：战利品/作战室/元首原样。
  assert.equal(warCopy.focusPage.lootLabel, '战利品')
  assert.equal(warCopy.head.title, '作战室')
  assert.equal(plainCopy.focusPage.lootLabel, '交付')
  assert.equal(plainCopy.head.title, '作战室')
})

test('V16 词表派生：trekCopy 全面换用星际迷航词（舰长/大副/外勤小队/星球/任务令/舰桥）', () => {
  assert.equal(trekCopy.head.title, '舰桥')
  assert.equal(trekCopy.focusPage.lootLabel, '任务产出')
  // 词表派生不漏角色词：任意含旧词的串都必须被换掉。
  const stale: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const w of ['元首', '参谋', '指挥官', '悬赏', '战报', '战利品', '母舰', '作战室', '战场']) {
        if (v.includes(w)) stale.push(`${w}: ${v.slice(0, 40)}`)
      }
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk)
  }
  walk(trekCopy)
  assert.deepEqual(stale, [], `trekCopy 仍有旧词残留: ${stale.slice(0, 5)}`)
  // 机制词不随皮肤变：工具名/战线/星域保留。
  assert.ok(JSON.stringify(trekCopy).includes('战线'))
})

test('皮肤 store：缺省 trek；切换/回切生效并通知订阅者；持久化失败不炸', () => {
  // node 无 localStorage → storedSkin 走 typeof 守卫回 'trek'。
  assert.equal(skinId(), 'trek')
  assert.equal(activeCopy(), trekCopy)
  let fired = 0
  const off = subscribeSkin(() => { fired += 1 })
  // 切到同名是幂等 no-op（不通知）。
  setSkin('trek')
  assert.equal(fired, 0)
  setSkin('war')
  assert.equal(fired, 1)
  assert.equal(skinId(), 'war')
  assert.equal(activeCopy(), warCopy)
  assert.equal(activeCopy().focusPage.lootLabel, '战利品')
  setSkin('plain')
  assert.equal(fired, 2)
  assert.equal(activeCopy().outcome.succeeded.label, '已完成')
  toggleSkin()
  assert.equal(fired, 3)
  assert.equal(skinId() satisfies SkinId, 'trek')
  off()
  setSkin('plain')
  assert.equal(fired, 3)
  // 还原缺省，避免影响同进程其他测试。
  setSkin('trek')
})
