/**
 * lib/api/response.ts
 * 统一 API 响应格式：{ ok, data, error, code } + 兼容旧格式 { success, data, error }
 *
 * 现状：前端 apiClient 处理 { success, data, message, error }；
 * 新格式使用 { ok, data, error, code }。为保持向后兼容，默认 ok/fail 同时输出两个字段。
 */

export interface ApiSuccess<T = unknown> {
  ok: true
  success: true
  data: T
}

export interface ApiFail {
  ok: false
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
  const body: ApiSuccess<T> = { ok: true, success: true, data }
  return Response.json(body, init)
}

/**
 * 失败响应统一出口。
 * - extra：透传额外字段（如 permission 权限详情），便于前端细化处理。
 *   注意：apiClient 在 fail 路径会 throw，不会自动消费 data/extra；
 *   前端若用 fetchWithCookie + 手动 res.json()，可以读取 extra 字段。
 */
export const fail = (
  code: string,
  message: string,
  status: number = 400,
  extra?: Record<string, unknown>
): Response => {
  const body: ApiFail = { ok: false, success: false, error: message, code, ...(extra || {}) }
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
