/**
 * lib/user/profile.ts
 * 基础用户信息：资料、统计、活跃用户、缓存清理
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { clearRankingCache } from '@/lib/ranking/service'
import { clearAuthUserCache } from '@/lib/api/handler'

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
    return prisma.user.findUnique({
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
    }) as Promise<UserProfile | null>
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
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, nickname: true, bio: true, avatar: true },
  })
  clearUserCache(userId)
  return updated
}

export async function getActiveUsers(limit = 20) {
  return prisma.user.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, username: true, nickname: true, avatar: true, updatedAt: true },
  })
}

export async function clearUserCache(userId: string) {
  cache.delete(`user:profile:${userId}`)
  cache.delete(`user:stats:${userId}`)
  cache.delete(`auth:user:${userId}`)
  // 清除鉴权层用户缓存（role/tokenVersion），避免角色变更后 60s 内仍以旧角色通过鉴权
  clearAuthUserCache(userId)
  // 任何用户变更（role / isBanned / rating / solvedCount / 删除）都会影响榜单
  clearRankingCache()
  // Phase 1：清理班级作业计时缓存（其他游戏化命名空间待 Phase 2+ 添加时再清理）
  // 注：timing progress 走 DB 查询，缓存目前仅作为预留命名空间；此处按前缀清理避免脏数据
  cache.deleteByPrefix(`timing:progress:`)
}
