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

import 'server-only'

import type { NextRequest } from 'next/server'
import { fail, serverError } from './response'
import { getUserFromRequest } from '@/lib/auth'
import { getClassMembership, type ClassMembership } from '@/lib/class/auth'
import { getCachedUser, type AuthUser, type ApiContext } from './handler'
import { canAccessAdmin, isSystemAdmin } from '@/lib/permissions'
import {
  ApiError,
  errorLike,
  throw400,
  throw401,
  throw403,
  throw404,
  throw409,
  throw500,
} from './errors'

export type { AuthUser, ApiContext }
export {
  ApiError,
  errorLike,
  throw400,
  throw401,
  throw403,
  throw404,
  throw409,
  throw500,
}

export interface AuthContext {
  user: AuthUser
}

export interface ClassContext extends AuthContext {
  membership: ClassMembership
  classId: string
}

/**
 * 内部：异常包装 + 日志
 */
async function safeCall(
  fn: () => Promise<Response | unknown>,
  errorCode: string,
  req: NextRequest
): Promise<Response> {
  // P1：注入 requestId 到 logger context，便于全链路日志追踪
  //    middleware 已写入 x-request-id 响应头，这里同步到 logger
  const { logger } = await import('@/lib/logger')
  const requestId = req.headers.get('x-request-id') || undefined
  const url = req.nextUrl?.pathname || ''
  const method = req.method || 'GET'
  logger.setContext({
    requestId,
    method,
    path: url,
    errorCode,
  })
  try {
    // fail-closed：database/system/auth 触发 block 后拒绝新请求
    const { errorMonitor } = await import('@/lib/error-monitor')
    for (const key of ['database', 'system', 'auth'] as const) {
      if (await errorMonitor.isBlockedAsync(key)) {
        return fail('SERVICE_UNAVAILABLE', '服务暂时不可用，请稍后重试', 503)
      }
    }
    const result = await fn()
    if (result instanceof Response) return result
    // 路由函数直接返回数据时，自动包装为 ok()
    const { ok } = await import('./response')
    return ok(result)
  } catch (err: unknown) {
    const e = errorLike(err)
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status)
    }
    if (e.message === 'INVALID_JSON') {
      return fail('INVALID_JSON', '请求体不是合法 JSON', 400)
    }
    if (e.name === 'ValidationError') {
      return fail('VALIDATION', e.message || '参数不合法', 400)
    }
    if (e.code === 'P2002') {
      return fail('UNIQUE_VIOLATION', '数据已存在', 409)
    }
    if (e.code === 'P2025') {
      return fail('NOT_FOUND', '资源不存在', 404)
    }
    // 兜底：仅记录详细错误到日志，不向客户端透传 err.message（避免泄露内部结构）
    logger.error(`[${errorCode}] ${e.message || err}`, {
      url: req.url,
      method: req.method,
      stack: e.stack,
    })
    // 驱动 error-monitor 熔断：Prisma 码 → database，其余未预期 → system
    try {
      const { errorMonitor } = await import('@/lib/error-monitor')
      const prismaCode = typeof e.code === 'string' && /^P\d{4}$/.test(e.code)
      void errorMonitor.trackError(err instanceof Error ? err : new Error(String(e.message || err)), {
        errorType: prismaCode ? 'database' : 'system',
        operation: errorCode,
      })
    } catch {
      // 监控失败不影响响应
    }
    return serverError('服务器错误')
  } finally {
    logger.clearContext()
  }
}

/* ============================================================================
 * 无需鉴权的快速路由
 * ========================================================================== */

/**
 * 解析 Next.js 16 的 ctx.params（可能是 Promise），统一为对象。
 * 兼容 Next.js 14 同步 params 与 15/16 异步 params 两种形态。
 */
function isPromise<T>(v: T | Promise<T>): v is Promise<T> {
  return !!v && typeof (v as Promise<T>).then === 'function'
}

async function resolveCtxParams<P = Record<string, string>>(
  ctx: { params: P | Promise<P> } | undefined
): Promise<ApiContext<P>> {
  if (!ctx) return { params: {} as P }
  const rawParams = ctx.params
  if (isPromise(rawParams)) {
    return { params: await rawParams }
  }
  return { params: rawParams }
}

async function assertWriteCsrf(req: NextRequest): Promise<void> {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const { assertCsrf } = await import('@/lib/security/csrf')
  assertCsrf(req)
}

export interface RouteHandler {
  (req: NextRequest, ctx: ApiContext): Promise<Response | unknown> | Response | unknown
}

/**
 * Next.js 路由处理器的第二参数形态：params 可能是同步对象或 Promise（Next 15+）。
 */
type RouteContext<P = Record<string, string>> = {
  params: P | Promise<P>
}

export const withApi = {
  /**
   * 公开路由：无需登录。写方法强制 CSRF（双提交 Cookie）。
   */
  public(handler: RouteHandler) {
    return async (req: NextRequest, ctx: RouteContext) => {
      return safeCall(async () => {
        await assertWriteCsrf(req)
        const resolved = await resolveCtxParams(ctx)
        return handler(req, resolved)
      }, 'PUBLIC', req)
    }
  },

  /**
   * 需登录：自动注入 user。写方法强制 CSRF。
   */
  auth<P = Record<string, string>>(
    handler: (req: NextRequest, ctx: ApiContext<P>, context: AuthContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: RouteContext<P>) => {
      return safeCall(async () => {
        await assertWriteCsrf(req)
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId, session.tokenVersion)
        if (!user) throw throw401('用户不存在或登录已失效')
        const resolved = await resolveCtxParams<P>(ctx)
        return handler(req, resolved, { user })
      }, 'AUTH', req)
    }
  },

  /**
   * 管理员鉴权（SYSTEM_ADMIN 或 ADMIN 可访问后台）
   */
  admin(
    handler: (req: NextRequest, ctx: ApiContext, context: AuthContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: RouteContext) => {
      return safeCall(async () => {
        await assertWriteCsrf(req)
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId, session.tokenVersion)
        if (!user) throw throw401('用户不存在或登录已失效')
        if (!canAccessAdmin(user)) {
          throw throw403('需要管理员权限')
        }
        const resolved = await resolveCtxParams(ctx)
        return handler(req, resolved, { user })
      }, 'ADMIN', req)
    }
  },

  /**
   * 系统管理员鉴权（仅 SYSTEM_ADMIN 可访问）
   */
  systemAdmin(
    handler: (req: NextRequest, ctx: ApiContext, context: AuthContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: RouteContext) => {
      return safeCall(async () => {
        await assertWriteCsrf(req)
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId, session.tokenVersion)
        if (!user) throw throw401('用户不存在或登录已失效')
        if (!isSystemAdmin(user)) {
          throw throw403('需要系统管理员权限')
        }
        const resolved = await resolveCtxParams(ctx)
        return handler(req, resolved, { user })
      }, 'SYSTEM_ADMIN', req)
    }
  },

  /**
   * 班级角色鉴权
   */
  classRole(
    allowedRoles: Array<'owner' | 'assistant' | 'student'>,
    handler: (req: NextRequest, ctx: ApiContext, context: ClassContext) => Promise<Response | unknown> | Response | unknown
  ) {
    return async (req: NextRequest, ctx: RouteContext) => {
      return safeCall(async () => {
        await assertWriteCsrf(req)
        const session = getUserFromRequest(req)
        if (!session?.userId) throw throw401()
        const user = await getCachedUser(session.userId, session.tokenVersion)
        // 会话签名有效但账号封禁/tokenVersion 失效：403 而非 401，便于前端区分「未登录」与「无权限」
        if (!user) throw throw403('账号不可用或会话已失效')
        const resolved = await resolveCtxParams(ctx)
        const classId = resolved.params?.id
        if (!classId) throw throw404('班级 ID 缺失')
        const membership = await getClassMembership(classId, user.id)
        if (!membership) throw throw403('不是班级成员')
        if (!allowedRoles.includes(membership.role)) {
          throw throw403('权限不足')
        }
        return handler(req, resolved, { user, membership, classId })
      }, 'CLASS_ROLE', req)
    }
  },
}

/**
 * 解析 JSON Body（可选用 zod schema 校验）
 */
interface ValidationSchema {
  safeParse: (data: unknown) => {
    success: boolean
    data?: unknown
    error?: { issues?: Array<{ path?: PropertyKey[]; message?: string }> }
  }
}
export async function readJson<T = unknown>(req: NextRequest, schema?: ValidationSchema): Promise<T> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError('INVALID_JSON', '请求体不是合法 JSON', 400)
  }
  if (schema && typeof schema.safeParse === 'function') {
    const r = schema.safeParse(body)
    if (!r.success) {
      const first = r.error?.issues?.[0]
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
 * 从 lib/api/handler.ts / response.ts 重新导出
 * ========================================================================== */
export { getCachedUser, clearAuthUserCache, resolveViewerFromRequest, resolveViewerFromCookies } from './handler'
export { fail, ok, serverError, unauthorized, forbidden, notFound, badRequest, conflict, tooManyRequests } from './response'
