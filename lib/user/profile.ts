/**
 * lib/user/profile.ts
 * 基础用户信息：资料、统计、活跃用户、缓存清理
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
  createdAt: Date
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return cache.get('user:profile', [userId], async () => {
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
        createdAt: true,
      },
    })
    if (!row) return null
    return { ...row, avatar: sanitizeAvatarUrl(row.avatar) }
  }, { ttl: 60_000 })
}

export async function getUserStats(userId: string) {
  return cache.get('user:stats', [userId], async () => {
    const [solved, submissions, contests] = await Promise.all([
      prisma.submission.count({ where: { userId, status: 'AC' } }),
      prisma.submission.count({ where: { userId } }),
      prisma.contestParticipant.count({ where: { userId } }),
    ])
    return { solved, submissions, contests }
  }, { ttl: 30_000 })
}

export async function updateUserProfile(userId: string, data: Partial<{
  nickname: string
  bio: string
  avatar: string
}>): Promise<{ id: string; nickname: string | null; bio: string | null; avatar: string | null }> {
  if (data.avatar !== undefined) {
    const ok =
      data.avatar === '' ||
      data.avatar.startsWith('/uploads/avatars/') ||
      data.avatar.startsWith('/api/placeholder/')
    if (!ok) {
      const { AppError } = await import('@/lib/errors')
      throw AppError.badRequest('INVALID_AVATAR', '头像地址不合法')
    }
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, nickname: true, bio: true, avatar: true },
  })
  clearUserCache(userId)
  return { ...updated, avatar: sanitizeAvatarUrl(updated.avatar) }
}

export async function getActiveUsers(limit = 20) {
  return prisma.user.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, username: true, nickname: true, avatar: true, updatedAt: true },
  })
}

export async function clearUserCache(userId: string, options?: { clearRanking?: boolean }) {
  cache.delete(`user:profile:${userId}`)
  cache.delete(`user:stats:${userId}`)
  cache.delete(`auth:user:${userId}`)
  clearAuthUserCache(userId)
  // 仅角色/封禁/rating/solved 等影响榜单的变更才清排行榜；资料/头像/邮箱不触发
  if (options?.clearRanking) {
    clearRankingCache()
  }
}
