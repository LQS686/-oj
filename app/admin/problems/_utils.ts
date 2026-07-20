import type { Problem } from './_types'

/** 题目列表筛选条件 */
export interface ProblemFilters {
  searchQuery: string
  difficultyFilter: string
}

/**
 * 按搜索词 / 难度筛选题目。
 */
export function filterProblems(problems: Problem[], filters: ProblemFilters): Problem[] {
  const { searchQuery, difficultyFilter } = filters
  const q = searchQuery.toLowerCase()

  return problems.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(q) ||
      (p.problemNumber && p.problemNumber.toLowerCase().includes(q))
    const matchesDifficulty = difficultyFilter === 'all' || p.difficulty === difficultyFilter

    return matchesSearch && matchesDifficulty
  })
}

/** 难度筛选下拉显示文案 */
export function getDifficultyLabel(difficultyFilter: string): string {
  return difficultyFilter === 'all' ? '全部难度' : difficultyFilter
}
