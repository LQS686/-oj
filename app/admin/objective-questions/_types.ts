/**
 * 客观题管理页面的类型定义。
 *
 * ObjectiveQuestionRow 对齐 /api/admin/objective-questions 返回的 list 项
 * （含 usageCount，不含 answer/explanation）。
 */
import type {
  ObjectiveQuestionListItem,
  ObjectiveQuestionType,
} from '@/lib/objective-question/types'
import type { ObjectiveDifficulty } from '@/lib/objective-question/validation'

/** 列表行类型（含被作业引用次数） */
export type ObjectiveQuestionRow = ObjectiveQuestionListItem

/** 客观题列表筛选条件 */
export interface ObjectiveQuestionFilters {
  /** 关键词（题号 / 题干） */
  keyword: string
  /** 题型：'all' = 全部 */
  type: 'all' | ObjectiveQuestionType
  /** 难度：'all' = 全部 */
  difficulty: 'all' | ObjectiveDifficulty
}
