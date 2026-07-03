/**
 * lib/api/withApi.ts
 * API 路由便捷封装：组合鉴权 + JSON 解析 + 错误处理
 *
 * 设计目标：
 * 1. 减少路由样板代码（try-catch / 重复 401 / 重复响应格式）
 * 2. 类型安全：自动推断 body / query 类型
 * 3. 渐进式迁移：现有路由可逐步切换
 *
 * 使用示例（取代手写 try-catch）：
 * ```ts
 * // Before: 14 行样板
 * export async function GET(request: NextRequest) {
 *   try {
 *     const user = getUserFromRequest(request)
 *     if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
 *     const data = await prisma.foo.findMany()
 *     return NextResponse.json({ success: true, data })
 *   } catch (error) {
 *     return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
 *   }
 * }
 *
 * // After: 3 行
 * export const GET = withApi.auth(async (req, { user }) => {
 *   const data = await prisma.foo.findMany()
 *   return ok(data)
 * })
 * ```
 */

import type { NextRequest } from 'next/server'
import { fail, serverError } from './response'
import { logger } from '@/lib/logger'
import { getUserFromRequest } from '@/lib/auth'
import { getClassMembership, type ClassMembership } from '@/lib/class/auth'
import { getCachedUser, type AuthUser, type ApiContext } from './handler'

export type { AuthUser, ApiContext }

export interface AuthContext {
  user: AuthUser
}

export interface ClassContext extends AuthContext {
  membership: ClassMembership
  classId: string
}

/**
 * 业务异常：抛出后会被 withApi 统一捕获并转为 fail(code, message, status)
 */
export class ApiError extends Error {
  constructor(public code: string, public message: string, public status: number = 400) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 抛出 400 / 401 / 403 / 404 便捷函数
 */
export const throw400 = (code: string, msg: string): never => { throw new ApiError(code, msg, 400) }
export const throw401 = (msg = '未登录'): never => { throw new ApiError('UNAUTHORIZED', msg, 401) }
export const throw403 = (msg = '权限不足'): never => { throw new ApiError('FORBIDDEN', msg, 403) }
export const throw404 = (msg = '资源不存在'): never => { throw new ApiError('NOT_FOUND', msg, 404) }
export const throw409 = (msg: string): never => { throw new ApiError('CONFLICT', msg, 409) }
export const throw500 = (msg = '服务器错误'): never => { throw new ApiError('INTERNAL', msg, 500) }

/**
 * 内部：异常包装 + 日志
 */
async function safeCall(
  fn: () => Promise<Response | unknown>,
  errorCode: string,
  req: NextRequest
): Promise<Response> {
  try {
    const result = await fn()
    if (result instanceof Response) return result
    // 路由函数直接返回数据时，自动包装为 ok()
    const { ok } = await import('./response')
    return ok(result)
  } catch (err: any) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status)
    }
    if (err?.message === 'INVALID_JSON') {
      return fail('INVALID_JSON', '请求体不是合法 JSON', 400)
    }
    if (err?.name === 'ValidationError') {
      return fail('VALIDATION', err.message || '参数不合法', 400)
    }
    if (err?.code === 'P2002') {
      return fail('UNIQUE_VIOLATION', '数据已存在', 409)
    }
    if (err?.code === 'P2025') {
      return fail('NOT_FOUND', '资源不存在', 404)
    }
    logger.error(`[${errorCode}] ${err?.message || err}`, {
      url: req.url,
      method: req.method,
      stack: err?.stack,
    })
    return serverError(err?.message || '服务器错误')
  }
}

/* ============================================================================
 * 无需鉴权的快速路由
 * ========================================================================== */

/**
 * 解析 Next.js 16 的 ctx.params（可能是 Promise），统一为对象。
 * 兼容 Next.js 14 同步 params 与 15/16 异步 params 两种形态。
 */
async function resolveCtxParams(ctx: any): Promise<any> {
  if (!ctx) return ctx
  const rawParams = ctx.params
  if (rawParams && typeof rawParams.then === 'function') {
    return { ...ctx, params: await rawParams }
  }
  return ctx
}

export interface RouteHandler {
  (req: NextRequest, ctx: ApiContext): Promise<Response | unknown> | Response | unknown
}

export const withApi = {
  /**
   * 公开路由：无需登录
   */
  public(handler: RouteHandler) {
    return async (req: NextRequest, ctx: any) => {
      return safeCall(async () => {
        const resolved = await resolveCtxParams(ctx)
        return handler(req, resolved)
      }, 'PUBLIC', req)
    }
  },

  /**
   * 需登录：自动注入 user
   */
  auth<P = any>(
    handler: (req: NextRequest, ctx: ApiContext<P>, context: AuthContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: ApiContext<P>) => {
      return safeCall(async () => {
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId)
        if (!user) throw throw401('用户不存在')
        const resolved = await resolveCtxParams(ctx)
        return handler(req, resolved, { user })
      }, 'AUTH', req)
    }
  },

  /**
   * 管理员鉴权（基于 hasPermission('admin.access')，SYSTEM_ADMIN 默认通过）
   */
  admin(
    handler: (req: NextRequest, ctx: ApiContext, context: AuthContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: any) => {
      return safeCall(async () => {
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId)
        if (!user) throw throw401('用户不存在')
        const { hasPermission } = await import('@/lib/permissions/permissions')
        const ok = await hasPermission(user, 'admin.access')
        if (!ok) {
          throw throw403('需要管理员权限')
        }
        const resolved = await resolveCtxParams(ctx)
        return handler(req, resolved, { user })
      }, 'ADMIN', req)
    }
  },

  /**
   * 班级角色鉴权
   */
  classRole(
    allowedRoles: Array<'teacher' | 'assistant' | 'student'>,
    handler: (req: NextRequest, ctx: ApiContext, context: ClassContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: ApiContext) => {
      return safeCall(async () => {
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId)
        if (!user) throw throw401('用户不存在')
        // 兼容 Promise<params> 与 params 两种 Next.js 形态
        const rawParams: any = ctx?.params
        const resolvedParams = rawParams && typeof rawParams.then === 'function' ? await rawParams : rawParams
        const classId = resolvedParams?.id
        if (!classId) throw throw404('班级 ID 缺失')
        const membership = await getClassMembership(classId, user.id)
        if (!membership) throw throw403('不是班级成员')
        if (!allowedRoles.includes(membership.role)) {
          throw throw403('权限不足')
        }
        const resolved = { ...ctx, params: resolvedParams }
        return handler(req, resolved, { user, membership, classId })
      }, 'CLASS_ROLE', req)
    }
  },
}

/**
 * 解析 JSON Body（可选用 zod schema 校验）
 */
export async function readJson<T = any>(req: NextRequest, schema?: any): Promise<T> {
  let body: any
  try {
    body = await req.json()
  } catch {
    throw new ApiError('INVALID_JSON', '请求体不是合法 JSON', 400)
  }
  if (schema && typeof schema.safeParse === 'function') {
    const r = schema.safeParse(body)
    if (!r.success) {
      const first = r.error.issues?.[0]
      throw new ApiError(
        'VALIDATION',
        `${first?.path?.join('.') || '参数'}: ${first?.message || '不合法'}`,
        400
      )
    }
    return r.data as T
  }
  return body as T
}

/**
 * 解析 URL Search Params
 */
export function readQuery<T = Record<string, string>>(req: NextRequest): T {
  const obj: Record<string, string> = {}
  const params = req.nextUrl.searchParams
  for (const key of params.keys()) {
    obj[key] = params.get(key) || ''
  }
  return obj as T
}

/* ============================================================================
 * 向后兼容：从 lib/api/handler.ts 重新导出
 * ========================================================================== */
export { getCachedUser, clearUserCache } from './handler'
export { fail, ok, serverError, unauthorized, forbidden, notFound, badRequest, conflict, tooManyRequests } from './response'
