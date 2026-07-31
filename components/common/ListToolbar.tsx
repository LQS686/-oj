'use client'

import type { FormEvent, ReactNode } from 'react'
import { Search } from 'lucide-react'

export interface ListToolbarSearchConfig {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** 传入后渲染「搜索」提交按钮，并由 form 触发 */
  onSubmit?: () => void
  submitLabel?: string
  type?: 'text' | 'search'
}

export interface ListToolbarProps {
  /** 左侧区域：分段筛选、来源切换等 */
  leading?: ReactNode
  /** 搜索框（可带提交） */
  search?: ListToolbarSearchConfig
  /** 右侧区域：下拉筛选、随机一题、清除等独有操作 */
  trailing?: ReactNode
  className?: string
}

/**
 * 用户端列表页统一工具栏：
 * 卡片容器 + [leading | search(弹性) | trailing]，各页独有控件通过槽位传入。
 */
export function ListToolbar({ leading, search, trailing, className = '' }: ListToolbarProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    search?.onSubmit?.()
  }

  const searchInput = search ? (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
      <input
        type={search.type ?? 'text'}
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        placeholder={search.placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-md border-0 bg-transparent text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-0"
        aria-label={search.placeholder || '搜索'}
      />
    </div>
  ) : null

  const showDivider = Boolean((leading || search) && trailing)

  return (
    <div
      className={`card-static rounded-lg border border-border p-2 relative z-10 ${className}`.trim()}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {leading && (
          <div className="flex items-center gap-1 shrink-0 overflow-x-auto">{leading}</div>
        )}

        {search &&
          (search.onSubmit ? (
            <form
              onSubmit={handleSubmit}
              className="flex gap-2 flex-1 min-w-0 items-center"
            >
              {searchInput}
              <button type="submit" className="btn btn-ghost btn-sm shrink-0 px-3">
                {search.submitLabel || '搜索'}
              </button>
            </form>
          ) : (
            <div className="flex-1 min-w-0 flex items-center">{searchInput}</div>
          ))}

        {trailing && (
          <div
            className={`flex items-center gap-2 shrink-0 flex-wrap ${
              showDivider
                ? 'border-t sm:border-t-0 sm:border-l border-border pt-2 sm:pt-0 sm:pl-2'
                : ''
            }`}
          >
            {trailing}
          </div>
        )}
      </div>
    </div>
  )
}

export interface ListToolbarTabItem {
  key: string
  label: ReactNode
}

export interface ListToolbarTabsProps {
  value: string
  onChange: (key: string) => void
  items: ListToolbarTabItem[]
  className?: string
  /** aria 标签，默认「筛选」 */
  ariaLabel?: string
}

/** 分段筛选 tabs（竞赛状态、班级范围、排行类型等） */
export function ListToolbarTabs({
  value,
  onChange,
  items,
  className = '',
  ariaLabel = '筛选',
}: ListToolbarTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-0.5 p-0.5 rounded-md bg-muted/70 ${className}`.trim()}
    >
      {items.map((item) => {
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
