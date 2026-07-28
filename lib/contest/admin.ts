/**
 * lib/contest/admin.ts
 * 管理员竞赛管理（创建/编辑/删除/列表 + 报名信息查询）
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { ApiError } from '@/lib/api/errors'
import { CacheKeys } from '@/lib/constants/cache-keys'

/* ============================================================================
 * 管理员编辑竞赛：含题目列表更新（原 /api/admin/contests/[id] PATCH）
 * ========================================================================== */

export interface AdminUpdateContestInput {
  title?: string
  description?: string
  type?: string
  startTime?: string
  endTime?: string
  isPublic?: boolean
  password?: string | null
  problems?: string[]
  // 封榜机制字段
  sealRankTime?: string | null
  sealUnlocked?: boolean
}

export async function adminUpdateContest(
  contestId: string,
  body: AdminUpdateContestInput
) {
  const { title, description, type, startTime, endTime, isPublic, password, problems, sealRankTime, sealUnlocked } = body

  const updateData: any = {
    title,
    description,
    type,
    isPublic,
  }

  // 仅在显式传入时更新密码；空串/null 表示清除，避免 undefined 被 ||null 误清
  if (password !== undefined) {
    updateData.password = password === '' || password === null ? null : password
  }

  if (startTime && endTime) {
    const start = new Date(startTime)
    const end = new Date(endTime)
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60)
    if (duration <= 0) {
      throw new ApiError('INVALID_TIME', '结束时间必须晚于开始时间', 400)
    }
    updateData.startTime = start
    updateData.endTime = end
    updateData.duration = duration
  }

  // 封榜时间：传 null/空字符串表示清除封榜；须落在比赛起止时间内
  if (sealRankTime !== undefined) {
    if (sealRankTime === null || sealRankTime === '') {
      updateData.sealRankTime = null
    } else {
      const sealDate = new Date(sealRankTime)
      if (isNaN(sealDate.getTime())) {
        throw new ApiError('INVALID_SEAL_TIME', '封榜时间格式无效', 400)
      }
      const existing = await prisma.contest.findUnique({
        where: { id: contestId },
        select: { startTime: true, endTime: true },
      })
      const start = updateData.startTime ?? existing?.startTime
      const end = updateData.endTime ?? existing?.endTime
      if (start && end && (sealDate < start || sealDate > end)) {
        throw new ApiError('INVALID_SEAL_TIME', '封榜时间必须在比赛起止时间范围内', 400)
      }
      updateData.sealRankTime = sealDate
    }
  }

  // 管理员手动解冻
  if (sealUnlocked !== undefined) {
    updateData.sealUnlocked = !!sealUnlocked
  }

  // 改为非事务处理以兼容 standalone MongoDB
  // 1. 更新基本信息
  await prisma.contest.update({ where: { id: contestId }, data: updateData })

  // 2. 如果提供了题目列表，校验题目存在且可见性允许挂入竞赛后再更新关联
  if (problems && Array.isArray(problems)) {
    if (problems.length > 0) {
      const found = await prisma.problem.findMany({
        where: { id: { in: problems } },
        select: { id: true, visibility: true, classId: true },
      })
      if (found.length !== problems.length) {
        const foundIds = new Set(found.map((p) => p.id))
        const missing = problems.filter((id) => !foundIds.has(id))
        throw new ApiError('INVALID_PROBLEMS', `题目不存在: ${missing.slice(0, 5).join(', ')}`, 400)
      }
      // 竞赛仅允许 public / contest 题；禁止 private 与班级私有题绕过可见性
      const invalid = found.filter(
        (p) => p.classId != null || (p.visibility !== 'public' && p.visibility !== 'contest')
      )
      if (invalid.length > 0) {
        throw new ApiError(
          'INVALID_PROBLEMS',
          `竞赛只能添加公开或竞赛可见题目: ${invalid
            .slice(0, 5)
            .map((p) => p.id)
            .join(', ')}`,
          400
        )
      }
    }
    await prisma.contestProblem.deleteMany({ where: { contestId } })
    if (problems.length > 0) {
      await prisma.contestProblem.createMany({
        data: problems.map((problemId: string, index: number) => ({
          contestId,
          problemId,
          orderIndex: index + 1,
          score: 100,
        })),
      })
    }
  }
  cache.delete(CacheKeys.contest.byId(contestId))
  cache.deleteByPrefix('contest:rank')
  return { message: '更新成功' }
}

export async function adminGetContestWithProblems(contestId: string) {
  return prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      problems: {
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
            },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })
}

export async function adminDeleteContest(contestId: string) {
  cache.delete(CacheKeys.contest.byId(contestId))
  return prisma.contest.delete({ where: { id: contestId } })
}

/* ============================================================================
 * 管理员竞赛管理（原 /api/admin/contests）
 * ========================================================================== */

/** 管理员列出所有竞赛（带作者 + 题目/参赛者计数） */
export async function listAdminContests(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page
  const rawPageSize = opts?.pageSize
  const pageSize =
    typeof rawPageSize === 'number' && rawPageSize > 0 ? Math.min(rawPageSize, 100) : undefined
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  const take = usePaging ? (pageSize as number) : 100
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0
  return prisma.contest.findMany({
    skip,
    take,
    orderBy: { startTime: 'desc' },
    include: {
      author: { select: { username: true } },
      _count: { select: { problems: true, participants: true } },
    },
  })
}

export interface AdminCreateContestInput {
  title: string
  description: string
  type: string
  startTime: string
  endTime: string
  isPublic?: boolean
  password?: string | null
  problems?: string[]
  // 封榜机制字段（创建时可选）
  sealRankTime?: string | null
}

/** 管理员创建竞赛 */
export async function adminCreateContest(
  input: AdminCreateContestInput,
  authorId: string
) {
  const start = new Date(input.startTime)
  const end = new Date(input.endTime)
  const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60)
  if (duration <= 0) {
    throw new ApiError('INVALID_TIME', '结束时间必须晚于开始时间', 400)
  }

  // 封榜时间解析：空值/null 表示不封榜
  let sealRankTime: Date | null = null
  if (input.sealRankTime) {
    const parsed = new Date(input.sealRankTime)
    if (!isNaN(parsed.getTime())) {
      // 封榜时间应在比赛时间范围内
      if (parsed.getTime() > start.getTime() && parsed.getTime() < end.getTime()) {
        sealRankTime = parsed
      }
    }
  }

  return prisma.contest.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      startTime: start,
      endTime: end,
      duration,
      isPublic: input.isPublic || false,
      password: input.password || null,
      authorId,
      sealRankTime,
      problems: {
        create: input.problems && Array.isArray(input.problems)
          ? input.problems.map((problemId, index) => ({
              problemId,
              orderIndex: index,
            }))
          : [],
      },
    },
  })
}

/** 读竞赛信息（用于报名） */
export async function getContestForRegistration(contestId: string) {
  return prisma.contest.findUnique({ where: { id: contestId } })
}

/** 用户是否已报名 */
export async function isUserRegistered(contestId: string, userId: string) {
  const p = await prisma.contestParticipant.findUnique({
    where: { contestId_userId: { contestId, userId } },
  })
  return !!p
}
