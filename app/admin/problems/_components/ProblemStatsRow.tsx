'use client'

import type { ProblemListStats } from '../_types'

interface ProblemStatsRowProps {
  /** 全部题目总数（未筛选，服务端 stats.totalAll） */
  totalAll: number
  /** 当前筛选条件下的题目总数（服务端 pagination.total） */
  total: number
  /** 服务端聚合的筛选后统计（加载完成前为 null） */
  stats: Pick<ProblemListStats, 'public' | 'hidden' | 'contest' | 'hasStd' | 'hasTests'> | null
  /** 是否有激活的筛选条件（有则高亮显示"筛选后 N 题"） */
  hasActiveFilters: boolean
}

/**
 * 题目列表上方的紧凑统计行：
 * 总数 / 公开 / 隐藏 / 竞赛 / 有标程 / 有测试点 / 筛选后数量。
 *
 * 统计全部由后端按当前筛选条件一次聚合返回（Mongo 下避免逐题 _count N+1），
 * 前端仅负责展示，不再对当前页数据做本地统计。
 */
export function ProblemStatsRow({ totalAll, total, stats, hasActiveFilters }: ProblemStatsRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm px-1">
      <span className="text-muted-foreground">
        共 <span className="text-lg font-bold text-foreground font-mono tabular-nums">{totalAll}</span> 题
      </span>
      <span className="text-border">|</span>
      <span className="text-secondary-light">
        公开 <span className="font-mono tabular-nums">{stats?.public ?? 0}</span>
      </span>
      <span className="text-muted-foreground">
        隐藏 <span className="font-mono tabular-nums">{stats?.hidden ?? 0}</span>
      </span>
      <span className="text-accent-light">
        竞赛 <span className="font-mono tabular-nums">{stats?.contest ?? 0}</span>
      </span>
      <span className="text-border">|</span>
      <span className="text-secondary-light">
        有标程 <span className="font-mono tabular-nums">{stats?.hasStd ?? 0}</span>
      </span>
      <span className="text-accent-light">
        有测试点 <span className="font-mono tabular-nums">{stats?.hasTests ?? 0}</span>
      </span>
      {hasActiveFilters && (
        <>
          <span className="text-border">|</span>
          <span className="text-primary">
            筛选后 <span className="font-mono tabular-nums">{total}</span> 题
          </span>
        </>
      )}
    </div>
  )
}
