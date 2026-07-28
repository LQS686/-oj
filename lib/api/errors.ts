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
