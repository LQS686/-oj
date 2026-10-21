'use client'

import type { ReactNode } from 'react'

export interface DenseListColumn {
  /** grid 跨度（16 列栅格） */
  span: string
  label: string
  className?: string
}

export interface DenseListShellProps {
  columns: DenseListColumn[]
  children: ReactNode
  className?: string
}

const DENSE_GRID_CLASS = 'grid grid-cols-[repeat(16,minmax(0,1fr))] gap-3 md:gap-4'

/**
 * 与题库列表一致的 16 列密集表头 + 行容器（border-b、无卡片网格）。
 * 16 列用于收窄状态/题号列，把更多宽度留给标签与标题。
 */
export function DenseListShell({ columns, children, className = '' }: DenseListShellProps) {
  return (
    <div className={`card-static overflow-hidden border border-border ${className}`}>
      <div className="bg-muted px-4 py-2.5 text-xs font-semibold text-muted-foreground border-b border-border">
        <div className={DENSE_GRID_CLASS}>
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

export const denseListRowClass = `${DENSE_GRID_CLASS} px-4 py-3 hover:bg-primary/5 transition-colors items-center`
