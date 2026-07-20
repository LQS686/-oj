'use client'

import type { RefObject } from 'react'
import Link from 'next/link'
import { Clock, Cpu, FileText, Loader2, RotateCw, XCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { AiLogItem } from '../_types'
import { extractModel, formatDuration } from '../_utils'
import { StatusBadge } from './StatusBadge'

interface TaskTableProps {
  logs: AiLogItem[]
  focusedLogId: string
  rowRefs: RefObject<Map<string, HTMLTableRowElement | HTMLDivElement>>
  retryingLogId: string | null
  cancellingLogId: string | null
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
}

export function TaskTable({
  logs,
  focusedLogId,
  rowRefs,
  retryingLogId,
  cancellingLogId,
  onRetry,
  onCancel,
}: TaskTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 px-2 font-medium">用户名</th>
            <th className="py-2 px-2 font-medium">状态</th>
            <th className="py-2 px-2 font-medium">模型</th>
            <th className="py-2 px-2 font-medium">耗时</th>
            <th className="py-2 px-2 font-medium">Token</th>
            <th className="py-2 px-2 font-medium">成本</th>
            <th className="py-2 px-2 font-medium">创建时间</th>
            <th className="py-2 px-2 font-medium">错误</th>
            <th className="py-2 px-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((it) => (
            <tr
              key={it.id}
              ref={(el) => {
                if (el) rowRefs.current.set(it.id, el)
                else rowRefs.current.delete(it.id)
              }}
              className={`border-b border-border/50 hover:bg-muted/30 ${focusedLogId === it.id ? 'ring-2 ring-primary' : ''}`}
            >
              <td className="py-2 px-2 text-foreground">{it.user?.username || '-'}</td>
              <td className="py-2 px-2"><StatusBadge status={it.status} /></td>
              <td className="py-2 px-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {extractModel(it)}
                </span>
              </td>
              <td className="py-2 px-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(it.createdAt, it.updatedAt)}
                </span>
              </td>
              <td className="py-2 px-2 text-muted-foreground">{(it.tokensUsed || 0).toLocaleString()}</td>
              {/* Phase 6 Task 35.3: 成本列 */}
              <td className="py-2 px-2 text-muted-foreground text-xs">
                {it.estimatedCost != null ? `¥${Number(it.estimatedCost).toFixed(6)}` : '-'}
              </td>
              <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                {formatDateTime(it.createdAt)}
              </td>
              <td className="py-2 px-2 text-error text-xs max-w-xs truncate" title={it.error || ''}>
                {it.error || '-'}
              </td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-1">
                  {(() => {
                    const pid = it.params?.problemId || it.params?.targetProblemId
                    return pid ? (
                      <Link
                        href={`/admin/problems/${pid}/edit`}
                        className="p-1 rounded hover:bg-muted text-primary transition-colors"
                        title="跳转关联题目"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Link>
                    ) : null
                  })()}
                  {it.status === 'FAILED' && (
                    <button
                      onClick={() => onRetry(it.id)}
                      disabled={retryingLogId === it.id}
                      className="p-1 rounded hover:bg-muted text-warning disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="重试"
                    >
                      {retryingLogId === it.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {it.status === 'PENDING' && (
                    <button
                      onClick={() => onCancel(it.id)}
                      disabled={cancellingLogId === it.id}
                      className="p-1 rounded hover:bg-muted text-error disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="取消"
                    >
                      {cancellingLogId === it.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
