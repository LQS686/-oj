/**
 * lib/api/handler.ts
 * 进程级用户缓存 + 鉴权上下文类型定义
 *
 * 注：旧的 withAuth/withClassRole/withAdmin/parseJson/parseQuery 高阶函数
 * 已被 lib/api/withApi.ts 的 withApi 统一封装取代，此处不再保留死代码。
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { isRedisConfigured } from '@/lib/redis'

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
  isBanned: boolean
}

/**
 * 进程级用户缓存（TTL 60s，LRU 上限 10000 条）
 * 仅用于鉴权层快速校验 role/tokenVersion，业务层查询应走 lib/cache.ts
 *
 * 多实例：clearAuthUserCache 会写 Redis 吊销戳，其它实例 L1 命中时校验戳时间。
 */
type CachedUser = { value: AuthUser; expiry: number; cachedAt: number }
const MAX_USER_CACHE_SIZE = 10000
const AUTH_INV_TTL_SEC = 120
const AUTH_INV_PREFIX = 'auth:userinv:'

const userCache: Map<string, CachedUser> = (() => {
  const g = globalThis as typeof globalThis & { __userCache?: Map<string, CachedUser> }
  if (!g.__userCache) g.__userCache = new Map<string, CachedUser>()
  return g.__userCache
})()

function authInvKey(userId: string): string {
  return `${AUTH_INV_PREFIX}${userId}`
}

async function readRemoteInvalidation(userId: string): Promise<number | null> {
  if (!isRedisConfigured()) return null
  try {
    const { getRedisClient } = await import('@/lib/redis')
    const raw = await getRedisClient().get(authInvKey(userId))
    if (!raw) return null
    const ts = Number(raw)
    return Number.isFinite(ts) ? ts : null
  } catch {
    return null
  }
}

function publishRemoteInvalidation(userId: string): void {
  if (!isRedisConfigured()) return
  void (async () => {
    try {
      const { getRedisClient } = await import('@/lib/redis')
      await getRedisClient().set(authInvKey(userId), String(Date.now()), 'EX', AUTH_INV_TTL_SEC)
    } catch {
      // 吊销广播失败时本进程仍已清 L1；依赖 TTL 兜底
    }
  })()
}

export async function getCachedUser(
  userId: string,
  expectedTokenVersion?: number
): Promise<AuthUser | null> {
  const hit = userCache.get(userId)
  if (hit && hit.expiry > Date.now()) {
    const invAt = await readRemoteInvalidation(userId)
    if (invAt !== null && invAt >= hit.cachedAt) {
      userCache.delete(userId)
    } else {
      if (expectedTokenVersion !== undefined && hit.value.tokenVersion !== expectedTokenVersion) {
        return null
      }
      if (hit.value.isBanned) return null
      // LRU：重新写入以标记为最近使用
      userCache.delete(userId)
      userCache.set(userId, hit)
      return hit.value
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
      role: true,
      email: true,
      tokenVersion: true,
      isBanned: true,
    },
  })
  if (!dbUser) return null
  if (dbUser.isBanned) return null

  // tokenVersion 校验：数据库中的版本号与 JWT 不一致，说明 Token 已被吊销
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
    isBanned: dbUser.isBanned,
  }
  // LRU 淘汰：容量超限时移除最旧条目
  while (userCache.size >= MAX_USER_CACHE_SIZE) {
    const oldestKey = userCache.keys().next().value
    if (oldestKey === undefined) break
    userCache.delete(oldestKey)
  }
  userCache.set(userId, { value, expiry: Date.now() + 60_000, cachedAt: Date.now() })
  return value
}

/**
 * 清除鉴权层用户缓存（本进程 L1 + Redis 吊销戳）。
 * 业务层应调用 lib/user/profile.ts 的 clearUserCache（统一入口，会联动调用本函数）。
 */
export function clearAuthUserCache(userId?: string) {
  if (userId) {
    userCache.delete(userId)
    publishRemoteInvalidation(userId)
  } else {
    userCache.clear()
  }
}
