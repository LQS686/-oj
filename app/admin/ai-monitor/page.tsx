'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, ChevronLeft, ChevronRight, ListChecks, Loader2, Network } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { isSystemAdmin } from '@/lib/permissions'

import { useAiMonitorData } from './_hooks/useAiMonitorData'
import { QueueCard } from './_components/QueueCard'
import { TodayStatsCards } from './_components/TodayStatsCards'
import { AiCostCards } from './_components/AiCostCards'
import { TaskFilterBar } from './_components/TaskFilterBar'
import { TaskTable } from './_components/TaskTable'
import { ChainGraphView } from './_components/ChainGraphView'
import type { ViewMode } from './_types'
import { AiDisabledNotice } from '@/components/ai/AiDisabledNotice'
import { AI_FEATURE_DISABLED } from '@/lib/ai/feature-flag'

export default function AiMonitorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading } = useUser()

  const allowed = isSystemAdmin(user)

  // Phase 6 Task 36.2: 视图切换（列表 / 任务链图）
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  // Phase 6 Task 36.4: focus 查询参数（点击任务链节点跳转到列表视图并高亮某行）
  const focusedLogId = searchParams?.get('focus') || ''
  const rowRefs = useRef<Map<string, HTMLTableRowElement | HTMLDivElement>>(new Map())

  const {
    queueStatus,
    todayCounts,
    todayTokens,
    logs,
    totalCount,
    page,
    totalPages,
    statusFilter,
    promptHashFilter,
    loadingLogs,
    error,
    retryingLogId,
    cancellingLogId,
    aiCost,
    taskChains,
    setPage,
    handleStatusChange,
    handlePromptHashChange,
    handleRetry,
    handleCancel,
    refreshLogs,
  } = useAiMonitorData(allowed)

  // 权限校验：非 SYSTEM_ADMIN 重定向到 /admin
  useEffect(() => {
    if (isLoading) return
    if (!isSystemAdmin(user)) {
      router.push('/admin')
    }
  }, [user, isLoading, router])

  // Phase 6 Task 36.4: focus 查询参数变化时，切换到列表视图并滚动到目标行
  useEffect(() => {
    if (!allowed || !focusedLogId) return
    // 自动切换到列表视图以显示该任务行
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换视图是 focus 跳转的必要副作用，与 handleFocusTask 配合保证 URL 直达时也能回到列表视图
    if (viewMode !== 'list') setViewMode('list')
    // 等数据 + 渲染完成后滚动
    const timer = setTimeout(() => {
      const el = rowRefs.current.get(focusedLogId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-primary')
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary')
        }, 2500)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [allowed, focusedLogId, logs, viewMode])

  // Phase 6 Task 36.4: 点击任务链节点跳转任务详情（同页滚动到列表视图对应行）
  const handleFocusTask = (logId: string) => {
    // 切换 URL 查询参数以触发 useEffect
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('focus', logId)
    router.replace(`/admin/ai-monitor?${params.toString()}`)
    if (viewMode !== 'list') setViewMode('list')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-error mx-auto mb-3" />
          <p className="text-error text-lg mb-1">无权限访问</p>
          <p className="text-muted-foreground text-sm">正在跳转...</p>
        </div>
      </div>
    )
  }

  // AI 功能下架：在所有 hooks 调用之后判定（遵守 React Rules of Hooks）
  if (AI_FEATURE_DISABLED) {
    return <AiDisabledNotice />
  }

  const todayTaskCountFallback =
    todayCounts.PENDING + todayCounts.PROCESSING + todayCounts.COMPLETED + todayCounts.FAILED

  return (
    <div className="space-y-6">
      {/* 第一行：两个队列状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QueueCard title="题目生成队列" status={queueStatus?.problemQueue ?? null} />
        <QueueCard title="题解生成队列" status={queueStatus?.solutionQueue ?? null} />
      </div>

      {/* 第二行：今日聚合指标 */}
      <TodayStatsCards todayCounts={todayCounts} todayTokens={todayTokens} />

      {/* Phase 6 Task 35.3: AI 成本卡片行（今日 / 本月） */}
      <AiCostCards aiCost={aiCost} todayTaskCountFallback={todayTaskCountFallback} />

      {/* 第三行：全局任务列表 */}
      <div className="card p-5">
        <TaskFilterBar
          promptHashFilter={promptHashFilter}
          onPromptHashChange={handlePromptHashChange}
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={refreshLogs}
        />

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loadingLogs && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>暂无任务记录</p>
          </div>
        ) : (
          <>
            {viewMode === 'list' ? (
              <TaskTable
                logs={logs}
                focusedLogId={focusedLogId}
                rowRefs={rowRefs}
                retryingLogId={retryingLogId}
                cancellingLogId={cancellingLogId}
                onRetry={handleRetry}
                onCancel={handleCancel}
              />
            ) : (
              <ChainGraphView
                chains={taskChains.chains}
                orphans={taskChains.orphans}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onFocusTask={handleFocusTask}
                retryingLogId={retryingLogId}
                cancellingLogId={cancellingLogId}
              />
            )}

            {/* 分页（仅列表视图显示） */}
            {viewMode === 'list' && (
              <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  共 {totalCount} 条，第 {page} 页 / 共 {totalPages} 页
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-outline btn-sm flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn btn-outline btn-sm flex items-center gap-1"
                  >
                    下一页
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 任务链视图说明 */}
            {viewMode === 'chain' && (
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Network className="w-3 h-3" />
                显示当前页 {logs.length} 条任务，按 parentLogId 关联成 {taskChains.chains.length} 条任务链
                {taskChains.orphans.length > 0 && ` · ${taskChains.orphans.length} 条孤儿任务`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
