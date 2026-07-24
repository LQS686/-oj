'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * 客户端路由切换时顶部细进度条，提升 SPA 导航反馈。
 * - 捕获同源 <a> 点击开始加载
 * - pathname/search 变化时收尾
 */
function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const prevKey = useRef(routeKey)
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement | null)?.closest?.('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return
      }

      try {
        const url = new URL(href, window.location.href)
        if (url.origin !== window.location.origin) return
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return
        }
        setVisible(true)
        setProgress(14)
      } catch {
        // ignore invalid href
      }
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (prevKey.current === routeKey) return
    prevKey.current = routeKey
    setProgress(100)
    setVisible(true)
    const hide = window.setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 220)
    return () => window.clearTimeout(hide)
  }, [routeKey])

  useEffect(() => {
    if (!visible || progress >= 100) return
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p
        return Math.min(92, p + 4 + Math.random() * 6)
      })
    }, 180)
    return () => window.clearInterval(id)
  }, [visible, progress])

  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0"
      style={{ zIndex: 'var(--z-toast)' }}
      aria-hidden
    >
      <div
        className="h-[2px] bg-primary shadow-[0_0_8px_rgba(79,106,232,0.45)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  )
}
