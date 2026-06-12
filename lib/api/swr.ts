/**
 * lib/api/swr.ts
 * SWR 客户端工具：fetcher + 响应处理
 *
 * 业务返回格式：{ ok, data, error, code }
 * fetcher 自动解包：成功返回 data，失败抛出 Error
 */

import type { ApiResponse } from './response'

export class SwrError extends Error {
  constructor(message: string, public code: string, public status?: number) {
    super(message)
    this.name = 'SwrError'
  }
}

/**
 * 默认 fetcher：
 * - 调用 fetch(url, { credentials: 'include' })
 * - 解包 { ok, data, error, code } 响应
 * - 401 时抛出 SwrError('UNAUTHORIZED')，调用方可决定是否跳转登录
 */
export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  let body: ApiResponse<T> | null = null
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new SwrError('服务器响应不是合法 JSON', 'INVALID_JSON', res.status)
  }
  if (!body) {
    throw new SwrError('空响应', 'EMPTY', res.status)
  }
  if (!body.ok) {
    throw new SwrError(body.error || '请求失败', body.code || 'UNKNOWN', res.status)
  }
  return body.data
}

/**
 * 携带参数的 fetcher（用于 mutation 或自定义 header）
 */
export async function postJson<T = unknown>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = (await res.json()) as ApiResponse<T>
  if (!body.ok) {
    throw new SwrError(body.error || '请求失败', body.code || 'UNKNOWN', res.status)
  }
  return body.data
}

/**
 * 透传 fetcher（POST/PUT/DELETE）
 */
export async function mutateJson<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  payload?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const body = (await res.json()) as ApiResponse<T>
  if (!body.ok) {
    throw new SwrError(body.error || '请求失败', body.code || 'UNKNOWN', res.status)
  }
  return body.data
}

/**
 * SWR key 工厂：避免散落的字符串拼接
 */
export const swrKey = {
  me: () => '/api/auth/me',
  user: (id: string) => `/api/users/${id}/info`,
  userStats: (id: string) => `/api/users/${id}/stats`,
  problem: (id: string) => `/api/problems/${id}`,
  problemList: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
    const q = qs.toString()
    return `/api/problems${q ? `?${q}` : ''}`
  },
  class: (id: string) => `/api/classes/${id}`,
  classMembers: (id: string) => `/api/classes/${id}/members`,
  classAssignments: (id: string) => `/api/classes/${id}/assignments`,
  contest: (id: string) => `/api/contests/${id}`,
  contestRank: (id: string) => `/api/contests/${id}/rank`,
  notifications: () => '/api/notifications',
  myRank: () => '/api/rankings/my-rank',
  globalRanking: () => '/api/rankings',
  tags: () => '/api/problems/tags',
}
