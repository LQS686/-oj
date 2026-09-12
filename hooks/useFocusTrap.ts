'use client'

import { useEffect, type RefObject } from 'react'

/**
 * 可聚焦元素选择器
 * 排除 disabled 与 type=hidden：它们无法被聚焦，
 * 一旦落在首位会导致 focus() 无效、陷阱失效。
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * 取容器内真正可聚焦的元素
 * 再排除被隐藏（display:none / visibility:hidden / hidden 属性）的元素：
 * 这类元素 focus() 同样无效，会导致边界循环失效、键盘焦点漏到弹窗外。
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  )
}

/**
 * 焦点陷阱 hook —— 模态框必备
 *
 * 行为：
 *   1. 激活时把焦点移入容器（首个可聚焦元素，无则容器本身）；
 *   2. Tab / Shift+Tab 在容器内循环；若焦点已在容器之外，直接拉回容器内；
 *   3. 取消激活（关闭）时把焦点还给打开前的元素。
 *
 * 为什么单独抽出来：原先 Modal 的内联实现有两个会失效的点 ——
 *   - 可聚焦查询把 disabled / type=hidden / display:none 也算进去，
 *     首尾元素若是这类元素，focus() 不生效，Tab 会漏出弹窗；
 *   - 只处理「焦点正好在首/末元素」的情形，焦点已经在弹窗外时不会拉回。
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const initial = getFocusableElements(container)
    if (initial.length > 0) initial[0].focus()
    else container.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const items = getFocusableElements(container)
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement as HTMLElement | null

      if (!current || !container.contains(current)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [containerRef, active])
}

export default useFocusTrap
