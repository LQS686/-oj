'use client'

import { useEffect } from 'react'
import {
  formatProblemDocumentTitle,
  SITE_TITLE_SUFFIX,
  type ProblemTabTitleContext,
} from '@/lib/document-title'

import { DEFAULT_SITE_TITLE } from '@/lib/page-titles'
import { assertDocumentTitle } from '@/lib/document-title-assert'

const DEFAULT_TITLE = DEFAULT_SITE_TITLE

/**
 * 题目详情页挂载时设置浏览器标签标题，卸载时恢复
 */
function contextKey(context?: ProblemTabTitleContext): string {
  if (!context) return ''
  return JSON.stringify(context)
}

export function useProblemDocumentTitle(
  title: string | null | undefined,
  context?: ProblemTabTitleContext
) {
  const ctxKey = contextKey(context)

  useEffect(() => {
    if (!title?.trim()) return

    const ctx = ctxKey ? (JSON.parse(ctxKey) as ProblemTabTitleContext) : undefined
    const next = formatProblemDocumentTitle(title, ctx)
    const prev = document.title
    const cancel = assertDocumentTitle(next)

    return () => {
      cancel()
      document.title = prev || DEFAULT_TITLE
    }
  }, [title, ctxKey])
}

export { SITE_TITLE_SUFFIX }
