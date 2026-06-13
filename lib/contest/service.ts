/**
 * lib/contest/service.ts
 * 竞赛 CRUD、报名、榜单
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface ContestFilter {
  keyword?: string
  status?: 'upcoming' | 'running' | 'finished'
  isPublic?: boolean
  type?: string
}

export async function listContests(
  filter: ContestFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.type) where.type = filter.type

  const now = new Date()
  if (filter.status === 'upcoming') where.startTime = { gt: now }
  if (filter.status === 'running') {
    where.startTime = { lte: now }
    where.endTime = { gt: now }
  }
  if (filter.status === 'finished') where.endTime = { lt: now }

  const [items, total] = await Promise.all([
    prisma.contest.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'startTime']: options.sortOrder || 'desc' },
    }),
    prisma.contest.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getContestById(id: string) {
  return cache.get('contest:byId', [id], async () => {
    return prisma.contest.findUnique({
      where: { id },
      include: { problems: { include: { problem: true }, orderBy: { orderIndex: 'asc' } } },
    })
  }, { ttl: 30_000 })
}

export async function createContest(data: any, authorId: string) {
  return prisma.contest.create({ data: { ...data, authorId } })
}

export async function updateContest(id: string, data: any) {
  cache.delete(`contest:byId:${id}`)
  return prisma.contest.update({ where: { id }, data })
}

export async function deleteContest(id: string) {
  cache.delete(`contest:byId:${id}`)
  return prisma.contest.delete({ where: { id } })
}

export async function registerContest(contestId: string, userId: string) {
  return prisma.contestParticipant.upsert({
    where: { contestId_userId: { contestId, userId } },
    update: {},
    create: { contestId, userId },
  })
}

export async function getContestRank(contestId: string, limit = 100) {
  return cache.get('contest:rank', [contestId, limit], async () => {
    return prisma.contestParticipant.findMany({
      where: { contestId },
      take: limit,
      orderBy: { score: 'desc' },
      include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
  }, { ttl: 30_000 })
}

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
    const ids = contests.map((c) => c.id)
    if (ids.length > 0) {
      const participations = await prisma.contestParticipant.findMany({
        where: { userId: currentUserId, contestId: { in: ids } },
        select: { contestId: true },
      })
      registeredSet = new Set(participations.map((p) => p.contestId))
    }
  }

  return {
    contests: contests.map((c) => ({
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