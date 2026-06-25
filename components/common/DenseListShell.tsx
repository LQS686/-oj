'use client'

import type { ReactNode } from 'react'

export interface DenseListColumn {
  /** grid-cols-12 跨度 */
  span: string
  label: string
  className?: string
}

export interface DenseListShellProps {
  columns: DenseListColumn[]
  children: ReactNode
  className?: string
}

/**
 * 与题库列表一致的 12 列密集表头 + 行容器（border-b、无卡片网格）。
 */
export function DenseListShell({ columns, children, className = '' }: DenseListShellProps) {
  return (
    <div className={`card-static rounded-lg overflow-hidden border border-border ${className}`}>
      <div className="bg-muted px-4 py-2.5 text-xs font-semibold text-muted-foreground border-b border-border">
        <div className="grid grid-cols-12 gap-3 md:gap-4">
          {columns.map((col) => (
            <div key={col.label} className={`${col.span} ${col.className ?? ''}`}>
              {col.label}
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

export const denseListRowClass =
  'grid grid-cols-12 gap-3 md:gap-4 px-4 py-3 hover:bg-primary/5 transition-colors items-center'