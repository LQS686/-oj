/**
 * lib/api/errors.ts
 * 轻量业务异常（无 Node/Redis/Prisma 依赖，可供服务端各层复用）
 *
 * 注意：勿把 withApi 整包再导出到客户端入口。
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number = 400
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 把 unknown 的 catch 异常当作「带可选 message/code/name/stack 的对象」读取。
 * 仅供 `catch (err: unknown)` 块做轻量字段访问，不做运行时变换。
 * 用法：`const e = errorLike(err); if (e.code === 'P2002') ...`
 */
export function errorLike(err: unknown): {
  message?: string
  code?: string
  name?: string
  stack?: string
} {
  if (err && typeof err === 'object') {
    return err as {
      message?: string
      code?: string
      name?: string
      stack?: string
    }
  }
  return {}
}

export const throw400 = (code: string, msg: string): never => {
  throw new ApiError(code, msg, 400)
}
export const throw401 = (msg = '未登录'): never => {
  throw new ApiError('UNAUTHORIZED', msg, 401)
}
export const throw403 = (msg = '权限不足'): never => {
  throw new ApiError('FORBIDDEN', msg, 403)
}
export const throw404 = (msg = '资源不存在'): never => {
  throw new ApiError('NOT_FOUND', msg, 404)
}
export const throw409 = (msg: string): never => {
  throw new ApiError('CONFLICT', msg, 409)
}
export const throw500 = (msg = '服务器错误'): never => {
  throw new ApiError('INTERNAL', msg, 500)
}
