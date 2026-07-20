'use client'

import { Hash, List, ListChecks, Network, RefreshCw } from 'lucide-react'
import { STATUS_OPTIONS } from '../_constants'
import type { ViewMode } from '../_types'

interface TaskFilterBarProps {
  promptHashFilter: string
  onPromptHashChange: (v: string) => void
  statusFilter: string
  onStatusChange: (v: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onRefresh: () => void
}

export function TaskFilterBar({
  promptHashFilter,
  onPromptHashChange,
  statusFilter,
  onStatusChange,
  viewMode,
  onViewModeChange,
  onRefresh,
}: TaskFilterBarProps) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground">全局任务列表</h3>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Phase 6 Task 39.3: promptHash 筛选输入 */}
        <div className="flex items-center gap-1">
          <Hash className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={promptHashFilter}
            onChange={(e) => onPromptHashChange(e.target.value)}
            placeholder="promptHash 过滤"
            className="input w-40 text-xs"
            title="按 prompt 版本哈希过滤任务（支持前缀匹配）"
          />
        </div>
        <label className="text-sm text-muted-foreground">状态</label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="input w-auto"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* Phase 6 Task 36.2: 视图切换（列表 / 任务链图） */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => onViewModeChange('list')}
            className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
              viewMode === 'list' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
            title="列表视图"
          >
            <List className="w-3.5 h-3.5" />
            列表
          </button>
          <button
            onClick={() => onViewModeChange('chain')}
            className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
              viewMode === 'chain' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
            title="任务链视图：按 parentLogId 关联展示 A → B 依赖关系"
          >
            <Network className="w-3.5 h-3.5" />
            任务链
          </button>
        </div>
        <button
          onClick={onRefresh}
          className="btn btn-ghost text-sm flex items-center gap-1"
          title="刷新当前页"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
