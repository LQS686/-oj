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
  
  // 定义路径映射
  const pathMap: Record<string, string> = {
    '/': '首页',
    '/problems': '题库',
    '/contests': '竞赛',
    '/training': '训练',
    '/teams': '团队',
    '/discuss': '社区',
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

  // 生成面包屑项
  const generateBreadcrumbItems = (): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = []
    const pathSegments = pathname.split('/').filter(segment => segment)
    
    // 添加首页
    items.push({ label: pathMap['/'], href: '/' })
    
    // 构建路径
    let currentPath = ''
    
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`
      
      // 检查是否是数字ID
      if (!isNaN(Number(segment)) && index > 0) {
        // 对于ID，使用前一个路径的标签加上"详情"
        const prevPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
        const prevLabel = pathMap[prevPath] || segment
        items.push({ label: `${prevLabel}详情`, href: currentPath })
      } else if (pathMap[currentPath]) {
        // 直接使用映射的标签
        items.push({ label: pathMap[currentPath], href: currentPath })
      } else {
        // 对于没有映射的路径，使用路径段
        items.push({ label: segment.charAt(0).toUpperCase() + segment.slice(1), href: currentPath })
      }
    })
    
    return items
  }

  const breadcrumbItems = generateBreadcrumbItems()

  return (
    <nav className="flex items-center gap-2 py-3 px-4 bg-gray-50 border-b border-gray-200">
      <div className="container mx-auto flex items-center gap-2">
        {breadcrumbItems.map((item, index) => (
          <React.Fragment key={item.href}>
            {index > 0 && (
              <span className="text-gray-400">/</span>
            )}
            {index === breadcrumbItems.length - 1 ? (
              <span className="text-gray-600 font-medium">{item.label}</span>
            ) : (
              <Link 
                href={item.href} 
                className="text-blue-600 hover:underline"
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
