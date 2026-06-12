/**
 * lib/api/handler.ts
 * API 路由高阶函数：withAuth / withClassRole / withAdmin / withRateLimit
 *
 * 使用示例：
 *   export const GET = withAuth(async (req, ctx, { user }) => {
 *     return ok({ user })
 *   })
 */

import { NextRequest } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClassMembership, type ClassMembership } from '@/lib/class/auth'
import { fail, forbidden, notFound, serverError, unauthorized } from './response'
import { logger } from '@/lib/logger'

export interface ApiContext<P = Record<string, string>> {
  params: P
}

export interface AuthUser {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  role: string
  email: string | null
}

export interface AuthContext {
  user: AuthUser
}

export interface ClassContext extends AuthContext {
  membership: ClassMembership
  classId: string
}

export type Handler<Ctx = AuthContext> = (
  req: NextRequest,
  ctx: ApiContext,
  context: Ctx
) => Promise<Response> | Response

/**
 * JSON Body 解析 helper
 */
export async function parseJson<T = unknown>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new Error('INVALID_JSON')
  }
}

/**
 * URL Search Params 解析
 */
export function parseQuery(req: NextRequest): Record<string, string> {
  const obj: Record<string, string> = {}
  const params = req.nextUrl.searchParams
  for (const key of params.keys()) {
    obj[key] = params.get(key) || ''
  }
  return obj
}

/**
 * 进程级用户缓存（TTL 60s）
 */
type CachedUser = { value: AuthUser; expiry: number }
const userCache: Map<string, CachedUser> = (() => {
  const g = globalThis as any
  if (!g.__userCache) g.__userCache = new Map<string, CachedUser>()
  return g.__userCache as Map<string, CachedUser>
})()

export async function getCachedUser(userId: string): Promise<AuthUser | null> {
  const hit = userCache.get(userId)
  if (hit && hit.expiry > Date.now()) return hit.value

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, nickname: true, avatar: true, role: true, email: true },
  })
  if (!dbUser) return null

  const value: AuthUser = {
    id: dbUser.id,
    username: dbUser.username,
    nickname: dbUser.nickname,
    avatar: dbUser.avatar,
    role: dbUser.role || 'user',
    email: dbUser.email,
  }
  userCache.set(userId, { value, expiry: Date.now() + 60_000 })
  return value
}

export function clearUserCache(userId?: string) {
  if (userId) userCache.delete(userId)
  else userCache.clear()
}

/**
 * 统一异常包装：handler 抛出任何异常时统一 500
 */
function wrapWithErrorBoundary(handler: Handler, errorCode = 'HANDLER'): Handler {
  return async (req, ctx, context) => {
    try {
      return await handler(req, ctx, context)
    } catch (err: any) {
      if (err?.message === 'INVALID_JSON') {
        return fail('INVALID_JSON', '请求体不是合法 JSON', 400)
      }
      logger.error(`[${errorCode}] ${err?.message || err}`, {
        url: req.url,
        method: req.method,
        stack: err?.stack,
      })
      return serverError(err?.message || '服务器错误')
    }
  }
}

/**
 * 鉴权中间件：自动注入 user
 */
export function withAuth(handler: Handler<AuthContext>) {
  const wrapped: Handler = async (req, ctx) => {
    const session = getUserFromRequest(req)
    if (!session?.userId) return unauthorized()
    const user = await getCachedUser(session.userId)
    if (!user) return unauthorized('用户不存在')
    return handler(req, ctx, { user })
  }
  return wrapWithErrorBoundary(wrapped, 'AUTH')
}

/**
 * 管理员鉴权中间件
 */
export function withAdmin(handler: Handler<AuthContext>) {
  return withAuth(async (req, ctx, { user }) => {
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return forbidden('需要管理员权限')
    }
    return handler(req, ctx, { user })
  })
}

/**
 * 班级角色鉴权：自动注入 user + membership
 * 必须先 withAuth
 */
export function withClassRole(
  allowedRoles: Array<'teacher' | 'assistant' | 'student'>,
  handler: Handler<ClassContext>
) {
  return withAuth(async (req, ctx, { user }) => {
    const classId = (ctx.params as any).id
    if (!classId) return notFound('班级 ID 缺失')
    const membership = await getClassMembership(classId, user.id)
    if (!membership) return forbidden('不是班级成员')
    if (!allowedRoles.includes(membership.role)) {
      return forbidden('权限不足')
    }
    return handler(req, ctx, { user, membership, classId })
  })
}

/**
 * 限流中间件包装（简单版）
 */
export function withRateLimit(
  check: (key: string) => boolean | Promise<boolean>,
  handler: Handler<AuthContext>
) {
  return withAuth(async (req, ctx, context) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown'
    const key = `${context.user.id}:${req.nextUrl.pathname}`
    const allowed = await check(key)
    if (!allowed) return forbidden('请求过于频繁')
    return handler(req, ctx, context)
  })
}
