'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Loader2,
  ListChecks,
  ArrowLeft,
  RotateCw,
  Eye,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Layers,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import type { AiTask, AiTaskStatus, AiTaskMode } from '@/types/ai'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'
import { AiResultPanel, type AiResultMode } from './AiResultPanel'

interface AiTaskHistoryPanelProps {
  /** 任务列表（最近 10 条，由 AiWorkspaceShell 通过 props 传入） */
  tasks: AiTask[]
  /** 是否正在加载 */
  loading?: boolean
  /** 拉取任务详情回调（点击进入详情时按需拉取） */
  onFetchDetail?: (taskId: string) => Promise<AiTask | null>
  /** 重试任务回调 */
  onRetry?: (taskId: string) => void | Promise<void>
  /** 入库预览题目回调（generate/similar 模式预览状态下显示） */
  onCommitPreview?: (taskId: string) => void | Promise<void>
  /** 丢弃预览题目回调（generate/similar 模式预览状态下显示） */
  onDiscardPreview?: (taskId: string) => void | Promise<void>
  /** 外部传入的初始选中任务 ID（浮动任务卡片点击时由 AiWorkspaceShell 设置）。
   *  当外部传入新值时，组件会自动选中对应任务并切换到详情视图。 */
  initialSelectedId?: string | null
  /** 结果版本号：入库/丢弃后递增，组件检测到变化后清除 detailCache 并重新拉取当前选中详情，
   *  确保下次渲染 AiResultPanel 时拿到的 result.isPreview 等字段已是后端最新值。 */
  resultVersion?: number
  /** 选中状态变化回调（null=返回列表视图，string=进入详情视图）。
   *  父组件 AiWorkspaceShell 用于动态调整左右两栏宽度。 */
  onSelectedChange?: (selectedId: string | null) => void
  /** 自定义 className */
  className?: string
}

/**
 * AI 任务记录面板（history Tab）
 *
 * 交互模式：
 * - 列表视图：展示最近 10 次操作记录的简洁卡片
 * - 点击某条任务后切换到详情视图：完整展示任务信息、结果、操作按钮
 * - 详情视图顶部带"返回列表"按钮
 *
 * 详情视图复用 AiResultPanel 展示生成结果（generate 模式下包含题目信息+测试点+题解+标程）。
 */
export function AiTaskHistoryPanel({
  tasks,
  loading = false,
  onFetchDetail,
  onRetry,
  onCommitPreview,
  onDiscardPreview,
  initialSelectedId,
  resultVersion,
  onSelectedChange,
  className = '',
}: AiTaskHistoryPanelProps) {
  // 当前选中查看详情的任务 ID（null 表示列表视图）
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, AiTask>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  // 上一次处理过的 resultVersion，用于检测变化
  const lastResultVersionRef = useRef<number>(resultVersion ?? 0)

  // 分页状态：每页 15 条
  const PAGE_SIZE = 15
  const [page, setPage] = useState(1)

  // 按时间倒序，展示当前功能（mode）的全部历史记录
  // （任务列表已由父组件 AiWorkspaceSidebar 按当前 Tab 对应的 mode 过滤）
  const sortedTasks = useMemo(() => {
    return [...tasks].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [tasks])

  // 分页计算
  const totalCount = sortedTasks.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  // 当前页超出范围时自动回到最后一页（如删除任务后总数减少）
  const safePage = Math.min(page, totalPages)
  if (safePage !== page) setPage(safePage)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const pagedTasks = sortedTasks.slice(startIndex, startIndex + PAGE_SIZE)

  // 切换 mode（任务列表变化）时回到第一页
  useEffect(() => {
    setPage(1)
  }, [tasks])

  const goToPrevPage = () => setPage(p => Math.max(1, p - 1))
  const goToNextPage = () => setPage(p => Math.min(totalPages, p + 1))

  // 点击进入详情视图
  const handleSelect = async (taskId: string) => {
    setSelectedId(taskId)
    onSelectedChange?.(taskId)
    if (!detailCache[taskId] && onFetchDetail) {
      setDetailLoading(taskId)
      try {
        const detail = await onFetchDetail(taskId)
        if (detail) {
          setDetailCache(prev => ({ ...prev, [taskId]: detail }))
        }
      } finally {
        setDetailLoading(null)
      }
    }
  }

  // 外部传入 initialSelectedId 时，自动选中并加载详情
  // （浮动任务卡片点击 → 父组件 setActiveTab('history') + 传入 initialSelectedId）
  useEffect(() => {
    if (!initialSelectedId) return
    // 仅在任务列表中存在该任务时才选中，避免无效 ID
    const exists = tasks.some(t => t.id === initialSelectedId)
    if (exists) {
      handleSelect(initialSelectedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId, tasks])

  // 入库/丢弃后 resultVersion 递增：清除 detailCache 中所有缓存，
  // 强制下次访问详情时重新拉取，确保 result.isPreview 等字段为后端最新值。
  // 同时若当前在详情视图，立即触发重新拉取，让用户看到"已入库"状态。
  useEffect(() => {
    const v = resultVersion ?? 0
    if (v === lastResultVersionRef.current) return
    lastResultVersionRef.current = v
    if (!selectedId) return
    setDetailCache(prev => {
      const next = { ...prev }
      delete next[selectedId]
      return next
    })
    if (onFetchDetail) {
      setDetailLoading(selectedId)
      onFetchDetail(selectedId)
        .then(detail => {
          if (detail) {
            setDetailCache(prev => ({ ...prev, [selectedId]: detail }))
          }
        })
        .finally(() => setDetailLoading(null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultVersion])

  const handleBack = () => {
    setSelectedId(null)
    onSelectedChange?.(null)
  }

  const handleRetry = async (taskId: string) => {
    if (!onRetry) return
    setRetrying(taskId)
    try {
      await onRetry(taskId)
    } finally {
      setRetrying(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载任务记录...
      </div>
    )
  }

  if (sortedTasks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>暂无任务记录</p>
        <p className="text-xs mt-1">提交 AI 任务后，最近 10 次操作将在此显示</p>
      </div>
    )
  }

  // ---------- 详情视图 ----------
  if (selectedId) {
    const selectedTask = sortedTasks.find(t => t.id === selectedId)
    const detail = detailCache[selectedId] || selectedTask
    if (!detail) {
      // 列表中已不存在此任务（被清理），返回列表
      setSelectedId(null)
      return null
    }
    return (
      <TaskDetailView
        task={detail}
        loading={detailLoading === selectedId}
        retrying={retrying === selectedId}
        onBack={handleBack}
        onRetry={onRetry ? () => handleRetry(selectedId) : undefined}
        onCommitPreview={onCommitPreview ? () => onCommitPreview(selectedId) : undefined}
        onDiscardPreview={onDiscardPreview ? () => onDiscardPreview(selectedId) : undefined}
      />
    )
  }

  // ---------- 列表视图 ----------
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs text-muted-foreground">
          共 {totalCount} 条记录（点击查看详情）
        </p>
        {totalCount > PAGE_SIZE && (
          <span className="text-[10px] text-muted-foreground">
            第 {safePage}/{totalPages} 页
          </span>
        )}
      </div>

      {pagedTasks.map(task => (
        <button
          key={task.id}
          type="button"
          onClick={() => handleSelect(task.id)}
          className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/50 hover:border-primary/50 transition-colors px-4 py-3 group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <StatusBadge status={task.status} />
              <span className="text-sm text-foreground truncate flex-1 min-w-0 group-hover:text-primary">
                {getTaskTitle(task)}
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {modeLabel(task.mode)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(task.createdAt)}
            </span>
          </div>
        </button>
      ))}

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-border">
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={safePage <= 1}
            className="btn btn-ghost text-xs flex items-center gap-1 px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="上一页"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            上一页
          </button>
          <span className="text-xs text-muted-foreground">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={safePage >= totalPages}
            className="btn btn-ghost text-xs flex items-center gap-1 px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="下一页"
          >
            下一页
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------- 详情视图子组件 ---------- */

function TaskDetailView({
  task,
  loading,
  retrying,
  onBack,
  onRetry,
  onCommitPreview,
  onDiscardPreview,
}: {
  task: AiTask
  loading: boolean
  retrying: boolean
  onBack: () => void
  onRetry?: () => void
  onCommitPreview?: () => void | Promise<void>
  onDiscardPreview?: () => void | Promise<void>
}) {
  const problemId = task.params?.problemId || task.params?.targetProblemId
  // 将 task.mode 映射到 AiResultPanel 支持的 AiResultMode
  const resultMode: AiResultMode = (() => {
    switch (task.mode) {
      case 'test_data':
      case 'test_data_incremental':
        return 'test_data'
      case 'analyze':
        return 'analyze'
      case 'suggest_metadata':
        return 'suggest_metadata'
      case 'parametric':
      case 'similar':
      default:
        return 'generate'
    }
  })()

  // AiResultPanel 期望 AiGenerationResult 类型；task.result 的结构与之兼容
  const result = (task.result || {}) as any

  return (
    <div className="space-y-4">
      {/* 顶部：返回按钮 + 任务标题 */}
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="返回任务列表"
          aria-label="返回任务列表"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={task.status} />
            <h3 className="text-base font-bold text-foreground truncate">
              {getTaskTitle(task)}
            </h3>
            <span className="text-xs text-muted-foreground">{modeLabel(task.mode)}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          加载任务详情...
        </div>
      ) : (
        <>
          {/* 基本信息区 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-3 rounded-lg bg-muted/30">
            <InfoItem icon={<Clock className="w-3 h-3" />} label="创建时间">
              {formatDateTime(task.createdAt)}
            </InfoItem>
            <InfoItem icon={<Layers className="w-3 h-3" />} label="任务类型">
              {modeLabel(task.mode)}
            </InfoItem>
            {typeof task.tokensUsed === 'number' && task.tokensUsed > 0 && (
              <InfoItem icon={<Zap className="w-3 h-3" />} label="Token 用量">
                {task.tokensUsed.toLocaleString()}
              </InfoItem>
            )}
            {task.params?.modelId && (
              <InfoItem icon={<Layers className="w-3 h-3" />} label="使用模型">
                {task.params.modelId}
              </InfoItem>
            )}
          </div>

          {/* 任务参数 */}
          {(task.params?.title || task.params?.topic?.length || problemId) && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">任务参数</p>
              <div className="rounded bg-muted/30 p-3 text-xs text-foreground space-y-1">
                {task.params?.title && (
                  <div><span className="text-muted-foreground">标题：</span>{task.params.title}</div>
                )}
                {task.params?.topic && task.params.topic.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">主题：</span>
                    {task.params.topic.join('、')}
                  </div>
                )}
                {task.params?.difficulty && (
                  <div><span className="text-muted-foreground">难度：</span>{task.params.difficulty}</div>
                )}
                {problemId && (
                  <div>
                    <span className="text-muted-foreground">关联题目：</span>
                    <code className="font-mono">{problemId}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {task.error && (
            <div>
              <p className="text-xs font-medium text-error mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                错误信息
              </p>
              <pre className="rounded bg-error/5 border border-error/20 p-3 text-xs text-error whitespace-pre-wrap break-words">
                {task.error}
              </pre>
            </div>
          )}

          {/* 结果详情：复用 AiResultPanel 展示完整生成结果（含预览-确认操作栏：入库/丢弃/重新生成） */}
          {task.status === 'COMPLETED' && result && Object.keys(result).length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                结果详情
              </p>
              <AiResultPanel
                result={result}
                mode={resultMode}
                taskStatus={task.status}
                onCommitPreview={onCommitPreview}
                onDiscardPreview={onDiscardPreview}
                onViewInLibrary={problemId ? () => window.open(`/admin/problems/${problemId}/edit`, '_blank') : undefined}
              />
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
            {problemId && (
              <Link
                href={`/admin/problems/${problemId}/edit`}
                className="btn btn-ghost text-xs flex items-center gap-1 px-3 py-1.5"
                title="跳转关联题目"
              >
                <FileText className="w-3.5 h-3.5" />
                查看题目
              </Link>
            )}

            {onRetry && (task.status === 'FAILED' || task.status === 'COMPLETED') && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="btn btn-ghost text-xs flex items-center gap-1 px-3 py-1.5 disabled:opacity-50"
                title="重试该任务"
              >
                {retrying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5" />
                )}
                重试
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- 通用子组件 ---------- */

function StatusBadge({ status }: { status: AiTaskStatus }) {
  switch (status) {
    case 'PENDING':
      return <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent whitespace-nowrap">等待中</span>
    case 'PROCESSING':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info inline-flex items-center gap-1 whitespace-nowrap">
          <Loader2 className="w-3 h-3 animate-spin" />
          处理中
        </span>
      )
    case 'COMPLETED':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary inline-flex items-center gap-1 whitespace-nowrap">
          <CheckCircle className="w-3 h-3" />
          已完成
        </span>
      )
    case 'FAILED':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-error/10 text-error inline-flex items-center gap-1 whitespace-nowrap">
          <XCircle className="w-3 h-3" />
          失败
        </span>
      )
    case 'DISCARDED':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
          <XCircle className="w-3 h-3" />
          已丢弃
        </span>
      )
    default:
      return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground whitespace-nowrap">{status}</span>
  }
}

function InfoItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
        {icon}
        {label}
      </p>
      <p className="text-foreground break-all">{children}</p>
    </div>
  )
}

/* ---------- 工具函数 ---------- */

function getTaskTitle(task: AiTask): string {
  const t = task.params?.title
  if (t) return t
  const topic = task.params?.topic
  if (topic && topic.length > 0) return topic.join('、')
  return modeLabel(task.mode)
}

function modeLabel(mode?: AiTaskMode | string): string {
  switch (mode) {
    case 'parametric':
      return '智能出题'
    case 'test_data':
      return '测试数据生成'
    case 'analyze':
      return '题目分析'
    case 'suggest_metadata':
      return '元数据建议'
    case 'similar':
      return '相似题生成'
    case 'diagnose':
      return '失败诊断'
    case 'test_data_incremental':
      return '测试数据增量补充'
    default:
      return 'AI 任务'
  }
}

export default AiTaskHistoryPanel
