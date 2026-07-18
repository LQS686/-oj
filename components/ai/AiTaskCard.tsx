'use client'

import { Loader2, CheckCircle, XCircle, Clock, Zap, FileText } from 'lucide-react'
import Link from 'next/link'
import type { AiTask, AiTaskStatus } from '@/types/ai'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'

interface AiTaskCardProps {
  task: AiTask
  /** 点击卡片回调 */
  onClick?: () => void
  /** 是否显示关联题目跳转按钮（默认 true） */
  showProblemLink?: boolean
  /** 自定义 className */
  className?: string
}

/**
 * AI 任务卡片
 *
 * 渲染：
 * - 状态徽章（PENDING / PROCESSING / COMPLETED / FAILED）
 * - 任务标题（topic / title / mode fallback）
 * - 耗时（基于 createdAt）
 * - token 用量
 * - 跳转关联题目按钮（当 task.params.problemId / targetProblemId 存在时）
 */
export function AiTaskCard({ task, onClick, showProblemLink = true, className = '' }: AiTaskCardProps) {
  const problemId = task.params?.problemId || task.params?.targetProblemId

  const title = (() => {
    const t = task.params?.title
    if (t) return t
    const topic = task.params?.topic
    if (topic && topic.length > 0) return topic.join('、')
    return modeLabel(task.mode)
  })()

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusBadge status={task.status} />
          <span className="text-sm text-foreground truncate">{title}</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDateTime(task.createdAt)}
          </span>
          {typeof task.tokensUsed === 'number' && task.tokensUsed > 0 && (
            <span className="inline-flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {task.tokensUsed.toLocaleString()} tokens
            </span>
          )}
        </div>
        {showProblemLink && problemId && (
          <Link
            href={`/admin/problems/${problemId}/edit`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:text-primary-light"
            title="跳转关联题目"
          >
            <FileText className="w-3 h-3" />
            查看
          </Link>
        )}
      </div>

      {task.error && (
        <p className="mt-1 text-xs text-error truncate" title={task.error}>
          {task.error}
        </p>
      )}
    </div>
  )
}

/**
 * 状态徽章子组件
 */
function StatusBadge({ status }: { status: AiTaskStatus }) {
  switch (status) {
    case 'PENDING':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent">等待中</span>
      )
    case 'PROCESSING':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          处理中
        </span>
      )
    case 'COMPLETED':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary inline-flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          已完成
        </span>
      )
    case 'FAILED':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-error/10 text-error inline-flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          失败
        </span>
      )
    default:
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{status}</span>
      )
  }
}

function modeLabel(mode?: string): string {
  switch (mode) {
    case 'parametric':
      return '智能出题'
    case 'test_data':
      return '测试数据生成'
    case 'analyze':
      return '题目分析'
    case 'suggest_metadata':
      return '元数据建议'
    default:
      return 'AI 任务'
  }
}

export default AiTaskCard
