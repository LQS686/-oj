'use client'

import { createElement, type ElementType, type ReactNode } from 'react'

/**
 * 语义化页面宽度容器
 *
 * 统一全站用户端页面的有效宽度与侧边内边距，替代散落的
 * `container mx-auto px-4 max-w-*` 写法。
 *
 * 宽度语义（对应 `app/globals.css` 中 `--max-width-page-*` token）：
 *   - `full`      1280px  列表、排行、通知、竞赛顶栏等
 *   - `workspace` 1440px  班级工作台、做题三栏
 *   - `standard`  1024px  题解、设置、用户主页、笔记阅读
 *   - `form`       896px  表单编辑、公告详情、邀请确认
 *
 * 侧边内边距统一为 `px-4 sm:px-6 lg:px-8`。
 * 务必保留 `w-full`，否则在 flex 父级下 `mx-auto` 会导致容器异常收缩。
 */
export type PageContainerVariant = 'full' | 'workspace' | 'standard' | 'form'

export interface PageContainerProps {
  /** 宽度语义，默认 'full' */
  variant?: PageContainerVariant
  /** 渲染的 HTML 标签，默认 'div' */
  as?: ElementType
  /** 追加的自定义类（如 py-6、min-h-screen），不会覆盖 max-w-page-* */
  className?: string
  children?: ReactNode
}

const VARIANT_CLASS: Record<PageContainerVariant, string> = {
  full: 'max-w-page-full',
  workspace: 'max-w-page-workspace',
  standard: 'max-w-page-standard',
  form: 'max-w-page-form',
}

export default function PageContainer({
  variant = 'full',
  as: Tag = 'div',
  className = '',
  children,
}: PageContainerProps) {
  const classes = [
    'w-full',
    'mx-auto',
    'px-4 sm:px-6 lg:px-8',
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return createElement(Tag, { className: classes }, children)
}
