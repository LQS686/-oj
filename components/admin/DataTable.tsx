'use client'

import React, { useState, useMemo, ReactNode } from 'react'
import { ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from 'lucide-react'

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
  onRowClick
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: '',
    direction: null,
  })
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

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
          <th className="px-4 py-3 w-4">
            <input
              type="checkbox"
              checked={selectedRows.size === data.length && data.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary/50"
            />
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
                  ) : sortConfig.direction === 'desc' ? (
                    <ChevronDown className="w-4 h-4 text-primary-light" />
                  ) : null
                ) : null
              )}
            </div>
          </th>
        ))}
        {batchActions && batchActions.length > 0 && (
          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
            操作
          </th>
        )}
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
              {batchActions && batchActions.length > 0 && (
                <td className="px-4 py-3 text-right">
                  <div className="w-8 h-4 rounded bg-muted animate-pulse ml-auto"></div>
                </td>
              )}
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
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleSelectRow(rowId, e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary/50"
                  />
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
              {batchActions && batchActions.length > 0 && (
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      title="更多操作"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              )}
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
              className="btn btn-ghost px-3 py-1 text-sm disabled:opacity-50"
            >
              <ChevronDown className="w-4 h-4 rotate-90" />
            </button>
            <span className="px-3 text-sm text-muted-foreground">{page} / {totalPages || 1}</span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="btn btn-ghost px-3 py-1 text-sm disabled:opacity-50"
            >
              <ChevronUp className="w-4 h-4 rotate-90" />
            </button>
          </div>
        </div>
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
      <div className="overflow-x-auto">
        <table className="w-full">
          {renderHeader()}
          {renderBody()}
        </table>
      </div>
      {renderPagination()}
    </div>
  )
}
