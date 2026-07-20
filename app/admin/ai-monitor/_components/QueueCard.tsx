'use client'

import { Layers } from 'lucide-react'
import type { QueueStatus } from '../_types'
import { UtilizationBar } from './UtilizationBar'

export function QueueCard({ title, status }: { title: string; status: QueueStatus | null }) {
  const active = status?.active ?? 0
  const max = status?.maxConcurrent ?? 0
  const waiting = status?.waiting ?? 0
  const pct = max > 0 ? Math.round((active / max) * 100) : 0
  const tagClass = pct >= 90 ? 'tag-error' : pct >= 50 ? 'tag-warning' : 'tag-success'
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <span className={`tag ${tagClass}`}>{pct}%</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">等待</p>
          <p className="text-2xl font-bold text-foreground">{waiting}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">运行</p>
          <p className="text-2xl font-bold text-foreground">{active}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">上限</p>
          <p className="text-2xl font-bold text-foreground">{max}</p>
        </div>
      </div>
      <UtilizationBar active={active} max={max} />
    </div>
  )
}
