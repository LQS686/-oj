'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

export interface EducationalPageShellProps {
  /** 页面主标题 */
  title: string
  /** 副标题 / 统计说明 */
  description?: ReactNode
  /** 标题左侧图标 */
  icon?: LucideIcon
  /** 图标容器背景，默认 primary 扁平色 */
  iconClassName?: string
  /** 右上角操作区 */
  actions?: ReactNode
  /** 返回链接（班级子页等） */
  backHref?: string
  backLabel?: string
  /** 标题下方的工具条（筛选、Tab） */
  toolbar?: ReactNode
  children: ReactNode
  /** 默认 container；narrow 用于通知等 */
  width?: 'default' | 'narrow' | 'full'
  className?: string
}

const widthClass = {
  default: 'container mx-auto px-4 py-6 md:py-8',
  narrow: 'container mx-auto px-4 py-6 md:py-8 max-w-4xl',
  full: 'w-full px-4 py-6 md:py-8',
}

/**
 * 教学向页面外壳：统一标题区、间距与信息密度，避免营销式大留白。
 */
export function EducationalPageShell({
  title,
  description,
  icon: Icon,
  iconClassName = 'bg-primary text-primary-foreground',
  actions,
  backHref,
  backLabel = '返回',
  toolbar,
  children,
  width = 'default',
  className = '',
}: EducationalPageShellProps) {
  return (
    <div className={`min-h-screen bg-background ${className}`}>
      <div className={widthClass[width]}>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4 transition-all duration-200 hover:translate-x-[-2px]"
          >
            {backLabel}
          </Link>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClassName}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">{title}</h1>
              {description != null && (
                <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>

        {toolbar && <div className="mb-6">{toolbar}</div>}

        <div>
          {children}
        </div>
      </div>
    </div>
  )
}