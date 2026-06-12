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
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFail

export const ok = <T>(data: T, init?: globalThis.ResponseInit): Response => {
  const body: ApiSuccess<T> = { ok: true, success: true, data }
  return Response.json(body, init)
}

export const fail = (code: string, message: string, status: number = 400): Response => {
  const body: ApiFail = { ok: false, success: false, error: message, code }
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
