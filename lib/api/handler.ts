/**
 * lib/api/handler.ts
 * 进程级用户缓存 + 鉴权上下文类型定义
 *
 * 注：旧的 withAuth/withClassRole/withAdmin/parseJson/parseQuery 高阶函数
 * 已被 lib/api/withApi.ts 的 withApi 统一封装取代，此处不再保留死代码。
 */

import { prisma } from '@/lib/prisma'

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
  tokenVersion: number
}

/**
 * 进程级用户缓存（TTL 60s，LRU 上限 10000 条）
 * 仅用于鉴权层快速校验 role/tokenVersion，业务层查询应走 lib/cache.ts
 */
type CachedUser = { value: AuthUser; expiry: number }
const MAX_USER_CACHE_SIZE = 10000
const userCache: Map<string, CachedUser> = (() => {
  const g = globalThis as any
  if (!g.__userCache) g.__userCache = new Map<string, CachedUser>()
  return g.__userCache as Map<string, CachedUser>
})()

export async function getCachedUser(
  userId: string,
  expectedTokenVersion?: number
): Promise<AuthUser | null> {
  const hit = userCache.get(userId)
  if (hit && hit.expiry > Date.now()) {
    // tokenVersion 校验：与 JWT 中的版本号不一致则视为已吊销
    if (expectedTokenVersion !== undefined && hit.value.tokenVersion !== expectedTokenVersion) {
      return null
    }
    // LRU：重新写入以标记为最近使用
    userCache.delete(userId)
    userCache.set(userId, hit)
    return hit.value
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, nickname: true, avatar: true, role: true, email: true, tokenVersion: true },
  })
  if (!dbUser) return null

  // tokenVersion 校验：数据库中的版本号大于 JWT 中的版本号，说明 Token 已被吊销
  if (expectedTokenVersion !== undefined && dbUser.tokenVersion !== expectedTokenVersion) {
    return null
  }

  const value: AuthUser = {
    id: dbUser.id,
    username: dbUser.username,
    nickname: dbUser.nickname,
    avatar: dbUser.avatar,
    role: dbUser.role || 'STUDENT',
    email: dbUser.email,
    tokenVersion: dbUser.tokenVersion,
  }
  // LRU 淘汰：容量超限时移除最旧条目
  while (userCache.size >= MAX_USER_CACHE_SIZE) {
    const oldestKey = userCache.keys().next().value
    if (oldestKey === undefined) break
    userCache.delete(oldestKey)
  }
  userCache.set(userId, { value, expiry: Date.now() + 60_000 })
  return value
}

/**
 * 清除鉴权层用户缓存（仅 userCache Map）。
 * 业务层应调用 lib/user/service.ts 的 clearUserCache（统一入口，会联动调用本函数）。
 */
export function clearAuthUserCache(userId?: string) {
  if (userId) userCache.delete(userId)
  else userCache.clear()
}
