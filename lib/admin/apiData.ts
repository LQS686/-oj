/**
 * 管理后台 API 响应解包（兼容 ok({ data: T }) 与历史双层 data.data）
 */

export function unwrapApiPayload<T = unknown>(json: {
  success?: boolean
  data?: unknown
}): T | null {
  if (!json?.success) return null
  const d = json.data as Record<string, unknown> | unknown[] | null | undefined
  if (d === null || d === undefined) return null as T
  if (Array.isArray(d)) return d as T
  if (typeof d === 'object' && d !== null && 'data' in d && (d as { data: unknown }).data !== undefined) {
    return (d as { data: T }).data
  }
  return d as T
}

export function unwrapApiList<T = unknown>(json: {
  success?: boolean
  data?: unknown
}): T[] {
  const payload = unwrapApiPayload<T[] | T>(json)
  return Array.isArray(payload) ? payload : []
}