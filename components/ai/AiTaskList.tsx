'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2, ListChecks, X, Bell, Layers, CheckCircle2, AlertCircle } from 'lucide-react'
import { AiTaskCard } from './AiTaskCard'
import type { AiTask } from '@/types/ai'

interface AiTaskListProps {
  /** 任务列表（由父组件 AiWorkspaceShell 通过 props 传入，组件本身不直接拉取） */
  tasks: AiTask[]
  /** 是否正在加载 */
  loading?: boolean
  /** 点击任务卡片回调 */
  onTaskClick?: (task: AiTask) => void
  /** 自定义 className */
  className?: string
}

/**
 * Phase 6 Task 29.5: 批量任务分组结构
 *
 * 同一 batchId 下的任务聚合为一个批次，展示完成进度（"3/5 完成"）。
 * 批次内任务展开/折叠展示，默认展开（便于查看进度）。
 */
interface BatchGroup {
  batchId: string
  tasks: AiTask[]
  total: number
  completed: number
  failed: number
  pending: number
  processing: number
}

/**
 * 将任务列表分为两段：
 * - batchGroups: 按 batchId 分组的批量任务
 * - standalone: 无 batchId 的独立任务
 */
function partitionTasks(tasks: AiTask[]): { batchGroups: BatchGroup[]; standalone: AiTask[] } {
  const groups = new Map<string, AiTask[]>()
  const standalone: AiTask[] = []

  for (const t of tasks) {
    const batchId = t.params?.batchId
    if (!batchId) {
      standalone.push(t)
      continue
    }
    const arr = groups.get(batchId) || []
    arr.push(t)
    groups.set(batchId, arr)
  }

  const batchGroups: BatchGroup[] = Array.from(groups.entries()).map(([batchId, ts]) => {
    // 按 createdAt 升序保持稳定
    const sorted = [...ts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return {
      batchId,
      tasks: sorted,
      total: sorted.length,
      completed: sorted.filter(t => t.status === 'COMPLETED').length,
      failed: sorted.filter(t => t.status === 'FAILED').length,
      pending: sorted.filter(t => t.status === 'PENDING').length,
      processing: sorted.filter(t => t.status === 'PROCESSING').length,
    }
  })

  // 批次按最新任务时间倒序（最近操作的批次在前）
  batchGroups.sort((a, b) => {
    const at = new Date(a.tasks[a.tasks.length - 1]?.createdAt || 0).getTime()
    const bt = new Date(b.tasks[b.tasks.length - 1]?.createdAt || 0).getTime()
    return bt - at
  })

  // 独立任务按 createdAt 倒序
  standalone.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return { batchGroups, standalone }
}

/**
 * 浮动右下角的 AI 任务列表面板
 *
 * 行为：
 * - 默认折叠为图标按钮（带未读小红点：tasks 中存在 PENDING/PROCESSING 时显示）
 * - 点击图标按钮展开为浮动面板
 * - 展开时显示半透明遮罩，点击遮罩折叠
 * - 面板内逐项渲染 AiTaskCard
 *
 * 组件本身不拉取数据，保持纯组件（数据由 AiWorkspaceShell 通过 props 传入）。
 *
 * Phase 6 Task 29.5: 支持 batchId 分组，批量任务展示 "3/5 完成" 进度条。
 */
export function AiTaskList({ tasks, loading, onTaskClick, className = '' }: AiTaskListProps) {
  const [open, setOpen] = useState(false)
  // Phase 6 Task 29.5: 批次展开状态（batchId -> 是否展开）
  const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set())

  // 当面板展开时按 ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const unread = tasks.some(t => t.status === 'PENDING' || t.status === 'PROCESSING')

  // Phase 6 Task 29.5: 分组计算
  const { batchGroups, standalone } = useMemo(() => partitionTasks(tasks), [tasks])

  const toggleBatch = (batchId: string) => {
    setCollapsedBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  /**
   * Phase 6 Task 29.5: 渲染批次分组
   */
  const renderBatchGroup = (group: BatchGroup) => {
    const isCollapsed = collapsedBatches.has(group.batchId)
    const allDone = group.completed + group.failed === group.total
    const hasActive = group.pending + group.processing > 0
    const pct = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0

    // 进度条颜色：进行中蓝色，全完成绿色，有失败则橙色
    const barColor = hasActive ? 'bg-primary' : group.failed > 0 ? 'bg-warning' : 'bg-success'

    return (
      <div
        key={group.batchId}
        className="rounded-lg border border-border bg-card/50 overflow-hidden"
      >
        {/* 批次头部：可点击折叠/展开 */}
        <button
          type="button"
          onClick={() => toggleBatch(group.batchId)}
          className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">
              批量任务
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {group.batchId.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {allDone && !hasActive && (
              group.failed === 0 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-warning" />
              )
            )}
            <span className={`text-xs font-medium ${
              hasActive ? 'text-primary' : group.failed > 0 ? 'text-warning' : 'text-success'
            }`}>
              {group.completed}/{group.total} 完成
            </span>
            {group.failed > 0 && (
              <span className="text-[10px] text-error">· {group.failed} 失败</span>
            )}
            <span className="text-muted-foreground text-xs">
              {isCollapsed ? '▶' : '▼'}
            </span>
          </div>
        </button>

        {/* 进度条 */}
        <div className="h-1 bg-muted">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* 批次内任务列表 */}
        {!isCollapsed && (
          <div className="p-2 space-y-2 bg-muted/30">
            {group.tasks.map(task => (
              <AiTaskCard
                key={task.id}
                task={task}
                onClick={onTaskClick ? () => onTaskClick(task) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* 半透明遮罩（展开时） */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 浮动面板 */}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] max-h-[70vh] flex flex-col card-static overflow-hidden shadow-2xl ${className}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">AI 任务列表</h3>
              {tasks.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({tasks.length}
                  {batchGroups.length > 0 && ` · ${batchGroups.length} 批次`})
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="收起"
              aria-label="收起任务列表"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>暂无任务</p>
                <p className="text-xs mt-1">提交 AI 任务后将在此显示</p>
              </div>
            ) : (
              <>
                {/* Phase 6 Task 29.5: 批量任务分组（按 batchId） */}
                {batchGroups.map(group => renderBatchGroup(group))}

                {/* 独立任务（无 batchId） */}
                {standalone.map(task => (
                  <AiTaskCard
                    key={task.id}
                    task={task}
                    onClick={onTaskClick ? () => onTaskClick(task) : undefined}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* 折叠态：浮动图标按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary-dark flex items-center justify-center transition-colors ${className}`}
          title="查看 AI 任务列表"
          aria-label="查看 AI 任务列表"
        >
          <Bell className="w-5 h-5" />
          {unread && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-error border-2 border-white" />
          )}
        </button>
      )}
    </>
  )
}

export default AiTaskList
