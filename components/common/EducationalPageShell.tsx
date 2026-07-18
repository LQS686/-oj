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
 * 教学向页面外壳：统一间距与信息密度，避免营销式大留白。
 *
 * 标题策略：
 * - 桌面端：顶部导航栏 NavLinks 已高亮当前页面，不再渲染 H1 标题，避免重复
 * - 移动端：导航栏菜单折叠，需要在页面顶部显示 H1 标题标识当前位置（sm:hidden）
 *
 * 工具栏与操作按钮：
 * - 若同时存在 toolbar 和 actions，桌面端合并为一行（toolbar 在左，actions 在右）
 * - 移动端自动堆叠，避免挤压
 * - 若只有 actions，右对齐显示
 */
export function EducationalPageShell({
  title,
  // 以下 prop 保留但不再在桌面端渲染（向后兼容）
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

        {/* 移动端标题：桌面端导航栏已高亮当前页面，无需重复；移动端导航菜单折叠，需要 H1 标识 */}
        <h1 className="sm:hidden text-lg font-bold text-foreground mb-4">{title}</h1>

        {/* 工具栏 + 操作按钮：合并为一行，避免 actions 孤立成行 */}
        {(toolbar || actions) && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
            {toolbar && (
              <div className="sm:flex-1 min-w-0">{toolbar}</div>
            )}
            {actions && (
              <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
                {actions}
              </div>
            )}
          </div>
        )}

        <div>
          {children}
        </div>
      </div>
    </div>
  )
}