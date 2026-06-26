/** 浏览器标签页标题后缀 */
export const SITE_TITLE_SUFFIX = '大山 OJ'

export type ProblemTabTitleContext =
  | { kind: 'library'; problemNumber?: string | null }
  | { kind: 'contest'; label: string; contestTitle?: string }
  | { kind: 'training'; label?: string; trainingTitle?: string }
  | { kind: 'class'; className?: string }
  | { kind: 'assignment'; assignmentTitle?: string }

/**
 * 生成题目页 document.title，便于多标签区分
 */
export function formatProblemDocumentTitle(
  title: string,
  context?: ProblemTabTitleContext
): string {
  const name = title.trim() || '题目'
  if (!context) {
    return `${name} - ${SITE_TITLE_SUFFIX}`
  }
  switch (context.kind) {
    case 'library': {
      const id = context.problemNumber?.trim()
      return id ? `${id} ${name} - ${SITE_TITLE_SUFFIX}` : `${name} - ${SITE_TITLE_SUFFIX}`
    }
    case 'contest': {
      const prefix = context.label.trim()
      const contest = context.contestTitle?.trim()
      if (contest) {
        return `${prefix} · ${name}（${contest}）- ${SITE_TITLE_SUFFIX}`
      }
      return `${prefix} · ${name} - 竞赛 - ${SITE_TITLE_SUFFIX}`
    }
    case 'training': {
      const letter = context.label?.trim()
      const sheet = context.trainingTitle?.trim()
      if (letter && sheet) {
        return `${letter} · ${name}（${sheet}）- ${SITE_TITLE_SUFFIX}`
      }
      if (letter) {
        return `${letter} · ${name} - 题单 - ${SITE_TITLE_SUFFIX}`
      }
      return sheet
        ? `${name} - ${sheet} - ${SITE_TITLE_SUFFIX}`
        : `${name} - 题单 - ${SITE_TITLE_SUFFIX}`
    }
    case 'class': {
      const cls = context.className?.trim()
      return cls ? `${name} - ${cls} - ${SITE_TITLE_SUFFIX}` : `${name} - 班级 - ${SITE_TITLE_SUFFIX}`
    }
    case 'assignment': {
      const hw = context.assignmentTitle?.trim()
      return hw ? `${name} - ${hw} - ${SITE_TITLE_SUFFIX}` : `${name} - 作业 - ${SITE_TITLE_SUFFIX}`
    }
    default:
      return `${name} - ${SITE_TITLE_SUFFIX}`
  }
}

/** 作业详情页浏览器标签标题 */
export function formatAssignmentDocumentTitle(
  assignmentTitle: string,
  className?: string | null
): string {
  const name = assignmentTitle.trim() || '作业'
  const cls = className?.trim()
  return cls ? `${name} - ${cls} - ${SITE_TITLE_SUFFIX}` : `${name} - 作业 - ${SITE_TITLE_SUFFIX}`
}