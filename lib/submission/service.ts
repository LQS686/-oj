/**
 * lib/submission/service.ts
 * 提交 CRUD、判题结果查询
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { AppError } from '@/lib/errors'
import { addJudgeJob } from '@/lib/judge/queue'
import { createSubmissionDirect, incrementProblemSubmitCount, updateSubmissionDirect } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import type { Prisma } from '@prisma/client'

export interface SubmissionFilter {
  userId?: string
  problemId?: string
  contestId?: string
  status?: string
  language?: string
}

export async function listSubmissions(
  filter: SubmissionFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.userId) where.userId = filter.userId
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.contestId) where.contestId = filter.contestId
  if (filter.status) where.status = filter.status
  if (filter.language) where.language = filter.language

  const [items, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'submittedAt']: options.sortOrder || 'desc' },
    }),
    prisma.submission.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getSubmissionById(id: string) {
  return cache.get('submission:byId', [id], async () => {
    return prisma.submission.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
  }, { ttl: 30_000 })
}

export async function createSubmission(data: {
  userId: string
  problemId: string
  code: string
  language: string
  contestId?: string
  assignmentId?: string
}) {
  return prisma.submission.create({
    data: {
      ...data,
      status: 'PENDING',
      submittedAt: new Date(),
    },
  })
}

export async function updateSubmissionStatus(
  id: string,
  status: string,
  extra: Partial<{
    score: number
    time: number
    memory: number
    passedTests: number
    totalTests: number
    message: string
    testResults: any
  }> = {}
) {
  cache.delete(`submission:byId:${id}`)
  return prisma.submission.update({
    where: { id },
    data: { status, ...extra },
  })
}

export async function getProblemSubmissions(problemId: string, limit = 20) {
  return prisma.submission.findMany({
    where: { problemId },
    take: limit,
    orderBy: { submittedAt: 'desc' },
    include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
  })
}

/* ============================================================================
 * 业务封装：原 /api/submissions 路由中的复杂逻辑
 * ========================================================================== */

/**
 * 提交代码：题目查找 + 创建记录 + 自增 + 加入评测队列
 */
export interface CreateSubmissionAdvancedInput {
  problemId: string
  code: string
  language: string
  contestId?: string
}

export async function submitCode(userId: string, body: CreateSubmissionAdvancedInput) {
  // 验证题目存在（支持 problemNumber 与 ObjectID 两种）
  let problem: any
  try {
    problem = await prisma.problem.findUnique({
      where: { problemNumber: body.problemId },
      include: { testCases: true },
    })
    if (!problem && body.problemId.length === 24) {
      problem = await prisma.problem.findUnique({
        where: { id: body.problemId },
        include: { testCases: true },
      })
    }
  } catch (error) {
    logger.error('查找题目错误', error)
  }
  if (!problem) {
    throw AppError.notFound('题目不存在')
  }

  // 创建提交记录
  const submission = await createSubmissionDirect({
    problemId: problem.id,
    userId,
    contestId: body.contestId || undefined,
    language: body.language,
    code: body.code,
    status: 'Pending',
    totalTests: problem.testCases.length,
  })

  // 自增题目提交数
  await incrementProblemSubmitCount(problem.id)

  // ❌ 【数据隔离】题库提交不写入 ClassAssignmentSubmission（保留旧注释语义）
  logger.info('题库提交，不同步到作业')

  // 加入评测队列（失败回写 SE）
  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: problem.id,
      userId,
      code: body.code,
      language: body.language,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      comparisonMode: problem.comparisonMode as any,
      realPrecision: problem.realPrecision,
      testCases: (problem.testCases as any[]).map((tc) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        score: tc.score,
        timeLimit: tc.timeLimit ?? undefined,
        memoryLimit: tc.memoryLimit ?? undefined,
      })),
    })
    logger.info(`提交 ${submission.id} 已加入评测队列`)
  } catch (queueError) {
    logger.error('加入队列失败', queueError)
    await updateSubmissionDirect(submission.id, {
      status: 'SE',
      message: '评测系统错误，请稍后重试',
    })
  }

  return submission
}

/**
 * 提交记录列表（problemId/userId/status 过滤 + 剔除已删除题目）
 */
export async function listSubmissionsAdvanced(
  page: number,
  limit: number,
  filter: { problemId?: string; userId?: string; status?: string }
) {
  const where: any = {}
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.userId) where.userId = filter.userId
  if (filter.status) where.status = filter.status

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { submittedAt: 'desc' },
      include: {
        problem: { select: { id: true, title: true } },
        user: { select: { id: true, username: true, nickname: true } },
      },
    }),
    prisma.submission.count({ where }),
  ])

  const validSubmissions = submissions.filter((sub: any) => sub.problem !== null)
  if (validSubmissions.length < submissions.length) {
    logger.warn(`发现 ${submissions.length - validSubmissions.length} 条无效提交记录（对应题目不存在）`)
  }
  return {
    submissions: validSubmissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * 提交详情：先查 Submission，找不到再回退到 ClassAssignmentSubmission
 */
export async function getSubmissionDetailOrClassAssignment(id: string) {
  let submission: any = await prisma.submission.findUnique({
    where: { id },
    include: {
      problem: { select: { id: true, problemNumber: true, title: true, difficulty: true } },
      user: { select: { id: true, username: true, nickname: true } },
    },
  })
  if (submission) {
    const testResults = 'testResults' in submission && submission.testResults
      ? (submission.testResults as any)
      : []
    return { ...submission, testResults }
  }
  const classSubmission = await prisma.classAssignmentSubmission.findUnique({ where: { id } })
  if (!classSubmission) return null
  const [problem, user] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: classSubmission.problemId },
      select: { id: true, problemNumber: true, title: true, difficulty: true },
    }),
    prisma.user.findUnique({
      where: { id: classSubmission.userId },
      select: { id: true, username: true, nickname: true },
    }),
  ])
  return {
    id: classSubmission.id,
    problemId: classSubmission.problemId,
    userId: classSubmission.userId,
    language: classSubmission.language,
    code: classSubmission.code,
    status: classSubmission.status,
    score: classSubmission.score,
    time: classSubmission.time,
    memory: classSubmission.memory,
    passedTests: classSubmission.passedTests,
    totalTests: classSubmission.totalTests,
    message: classSubmission.message,
    submittedAt: classSubmission.submittedAt,
    problem: problem || {
      id: classSubmission.problemId,
      problemNumber: null,
      title: '未知题目',
      difficulty: '未知',
    },
    user: user || {
      id: classSubmission.userId,
      username: '未知用户',
      nickname: null,
    },
    testResults: [],
  }
}

/* ============================================================================
 * 管理员提交列表（原 /api/admin/submissions）
 * ========================================================================== */

export interface ListAdminSubmissionsResult {
  submissions: Array<any>
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalByStatus: Record<string, number>
}

/**
 * 管理员提交记录列表（带 user/problem enrich）
 * status 参数支持逗号分隔的多状态（如 "WA,TLE,MLE,CE,RE"）
 */
export async function listAdminSubmissions(filter: {
  page?: number
  pageSize?: number
  status?: string
}): Promise<ListAdminSubmissionsResult> {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 50
  const where: any = {}
  if (filter.status && filter.status !== 'all') {
    const statuses = filter.status.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length === 1) {
      where.status = statuses[0]
    } else if (statuses.length > 1) {
      where.status = { in: statuses }
    }
  }
  // 全局状态统计（不受 status 筛选影响），用于前端统计卡显示全局数字
  const statusGroups = await prisma.submission.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  const totalByStatus: Record<string, number> = {}
  let globalTotal = 0
  for (const g of statusGroups) {
    totalByStatus[g.status] = g._count._all
    globalTotal += g._count._all
  }
  const [total, submissionsRaw] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        problemId: true,
        language: true,
        code: true,
        status: true,
        score: true,
        time: true,
        memory: true,
        passedTests: true,
        totalTests: true,
        message: true,
        submittedAt: true,
      },
    }),
  ])
  // 当无状态筛选时，total 应等于全局总数；用统计结果覆盖以避免分页漂移
  const finalTotal = !filter.status || filter.status === 'all' ? globalTotal : total
  // 批量查询用户和题目信息，避免 N+1（原每条提交 2 次查询，pageSize=50 时 100 次往返）
  const userIds = [...new Set(submissionsRaw.map((s: any) => s.userId).filter(Boolean))]
  const problemIds = [...new Set(submissionsRaw.map((s: any) => s.problemId).filter(Boolean))]
  const [users, problems] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, nickname: true },
        })
      : [],
    problemIds.length
      ? prisma.problem.findMany({
          where: { id: { in: problemIds } },
          select: { id: true, problemNumber: true, title: true },
        })
      : [],
  ])
  const userMap = new Map(users.map((u: any) => [u.id, u]))
  const problemMap = new Map(problems.map((p: any) => [p.id, p]))
  const submissions = submissionsRaw.map((sub: any) => ({
    ...sub,
    user: userMap.get(sub.userId) || {
      id: sub.userId,
      username: '未知用户',
      nickname: '未知用户',
    },
    problem: problemMap.get(sub.problemId) || {
      id: sub.problemId,
      problemNumber: '',
      title: '题目已删除',
    },
  }))
  return {
    submissions,
    total: finalTotal,
    page,
    pageSize,
    totalPages: Math.ceil(finalTotal / pageSize),
    totalByStatus,
  }
}
