/**
 * lib/contest/service.ts
 * 竞赛 CRUD、报名、榜单
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import { ApiError } from '@/lib/api/withApi'
import {
  createSubmissionDirect,
  incrementProblemSubmitCount,
  updateSubmissionDirect,
} from '@/lib/mongodb-direct'
import { addJudgeJob } from '@/lib/judge/queue'

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
  cache.delete(`contest:byId:${contestId}`)
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

/* ============================================================================
 * 竞赛排行榜（按 ACM / OI 规则计算 + 排名）
 * ========================================================================== */

const PENALTY_PER_WA = 20 * 60 * 1000

interface ContestUserStats {
  user: any
  solved: number
  totalScore: number
  penalty: number
  problems: Record<
    string,
    { status: string; time: number; tries: number; score: number }
  >
}

/**
 * 拉取题目+参赛者+提交，并计算排行榜
 */
export async function computeContestRankings(contestId: string) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      problems: {
        include: {
          problem: { select: { id: true, title: true, problemNumber: true } },
        },
        orderBy: { orderIndex: 'asc' },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
              rating: true,
              rank: true,
              color: true,
            },
          },
        },
      },
    },
  })
  if (!contest) return null

  // 只获取必要的字段以减少数据量
  const submissions = await prisma.submission.findMany({
    where: { contestId },
    select: {
      userId: true,
      problemId: true,
      status: true,
      submittedAt: true,
      score: true, // 添加分数
    },
    orderBy: { submittedAt: 'asc' },
  })

  const startTime = contest.startTime.getTime()
  const userStatsMap = new Map<string, ContestUserStats>()

  // 预填充
  contest.participants.forEach((p: any) => {
    userStatsMap.set(p.userId, {
      user: p.user,
      solved: 0,
      totalScore: 0,
      penalty: 0,
      problems: {},
    })
  })

  submissions.forEach((sub: any) => {
    if (!userStatsMap.has(sub.userId)) return
    const stats = userStatsMap.get(sub.userId)!

    if (!stats.problems[sub.problemId]) {
      stats.problems[sub.problemId] = {
        status: 'Unsubmitted',
        time: 0,
        tries: 0,
        score: 0,
      }
    }

    const problemStats = stats.problems[sub.problemId]
    const relativeTime = new Date(sub.submittedAt).getTime() - startTime
    if (relativeTime < 0) return

    // ACM 逻辑
    if (contest.type === 'ACM') {
      if (problemStats.status === 'AC') return
      if (sub.status === 'AC' || sub.status === 'Accepted') {
        // 兼容不同状态写法
        problemStats.status = 'AC'
        problemStats.time = relativeTime
        problemStats.score = 1 // ACM 1题1分
        stats.penalty += relativeTime + problemStats.tries * PENALTY_PER_WA
        stats.solved += 1
        stats.totalScore += 1
      } else if (
        ['WA', 'TLE', 'MLE', 'RE'].includes(sub.status) ||
        sub.status === 'Wrong Answer'
      ) {
        problemStats.status = 'WA'
        problemStats.tries += 1
      }
    } else {
      // OI 逻辑 (取最高分)
      const currentScore = sub.score || 0
      if (currentScore > problemStats.score) {
        // 更新最高分，同时更新总分
        stats.totalScore += currentScore - problemStats.score
        problemStats.score = currentScore
        problemStats.status =
          currentScore === 100 ? 'AC' : currentScore > 0 ? 'Partial' : 'WA'
      }
      // OI 也可以记录最后一次提交时间作为罚时？或者不计算罚时
    }
  })

  // 4. 排序
  const rankList = Array.from(userStatsMap.values()).sort((a, b) => {
    if (contest.type === 'ACM') {
      if (a.solved !== b.solved) return b.solved - a.solved
      return a.penalty - b.penalty
    } else {
      // OI: 分数优先
      return b.totalScore - a.totalScore
    }
  })

  // 5. 赋予排名
  const finalRankList = rankList.map((item, index) => ({
    rank: index + 1,
    ...item,
    penaltyMinutes: Math.floor(item.penalty / 60000),
  }))

  return {
    rankings: finalRankList,
    contestType: contest.type,
    problems: contest.problems.map((cp: any) => ({
      id: cp.problem.id,
      title: cp.problem.title,
      problemNumber: cp.problem.problemNumber,
      orderIndex: cp.orderIndex,
    })),
  }
}

/* ============================================================================
 * 竞赛提交列表（含 user/problem 关联）
 * ========================================================================== */

export interface ListContestSubmissionsFilter {
  page?: number
  limit?: number
  userId?: string
  problemId?: string
}

export async function listContestSubmissionsPaged(
  contestId: string,
  filter: ListContestSubmissionsFilter = {}
) {
  const page = filter.page ?? 1
  const limit = filter.limit ?? 20
  const where: any = { contestId }
  if (filter.userId) where.userId = filter.userId
  if (filter.problemId) where.problemId = filter.problemId

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { submittedAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, nickname: true } },
        problem: { select: { id: true, title: true, problemNumber: true } },
      },
    }),
    prisma.submission.count({ where }),
  ])

  return {
    submissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/* ============================================================================
 * 竞赛代码提交：入队评测（原 /api/contests/[id]/submissions POST）
 * ========================================================================== */

export interface SubmitContestCodeInput {
  contestId: string
  userId: string
  isAdmin: boolean
  problemId: string
  code: string
  language: string
}

export async function submitContestCode(input: SubmitContestCodeInput) {
  if (!input.problemId || !input.code || !input.language) {
    throw new ApiError('MISSING_FIELDS', '缺少必需字段: problemId, code, language', 400)
  }
  const contest = await prisma.contest.findUnique({ where: { id: input.contestId } })
  if (!contest) {
    throw new ApiError('NOT_FOUND', '竞赛不存在', 404)
  }

  const now = new Date()
  // 管理员可以随时提交（用于测试），普通用户需在比赛期间提交
  if (!input.isAdmin) {
    if (now < contest.startTime) throw new ApiError('FORBIDDEN', '竞赛尚未开始', 403)
    if (now > contest.endTime) throw new ApiError('FORBIDDEN', '竞赛已结束', 403)

    // 验证用户是否报名
    const participant = await prisma.contestParticipant.findFirst({
      where: { contestId: input.contestId, userId: input.userId },
    })
    if (!participant) {
      throw new ApiError('FORBIDDEN', '未报名该竞赛，无法提交', 403)
    }
  }

  // 验证题目是否属于该竞赛
  // input.problemId 可能是真实 problemId，也可能是 contestProblem 的 id 或者 orderIndex
  // 假设前端传的是真实 problemId
  const contestProblem = await prisma.contestProblem.findFirst({
    where: { contestId: input.contestId, problemId: input.problemId },
    include: { problem: { include: { testCases: true } } },
  })
  if (!contestProblem) {
    throw new ApiError('PROBLEM_NOT_IN_CONTEST', '该题目不属于当前竞赛', 400)
  }
  const problem = contestProblem.problem

  // 4. 创建提交记录
  const submission = await createSubmissionDirect({
    problemId: problem.id,
    userId: input.userId,
    contestId: input.contestId,
    language: input.language,
    code: input.code,
    status: 'Pending',
    totalTests: problem.testCases.length,
  })

  // 更新题目总提交数
  await incrementProblemSubmitCount(problem.id)

  // 5. 加入评测队列
  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: problem.id,
      userId: input.userId,
      code: input.code,
      language: input.language,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      testCases: problem.testCases.map((tc: any) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        score: tc.score,
        timeLimit: tc.timeLimit,
        memoryLimit: tc.memoryLimit,
      })),
    })
    console.log(`✅ 竞赛提交 ${submission.id} 已加入评测队列`)
  } catch (queueError) {
    console.error('加入队列失败:', queueError)
    // 依然返回成功，但标记为系统错误
    await updateSubmissionDirect(submission.id, {
      status: 'SE',
      message: '评测系统错误，请稍后重试',
    })
  }

  // 提交后失效该竞赛的排行榜缓存（不同 limit 的缓存都要清）
  cache.deleteByPrefix(`contest:rank:${input.contestId}`)

  return {
    submissionId: submission.id,
    submission,
    message: '代码已提交，正在评测中...',
  }
}

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
  cache.delete(`contest:byId:${contestId}`)
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
  cache.delete(`contest:byId:${contestId}`)
  return prisma.contest.delete({ where: { id: contestId } })
}

/* ============================================================================
 * 竞赛题目列表（含个人提交状态 + 整体统计）原 /api/contests/[id]/problems
 * ========================================================================== */

export async function listContestProblemsWithStatus(
  contestId: string,
  currentUserId: string | null
) {
  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId },
    orderBy: { orderIndex: 'asc' },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          problemNumber: true,
          difficulty: true,
          visibility: true,
          isPublic: true,
          totalAccepted: true,
          totalSubmit: true,
        },
      },
    },
  })

  const problemIds = contestProblems.map((cp: any) => cp.problemId)
  const userSubmissionStatus: Record<string, 'Accepted' | 'Attempted' | null> = {}
  const contestStats: Record<string, { accepted: number; submitted: number }> = {}

  if (currentUserId) {
    const submissions = await prisma.submission.findMany({
      where: { contestId, problemId: { in: problemIds }, userId: currentUserId },
      select: { problemId: true, status: true },
    })
    const problemSubmissionMap = new Map<string, Set<string>>()
    for (const sub of submissions) {
      if (!problemSubmissionMap.has(sub.problemId)) {
        problemSubmissionMap.set(sub.problemId, new Set())
      }
      problemSubmissionMap.get(sub.problemId)!.add(sub.status)
    }
    for (const problemId of problemIds) {
      const statuses = problemSubmissionMap.get(problemId)
      if (statuses?.has('Accepted')) {
        userSubmissionStatus[problemId] = 'Accepted'
      } else if (statuses && statuses.size > 0) {
        userSubmissionStatus[problemId] = 'Attempted'
      } else {
        userSubmissionStatus[problemId] = null
      }
    }
  }

  const [contestSubmissions, acceptedSubmissions] = await Promise.all([
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { contestId, problemId: { in: problemIds } },
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { contestId, problemId: { in: problemIds }, status: 'Accepted' },
      _count: { _all: true },
    }),
  ])

  const acceptedMap = new Map<any, any>(acceptedSubmissions.map((s: any) => [s.problemId, s._count._all]))
  for (const sub of contestSubmissions) {
    contestStats[sub.problemId] = {
      accepted: acceptedMap.get(sub.problemId) || 0,
      submitted: sub._count._all,
    }
  }

  return contestProblems.map((cp: any) => {
    const stats = contestStats[cp.problemId] || { accepted: 0, submitted: 0 }
    return {
      id: cp.problemId,
      orderIndex: cp.orderIndex,
      score: cp.score,
      label: String.fromCharCode(65 + cp.orderIndex),
      title: cp.problem.title,
      problemNumber: cp.problem.problemNumber,
      difficulty: cp.problem.difficulty,
      visibility: cp.problem.visibility,
      isPublic: cp.problem.isPublic,
      accepted: stats.accepted,
      submitted: stats.submitted,
      status: currentUserId ? userSubmissionStatus[cp.problemId] : null,
    }
  })
}

/* ============================================================================
 * 管理员竞赛管理（原 /api/admin/contests）
 * ========================================================================== */

/** 管理员列出所有竞赛（带作者 + 题目/参赛者计数） */
export async function listAdminContests() {
  return prisma.contest.findMany({
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