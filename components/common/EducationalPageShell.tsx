'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { PageShell, type PageWidth } from '@/components/layout'

/**
 * 用户端页面宽度语义（与 PageContainer / CSS token 对齐）
 *
 * 自 2026-09 起，本组件只是 `PageShell` 的兼容层：标题层级、H1 尺寸、
 * 宽度语义统一由 PageShell 决定。新页面请直接使用 PageShell。
 *
 * - default / list → 1280px 列表、排行、通知等
 * - standard       → 1024px 阅读、设置、用户主页、题解
 * - workspace      → 1440px 班级工作台、做题三栏
 * - narrow         → 896px  公告详情、邀请确认等窄阅读
 * - bleed / full   → 仅统一边距，不限宽（极少用；班级请优先用 workspace）
 */
export type EducationalPageWidth =
  'default' | 'list' | 'standard' | 'workspace' | 'narrow' | 'full' | 'bleed'

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
  /** 视觉隐藏 H1：仅当页面内已提供等价可见标题（如用户资料卡）时使用 */
  visuallyHiddenTitle?: boolean
}

const WIDTH_MAP: Record<EducationalPageWidth, PageWidth> = {
  default: 'full',
  list: 'full',
  standard: 'standard',
  workspace: 'workspace',
  narrow: 'form',
  full: 'bleed',
  bleed: 'bleed',
}

/**
 * 教学向页面外壳（PageShell 的兼容别名）。
 *
 * 历史问题已修复：
 *   - 原先 `icon` / `iconClassName` / `description` 被接收后静默丢弃，现正常渲染。
 *   - 原先 H1 在桌面端被 `sm:hidden` 隐藏（display:none，同时移出无障碍树），
 *     导致列表页没有任何可用标题；现改为始终可见，大小统一为 text-page-title。
 *   - 原先 `showTitle` 只影响移动端，语义混乱，已移除。
 */
export function EducationalPageShell({
  title,
  description,
  icon,
  iconClassName,
  actions,
  backHref,
  backLabel,
  toolbar,
  children,
  width = 'default',
  className = '',
  visuallyHiddenTitle = false,
}: EducationalPageShellProps) {
  return (
    <PageShell
      title={title}
      description={description}
      icon={icon}
      iconClassName={iconClassName}
      actions={actions}
      backHref={backHref}
      backLabel={backLabel}
      toolbar={toolbar}
      width={WIDTH_MAP[width]}
      className={className}
      visuallyHiddenTitle={visuallyHiddenTitle}
    >
      {children}
    </PageShell>
  )
}
