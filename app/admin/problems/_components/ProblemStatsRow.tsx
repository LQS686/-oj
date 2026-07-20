'use client'

import type { Problem } from '../_types'

interface ProblemStatsRowProps {
  problems: Problem[]
  filteredCount: number
}

/**
 * 题目列表上方的紧凑统计行：总数 / 公开 / 竞赛 / 隐藏 / 筛选后数量。
 *
 * 数字使用 font-mono tabular-nums 保证等宽对齐。
 */
export function ProblemStatsRow({ problems, filteredCount }: ProblemStatsRowProps) {
  const publicCount = problems.filter(p => p.isPublic).length
  const contestCount = problems.filter(p => p.visibility === 'contest').length
  const hiddenCount = problems.filter(p => !p.isPublic && p.visibility !== 'contest').length

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm px-1">
      <span className="text-muted-foreground">
        共 <span className="text-lg font-bold text-foreground font-mono tabular-nums">{problems.length}</span> 题
      </span>
      <span className="text-border">|</span>
      <span className="text-secondary-light">
        公开 <span className="font-mono tabular-nums">{publicCount}</span>
      </span>
      <span className="text-accent-light">
        竞赛 <span className="font-mono tabular-nums">{contestCount}</span>
      </span>
      <span className="text-muted-foreground">
        隐藏 <span className="font-mono tabular-nums">{hiddenCount}</span>
      </span>
      {filteredCount !== problems.length && (
        <>
          <span className="text-border">|</span>
          <span className="text-primary">
            筛选后 <span className="font-mono tabular-nums">{filteredCount}</span> 题
          </span>
        </>
      )}
    </div>
  )
}
