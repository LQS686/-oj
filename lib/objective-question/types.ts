/**
 * 客观题模块类型定义
 */

/** 客观题题型常量（唯一真相源） */
export const OBJECTIVE_QUESTION_TYPES = [
  'single-choice',
  'multiple-choice',
  'true-false',
  'fill-blank',
] as const

/** 客观题题型 */
export type ObjectiveQuestionType = (typeof OBJECTIVE_QUESTION_TYPES)[number]

/** 题型中文标签 */
export const OBJECTIVE_QUESTION_TYPE_LABELS: Record<ObjectiveQuestionType, string> = {
  'single-choice': '单选题',
  'multiple-choice': '多选题',
  'true-false': '判断题',
  'fill-blank': '填空题',
}

/** 题型徽标 tag 类名（需配合基础类 `tag` 使用，如 `tag tag-info`） */
export const OBJECTIVE_QUESTION_TYPE_TAG_CLASSES: Record<ObjectiveQuestionType, string> = {
  'single-choice': 'tag-info',
  'multiple-choice': 'tag-warning',
  'true-false': 'tag-success',
  'fill-blank': 'tag-error',
}

/** 选择题选项 */
export interface ObjectiveQuestionOption {
  /** 选项标识，如 'A' / 'B' / 'C' / 'D' */
  key: string
  /** 选项内容（Markdown） */
  content: string
}

/**
 * 标准答案 / 学生作答的统一结构
 * - 单选：['A']
 * - 多选：['A', 'C']
 * - 判断：[true]
 * - 填空：['答案一', '答案二']
 */
export type ObjectiveAnswer = (string | boolean)[]

/** 客观题列表项（列表页展示，不含 answer/explanation，防止答案泄露） */
export interface ObjectiveQuestionListItem {
  /** 题目 ID */
  id: string
  /** 题号，如 "Q1001"（创建时服务端自动生成，可能为空） */
  questionNumber: string | null
  /** 题型 */
  type: ObjectiveQuestionType
  /** 题干（Markdown，填空题以 ≥4 连续下划线 ____ 标记空位） */
  title: string
  /** 难度：'简单' | '中等' | '困难' */
  difficulty: string
  /** 标签 */
  tags: string[]
  /** 建议分值（1-100） */
  score: number
  /** 选项列表（单选/多选使用；判断/填空为 null） */
  options: ObjectiveQuestionOption[] | null
  /** 被作业引用的次数（列表页统计列） */
  usageCount?: number
  /** 更新时间 */
  updatedAt: string | Date
}

/** 客观题详情（管理端编辑/详情页，含标准答案与解析） */
export interface ObjectiveQuestionDetail {
  /** 题目 ID */
  id: string
  /** 题号，如 "Q1001"（创建时服务端自动生成，可能为空） */
  questionNumber: string | null
  /** 题型 */
  type: ObjectiveQuestionType
  /** 题干（Markdown，填空题以 ≥4 连续下划线 ____ 标记空位） */
  title: string
  /** 选项列表（单选/多选使用；判断/填空为 null） */
  options: ObjectiveQuestionOption[] | null
  /** 标准答案（结构见 ObjectiveAnswer） */
  answer: ObjectiveAnswer
  /** 解析（Markdown，选填） */
  explanation: string | null
  /** 难度：'简单' | '中等' | '困难' */
  difficulty: string
  /** 标签 */
  tags: string[]
  /** 建议分值（1-100） */
  score: number
  /** 作者用户 ID */
  authorId: string
  /** 创建时间 */
  createdAt: string | Date
  /** 更新时间 */
  updatedAt: string | Date
}

/** 班级作业客观题提交记录（学生作答结果） */
export interface ObjectiveSubmissionDTO {
  /** 对应客观题 ID */
  questionId: string
  /** 学生作答（结构同 ObjectiveAnswer） */
  answer: ObjectiveAnswer
  /** 是否判分正确 */
  isCorrect: boolean
  /** 得分：正确 = 题目分值，错误 = 0 */
  score: number
  /** 累计提交次数（重复提交 upsert 时 +1） */
  submitCount: number
  /** 提交时间（ISO 字符串） */
  submittedAt: string
  /** 是否逾期提交 */
  isLate: boolean
}

/** 填空题空位标记：连续 ≥4 个下划线 */
export const FILL_BLANK_PATTERN = /_{4,}/g

/** 统计题干中的填空空位数 */
export function countFillBlanks(title: string): number {
  return (title.match(FILL_BLANK_PATTERN) || []).length
}

/**
 * 按空位切分题干为片段数组，供渲染 ①②③ 编号空位用
 * 例："前____中____后" → ["前", "中", "后"]（片段数 = 空位数 + 1）
 */
export function splitFillBlankStem(title: string): string[] {
  return title.split(FILL_BLANK_PATTERN)
}

/** 填空题作答归一化（判分用）：trim + toLowerCase */
export function normalizeFillBlankAnswer(s: string): string {
  return s.trim().toLowerCase()
}
