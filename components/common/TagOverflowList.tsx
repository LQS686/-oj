'use client'

import { useLayoutEffect, useRef, useState } from 'react'

const GAP_PX = 6
const ELLIPSIS_WIDTH_PX = 22

/**
 * 单行标签列表：尽量展示完整标签，剩余部分折叠为 “…”；
 * 容器任意位置悬停均可通过 title 查看全部标签。
 */
export default function TagOverflowList({
  tags,
  className = '',
  tagClassName = '',
  ellipsisClassName = '',
}: {
  tags: string[]
  className?: string
  tagClassName?: string
  ellipsisClassName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const items = [...el.querySelectorAll<HTMLElement>('[data-tag-item]')]
      if (items.length === 0) return

      const available = el.clientWidth
      let used = 0
      let count = 0
      for (let i = 0; i < items.length; i++) {
        const width = items[i].getBoundingClientRect().width
        const next = used + (count > 0 ? GAP_PX : 0) + width
        const hasMore = i < items.length - 1
        if (next + (hasMore ? GAP_PX + ELLIPSIS_WIDTH_PX : 0) <= available) {
          used = next
          count++
        } else {
          break
        }
      }
      setVisibleCount((prev) => (prev === count ? prev : count))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tags])

  if (tags.length === 0) return null

  const fullText = tags.join('、')
  return (
    <div
      ref={containerRef}
      className={`relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap ${className}`}
      title={fullText}
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          data-tag-item
          className={`shrink-0 ${tagClassName}`}
          style={
            index >= visibleCount
              ? { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }
              : undefined
          }
        >
          {tag}
        </span>
      ))}
      {visibleCount < tags.length && (
        <span
          className={`shrink-0 cursor-help ${ellipsisClassName}`}
          aria-label={`还有 ${tags.length - visibleCount} 个标签：${tags.slice(visibleCount).join('、')}`}
        >
          …
        </span>
      )}
    </div>
  )
}
