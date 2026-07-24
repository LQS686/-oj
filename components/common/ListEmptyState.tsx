'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface ListEmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  /** error 用红色图标底 */
  tone?: 'default' | 'error'
}

/**
 * 列表/筛选空态：紧凑居中，避免 p-12~p-16 营销式留白。
 */
export function ListEmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'default',
}: ListEmptyStateProps) {
  return (
    <div className="card-static rounded-xl border border-border px-6 py-8 text-center max-w-md mx-auto">
      {Icon && (
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${
            tone === 'error' ? 'bg-error/10' : 'bg-muted'
          }`}
        >
          <Icon className={`w-5 h-5 ${tone === 'error' ? 'text-error' : 'text-muted-foreground'}`} />
        </div>
      )}
      <p
        className={`text-sm font-medium mb-1 ${
          tone === 'error' ? 'text-error' : 'text-foreground'
        }`}
      >
        {title}
      </p>
      {description ? (
        <div className="text-xs text-muted-foreground mb-3 leading-relaxed">{description}</div>
      ) : null}
      {action}
    </div>
  )
}
