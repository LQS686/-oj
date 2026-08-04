/**
 * lib/contest/admin.ts
 * 管理员竞赛管理（创建/编辑/删除/列表 + 报名信息查询）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
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

/**
 * A-P2-3：竞赛时间字段公共校验（创建/更新共用，公开 API 与管理员 API 对齐）
 * 非法日期 / 结束不晚于开始 / 封榜时间越界一律抛 400。
 * 未提供的字段不校验（允许部分更新）；sealRankTime 仅当 start/end 均已知时校验时间窗。
 */
export function validateContestTimeFields(input: {
  startTime?: string | Date | null
  endTime?: string | Date | null
  sealRankTime?: string | Date | null
}) {
  const isEmpty = (v: unknown): v is null | undefined | '' => v == null || v === ''
  const start = isEmpty(input.startTime) ? null : new Date(input.startTime as string | Date)
  const end = isEmpty(input.endTime) ? null : new Date(input.endTime as string | Date)
  if (!isEmpty(input.startTime) && isNaN(start!.getTime())) {
    throw new ApiError('INVALID_TIME', '开始时间格式无效', 400)
  }
  if (!isEmpty(input.endTime) && isNaN(end!.getTime())) {
    throw new ApiError('INVALID_TIME', '结束时间格式无效', 400)
  }
  if (start && end && end.getTime() <= start.getTime()) {
    throw new ApiError('INVALID_TIME', '结束时间必须晚于开始时间', 400)
  }
  if (!isEmpty(input.sealRankTime)) {
    const seal = new Date(input.sealRankTime as string | Date)
    if (isNaN(seal.getTime())) {
      throw new ApiError('INVALID_SEAL_TIME', '封榜时间格式无效', 400)
    }
    if (start && end && (seal.getTime() <= start.getTime() || seal.getTime() >= end.getTime())) {
      throw new ApiError('INVALID_SEAL_TIME', '封榜时间必须在比赛起止时间范围内', 400)
    }
  }
}

export async function adminUpdateContest(
  contestId: string,
  body: AdminUpdateContestInput
) {
  const { title, description, type, startTime, endTime, isPublic, password, problems, sealRankTime, sealUnlocked } = body

  const updateData: Prisma.ContestUpdateInput = {
    title,
    description,
    type,
    isPublic,
  }

  // 仅在显式传入时更新密码；空串/null 表示清除；明文写入前 bcrypt
  if (password !== undefined) {
    if (password === '' || password === null) {
      updateData.password = null
    } else {
      const bcrypt = (await import('bcryptjs')).default
      updateData.password = await bcrypt.hash(password, 12)
    }
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
  const unlockingSeal = sealUnlocked === true
  if (sealUnlocked !== undefined) {
    updateData.sealUnlocked = !!sealUnlocked
  }

  // 题目存在性与可见性校验（只读，事务外执行，与 public.updateContestWithProblems 一致）
  if (problems && Array.isArray(problems) && problems.length > 0) {
    const found = await prisma.problem.findMany({
      where: { id: { in: problems } },
      select: { id: true, visibility: true },
    })
    if (found.length !== problems.length) {
      const foundIds = new Set(found.map((p) => p.id))
      const missing = problems.filter((id) => !foundIds.has(id))
      throw new ApiError('INVALID_PROBLEMS', `题目不存在: ${missing.slice(0, 5).join(', ')}`, 400)
    }
    // 竞赛仅允许 public / contest 题；禁止后台隐藏草稿绕过可见性
    const invalid = found.filter(
      (p) => p.visibility !== 'public' && p.visibility !== 'contest'
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

  // C-P1-3：更新主表 + 重建题目关联放入同一事务，避免两阶段写出现中间态
  // （与 public.updateContestWithProblems 的 $transaction 写法一致）。
  // 注：Mongo 事务需要副本集；本项目 DATABASE_URL 默认带 replicaSet=rs0（见 lib/prisma.ts），
  // 且 lib/contest/public.ts、lib/mongodb/contest-direct.ts 已在使用 $transaction / withTransaction，
  // 故此处可按同样方式使用事务；若部署环境为 standalone MongoDB 需先切换为副本集。
  await prisma.$transaction(async (tx) => {
    // 1. 更新基本信息
    await tx.contest.update({ where: { id: contestId }, data: updateData })

    // 2. 如果提供了题目列表，重建题目关联（空数组 = 清空题目）
    if (problems && Array.isArray(problems)) {
      await tx.contestProblem.deleteMany({ where: { contestId } })
      if (problems.length > 0) {
        await tx.contestProblem.createMany({
          data: problems.map((problemId: string, index: number) => ({
            contestId,
            problemId,
            orderIndex: index,
            score: 100,
          })),
        })
      }
    }
  })

  // 解冻：补齐封榜期间延迟的全局题目计数与用户 solvedCount
  if (unlockingSeal) {
    const { applyDeferredGlobalStatsAfterSealUnlock } = await import('./seal-stats')
    const { logger } = await import('@/lib/logger')
    void applyDeferredGlobalStatsAfterSealUnlock(contestId).catch((err) => {
      logger.error('封榜解冻后补齐全局统计失败', err)
    })
  }

  cache.delete(CacheKeys.contest.byId(contestId))
  cache.deleteByPrefix(CacheKeys.contest.rankPrefix(contestId))
  return { message: '更新成功' }
}

export async function adminGetContestWithProblems(contestId: string) {
  const contest = await prisma.contest.findUnique({
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
  if (!contest) return null
  const { password: _pw, ...safe } = contest
  return { ...safe, hasPassword: Boolean(_pw) }
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
  // C-P2-22：并行查询列表与总数，总数不受 take=100 截断影响（供前端统计卡片/分页使用）
  const [rows, total] = await Promise.all([
    prisma.contest.findMany({
      skip,
      take,
      orderBy: { startTime: 'desc' },
      include: {
        author: { select: { username: true } },
        _count: { select: { problems: true, participants: true } },
      },
    }),
    prisma.contest.count(),
  ])
  return {
    list: rows.map((c) => {
      const { password: _pw, ...safe } = c
      return { ...safe, hasPassword: Boolean(_pw) }
    }),
    total,
  }
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

  // 封榜时间解析：空值/null 表示不封榜；非法或不在窗内直接抛错（与 update 对齐）
  let sealRankTime: Date | null = null
  if (input.sealRankTime) {
    const parsed = new Date(input.sealRankTime)
    if (isNaN(parsed.getTime())) {
      throw new ApiError('INVALID_SEAL_TIME', '封榜时间格式无效', 400)
    }
    if (parsed.getTime() <= start.getTime() || parsed.getTime() >= end.getTime()) {
      throw new ApiError('INVALID_SEAL_TIME', '封榜时间必须在比赛起止时间范围内', 400)
    }
    sealRankTime = parsed
  }

  let hashedPassword: string | null = null
  if (input.password) {
    const bcrypt = (await import('bcryptjs')).default
    hashedPassword = await bcrypt.hash(input.password, 12)
  }

  // 创建时同样校验题目可见性（与 update 对齐）
  if (input.problems && input.problems.length > 0) {
    const found = await prisma.problem.findMany({
      where: { id: { in: input.problems } },
      select: { id: true, visibility: true },
    })
    if (found.length !== input.problems.length) {
      const foundIds = new Set(found.map((p) => p.id))
      const missing = input.problems.filter((id) => !foundIds.has(id))
      throw new ApiError('INVALID_PROBLEMS', `题目不存在: ${missing.slice(0, 5).join(', ')}`, 400)
    }
    const invalid = found.filter(
      (p) => p.visibility !== 'public' && p.visibility !== 'contest'
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

  const contest = await prisma.contest.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      startTime: start,
      endTime: end,
      duration,
      isPublic: input.isPublic || false,
      password: hashedPassword,
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
  // 响应不回传哈希密码
  const { password: _pw, ...safe } = contest
  return { ...safe, hasPassword: Boolean(_pw) }
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