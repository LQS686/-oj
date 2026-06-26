import { formatProblemDocumentTitle, type ProblemTabTitleContext } from '@/lib/document-title'

/**
 * 在新标签页打开题目（用于按钮 onClick，如竞赛 A/B/C）
 */
export function openProblemTab(
  href: string,
  problemTitle: string,
  titleContext?: ProblemTabTitleContext
) {
  const title = formatProblemDocumentTitle(problemTitle, titleContext)
  const win = window.open(href, '_blank', 'noopener,noreferrer')
  if (win) {
    try {
      win.opener = null
    } catch {
      /* ignore */
    }
  }
  return title
}