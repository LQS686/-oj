'use client'

import { createElement, type ElementType, type ReactNode } from 'react'

/**
 * 语义化页面宽度容器
 *
 * 统一全站用户端页面的有效宽度与侧边内边距，替代散落的
 * `container mx-auto px-4 max-w-*` 写法。
 *
 * 三种语义宽度（对应 `app/globals.css` 中 `--max-w-page-*` token）：
 *   - `full`    1280px  多栏工作台、列表、详情等宽内容页面
 *   - `standard` 1024px 题解、设置、笔记、用户主页等标准阅读页面
 *   - `form`     896px  表单、创建、编辑等窄表单页面
 *
 * 侧边内边距统一为 `px-4 sm:px-6 lg:px-8`。
 */
export type PageContainerVariant = 'full' | 'standard' | 'form'

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
    'mx-auto',
    'px-4 sm:px-6 lg:px-8',
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return createElement(Tag, { className: classes }, children)
}
