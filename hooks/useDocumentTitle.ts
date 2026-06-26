'use client'

import { useEffect } from 'react'
import { formatAssignmentDocumentTitle } from '@/lib/document-title'
import {
  DEFAULT_SITE_TITLE,
  formatPageDocumentTitle,
  resolvePageTitle,
} from '@/lib/page-titles'

export type DocumentTitleMode = 'page' | 'assignment'

/**
 * 设置当前页浏览器标签标题；卸载时恢复为默认或上一标题
 * @param mode assignment 使用作业专用格式（可带班级名）
 */
export function useDocumentTitle(
  title: string | null | undefined,
  options?: { enabled?: boolean; mode?: DocumentTitleMode; className?: string | null }
) {
  const enabled = options?.enabled !== false
  const mode = options?.mode ?? 'page'
  const className = options?.className

  useEffect(() => {
    if (!enabled || !title?.trim()) return

    const next =
      mode === 'assignment'
        ? formatAssignmentDocumentTitle(title, className)
        : formatPageDocumentTitle(title)
    const prev = document.title
    document.title = next

    return () => {
      document.title = prev || DEFAULT_SITE_TITLE
    }
  }, [title, enabled, mode, className])
}

/**
 * 根据当前 pathname 设置标签标题（用于全局 Provider）
 */
export function usePathnameDocumentTitle(pathname: string) {
  useEffect(() => {
    const pageTitle = resolvePageTitle(pathname)
    document.title = formatPageDocumentTitle(pageTitle)
  }, [pathname])
}

export { DEFAULT_SITE_TITLE, formatPageDocumentTitle, resolvePageTitle }