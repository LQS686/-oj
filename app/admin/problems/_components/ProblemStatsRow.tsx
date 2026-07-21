'use client'

import type { Problem } from '../_types'

interface ProblemStatsRowProps {
  /** 全部题目（未筛选） */
  problems: Problem[]
  /** 筛选后的题目 */
  filteredProblems: Problem[]
}

/**
 * 题目列表上方的紧凑统计行：
 * 总数 / 公开 / 隐藏 / 竞赛 / 有标程 / 有测试点 / 筛选后数量。
 *
 * - "共 N 题"基于全部题目（problems）
 * - "公开/隐藏/竞赛/有标程/有测试点"基于筛选后题目（filteredProblems）
 * - "筛选后 N 题"在筛选条件生效时高亮显示
 */
export function ProblemStatsRow({ problems, filteredProblems }: ProblemStatsRowProps) {
  const publicCount = filteredProblems.filter(p =>
    p.visibility === 'public' || (!p.visibility && p.isPublic)
  ).length
  const contestCount = filteredProblems.filter(p => p.visibility === 'contest').length
  const hiddenCount = filteredProblems.filter(p => {
    const v = p.visibility || (p.isPublic ? 'public' : 'private')
    return v === 'private' || (!p.visibility && !p.isPublic && v !== 'contest')
  }).length
  const hasStdCount = filteredProblems.filter(p => !!p.stdCode).length
  const hasTestsCount = filteredProblems.filter(p => (p._count?.testCases ?? 0) > 0).length

  const isFiltered = filteredProblems.length !== problems.length

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm px-1">
      <span className="text-muted-foreground">
        共 <span className="text-lg font-bold text-foreground font-mono tabular-nums">{problems.length}</span> 题
      </span>
      <span className="text-border">|</span>
      <span className="text-secondary-light">
        公开 <span className="font-mono tabular-nums">{publicCount}</span>
      </span>
      <span className="text-muted-foreground">
        隐藏 <span className="font-mono tabular-nums">{hiddenCount}</span>
      </span>
      <span className="text-accent-light">
        竞赛 <span className="font-mono tabular-nums">{contestCount}</span>
      </span>
      <span className="text-border">|</span>
      <span className="text-secondary-light">
        有标程 <span className="font-mono tabular-nums">{hasStdCount}</span>
      </span>
      <span className="text-accent-light">
        有测试点 <span className="font-mono tabular-nums">{hasTestsCount}</span>
      </span>
      {isFiltered && (
        <>
          <span className="text-border">|</span>
          <span className="text-primary">
            筛选后 <span className="font-mono tabular-nums">{filteredProblems.length}</span> 题
          </span>
        </>
      )}
    </div>
  )
}
