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
      {...(openInNewTab
        ? { target: '_blank' as const, rel: 'noopener noreferrer' }
        : {})}
      {...rest}
    >
      {children}
    </Link>
  )
}