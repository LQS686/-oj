import { NextRequest, NextResponse } from 'next/server'

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

export interface AppErrorDetails {
  field?: string
  constraint?: string
  [key: string]: unknown
}

export class AppError extends Error {
  statusCode: number
  code: ErrorCode
  details?: AppErrorDetails
  isOperational: boolean

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
    details?: AppErrorDetails,
    isOperational: boolean = true
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.isOperational = isOperational

    Error.captureStackTrace(this, this.constructor)
  }

  static validation(message: string, details?: AppErrorDetails): AppError {
    return new AppError(message, 400, ERROR_CODES.VALIDATION_ERROR, details)
  }

  static unauthorized(message: string = '未授权访问'): AppError {
    return new AppError(message, 401, ERROR_CODES.UNAUTHORIZED)
  }

  static forbidden(message: string = '禁止访问'): AppError {
    return new AppError(message, 403, ERROR_CODES.FORBIDDEN)
  }

  static notFound(message: string = '资源不存在'): AppError {
    return new AppError(message, 404, ERROR_CODES.NOT_FOUND)
  }

  static conflict(message: string, details?: AppErrorDetails): AppError {
    return new AppError(message, 409, ERROR_CODES.CONFLICT, details)
  }

  static internal(message: string = '服务器内部错误'): AppError {
    return new AppError(message, 500, ERROR_CODES.INTERNAL_ERROR, undefined, false)
  }

  static rateLimit(message: string = '请求过于频繁，请稍后重试'): AppError {
    return new AppError(message, 429, ERROR_CODES.RATE_LIMIT)
  }
}

interface SanitizedError {
  message: string
  code: ErrorCode
  statusCode: number
  details?: AppErrorDetails
}

interface DevError extends SanitizedError {
  stack?: string
  originalError?: string
}

const SENSITIVE_PATTERNS = [
  /password/gi,
  /token/gi,
  /secret/gi,
  /key/gi,
  /credential/gi,
  /authorization/gi,
  /cookie/gi,
  /session/gi,
]

const SENSITIVE_PATHS = [
  /\/node_modules\//gi,
  /\/\.next\//gi,
  /\/dist\//gi,
  /\/build\//gi,
  /C:\\/gi,
  /\/home\//gi,
  /\/var\//gi,
  /\/etc\//gi,
]

const DB_ERROR_PATTERNS = [
  /PrismaClient/i,
  /Unique constraint/i,
  /Foreign key/i,
  /Connection/i,
  /Database/i,
  /MongoDB/i,
  /MySQL/i,
  /PostgreSQL/i,
]

export class ErrorHandler {
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production'
  }

  handle(error: unknown, request?: NextRequest): NextResponse {
    const sanitizedError = this.sanitizeError(error instanceof Error ? error : new Error(String(error)))

    if (error instanceof AppError) {
      return this.createResponse(sanitizedError, error.statusCode)
    }

    if (error instanceof Error) {
      const appError = this.classifyError(error)
      return this.createResponse(this.sanitizeError(appError), appError.statusCode)
    }

    return this.createResponse(
      {
        message: '服务器内部错误',
        code: ERROR_CODES.INTERNAL_ERROR,
        statusCode: 500,
      },
      500
    )
  }

  sanitizeError(error: Error | AppError): SanitizedError | DevError {
    const baseError: SanitizedError = {
      message: this.sanitizeMessage(error.message),
      code: error instanceof AppError ? error.code : ERROR_CODES.INTERNAL_ERROR,
      statusCode: error instanceof AppError ? error.statusCode : 500,
      details: error instanceof AppError ? this.sanitizeDetails(error.details) : undefined,
    }

    if (!this.isProduction) {
      const devError: DevError = {
        ...baseError,
        stack: this.sanitizeStack(error.stack),
        originalError: error.message,
      }
      return devError
    }

    if (this.isSensitiveError(error)) {
      return {
        message: '服务器内部错误',
        code: ERROR_CODES.INTERNAL_ERROR,
        statusCode: 500,
      }
    }

    return baseError
  }

  private createResponse(error: SanitizedError | DevError, statusCode: number): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
        ...('stack' in error && error.stack && { stack: error.stack }),
        ...('originalError' in error && error.originalError && { originalError: error.originalError }),
      },
      { status: statusCode }
    )
  }

  private sanitizeMessage(message: string): string {
    let sanitized = message

    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }

    for (const pattern of DB_ERROR_PATTERNS) {
      if (pattern.test(sanitized)) {
        return '数据库操作失败'
      }
    }

    return sanitized
  }

  private sanitizeStack(stack?: string): string | undefined {
    if (!stack) return undefined

    let sanitized = stack

    for (const pattern of SENSITIVE_PATHS) {
      sanitized = sanitized.replace(pattern, '[PATH]')
    }

    return sanitized
  }

  private sanitizeDetails(details?: AppErrorDetails): AppErrorDetails | undefined {
    if (!details) return undefined

    const sanitized: AppErrorDetails = {}

    for (const [key, value] of Object.entries(details)) {
      const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key))

      if (isSensitive) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeMessage(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  private isSensitiveError(error: Error): boolean {
    const message = error.message.toLowerCase()
    const stack = error.stack?.toLowerCase() || ''

    const sensitiveIndicators = [
      'jwt',
      'token',
      'secret',
      'password',
      'credential',
      'private key',
      'api key',
    ]

    return sensitiveIndicators.some(
      indicator => message.includes(indicator) || stack.includes(indicator)
    )
  }

  private classifyError(error: Error): AppError {
    const message = error.message.toLowerCase()

    if (message.includes('unique constraint') || message.includes('duplicate')) {
      return AppError.conflict('资源已存在')
    }

    if (message.includes('foreign key') || message.includes('reference')) {
      return AppError.validation('关联资源不存在')
    }

    if (message.includes('connection') || message.includes('timeout')) {
      return AppError.internal('服务暂时不可用')
    }

    if (message.includes('unauthorized') || message.includes('unauthenticated')) {
      return AppError.unauthorized()
    }

    if (message.includes('forbidden') || message.includes('permission')) {
      return AppError.forbidden()
    }

    if (message.includes('not found')) {
      return AppError.notFound()
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return AppError.validation(error.message)
    }

    return AppError.internal()
  }
}

export const errorHandler = new ErrorHandler()
