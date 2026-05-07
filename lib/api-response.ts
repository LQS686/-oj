import { NextResponse } from 'next/server'
import { ERROR_CODES, type ErrorCode } from './error-handler'

interface SuccessResponse<T> {
  success: true
  data: T
  message?: string
}

interface ErrorResponse {
  success: false
  error: string
  code?: ErrorCode
  details?: Record<string, unknown>
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasMore: boolean
}

interface PaginatedResponse<T> {
  success: true
  data: T[]
  pagination: PaginationInfo
}

export function success<T>(data: T, message?: string): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    ...(message && { message }),
  })
}

export function error(
  message: string,
  statusCode: number = 500,
  code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
  details?: Record<string, unknown>
): NextResponse<ErrorResponse> {
  const isProduction = process.env.NODE_ENV === 'production'

  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(code !== ERROR_CODES.INTERNAL_ERROR && { code }),
      ...(details && !isProduction && { details }),
    },
    { status: statusCode }
  )
}

export function paginated<T>(
  data: T[],
  pagination: {
    page: number
    pageSize: number
    total: number
  }
): NextResponse<PaginatedResponse<T>> {
  const totalPages = Math.ceil(pagination.total / pagination.pageSize)
  const hasMore = pagination.page < totalPages

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      totalPages,
      hasMore,
    },
  })
}

export function created<T>(data: T, message?: string): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message && { message }),
    },
    { status: 201 }
  )
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export function badRequest(message: string, details?: Record<string, unknown>): NextResponse<ErrorResponse> {
  return error(message, 400, ERROR_CODES.VALIDATION_ERROR, details)
}

export function unauthorized(message: string = '未授权访问'): NextResponse<ErrorResponse> {
  return error(message, 401, ERROR_CODES.UNAUTHORIZED)
}

export function forbidden(message: string = '禁止访问'): NextResponse<ErrorResponse> {
  return error(message, 403, ERROR_CODES.FORBIDDEN)
}

export function notFound(message: string = '资源不存在'): NextResponse<ErrorResponse> {
  return error(message, 404, ERROR_CODES.NOT_FOUND)
}

export function conflict(message: string, details?: Record<string, unknown>): NextResponse<ErrorResponse> {
  return error(message, 409, ERROR_CODES.CONFLICT, details)
}

export function internalError(message: string = '服务器内部错误'): NextResponse<ErrorResponse> {
  return error(message, 500, ERROR_CODES.INTERNAL_ERROR)
}

export function rateLimited(message: string = '请求过于频繁，请稍后重试'): NextResponse<ErrorResponse> {
  return error(message, 429, ERROR_CODES.RATE_LIMIT)
}

export const tooManyRequests = rateLimited
