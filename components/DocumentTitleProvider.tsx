'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { formatPageDocumentTitle, resolvePageTitle } from '@/lib/page-titles'
import { assertDocumentTitle } from '@/lib/document-title-assert'

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
    // 仅题解列表页自行设置富标题（含题目上下文）；
    // /solutions/new 与 /solutions/[id] 交给 lib/page-titles.ts 规则，
    // 否则这些页面无人设置标题，会停留在上一页的标题上。
    /^\/problems\/[^/]+\/solutions$/,
  ]
  return patterns.some((re) => re.test(path))
}

/**
 * 路由变化时同步浏览器标签标题。
 *
 * 写入采用 assertDocumentTitle：Next.js 会把 layout/page 的 `metadata` 提升到
 * <head> 并在重渲染时重新断言，单次写入会被稍晚的重渲染覆盖——这正是历史上
 * 「/reset-password 显示首页」「后台子页永远显示栏目名」的根因。
 *
 * 跳过的路由不做任何写入，把标题让给页面自己的 hook
 * （useDocumentTitle / useProblemDocumentTitle）。
 */
export default function DocumentTitleProvider() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || skipPathnameTitle(pathname)) return
    return assertDocumentTitle(formatPageDocumentTitle(resolvePageTitle(pathname)))
  }, [pathname])

  return null
}
