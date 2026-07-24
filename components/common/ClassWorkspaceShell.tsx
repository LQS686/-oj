'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { EducationalPageShell, type EducationalPageWidth } from './EducationalPageShell'

export interface ClassNavItem {
  href: string
  label: string
  match?: 'exact' | 'prefix'
  tab?: string
}

export interface ClassWorkspaceShellProps {
  classId: string
  className?: string
  title: string
  description?: ReactNode
  icon?: LucideIcon
  iconClassName?: string
  actions?: ReactNode
  navItems?: ClassNavItem[]
  toolbar?: ReactNode
  children: ReactNode
  /** 默认 workspace（1440px），与班级概览一致 */
  width?: EducationalPageWidth
  showBack?: boolean
}

export const classOverviewNav = (classId: string): ClassNavItem[] => [
  { href: `/classes/${classId}`, label: '概览', match: 'exact', tab: 'overview' },
  { href: `/classes/${classId}`, label: '管理', match: 'exact', tab: 'manage' },
]

function isNavActive(pathname: string, classId: string, tab: string | null, item: ClassNavItem): boolean {
  const base = `/classes/${classId}`
  const onClassHome = pathname === base || pathname === `${base}/`
  if (!onClassHome) return false
  if (item.tab === 'manage') return tab === 'manage'
  return tab !== 'manage'
}

export function ClassWorkspaceShell({
  classId,
  className: _classTitle,
  title,
  description,
  icon,
  iconClassName,
  actions,
  navItems,
  toolbar,
  children,
  width = 'workspace',
  showBack = false,
}: ClassWorkspaceShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const items = navItems ?? classOverviewNav(classId)

  const nav = (
    <nav className="flex gap-1 border-b border-border" aria-label="班级功能导航">
      {items.map((item) => {
        const active = isNavActive(pathname, classId, tab, item)
        const href =
          item.tab === 'manage' ? `/classes/${classId}?tab=manage` : `/classes/${classId}`
        return (
          <Link
            key={item.label}
            href={href}
            scroll={false}
            prefetch
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <EducationalPageShell
      title={title}
      description={description}
      icon={icon}
      iconClassName={iconClassName}
      actions={actions}
      backHref={showBack ? '/classes' : undefined}
      backLabel="返回班级列表"
      toolbar={
        <div className="space-y-3">
          {nav}
          {toolbar}
        </div>
      }
      width={width}
    >
      {children}
    </EducationalPageShell>
  )
}
