/**
 * lib/contest/admin.ts
 * 管理员竞赛管理（创建/编辑/删除/列表 + 报名信息查询）
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { ApiError } from '@/lib/api/withApi'
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
}

export async function adminUpdateContest(
  contestId: string,
  body: AdminUpdateContestInput
) {
  const { title, description, type, startTime, endTime, isPublic, password, problems } = body

  const updateData: any = {
    title,
    description,
    type,
    isPublic,
    password: password || null,
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

  // 改为非事务处理以兼容 standalone MongoDB
  // 1. 更新基本信息
  await prisma.contest.update({ where: { id: contestId }, data: updateData })

  // 2. 如果提供了题目列表，更新题目关联
  if (problems && Array.isArray(problems)) {
    await prisma.contestProblem.deleteMany({ where: { contestId } })
    if (problems.length > 0) {
      await prisma.contestProblem.createMany({
        data: problems.map((problemId: string, index: number) => ({
          contestId,
          problemId,
          orderIndex: index + 1,
          score: 100, // 默认分数，后续可以细化
        })),
      })
    }
  }
  cache.delete(CacheKeys.contest.byId(contestId))
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
  const pageSize = opts?.pageSize
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  // 未传分页参数时加 take 上限防 OOM；传入参数时按 page/pageSize 分页
  const take = usePaging ? (pageSize as number) : 500
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
