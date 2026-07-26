/**
 * lib/api/response.ts
 * 统一 API 响应格式：{ success: true, data } | { success: false, error, code }
 */
export interface ApiSuccess<T = unknown> {
  success: true
  data: T
}

export interface ApiFail {
  success: false
  error: string
  code: string
  /**
   * 失败响应携带的额外信息（如 permission 权限详情）。
   * 不会与 data 字段冲突，apiClient 在 fail 路径不会读取 data。
   */
  [key: string]: unknown
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFail

export const ok = <T>(data: T, init?: globalThis.ResponseInit): Response => {
  const body: ApiSuccess<T> = { success: true, data }
  return Response.json(body, init)
}

/**
 * 失败响应统一出口。
 * - extra：透传额外字段（如 permission 权限详情），便于前端细化处理。
 */
export const fail = (
  code: string,
  message: string,
  status: number = 400,
  extra?: Record<string, unknown>
): Response => {
  const body: ApiFail = { success: false, error: message, code, ...(extra || {}) }
  return Response.json(body, { status })
}

export const unauthorized = (message = '未登录') =>
  fail('UNAUTHORIZED', message, 401)

export const forbidden = (message = '权限不足') =>
  fail('FORBIDDEN', message, 403)

export const notFound = (message = '资源不存在') =>
  fail('NOT_FOUND', message, 404)

export const badRequest = (message = '参数错误') =>
  fail('BAD_REQUEST', message, 400)

export const conflict = (message = '资源冲突') =>
  fail('CONFLICT', message, 409)

export const serverError = (message = '服务器错误') =>
  fail('SERVER_ERROR', message, 500)

export const tooManyRequests = (message = '请求过于频繁，请稍后再试') =>
  fail('RATE_LIMITED', message, 429)
