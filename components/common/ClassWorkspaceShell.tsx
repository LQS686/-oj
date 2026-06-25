'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { EducationalPageShell } from './EducationalPageShell'

export interface ClassNavItem {
  href: string
  label: string
  /** 精确匹配或前缀匹配（默认前缀，首页仅精确） */
  match?: 'exact' | 'prefix'
}

export interface ClassWorkspaceShellProps {
  classId: string
  className?: string
  title: string
  description?: ReactNode
  icon?: LucideIcon
  iconClassName?: string
  actions?: ReactNode
  /** 覆盖默认班级导航 */
  navItems?: ClassNavItem[]
  toolbar?: ReactNode
  children: ReactNode
  width?: 'default' | 'narrow' | 'full'
}

const defaultNav = (classId: string): ClassNavItem[] => [
  { href: `/classes/${classId}`, label: '概览', match: 'exact' },
  { href: `/classes/${classId}/assignments`, label: '作业', match: 'prefix' },
  { href: `/classes/${classId}/problems`, label: '题目', match: 'prefix' },
  { href: `/classes/${classId}/notes`, label: '笔记', match: 'prefix' },
  { href: `/classes/${classId}/members`, label: '成员', match: 'prefix' },
  { href: `/classes/${classId}/points`, label: '积分', match: 'prefix' },
  { href: `/classes/${classId}/manage`, label: '管理', match: 'prefix' },
]

function isNavActive(pathname: string, item: ClassNavItem): boolean {
  if (item.match === 'exact') {
    return pathname === item.href || pathname === `${item.href}/`
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/**
 * 班级教学工作区：班级列表返回 + 横向功能导航 + 统一标题区。
 */
export function ClassWorkspaceShell({
  classId,
  className: classTitle,
  title,
  description,
  icon,
  iconClassName,
  actions,
  navItems,
  toolbar,
  children,
  width = 'default',
}: ClassWorkspaceShellProps) {
  const pathname = usePathname()
  const items = navItems ?? defaultNav(classId)

  const nav = (
    <nav
      className="flex flex-wrap gap-1 border-b border-border pb-0 -mb-px"
      aria-label="班级功能导航"
    >
      {items.map((item) => {
        const active = isNavActive(pathname, item)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors rounded-t-md ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const combinedToolbar = (
    <div className="space-y-4">
      {nav}
      {toolbar}
    </div>
  )

  return (
    <EducationalPageShell
      title={title}
      description={description ?? (classTitle ? `班级：${classTitle}` : undefined)}
      icon={icon}
      iconClassName={iconClassName}
      actions={actions}
      backHref="/classes"
      backLabel="返回班级列表"
      toolbar={combinedToolbar}
      width={width}
    >
      {children}
    </EducationalPageShell>
  )
}