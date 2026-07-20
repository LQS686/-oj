import type { Problem } from './_types'

/** 题目列表筛选条件 */
export interface ProblemFilters {
  searchQuery: string
  difficultyFilter: string
  aiStatusFilter: string
}

/**
 * 按搜索词 / 难度 / AI 来源筛选题目。
 * 与原 page.tsx 内联实现保持一致（含 AI 状态多别名兼容）。
 */
export function filterProblems(problems: Problem[], filters: ProblemFilters): Problem[] {
  const { searchQuery, difficultyFilter, aiStatusFilter } = filters
  const q = searchQuery.toLowerCase()

  return problems.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(q) ||
      (p.problemNumber && p.problemNumber.toLowerCase().includes(q))
    const matchesDifficulty = difficultyFilter === 'all' || p.difficulty === difficultyFilter

    let matchesAi = true
    if (aiStatusFilter === 'manual') {
      matchesAi = !p.aiStatus || p.aiStatus === 'MANUAL_CREATED' || p.aiStatus === 'NONE'
    } else if (aiStatusFilter === 'assisted') {
      matchesAi = p.aiStatus === 'AI_ASSISTED' || p.aiStatus === 'ASSISTED'
    } else if (aiStatusFilter === 'generated') {
      matchesAi = p.aiStatus === 'AI_GENERATED' || p.aiStatus === 'GENERATED'
    }

    return matchesSearch && matchesDifficulty && matchesAi
  })
}

/** 难度筛选下拉显示文案 */
export function getDifficultyLabel(difficultyFilter: string): string {
  return difficultyFilter === 'all' ? '全部难度' : difficultyFilter
}
