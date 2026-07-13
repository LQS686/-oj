/**
 * lib/types/common.ts
 * 跨业务模块的通用类型
 */

export interface ListOptions {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
