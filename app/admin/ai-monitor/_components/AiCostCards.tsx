'use client'

import { DollarSign } from 'lucide-react'
import type { AiCostData } from '../_types'

interface AiCostCardsProps {
  aiCost: AiCostData | null
  /** 当 aiCost.todayTaskCount 缺失时的兜底（前端今日聚合总数） */
  todayTaskCountFallback: number
}

export function AiCostCards({ aiCost, todayTaskCountFallback }: AiCostCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-success" />
            <p className="text-xs text-muted-foreground">今日 AI 成本</p>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {aiCost?.todayTaskCount ?? todayTaskCountFallback} 个任务
          </span>
        </div>
        <p className="text-2xl font-bold text-success">
          ¥{(aiCost?.todayCost ?? 0).toFixed(6)}
        </p>
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs text-muted-foreground">本月累计成本</p>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {aiCost?.monthTaskCount ?? '-'} 个任务
          </span>
        </div>
        <p className="text-2xl font-bold text-primary">
          ¥{(aiCost?.monthCost ?? 0).toFixed(6)}
        </p>
      </div>
    </div>
  )
}
