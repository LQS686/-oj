/**
 * 客观题列表筛选条件的 URL 序列化 / 反序列化工具（对齐 problems/_utils 模式）。
 */
import {
  OBJECTIVE_QUESTION_TYPES,
  type ObjectiveQuestionType,
} from '@/lib/objective-question/types'
import {
  OBJECTIVE_DIFFICULTIES,
  type ObjectiveDifficulty,
} from '@/lib/objective-question/validation'
import type { ObjectiveQuestionFilters } from './_types'

export type { ObjectiveQuestionFilters } from './_types'

/** 默认筛选条件 */
export const DEFAULT_FILTERS: ObjectiveQuestionFilters = {
  keyword: '',
  type: 'all',
  difficulty: 'all',
}

/**
 * 计算筛选条件中激活（非默认）的维度数，用于筛选栏 activeCount 角标。
 */
export function countActiveFilters(filters: ObjectiveQuestionFilters): number {
  let count = 0
  if (filters.keyword.trim()) count++
  if (filters.type !== 'all') count++
  if (filters.difficulty !== 'all') count++
  return count
}

/**
 * 将筛选条件序列化为 URL query string 参数对象。
 * 默认值不写入 URL（保持 URL 简洁）。
 */
export function filtersToQueryParams(
  filters: ObjectiveQuestionFilters,
): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.keyword.trim()) {
    params.keyword = filters.keyword.trim()
  }
  if (filters.type !== 'all') {
    params.type = filters.type
  }
  if (filters.difficulty !== 'all') {
    params.difficulty = filters.difficulty
  }
  return params
}

/**
 * 从 URL query string 参数恢复筛选条件。
 * 缺失或非法的参数使用默认值。
 */
export function queryParamsToFilters(
  params: URLSearchParams,
): ObjectiveQuestionFilters {
  const filters: ObjectiveQuestionFilters = { ...DEFAULT_FILTERS }
  const keyword = params.get('keyword')
  if (keyword) filters.keyword = keyword

  const type = params.get('type')
  if (
    type &&
    (OBJECTIVE_QUESTION_TYPES as readonly string[]).includes(type)
  ) {
    filters.type = type as ObjectiveQuestionType
  }

  const difficulty = params.get('difficulty')
  if (
    difficulty &&
    (OBJECTIVE_DIFFICULTIES as readonly string[]).includes(difficulty)
  ) {
    filters.difficulty = difficulty as ObjectiveDifficulty
  }
  return filters
}
