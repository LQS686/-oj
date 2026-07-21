import type { Problem } from './_types'

/** 题目列表筛选条件 */
export interface ProblemFilters {
  searchQuery: string
  /** 难度多选：空数组=全部 */
  difficultyFilter: string[]
  /** 可见性：all=全部 */
  visibility: 'all' | 'public' | 'private' | 'contest'
  /** 标签多选（AND 语义）：空数组=不限 */
  tags: string[]
  /** 来源多选：空数组=不限 */
  sources: string[]
  /** 数据完整度筛选 */
  completeness: 'all' | 'hasStd' | 'noStd' | 'hasTests' | 'noTests'
}

/** 默认筛选条件 */
export const DEFAULT_FILTERS: ProblemFilters = {
  searchQuery: '',
  difficultyFilter: [],
  visibility: 'all',
  tags: [],
  sources: [],
  completeness: 'all',
}

/**
 * 按搜索词 / 难度 / 可见性 / 标签 / 来源 / 数据完整度筛选题目。
 *
 * - 难度：空数组=全部；非空=任一命中
 * - 可见性：all=全部；其他值精确匹配 problem.visibility（兼容 isPublic 字段）
 * - 标签：AND 语义，需同时拥有所有选中标签
 * - 来源：精确匹配 problem.source（空数组=不限）
 * - 数据完整度：hasStd/noStd 基于 stdCode 字段；hasTests/noTests 基于 _count.testCases
 */
export function filterProblems(problems: Problem[], filters: ProblemFilters): Problem[] {
  const { searchQuery, difficultyFilter, visibility, tags, sources, completeness } = filters
  const q = searchQuery.trim().toLowerCase()

  return problems.filter(p => {
    // 关键字：题号 / 标题 / 来源 模糊匹配
    const matchesSearch = !q ||
      p.title.toLowerCase().includes(q) ||
      (p.problemNumber && p.problemNumber.toLowerCase().includes(q)) ||
      (p.source && p.source.toLowerCase().includes(q))

    // 难度：空数组=全部
    const matchesDifficulty = difficultyFilter.length === 0 ||
      difficultyFilter.includes(p.difficulty)

    // 可见性：兼容 isPublic 字段（无 visibility 时按 isPublic 推断）
    const problemVisibility = p.visibility || (p.isPublic ? 'public' : 'private')
    const matchesVisibility = visibility === 'all' || problemVisibility === visibility

    // 标签：AND 语义
    const matchesTags = tags.length === 0 ||
      tags.every(t => p.tags.includes(t))

    // 来源：精确匹配（空数组=不限）
    const matchesSource = sources.length === 0 ||
      (p.source != null && sources.includes(p.source))

    // 数据完整度
    const hasStd = !!p.stdCode
    const testCount = p._count?.testCases ?? 0
    const hasTests = testCount > 0
    const matchesCompleteness =
      completeness === 'all' ||
      (completeness === 'hasStd' && hasStd) ||
      (completeness === 'noStd' && !hasStd) ||
      (completeness === 'hasTests' && hasTests) ||
      (completeness === 'noTests' && !hasTests)

    return matchesSearch && matchesDifficulty && matchesVisibility &&
      matchesTags && matchesSource && matchesCompleteness
  })
}

/** 难度筛选下拉显示文案（保留用于其他单选场景） */
export function getDifficultyLabel(difficultyFilter: string): string {
  return difficultyFilter === 'all' ? '全部难度' : difficultyFilter
}

/**
 * 计算筛选条件中激活（非默认）的维度数，用于筛选栏 activeCount 角标。
 */
export function countActiveFilters(filters: ProblemFilters): number {
  let count = 0
  if (filters.searchQuery.trim()) count++
  if (filters.difficultyFilter.length > 0) count++
  if (filters.visibility !== 'all') count++
  if (filters.tags.length > 0) count++
  if (filters.sources.length > 0) count++
  if (filters.completeness !== 'all') count++
  return count
}

/**
 * 将筛选条件序列化为 URL query string 参数对象。
 * 空数组与默认值不写入 URL（保持 URL 简洁）。
 */
export function filtersToQueryParams(filters: ProblemFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.searchQuery.trim()) {
    params.q = filters.searchQuery.trim()
  }
  if (filters.difficultyFilter.length > 0) {
    params.difficulty = filters.difficultyFilter.join(',')
  }
  if (filters.visibility !== 'all') {
    params.visibility = filters.visibility
  }
  if (filters.tags.length > 0) {
    params.tags = filters.tags.join(',')
  }
  if (filters.sources.length > 0) {
    params.source = filters.sources.join(',')
  }
  if (filters.completeness !== 'all') {
    params.completeness = filters.completeness
  }
  return params
}

/**
 * 从 URL query string 参数恢复筛选条件。
 * 缺失的参数使用默认值。
 */
export function queryParamsToFilters(params: URLSearchParams): ProblemFilters {
  const filters: ProblemFilters = { ...DEFAULT_FILTERS }
  const q = params.get('q')
  if (q) filters.searchQuery = q
  const difficulty = params.get('difficulty')
  if (difficulty) {
    filters.difficultyFilter = difficulty.split(',').map(s => s.trim()).filter(Boolean)
  }
  const visibility = params.get('visibility')
  if (visibility === 'public' || visibility === 'private' || visibility === 'contest') {
    filters.visibility = visibility
  }
  const tags = params.get('tags')
  if (tags) {
    filters.tags = tags.split(',').map(s => s.trim()).filter(Boolean)
  }
  const source = params.get('source')
  if (source) {
    filters.sources = source.split(',').map(s => s.trim()).filter(Boolean)
  }
  const completeness = params.get('completeness')
  if (completeness === 'hasStd' || completeness === 'noStd' ||
      completeness === 'hasTests' || completeness === 'noTests') {
    filters.completeness = completeness
  }
  return filters
}
