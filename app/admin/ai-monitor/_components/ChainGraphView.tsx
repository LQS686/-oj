'use client'

import Link from 'next/link'
import { AlertCircle, FileText, ListChecks, Loader2, Network, RotateCw, XCircle } from 'lucide-react'
import type { AiLogItem } from '../_types'
import { formatDuration } from '../_utils'
import { StatusBadge } from './StatusBadge'

interface ChainGraphViewProps {
  chains: AiLogItem[][]
  orphans: AiLogItem[]
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
  onFocusTask: (logId: string) => void
  retryingLogId: string | null
  cancellingLogId: string | null
}

/**
 * Phase 6 Task 36.3 / 36.4: 任务链图视图
 *
 * 渲染有向链：root → child → grandchild → ...
 * - 成功节点（COMPLETED）：绿色边框
 * - 失败节点（FAILED）：红色边框
 * - 进行中节点（PROCESSING）：蓝色边框 + 旋转图标
 * - 待处理节点（PENDING）：灰色边框
 * - 点击节点跳转关联题目（如 params.problemId 存在）
 * - Phase 6 Task 36.4：点击节点详情按钮跳转列表视图对应行（?focus=xxx）
 */
export function ChainGraphView({
  chains,
  orphans,
  onRetry,
  onCancel,
  onFocusTask,
  retryingLogId,
  cancellingLogId,
}: ChainGraphViewProps) {
  if (chains.length === 0 && orphans.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>暂无任务链</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {chains.map((chain, idx) => (
        <ChainRow
          key={`chain-${idx}`}
          chain={chain}
          onRetry={onRetry}
          onCancel={onCancel}
          onFocusTask={onFocusTask}
          retryingLogId={retryingLogId}
          cancellingLogId={cancellingLogId}
        />
      ))}

      {orphans.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            孤儿任务（无父任务关联，{orphans.length} 条）
          </p>
          <div className="flex flex-wrap gap-2">
            {orphans.map((it) => (
              <ChainNode
                key={it.id}
                item={it}
                onRetry={onRetry}
                onCancel={onCancel}
                onFocusTask={onFocusTask}
                retryingLogId={retryingLogId}
                cancellingLogId={cancellingLogId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChainRow({
  chain,
  onRetry,
  onCancel,
  onFocusTask,
  retryingLogId,
  cancellingLogId,
}: {
  chain: AiLogItem[]
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
  onFocusTask: (logId: string) => void
  retryingLogId: string | null
  cancellingLogId: string | null
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
        <Network className="w-3 h-3" />
        <span>任务链（{chain.length} 个节点）</span>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto custom-scrollbar pb-2">
        {chain.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 flex-shrink-0">
            <ChainNode
              item={item}
              onRetry={onRetry}
              onCancel={onCancel}
              onFocusTask={onFocusTask}
              retryingLogId={retryingLogId}
              cancellingLogId={cancellingLogId}
            />
            {idx < chain.length - 1 && (
              <div className="flex items-center text-muted-foreground" aria-hidden="true">
                <span className="text-lg">→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChainNode({
  item,
  onRetry,
  onCancel,
  onFocusTask,
  retryingLogId,
  cancellingLogId,
}: {
  item: AiLogItem
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
  onFocusTask: (logId: string) => void
  retryingLogId: string | null
  cancellingLogId: string | null
}) {
  const status = item.status
  const borderClass =
    status === 'COMPLETED' ? 'border-success/60 bg-success/5'
    : status === 'FAILED' ? 'border-error/60 bg-error/5'
    : status === 'PROCESSING' ? 'border-info/60 bg-info/5'
    : 'border-border bg-muted'

  const pid = item.params?.problemId || item.params?.targetProblemId

  return (
    <div className={`rounded-lg border-2 ${borderClass} p-2.5 min-w-[180px] max-w-[240px]`}>
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <StatusBadge status={status} />
        <span className="text-[10px] text-muted-foreground font-mono" title={item.id}>
          #{item.id.slice(-6)}
        </span>
      </div>
      <p className="text-xs text-foreground font-medium mb-1 truncate">
        {item.user?.username || '未知用户'}
      </p>
      <p className="text-[10px] text-muted-foreground mb-1 truncate">
        模式：{item.params?.mode || '-'}
      </p>
      <p className="text-[10px] text-muted-foreground mb-1.5">
        耗时：{formatDuration(item.createdAt, item.updatedAt)}
        · Token：{(item.tokensUsed || 0).toLocaleString()}
      </p>
      {item.estimatedCost != null && (
        <p className="text-[10px] text-success mb-1.5">
          成本：¥{Number(item.estimatedCost).toFixed(6)}
        </p>
      )}
      {item.error && (
        <p className="text-[10px] text-error mb-1.5 line-clamp-2" title={item.error}>
          {item.error}
        </p>
      )}
      <div className="flex items-center gap-1">
        {/* Phase 6 Task 36.4：点击节点详情按钮跳转列表视图对应行 */}
        <button
          onClick={() => onFocusTask(item.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="在列表视图中定位此任务"
        >
          <ListChecks className="w-3 h-3" />
        </button>
        {pid && (
          <Link
            href={`/admin/problems/${pid}/edit`}
            className="p-1 rounded hover:bg-muted text-primary transition-colors"
            title="跳转关联题目"
          >
            <FileText className="w-3 h-3" />
          </Link>
        )}
        {status === 'FAILED' && (
          <button
            onClick={() => onRetry(item.id)}
            disabled={retryingLogId === item.id}
            className="p-1 rounded hover:bg-muted text-warning disabled:opacity-50 transition-colors"
            title="重试"
          >
            {retryingLogId === item.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCw className="w-3 h-3" />
            )}
          </button>
        )}
        {status === 'PENDING' && (
          <button
            onClick={() => onCancel(item.id)}
            disabled={cancellingLogId === item.id}
            className="p-1 rounded hover:bg-muted text-error disabled:opacity-50 transition-colors"
            title="取消"
          >
            {cancellingLogId === item.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
