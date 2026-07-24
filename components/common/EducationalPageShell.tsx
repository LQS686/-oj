'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { PageContainer, type PageContainerVariant } from '@/components/layout'

/**
 * 用户端页面宽度语义（与 PageContainer / CSS token 对齐）
 * - default / list → 1280px 列表、排行、通知等
 * - standard       → 1024px 阅读、设置、用户主页、题解
 * - workspace      → 1440px 班级工作台、做题三栏
 * - narrow         → 896px  公告详情、邀请确认等窄阅读
 * - bleed / full   → 仅统一边距，不限宽（极少用；班级请优先用 workspace）
 */
export type EducationalPageWidth =
  | 'default'
  | 'list'
  | 'standard'
  | 'workspace'
  | 'narrow'
  | 'full'
  | 'bleed'

export interface EducationalPageShellProps {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  iconClassName?: string
  actions?: ReactNode
  backHref?: string
  backLabel?: string
  toolbar?: ReactNode
  children: ReactNode
  width?: EducationalPageWidth
  className?: string
}

const WIDTH_TO_VARIANT: Record<
  Exclude<EducationalPageWidth, 'full' | 'bleed'>,
  PageContainerVariant
> = {
  default: 'full',
  list: 'full',
  standard: 'standard',
  workspace: 'workspace',
  narrow: 'form',
}

function isBleed(width: EducationalPageWidth): boolean {
  return width === 'full' || width === 'bleed'
}

/**
 * 教学向页面外壳：统一宽度、边距与信息密度。
 *
 * 标题策略：
 * - 桌面端：顶部导航已高亮当前页，不重复渲染 H1
 * - 移动端：显示 H1（sm:hidden）
 */
export function EducationalPageShell({
  title,
  description: _description,
  icon: _Icon,
  iconClassName: _iconClassName = 'bg-primary text-primary-foreground',
  actions,
  backHref,
  backLabel = '返回',
  toolbar,
  children,
  width = 'default',
  className = '',
}: EducationalPageShellProps) {
  const body = (
    <>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3 transition-all duration-200 hover:translate-x-[-2px]"
        >
          {backLabel}
        </Link>
      )}

      <h1 className="sm:hidden text-lg font-bold text-foreground mb-3">{title}</h1>

      {(toolbar || actions) && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          {toolbar && <div className="sm:flex-1 min-w-0">{toolbar}</div>}
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">{actions}</div>
          )}
        </div>
      )}

      <div>{children}</div>
    </>
  )

  return (
    <div className={`min-h-[calc(100vh-var(--navbar-height))] bg-background ${className}`}>
      {isBleed(width) ? (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 md:py-6">{body}</div>
      ) : (
        <PageContainer variant={WIDTH_TO_VARIANT[width as keyof typeof WIDTH_TO_VARIANT]} className="py-4 md:py-6">
          {body}
        </PageContainer>
      )}
    </div>
  )
}
