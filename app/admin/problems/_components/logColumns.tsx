'use client'

import { type Column } from '@/components/admin'
import { formatDateTime } from '@/lib/utils'
import type { LogEntry } from '../_types'

/**
 * 来源变更日志表格的列定义。
 *
 * 无依赖回调，直接渲染；详情列展示 count / targetSource。
 */
export function buildLogColumns(): Column<LogEntry>[] {
  return [
    {
      key: 'createdAt',
      label: '时间',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(value)}
        </span>
      ),
    },
    {
      key: 'userId',
      label: '操作人',
      render: (value) => (
        <span className="text-sm text-foreground font-medium">
          {value || 'System'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '动作',
      render: (value) => <span className="tag">{value}</span>,
    },
    {
      key: 'details',
      label: '详情',
      render: (value) => value ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          {value.count !== undefined && <div>数量: {value.count}</div>}
          {value.targetSource && (
            <div>
              目标来源: <span className="font-mono text-xs">{value.targetSource}</span>
            </div>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    },
    {
      key: 'ip',
      label: 'IP',
      render: (value) => (
        <span className="text-sm text-muted-foreground font-mono text-xs">{value}</span>
      ),
    },
  ]
}
