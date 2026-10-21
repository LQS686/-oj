'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import type { ProblemTabTitleContext } from '@/lib/document-title'
import { formatProblemDocumentTitle } from '@/lib/document-title'

type LinkProps = ComponentProps<typeof Link>

export interface ProblemOpenLinkProps extends Omit<LinkProps, 'href' | 'title'> {
  href: string
  /** 用于新标签页 hover 提示与无障碍 */
  problemTitle: string
  titleContext?: ProblemTabTitleContext
  /** 默认 true：新标签打开 */
  openInNewTab?: boolean
}

/**
 * 从列表进入题目：新标签 + title 属性便于识别
 */
export default function ProblemOpenLink({
  href,
  problemTitle,
  titleContext,
  openInNewTab = true,
  children,
  ...rest
}: ProblemOpenLinkProps) {
  const docTitle = formatProblemDocumentTitle(problemTitle, titleContext)

  return (
    <Link
      href={href}
      title={docTitle}
      // 新标签页打开时预取 RSC 毫无收益（新标签需要完整文档），
      // 却会让列表页每行都触发一次服务端渲染，反而拖慢当前页
      prefetch={openInNewTab ? false : undefined}
      {...(openInNewTab ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </Link>
  )
}
