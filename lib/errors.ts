/**
 * lib/errors.ts
 * 统一业务异常类，取代 `const err: any = new Error(); err.status = 400` 模式
 *
 * 用法：
 *   throw new AppError('INVALID_ROLE', '无效的角色类型', 400)
 *   throw AppError.badRequest('CODE', '消息')
 *   throw AppError.notFound('资源不存在')
 */

export class AppError extends Error {
  public readonly code: string
  public readonly status: number

  constructor(code: string, message: string, status: number = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }

  static badRequest(code: string, message: string): AppError {
    return new AppError(code, message, 400)
  }

  static unauthorized(message = '未登录'): AppError {
    return new AppError('UNAUTHORIZED', message, 401)
  }

  static forbidden(message = '权限不足'): AppError {
    return new AppError('FORBIDDEN', message, 403)
  }

  static notFound(message = '资源不存在'): AppError {
    return new AppError('NOT_FOUND', message, 404)
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message, 409)
  }

  static internal(message = '服务器错误'): AppError {
    return new AppError('INTERNAL', message, 500)
  }
}
