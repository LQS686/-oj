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

/**
 * 分页参数校验：确保 page >= 1, pageSize >= 1 且不超过 maxPageSize
 */
export function sanitizePagination(
  page: number | undefined,
  pageSize: number | undefined,
  defaults: { page?: number; pageSize?: number; maxPageSize?: number } = {}
): { page: number; pageSize: number } {
  const p = page && page > 0 ? Math.floor(page) : (defaults.page ?? 1)
  const ps = pageSize && pageSize > 0 ? Math.floor(pageSize) : (defaults.pageSize ?? 20)
  const maxPs = defaults.maxPageSize ?? 100
  return { page: p, pageSize: Math.min(ps, maxPs) }
}

/**
 * 计算分页元数据
 */
export function calcPaginationMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  }
}
