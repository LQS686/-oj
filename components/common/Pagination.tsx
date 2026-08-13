'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** 紧凑模式：小号数字按钮（适合题库等密集列表） */
  compact?: boolean
}

/**
 * 生成带省略号的分页项：始终展示首页/末页，并围绕当前页开一个窗口，
 * 保证「当前页」在任意页码下都可见（修复原先只显示 1..5 + 末页、翻到中间页时无高亮的体验问题）。
 */
function buildItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) items.push('ellipsis')
  for (let i = start; i <= end; i += 1) items.push(i)
  if (end < total - 1) items.push('ellipsis')
  items.push(total)
  return items
}

export function Pagination({ page, totalPages, onChange, compact = false }: PaginationProps) {
  if (totalPages <= 1) return null

  // 防御：调用方可能短暂持有越界页码（如通知页删除最后一页的最后一条后未重置 page），
  // 归一化到 [1, totalPages]，保证高亮/窗口/箭头禁用态始终合理，且箭头点击不会再越界。
  const current = Math.min(Math.max(1, page), totalPages)
  const items = buildItems(current, totalPages)
  const numSize = compact ? 'w-8 h-8 rounded-md' : 'w-10 h-10 rounded-lg'
  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div className="flex items-center gap-2 card-static rounded-lg p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        aria-label="上一页"
        className="btn btn-ghost px-3 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className={iconSize} />
      </button>

      <div className="flex items-center gap-1">
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="px-2 text-muted-foreground select-none"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              aria-current={item === current ? 'page' : undefined}
              className={`${numSize} font-semibold transition-colors ${
                item === current
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
              }`}
            >
              {item}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, current + 1))}
        disabled={current >= totalPages}
        aria-label="下一页"
        className="btn btn-ghost px-3 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronRight className={iconSize} />
      </button>
    </div>
  )
}
