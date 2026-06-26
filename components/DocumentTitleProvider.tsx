'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { formatPageDocumentTitle, resolvePageTitle } from '@/lib/page-titles'

/** 子页面会用专用 hook / generateMetadata 设置更具体标题的路由 */
function skipPathnameTitle(pathname: string): boolean {
  const path = pathname.split('?')[0]
  const patterns = [
    /^\/problem\/[^/]+$/,
    /^\/contests\/[^/]+\/problems\/[^/]+$/,
    /^\/training\/[^/]+\/problems\/[^/]+$/,
    /^\/contests\/[^/]+$/, // 竞赛详情（服务端 generateMetadata）
    /^\/classes\/[^/]+\/assignments\/[^/]+$/,
    /^\/training\/[^/]+$/,
    /^\/classes\/[^/]+$/,
    /^\/announcements\/[^/]+$/,
    /^\/submission\/[^/]+$/,
    /^\/user\/[^/]+$/,
    /^\/problems\/[^/]+\/solutions(\/|$)/,
    /^\/admin\/problems\/[^/]+\/(edit|testcases)$/,
    /^\/admin\/trainings\/[^/]+$/,
    /^\/classes\/[^/]+\/notes\/[^/]+$/,
  ]
  return patterns.some((re) => re.test(path))
}

/**
 * 路由变化时同步浏览器标签标题（静态/模式路由）
 */
export default function DocumentTitleProvider() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || skipPathnameTitle(pathname)) return
    const pageTitle = resolvePageTitle(pathname)
    document.title = formatPageDocumentTitle(pageTitle)
  }, [pathname])

  return null
}