'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface BreadcrumbItem {
  label: string
  href: string
}

export default function Breadcrumb() {
  const pathname = usePathname()

  const pathMap: Record<string, string> = {
    '/': '首页',
    '/problems': '题库',
    '/contests': '竞赛',
    '/training': '训练',
    '/classes': '班级',
    '/rank': '排行榜',
    '/submissions': '提交记录',
    '/admin': '后台管理',
    '/user': '用户',
    '/profile': '个人主页',
    '/settings': '设置',
    '/notifications': '通知',
    '/login': '登录',
    '/register': '注册',
  }

  const generateBreadcrumbItems = (): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = []
    const pathSegments = pathname.split('/').filter(segment => segment)

    items.push({ label: pathMap['/'], href: '/' })

    let currentPath = ''

    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`

      if (!isNaN(Number(segment)) && index > 0) {
        const prevPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
        const prevLabel = pathMap[prevPath] || segment
        items.push({ label: `${prevLabel}详情`, href: currentPath })
      } else if (pathMap[currentPath]) {
        items.push({ label: pathMap[currentPath], href: currentPath })
      } else {
        items.push({ label: segment.charAt(0).toUpperCase() + segment.slice(1), href: currentPath })
      }
    })

    return items
  }

  const breadcrumbItems = generateBreadcrumbItems()

  return (
    <nav className="flex items-center gap-2 py-2 px-4 bg-background-secondary border-b border-border">
      <div className="container mx-auto flex items-center gap-2 text-sm">
        {breadcrumbItems.map((item, index) => (
          <React.Fragment key={item.href}>
            {index > 0 && (
              <span className="text-muted-foreground">/</span>
            )}
            {index === breadcrumbItems.length - 1 ? (
              <span className="text-foreground font-medium">{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="text-primary hover:underline"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </div>
    </nav>
  )
}
