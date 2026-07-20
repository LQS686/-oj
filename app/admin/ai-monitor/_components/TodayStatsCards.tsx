'use client'

import { Zap } from 'lucide-react'

interface TodayStatsCardsProps {
  todayCounts: Record<string, number>
  todayTokens: number
}

export function TodayStatsCards({ todayCounts, todayTokens }: TodayStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="card p-5">
        <p className="text-xs text-muted-foreground mb-1">今日等待</p>
        <p className="text-2xl font-bold text-foreground">{todayCounts.PENDING}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs text-muted-foreground mb-1">今日处理中</p>
        <p className="text-2xl font-bold text-info">{todayCounts.PROCESSING}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs text-muted-foreground mb-1">今日完成</p>
        <p className="text-2xl font-bold text-secondary">{todayCounts.COMPLETED}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs text-muted-foreground mb-1">今日失败</p>
        <p className="text-2xl font-bold text-error">{todayCounts.FAILED}</p>
      </div>
      <div className="card p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <Zap className="w-3.5 h-3.5 text-warning" />
          <p className="text-xs text-muted-foreground">今日 Token</p>
        </div>
        <p className="text-2xl font-bold text-foreground">{todayTokens.toLocaleString()}</p>
      </div>
    </div>
  )
}
