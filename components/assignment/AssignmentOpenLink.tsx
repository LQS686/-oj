'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { formatAssignmentDocumentTitle } from '@/lib/document-title'

type LinkProps = ComponentProps<typeof Link>

export interface AssignmentOpenLinkProps extends Omit<LinkProps, 'href' | 'title'> {
  href: string
  assignmentTitle: string
  /** 班级名称，用于标签页标题 */
  classLabel?: string | null
  openInNewTab?: boolean
}

export default function AssignmentOpenLink({
  href,
  assignmentTitle,
  classLabel,
  openInNewTab = true,
  children,
  ...rest
}: AssignmentOpenLinkProps) {
  const docTitle = formatAssignmentDocumentTitle(assignmentTitle, classLabel)

  return (
    <Link
      href={href}
      title={docTitle}
      {...(openInNewTab ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </Link>
  )
}