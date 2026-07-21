'use client'

import { useState, useMemo, useEffect, ReactNode } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  return isMobile
}

export interface Column<T> {
  key: keyof T
  label: string
  sortable?: boolean
  className?: string
  render?: (value: any, row: T) => ReactNode
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  batchActions?: Array<{
    label: string
    action: (selectedIds: string[]) => void
    danger?: boolean
  }>
  loading?: boolean
  emptyMessage?: string
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
  }
  idKey: string
  onRowClick?: (row: T) => void
  mobileCardRenderer?: (row: T) => ReactNode
  // 选中行变化回调，将内部 selectedRows 同步给父组件
  onSelectionChange?: (ids: string[]) => void
}

interface SortConfig {
  key: string
  direction: 'asc' | 'desc' | null
}

/**
 * DataTable — reusable, generic table for admin list pages.
 *
 * Provides client-side sorting, row selection with batch actions,
 * pagination, row-click navigation, a loading skeleton state, and an
 * empty state. Built with design tokens (bg-card, text-foreground,
 * border-border, bg-muted, text-muted-foreground) so it adapts to the
 * light/dark theme automatically.
 *
 * @typeParam T - The row data type.
 *
 * @example
 * ```tsx
 * import { DataTable, type Column } from '@/components/admin'
 *
 * interface User { id: string; name: string; status: 'active' | 'banned' }
 *
 * const columns: Column<User>[] = [
 *   { key: 'name', label: '用户名', sortable: true },
 *   {
 *     key: 'status',
 *     label: '状态',
 *     render: (value) => <span className="tag tag-primary">{value}</span>,
 *   },
 * ]
 *
 * <DataTable<User>
 *   data={users}
 *   columns={columns}
 *   idKey="id"
 *   loading={isLoading}
 *   onRowClick={(row) => router.push(`/admin/users/${row.id}`)}
 *   pagination={{ page, pageSize, total, onPageChange, onPageSizeChange }}
 *   batchActions={[{ label: '删除', action: deleteUsers, danger: true }]}
 * />
 * ```
 *
 * `Column<T>`:
 * - `key: keyof T` — field to read from each row. Supports dot paths (e.g. `'user.name'`).
 * - `label: string` — header text.
 * - `sortable?: boolean` — enables client-side sort on this column.
 * - `className?: string` — extra classes applied to the column's `<th>` and `<td>`.
 * - `render?: (value: any, row: T) => ReactNode` — custom cell renderer; use it for
 *   badges, status tags, formatted dates, links, etc. Returns ReactNode so any JSX works.
 *
 * `DataTableProps<T>`:
 * - `data: T[]` — rows to render.
 * - `columns: Column<T>[]` — column definitions.
 * - `batchActions?: Array<{ label: string; action: (selectedIds: string[]) => void; danger?: boolean }>`
 *   — when provided, renders a selection checkbox column and an action bar shown when rows are selected.
 * - `loading?: boolean` — when true, renders shimmer placeholder rows instead of data.
 * - `emptyMessage?: string` — text shown when `data` is empty (default `'暂无数据'`).
 * - `pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }`
 *   — optional pagination footer.
 * - `idKey: string` — name of the field that uniquely identifies a row (used for keys & selection).
 * - `onRowClick?: (row: T) => void` — row click handler; typically used to navigate to a detail page.
 */
export default function DataTable<T>({
  data,
  columns,
  batchActions,
  loading,
  emptyMessage = '暂无数据',
  pagination,
  idKey,
  onRowClick,
  mobileCardRenderer,
  onSelectionChange
}: DataTableProps<T>) {
  const isMobile = useIsMobile()
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: '',
    direction: null,
  })
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  // 选中行变化时同步给父组件（如导出弹窗需要拿到选中 ID）
  useEffect(() => {
    onSelectionChange?.(Array.from(selectedRows))
  }, [selectedRows, onSelectionChange])

  const handleSort = (key: string) => {
    if (sortConfig.key === key) {
      if (sortConfig.direction === null) {
        setSortConfig({ key, direction: 'asc' })
      } else if (sortConfig.direction === 'asc') {
        setSortConfig({ key, direction: 'desc' })
      } else {
        setSortConfig({ key: '', direction: null })
      }
    } else {
      setSortConfig({ key, direction: 'asc' })
    }
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(new Set(data.map(row => String(row[idKey as keyof T]))))
    } else {
      setSelectedRows(new Set())
    }
  }

  const handleSelectRow = (rowId: string, isChecked: boolean) => {
    const newSelected = new Set(selectedRows)
    if (isChecked) {
      newSelected.add(rowId)
    } else {
      newSelected.delete(rowId)
    }
    setSelectedRows(newSelected)
  }

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return data
    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof T]
      const bValue = b[sortConfig.key as keyof T]
      if (aValue === undefined || aValue === null) return 0
      if (bValue === undefined || bValue === null) return 0
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
      }
      return 0
    })
  }, [data, sortConfig])

  const renderHeader = () => (
    <thead>
      <tr className="border-b border-border">
        {batchActions && batchActions.length > 0 && (
          <th className="px-4 py-3 w-12">
            <label className="inline-flex items-center justify-center w-9 h-9 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRows.size === data.length && data.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary/50"
              />
            </label>
          </th>
        )}
        {columns.map((column) => (
          <th
            key={String(column.key)}
            className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${column.className || ''}`}
          >
            <div
              className={`flex items-center gap-1 ${column.sortable ? 'cursor-pointer select-none' : ''}`}
              onClick={column.sortable ? () => handleSort(String(column.key)) : undefined}
            >
              {column.label}
              {column.sortable && (
                sortConfig.key === column.key ? (
                  sortConfig.direction === 'asc' ? (
                    <ChevronUp className="w-4 h-4 text-primary-light" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-primary-light" />
                  )
                ) : null
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  )

  const renderBody = () => {
    if (loading) {
      const skeletonRowCount = 5
      const skeletonWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3']
      return (
        <tbody className="divide-y divide-border">
          {Array.from({ length: skeletonRowCount }).map((_, rowIdx) => (
            <tr key={`skeleton-${rowIdx}`}>
              {batchActions && batchActions.length > 0 && (
                <td className="px-4 py-3">
                  <div className="w-4 h-4 rounded bg-muted animate-pulse"></div>
                </td>
              )}
              {columns.map((column, colIdx) => (
                <td
                  key={`skeleton-${rowIdx}-${String(column.key)}`}
                  className={`px-4 py-3 ${column.className || ''}`}
                >
                  <div
                    className={`h-4 rounded bg-muted animate-pulse ${skeletonWidths[(rowIdx + colIdx) % skeletonWidths.length]}`}
                  ></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      )
    }
    if (data.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={columns.length + (batchActions ? 2 : 1)} className="px-4 py-12 text-center text-muted-foreground">
              {emptyMessage}
            </td>
          </tr>
        </tbody>
      )
    }
    return (
      <tbody className="divide-y divide-border">
        {sortedData.map((row) => {
          const rowId = String(row[idKey as keyof T])
          const isSelected = selectedRows.has(rowId)
          return (
            <tr
              key={rowId}
              className={`transition-colors hover:bg-muted ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {batchActions && batchActions.length > 0 && (
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <label className="inline-flex items-center justify-center w-9 h-9 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleSelectRow(rowId, e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary/50"
                    />
                  </label>
                </td>
              )}
              {columns.map((column) => {
                const value = typeof column.key === 'string' && column.key.includes('.')
                  ? column.key.split('.').reduce((acc: any, key: any) => acc?.[key], row)
                  : row[column.key as keyof T]
                return (
                  <td key={String(column.key)} className={`px-4 py-3 ${column.className || ''}`}>
                    {column.render ? column.render(value, row) : (
                      <span className="text-foreground">{String(value ?? '')}</span>
                    )}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    )
  }

  const renderPagination = () => {
    if (!pagination) return null
    const { page, pageSize, total, onPageChange, onPageSizeChange } = pagination
    const totalPages = Math.ceil(total / pageSize)
    return (
      <div className="px-4 md:px-6 py-4 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          显示 {pageSize * (page - 1) + 1} 到 {Math.min(pageSize * page, total)} 共 {total} 条
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="input w-auto text-sm py-1"
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
            <option value={100}>100条/页</option>
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn btn-ghost px-3.5 py-2 text-sm disabled:opacity-50"
            >
              <ChevronDown className="w-4 h-4 rotate-90" />
            </button>
            <span className="px-3 text-sm text-muted-foreground">{page} / {totalPages || 1}</span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="btn btn-ghost px-3.5 py-2 text-sm disabled:opacity-50"
            >
              <ChevronUp className="w-4 h-4 rotate-90" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderMobileCards = () => {
    if (loading) {
      return (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={`skeleton-card-${idx}`} className="card p-4">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse mb-2"></div>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse"></div>
            </div>
          ))}
        </div>
      )
    }
    if (data.length === 0) {
      return (
        <div className="px-4 py-12 text-center text-muted-foreground">
          {emptyMessage}
        </div>
      )
    }
    return (
      <div className="p-4 space-y-3">
        {sortedData.map((row) => {
          const rowId = String(row[idKey as keyof T])
          const isSelected = selectedRows.has(rowId)
          return (
            <div
              key={rowId}
              className={`card p-4 transition-colors ${onRowClick ? 'cursor-pointer hover:border-primary/40' : ''} ${isSelected ? 'border-primary ring-1 ring-primary/20' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {batchActions && batchActions.length > 0 && (
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-border" onClick={e => e.stopPropagation()}>
                  <label className="inline-flex items-center justify-center w-9 h-9 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleSelectRow(rowId, e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary/50"
                    />
                  </label>
                  {isSelected && (
                    <span className="text-xs text-primary-light font-medium">已选择</span>
                  )}
                </div>
              )}
              {mobileCardRenderer ? (
                mobileCardRenderer(row)
              ) : (
                <dl className="space-y-2">
                  {columns.map((column) => {
                    const value = typeof column.key === 'string' && column.key.includes('.')
                      ? column.key.split('.').reduce((acc: any, key: any) => acc?.[key], row)
                      : row[column.key as keyof T]
                    return (
                      <div key={String(column.key)} className="flex items-start gap-3">
                        <dt className="text-xs text-muted-foreground uppercase tracking-wider flex-shrink-0 min-w-[80px]">
                          {column.label}
                        </dt>
                        <dd className="text-sm text-foreground flex-1 break-words">
                          {column.render ? column.render(value, row) : (
                            <span>{String(value ?? '')}</span>
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      {batchActions && batchActions.length > 0 && selectedRows.size > 0 && (
        <div className="px-4 md:px-6 py-3 border-b border-border flex flex-wrap items-center gap-3 bg-primary/5">
          <span className="text-sm text-primary-light font-medium">已选择 {selectedRows.size} 项</span>
          <div className="flex flex-wrap gap-2">
            {batchActions.map((action, index) => (
              <button
                key={index}
                onClick={() => action.action(Array.from(selectedRows))}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  action.danger
                    ? 'bg-error/20 text-error hover:bg-error/30'
                    : 'bg-primary/20 text-primary-light hover:bg-primary/30'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {isMobile ? (
        renderMobileCards()
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderHeader()}
              {renderBody()}
            </table>
          </div>
        </>
      )}
      {renderPagination()}
    </div>
  )
}
