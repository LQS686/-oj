/**
 * 浏览器标签标题的可靠写入（lib/document-title-assert.ts）
 *
 * 背景：Next.js App Router 把 layout/page 的 `metadata` 渲染成 React 元素并提升
 * （hoist）到 <head>。此后任何一次重渲染（Context 数据到达、状态更新等）都会让
 * React **重新断言**该 <title>，覆盖掉此前由客户端写入的值。
 * 症状：客户端设置的标题会「莫名回到」上一页或站点默认标题。
 *
 * 对策：写入后在一小段窗口内幂等地重复断言（值确定，重复写入无副作用），
 * 等 React 稳定后最终生效。返回取消函数，务必在卸载时调用，
 * 避免定时器在已离开的页面上写入过期标题。
 */

/** 重复断言的时机（毫秒）。覆盖首帧 + 典型的数据到达与重渲染窗口。 */
export const TITLE_ASSERT_DELAYS_MS = [0, 150, 400, 900]

export function assertDocumentTitle(value: string): () => void {
  if (typeof document === 'undefined') return () => {}

  const apply = () => {
    if (document.title !== value) document.title = value
  }

  apply()
  const timers = TITLE_ASSERT_DELAYS_MS.map((ms) => window.setTimeout(apply, ms))
  return () => timers.forEach((t) => window.clearTimeout(t))
}
