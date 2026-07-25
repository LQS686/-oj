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
import { SubmissionStatus } from '@/lib/constants/submission-status'
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
      status: SubmissionStatus.PENDING,
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
    status: SubmissionStatus.PENDING,
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
      status: SubmissionStatus.SYSTEM_ERROR,
      message: '评测系统错误，请稍后重试',
    })
  }

  return submission
}

/**
 * 提交记录列表（problemId/userId/status/language/keyword 过滤 + 剔除已删除题目）
 */
export async function listSubmissionsAdvanced(
  page: number,
  limit: number,
  filter: {
    problemId?: string
    userId?: string
    status?: string
    language?: string
    keyword?: string
  }
) {
  const where: any = {}
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.userId) where.userId = filter.userId
  if (filter.language) where.language = filter.language
  if (filter.status) {
    const statuses = filter.status.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length === 1) where.status = statuses[0]
    else if (statuses.length > 1) where.status = { in: statuses }
  }

  const keyword = filter.keyword?.trim()
  if (keyword) {
    const [matchedUsers, matchedProblems] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: keyword, mode: 'insensitive' } },
            { nickname: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 80,
      }),
      prisma.problem.findMany({
        where: {
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { problemNumber: { contains: keyword.toUpperCase() } },
          ],
        },
        select: { id: true },
        take: 80,
      }),
    ])
    const userIds = matchedUsers.map((u) => u.id)
    const problemIds = matchedProblems.map((p) => p.id)
    if (userIds.length === 0 && problemIds.length === 0) {
      return {
        submissions: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      }
    }
    const or: any[] = []
    if (userIds.length) or.push({ userId: { in: userIds } })
    if (problemIds.length) or.push({ problemId: { in: problemIds } })
    where.AND = [...(where.AND || []), { OR: or }]
  }

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        problemId: true,
        userId: true,
        language: true,
        status: true,
        score: true,
        time: true,
        memory: true,
        passedTests: true,
        totalTests: true,
        message: true,
        submittedAt: true,
        problem: { select: { id: true, title: true, problemNumber: true } },
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
 * 管理员重测：重置状态并重新入队评测
 */
export async function rejudgeSubmission(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      problemId: true,
      userId: true,
      code: true,
      language: true,
      status: true,
    },
  })
  if (!submission) {
    throw AppError.notFound('提交记录不存在')
  }
  if (!submission.code?.trim()) {
    throw AppError.badRequest('EMPTY_CODE', '提交代码为空，无法重测')
  }

  const problem = await prisma.problem.findUnique({
    where: { id: submission.problemId },
    include: { testCases: true },
  })
  if (!problem) {
    throw AppError.notFound('关联题目不存在')
  }
  if (!problem.testCases.length) {
    throw AppError.badRequest('NO_TESTCASES', '题目没有测试点，无法重测')
  }

  const normalized = submission.status?.toUpperCase?.() || submission.status
  if (normalized === 'PENDING' || normalized === 'JUDGING' || normalized === 'RUNNING'
    || submission.status === 'Pending' || submission.status === 'Judging' || submission.status === 'Running') {
    throw AppError.badRequest('JUDGING_IN_PROGRESS', '该提交正在评测中，请稍后再试')
  }

  await updateSubmissionDirect(
    submission.id,
    {
      status: SubmissionStatus.PENDING,
      score: 0,
      time: 0,
      memory: 0,
      passedTests: 0,
      totalTests: problem.testCases.length,
      message: null,
      testResults: [],
    },
    { forceStatus: true }
  )

  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: problem.id,
      userId: submission.userId,
      code: submission.code,
      language: submission.language,
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
  } catch (queueError) {
    logger.error('重测入队失败', queueError)
    await updateSubmissionDirect(
      submission.id,
      {
        status: SubmissionStatus.SYSTEM_ERROR,
        message: '重测入队失败，请稍后重试',
      },
      { forceStatus: true }
    )
    throw AppError.internal('重测入队失败')
  }

  logger.info(`管理员重测提交 ${submission.id}`)
  return {
    id: submission.id,
    status: SubmissionStatus.PENDING,
    totalTests: problem.testCases.length,
  }
}

/**
 * 提交详情：先查 Submission，找不到再回退到 ClassAssignmentSubmission
 */
export async function getSubmissionDetailOrClassAssignment(id: string) {
  const submission: any = await prisma.submission.findUnique({
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
  const [problem, user, linkedSubmission] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: classSubmission.problemId },
      select: { id: true, problemNumber: true, title: true, difficulty: true },
    }),
    prisma.user.findUnique({
      where: { id: classSubmission.userId },
      select: { id: true, username: true, nickname: true },
    }),
    // 作业提交会同步写主 Submission（带 assignmentSubmissionId），测试点详情在那边
    prisma.submission.findFirst({
      where: { assignmentSubmissionId: classSubmission.id },
      select: {
        id: true,
        testResults: true,
        message: true,
        time: true,
        memory: true,
        passedTests: true,
        totalTests: true,
        score: true,
        status: true,
      },
    }),
  ])
  const linked = linkedSubmission as any
  const testResults =
    linked && 'testResults' in linked && linked.testResults
      ? (linked.testResults as any)
      : []
  return {
    id: classSubmission.id,
    problemId: classSubmission.problemId,
    userId: classSubmission.userId,
    language: classSubmission.language,
    code: classSubmission.code,
    status: linked?.status || classSubmission.status,
    score: linked?.score ?? classSubmission.score,
    time: linked?.time ?? classSubmission.time,
    memory: linked?.memory ?? classSubmission.memory,
    passedTests: linked?.passedTests ?? classSubmission.passedTests,
    totalTests: linked?.totalTests ?? classSubmission.totalTests,
    message: linked?.message ?? classSubmission.message,
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
    testResults,
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
  language?: string
  keyword?: string
}): Promise<ListAdminSubmissionsResult> {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 50
  const where: any = {}
  if (filter.language) where.language = filter.language
  if (filter.status && filter.status !== 'all') {
    const statuses = filter.status.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length === 1) {
      where.status = statuses[0]
    } else if (statuses.length > 1) {
      where.status = { in: statuses }
    }
  }
  const keyword = filter.keyword?.trim()
  if (keyword) {
    const [matchedUsers, matchedProblems] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: keyword, mode: 'insensitive' } },
            { nickname: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 80,
      }),
      prisma.problem.findMany({
        where: {
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { problemNumber: { contains: keyword.toUpperCase() } },
          ],
        },
        select: { id: true },
        take: 80,
      }),
    ])
    const userIds = matchedUsers.map((u) => u.id)
    const problemIds = matchedProblems.map((p) => p.id)
    if (userIds.length === 0 && problemIds.length === 0) {
      const statusGroupsEmpty = await prisma.submission.groupBy({
        by: ['status'],
        _count: { _all: true },
      })
      const totalByStatusEmpty: Record<string, number> = {}
      for (const g of statusGroupsEmpty) totalByStatusEmpty[g.status] = g._count._all
      return {
        submissions: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        totalByStatus: totalByStatusEmpty,
      }
    }
    const or: any[] = []
    if (userIds.length) or.push({ userId: { in: userIds } })
    if (problemIds.length) or.push({ problemId: { in: problemIds } })
    where.AND = [...(where.AND || []), { OR: or }]
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
  // 无筛选时用全局总数；有 status/language/keyword 时用 where 计数
  const hasNarrowFilter =
    !!(filter.status && filter.status !== 'all') || !!filter.language || !!keyword
  const finalTotal = hasNarrowFilter ? total : globalTotal
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
