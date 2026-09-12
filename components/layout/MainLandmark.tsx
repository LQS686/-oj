'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * 主内容地标（main landmark）—— 全站唯一来源
 *
 * 为什么放在根布局，而不是各页面外壳：
 *   站内除 PageShell / AdminLayout 外，还有一批页面自带布局
 *   （首页、题目 / 提交 / 题单详情、认证页、错误页、403 / 404），
 *   若由各页面自己写 <main>，这些页面就会被漏掉 —— 实测 /login 就曾没有 main，
 *   skip link 会指向不存在的锚点。
 *
 * 放在根布局统一包住「页面内容」（不含 Navbar），可保证：
 *   - 每个路由恰好一个 <main>，既不缺失也不嵌套；
 *   - 后台路由改用 AdminLayout 自己的 <main>（侧边栏位于其外），
 *     这样 skip link 才能真正跳过侧边栏导航，而不是停在它前面。
 */
export function MainLandmark({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin') ?? false

  if (isAdmin) return <>{children}</>

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none">
      {children}
    </main>
  )
}

export default MainLandmark
