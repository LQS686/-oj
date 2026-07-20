/**
 * lib/contest/public.ts
 * 公开比赛列表 / 详情 / 密码校验 / 权限
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'

/* ============================================================================
 * 列表 / 详情 / 创建 / 更新 / 删除 业务层封装
 * （与 /api/contests 与 /api/contests/[id] 等路由直接交互）
 * ========================================================================== */

export interface ListPublicContestsFilter {
  page?: number
  limit?: number
  status?: 'ongoing' | 'upcoming' | 'ended'
  keyword?: string
}

export interface ListPublicContestsResult {
  contests: Array<{
    id: string
    title: string
    description: string | null
    type: string
    startTime: Date
    endTime: Date
    isPublic: boolean
    authorId: string
    author?: { id: string; username: string; nickname: string | null } | null
    _count?: { participants: number; problems: number }
    isRegistered: boolean
  }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function listPublicContests(
  filter: ListPublicContestsFilter = {},
  currentUserId?: string
): Promise<ListPublicContestsResult> {
  const page = filter.page ?? 1
  const limit = Math.min(filter.limit ?? 20, 50)
  const { status, keyword } = filter

  const where: any = { isPublic: true }
  const now = new Date()
  if (keyword) {
    where.OR = [
      { title: { contains: keyword, mode: 'insensitive' } },
      { description: { contains: keyword, mode: 'insensitive' } },
    ]
  }
  if (status === 'ongoing') {
    where.startTime = { lte: now }
    where.endTime = { gte: now }
  } else if (status === 'upcoming') {
    where.startTime = { gt: now }
  } else if (status === 'ended') {
    where.endTime = { lt: now }
  }

  const [contests, total] = await Promise.all([
    prisma.contest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startTime: 'desc' },
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        _count: { select: { participants: true, problems: true } },
      },
    }),
    prisma.contest.count({ where }),
  ])

  let registeredSet = new Set<string>()
  if (currentUserId) {
    const ids = contests.map((c: any) => c.id)
    if (ids.length > 0) {
      const participations = await prisma.contestParticipant.findMany({
        where: { userId: currentUserId, contestId: { in: ids } },
        select: { contestId: true },
      })
      registeredSet = new Set(participations.map((p: any) => p.contestId))
    }
  }

  return {
    contests: contests.map((c: any) => ({
      ...c,
      isRegistered: registeredSet.has(c.id),
    })) as any,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function getContestDetailWithRegistration(
  contestId: string,
  currentUserId?: string
) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      author: { select: { id: true, username: true, nickname: true } },
      _count: { select: { participants: true, problems: true } },
    },
  })
  if (!contest) return null

  let isRegistered = false
  if (currentUserId) {
    const participant = await prisma.contestParticipant.findUnique({
      where: {
        contestId_userId: { contestId, userId: currentUserId },
      },
    })
    isRegistered = !!participant
  }
  return { ...contest, isRegistered }
}

export async function updateContestWithProblems(
  contestId: string,
  data: {
    title?: string
    description?: string | null
    type?: string
    startTime?: Date | null
    endTime?: Date | null
    duration?: number | null
    isPublic?: boolean
    password?: string | null
    problemIds?: string[]
  }
) {
  const { problemIds, ...contestData } = data
  const updated = await prisma.contest.update({
    where: { id: contestId },
    data: contestData as any,
  })

  if (Array.isArray(problemIds)) {
    await prisma.contestProblem.deleteMany({ where: { contestId } })
    if (problemIds.length > 0) {
      await prisma.contestProblem.createMany({
        data: problemIds.map((problemId, index) => ({
          contestId,
          problemId,
          orderIndex: index,
          score: 100,
        })),
      })
    }
  }
  cache.delete(CacheKeys.contest.byId(contestId))
  return updated
}

/** 校验密码竞赛报名所需的密码 / 邀请码 */
export async function verifyContestPassword(
  inputPassword: string,
  storedPassword: string | null
): Promise<boolean> {
  if (!storedPassword) return false
  // bcrypt 哈希
  if (storedPassword.startsWith('$2')) {
    const bcrypt = (await import('bcryptjs')).default
    return bcrypt.compare(inputPassword, storedPassword)
  }
  // 明文（兼容）
  return inputPassword === storedPassword
}

/** 校验当前用户是否为竞赛创建者或管理员 */
export async function ensureContestManageAccess(
  contestId: string,
  userId: string,
  isAdmin: boolean
) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } })
  if (!contest) return { ok: false as const, status: 404, error: '竞赛不存在' }
  if (contest.authorId !== userId && !isAdmin) {
    return { ok: false as const, status: 403, error: '无权操作此竞赛' }
  }
  return { ok: true as const, contest }
}
