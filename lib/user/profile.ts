/**
 * lib/user/profile.ts
 * 基础用户信息：资料读取与用户缓存清理
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { clearRankingCache } from '@/lib/ranking/service'
import { clearAuthUserCache } from '@/lib/api/handler'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

export { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

export interface UserProfile {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  bio: string | null
  email: string | null
  role: string
  isBanned: boolean
  rank: string
  color: string
  createdAt: Date
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return cache.get(
    'user:profile',
    [userId],
    async () => {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          nickname: true,
          avatar: true,
          bio: true,
          email: true,
          role: true,
          isBanned: true,
          rank: true,
          color: true,
          createdAt: true,
        },
      })
      if (!row) return null
      return { ...row, avatar: sanitizeAvatarUrl(row.avatar) }
    },
    { ttl: 60_000 }
  )
}

export async function clearUserCache(userId: string, options?: { clearRanking?: boolean }) {
  cache.delete(`user:profile:${userId}`)
  cache.delete(`user:stats:${userId}`)
  clearAuthUserCache(userId)
  // 仅角色/封禁/solved 等影响榜单的变更才清排行榜；资料/头像/邮箱不触发
  if (options?.clearRanking) {
    clearRankingCache()
  }
}
