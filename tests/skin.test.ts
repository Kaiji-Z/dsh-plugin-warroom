import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeCopy, plainCopy, setSkin, skinId, subscribeSkin, toggleSkin, warCopy, type SkinId } from '../src/client/copy.ts'

/** 皮肤 store 是纯函数层（不引 react/node 专属 API）——node 直测；
 * localStorage 经 typeof 守卫，node 无 localStorage 时缺省军事皮肤。 */

test('皮肤基础：plainCopy 与 warCopy 在关键字段上确实换词（角色扮演出口）', () => {
  assert.equal(warCopy.outcome.succeeded.label, '打赢了')
  assert.equal(plainCopy.outcome.succeeded.label, '已完成')
  assert.equal(plainCopy.outcome.reported.label, '待验收')
  assert.equal(plainCopy.taskStatus.reported, '待验收')
  assert.equal(plainCopy.taskStatus.closed, '已完成')
  assert.equal(warCopy.focusPage.lootLabel, '战利品')
  assert.equal(plainCopy.focusPage.lootLabel, '交付')
  // 品牌词与机制词保留：作战室仍在，工具名/协议词汇不换。
  assert.equal(plainCopy.head.title, '作战室')
})

test('皮肤 store：缺省 war；切换/回切生效并通知订阅者；持久化失败不炸', () => {
  // node 无 localStorage → storedSkin 走 typeof 守卫回 'war'。
  assert.equal(skinId(), 'war')
  assert.equal(activeCopy(), warCopy)
  let fired = 0
  const off = subscribeSkin(() => { fired += 1 })
  // 切到同名是幂等 no-op（不通知）。
  setSkin('war')
  assert.equal(fired, 0)
  setSkin('plain')
  assert.equal(fired, 1)
  assert.equal(skinId(), 'plain')
  assert.equal(activeCopy(), plainCopy)
  assert.equal(activeCopy().outcome.succeeded.label, '已完成')
  toggleSkin()
  assert.equal(fired, 2)
  assert.equal(skinId() satisfies SkinId, 'war')
  off()
  setSkin('plain')
  assert.equal(fired, 2)
  // 还原缺省，避免影响同进程其他测试。
  setSkin('war')
})
