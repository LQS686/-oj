import type { ProblemTabTitleContext } from '@/lib/document-title'

/** 在新标签打开题目（标题由目标页 useProblemDocumentTitle 设置） */
export function openProblemInNewTab(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer')
}

export type { ProblemTabTitleContext }