/**
 * lib/submission/service.ts
 * 提交 CRUD、判题结果查询
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { cache } from '@/lib/cache'
import { AppError } from '@/lib/errors'
import { addJudgeJob } from '@/lib/judge/queue'
import {
  createSubmissionDirect,
  decrementProblemAcceptedCount,
  decrementProblemSubmitCount,
  incrementProblemAcceptedCount,
  incrementProblemSubmitCount,
  isFirstAccepted,
  updateClassAssignmentSubmissionDirect,
  updateSubmissionDirect,
} from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import { SubmissionStatus, isNonFinalSubmissionStatus } from '@/lib/constants/submission-status'
import { parseComparisonMode } from '@/lib/judge/types'
import { mapTestCasesMeta, TESTCASE_META_SELECT } from '@/lib/judge/testcase-loader'
import { canAccessAdmin } from '@/lib/permissions'
import { assertCanAccessProblem } from '@/lib/problem/access'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { clearRankingCache } from '@/lib/ranking/service'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

export interface SubmissionFilter {
  userId?: string
  problemId?: string
  contestId?: string
  status?: string
  language?: string
}

/** 评测测试点结果（与 JudgeResult.testResults / DB Json 对齐） */
export type SubmissionTestResult = {
  testId: string
  status: string
  time: number
  memory: number
  message?: string
}

function parseSubmissionTestResults(value: unknown): SubmissionTestResult[] {
  if (!Array.isArray(value)) return []
  const out: SubmissionTestResult[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.testId !== 'string' || typeof row.status !== 'string') continue
    out.push({
      testId: row.testId,
      status: row.status,
      time: typeof row.time === 'number' ? row.time : 0,
      memory: typeof row.memory === 'number' ? row.memory : 0,
      message: typeof row.message === 'string' ? row.message : undefined,
    })
  }
  return out
}

function mapProblemTestCases(
  testCases: Array<{
    id: string
    score: number
    timeLimit?: number | null
    memoryLimit?: number | null
  }>
) {
  return mapTestCasesMeta(testCases)
}

export async function listSubmissions(
  filter: SubmissionFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<Prisma.SubmissionGetPayload<object>>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: Prisma.SubmissionWhereInput = {}
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
    const row = await prisma.submission.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
    if (!row?.user) return row
    return {
      ...row,
      user: { ...row.user, avatar: sanitizeAvatarUrl(row.user.avatar) },
    }
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
    testResults: Prisma.InputJsonValue
  }> = {}
) {
  cache.delete(`submission:byId:${id}`)
  return prisma.submission.update({
    where: { id },
    data: { status, ...extra },
  })
}

export async function getProblemSubmissions(problemId: string, limit = 20) {
  const rows = await prisma.submission.findMany({
    where: { problemId },
    take: limit,
    orderBy: { submittedAt: 'desc' },
    include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
  })
  return rows.map((row) => ({
    ...row,
    user: { ...row.user, avatar: sanitizeAvatarUrl(row.user.avatar) },
  }))
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

export async function submitCode(
  userId: string,
  body: CreateSubmissionAdvancedInput,
  viewerRole?: string
) {
  // 竞赛提交必须走 /api/contests/[id]/submissions（含时间窗/报名/题目归属校验）
  if (body.contestId) {
    throw AppError.badRequest(
      'USE_CONTEST_ENDPOINT',
      '竞赛提交请使用竞赛提交接口，不能通过普通题库提交写入 contestId'
    )
  }

  // 验证题目存在（支持 problemNumber 与 ObjectID 两种）
  type ProblemWithCases = Prisma.ProblemGetPayload<{
    include: { testCases: { select: typeof TESTCASE_META_SELECT } }
  }>
  let problem: ProblemWithCases | null = null
  try {
    problem = await prisma.problem.findUnique({
      where: { problemNumber: body.problemId },
      include: { testCases: { select: TESTCASE_META_SELECT } },
    })
    if (!problem && body.problemId.length === 24) {
      problem = await prisma.problem.findUnique({
        where: { id: body.problemId },
        include: { testCases: { select: TESTCASE_META_SELECT } },
      })
    }
  } catch (error) {
    logger.error('查找题目错误', error)
  }
  if (!problem) {
    throw AppError.notFound('题目不存在')
  }

  await assertCanAccessProblem(
    {
      id: problem.id,
      authorId: problem.authorId,
      visibility: problem.visibility,
    },
    { id: userId, role: viewerRole }
  )

  // 创建提交记录
  const submission = await createSubmissionDirect({
    problemId: problem.id,
    userId,
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
      comparisonMode: parseComparisonMode(problem.comparisonMode),
      realPrecision: problem.realPrecision,
      spjCode: problem.spjCode ?? null,
      testCases: mapProblemTestCases(problem.testCases),
    })
    logger.info(`提交 ${submission.id} 已加入评测队列`)
  } catch (queueError) {
    logger.error('加入队列失败', queueError)
    await updateSubmissionDirect(submission.id, {
      status: SubmissionStatus.SYSTEM_ERROR,
      message: '评测系统错误，请稍后重试',
    })
    // 入队失败仍保留 SE 记录，但须回滚 totalSubmit，避免虚高
    try {
      await decrementProblemSubmitCount(problem.id)
    } catch (decErr) {
      logger.error(
        `totalSubmit 回滚失败 (submissionId=${submission.id}, problemId=${problem.id})`,
        decErr
      )
    }
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
  const where: Prisma.SubmissionWhereInput = {}
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
    const or: Prisma.SubmissionWhereInput[] = []
    if (userIds.length) or.push({ userId: { in: userIds } })
    if (problemIds.length) or.push({ problemId: { in: problemIds } })
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: or }]
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

  const validSubmissions = submissions.filter((sub) => sub.problem !== null)
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
      contestId: true,
      code: true,
      language: true,
      status: true,
      score: true,
      time: true,
      memory: true,
      passedTests: true,
      totalTests: true,
      message: true,
      testResults: true,
      assignmentSubmissionId: true,
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
    include: { testCases: { select: TESTCASE_META_SELECT } },
  })
  if (!problem) {
    throw AppError.notFound('关联题目不存在')
  }
  if (!problem.testCases.length) {
    throw AppError.badRequest('NO_TESTCASES', '题目没有测试点，无法重测')
  }

  if (isNonFinalSubmissionStatus(submission.status)) {
    throw AppError.badRequest('JUDGING_IN_PROGRESS', '该提交正在评测中，请稍后再试')
  }

  const wasAccepted = submission.status === SubmissionStatus.ACCEPTED
  let wasOnlyAc = false
  // B-P1-3：封榜期间 worker 对竞赛 AC 提交不写全局计数（worker.ts deferGlobalAc=true，
  // totalAccepted/solvedCount 均未 +1）；rejudge 回滚须与之一致——封榜中的提交
  // 跳过 decrement，否则 totalAccepted / solvedCount 会永久少 1。
  // 普通（非封榜）rejudge 行为不变。
  let shouldRollbackAccepted = wasAccepted
  if (wasAccepted && submission.contestId) {
    try {
      const { isContestSealed } = await import('@/lib/contest/rankings')
      const contest = await prisma.contest.findUnique({
        where: { id: submission.contestId },
        select: { sealRankTime: true, sealUnlocked: true },
      })
      if (contest && isContestSealed(contest)) {
        shouldRollbackAccepted = false
        logger.info('封榜期间 rejudge：跳过 AC 计数回滚', {
          submissionId: submission.id,
          contestId: submission.contestId,
        })
      }
    } catch (err) {
      logger.warn('rejudge 封榜判断失败，按未封榜回滚', {
        submissionId: submission.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  let assignmentSnapshot: {
    status: string
    score: number
    time: number
    memory: number
    passedTests: number
    message: string
    isFirstAc: boolean
    timeElapsedMs: number
  } | null = null

  // 重测前回滚 AC 计数：否则终态被清成 PENDING 后再次 AC 会双计 totalAccepted / solvedCount
  if (wasAccepted && shouldRollbackAccepted) {
    await decrementProblemAcceptedCount(submission.problemId)
    cache.delete(CacheKeys.problem.byId(submission.problemId))
    cache.delete(CacheKeys.problem.statusCounts(submission.problemId))
    cache.delete(CacheKeys.problem.stats(submission.problemId))

    wasOnlyAc = await isFirstAccepted(
      submission.problemId,
      submission.userId,
      submission.id
    )
    if (wasOnlyAc) {
      await prisma.user.updateMany({
        where: { id: submission.userId, solvedCount: { gt: 0 } },
        data: { solvedCount: { decrement: 1 } },
      })
      clearRankingCache()
    }
  } else if (wasAccepted) {
    // 封榜中：计数未计入全局，无需回滚；但题目状态/统计缓存仍须失效，避免展示旧数据
    cache.delete(CacheKeys.problem.byId(submission.problemId))
    cache.delete(CacheKeys.problem.statusCounts(submission.problemId))
    cache.delete(CacheKeys.problem.stats(submission.problemId))
  }

  if (submission.assignmentSubmissionId) {
    try {
      const row = await prisma.classAssignmentSubmission.findUnique({
        where: { id: submission.assignmentSubmissionId },
        select: {
          status: true,
          score: true,
          time: true,
          memory: true,
          passedTests: true,
          message: true,
          isFirstAc: true,
          timeElapsedMs: true,
        },
      })
      if (row) {
        assignmentSnapshot = {
          status: row.status,
          score: row.score,
          time: row.time,
          memory: row.memory,
          passedTests: row.passedTests,
          message: row.message || '',
          isFirstAc: !!row.isFirstAc,
          timeElapsedMs: row.timeElapsedMs || 0,
        }
      }
    } catch (err) {
      logger.warn('重测前读取作业提交快照失败', {
        assignmentSubmissionId: submission.assignmentSubmissionId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
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

  // B-P2-13：提交状态已重置为 PENDING，失效 byId 缓存（与 worker.ts 终态失效同键），
  // 避免详情页/列表在 30s TTL 内读到旧的 AC/WA 终态
  cache.delete(`submission:byId:${submission.id}`)

  // 同步作业提交行，避免主 Submission 已 PENDING 而作业行仍显示 AC / 首次 AC 徽章
  if (submission.assignmentSubmissionId) {
    try {
      await updateClassAssignmentSubmissionDirect(
        submission.assignmentSubmissionId,
        {
          status: SubmissionStatus.PENDING,
          score: 0,
          time: 0,
          memory: 0,
          passedTests: 0,
          message: '',
          isFirstAc: false,
          timeElapsedMs: 0,
        },
        { forceStatus: true }
      )
    } catch (err) {
      logger.warn('重测时同步作业提交状态失败', {
        assignmentSubmissionId: submission.assignmentSubmissionId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: problem.id,
      userId: submission.userId,
      code: submission.code,
      language: submission.language,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      comparisonMode: parseComparisonMode(problem.comparisonMode),
      realPrecision: problem.realPrecision,
      spjCode: problem.spjCode ?? null,
      testCases: mapProblemTestCases(problem.testCases),
    })
  } catch (queueError) {
    logger.error('重测入队失败，回滚提交状态与计数', queueError)
    // 入队失败：恢复终态与 AC 计数，避免永久少计 / 作业行卡在 PENDING
    await updateSubmissionDirect(
      submission.id,
      {
        status: submission.status,
        score: submission.score,
        time: submission.time,
        memory: submission.memory,
        passedTests: submission.passedTests,
        totalTests: submission.totalTests,
        message: submission.message,
        testResults: Array.isArray(submission.testResults) ? submission.testResults : [],
      },
      { forceStatus: true }
    )
    // 入队失败：恢复计数仅限「未封榜且确实回滚过」的提交（B-P1-3），
    // 并失效 byId 缓存，避免读到短暂 PENDING 态（B-P2-13）
    if (wasAccepted && shouldRollbackAccepted) {
      await incrementProblemAcceptedCount(submission.problemId)
      if (wasOnlyAc) {
        await prisma.user.update({
          where: { id: submission.userId },
          data: { solvedCount: { increment: 1 } },
        })
        clearRankingCache()
      }
    }
    cache.delete(`submission:byId:${submission.id}`)
    if (submission.assignmentSubmissionId && assignmentSnapshot) {
      try {
        await updateClassAssignmentSubmissionDirect(
          submission.assignmentSubmissionId,
          assignmentSnapshot,
          { forceStatus: true }
        )
      } catch (err) {
        logger.warn('重测入队失败后恢复作业提交失败', {
          assignmentSubmissionId: submission.assignmentSubmissionId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
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
 * 提交详情：仅查主 Submission（作业提交也有关联的主记录）
 */
export async function getSubmissionDetail(id: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      problem: { select: { id: true, problemNumber: true, title: true, difficulty: true } },
      user: { select: { id: true, username: true, nickname: true } },
    },
  })
  if (!submission) return null
  return {
    ...submission,
    testResults: parseSubmissionTestResults(submission.testResults),
  }
}

/**
 * 获取提交中第一个 WA 测试点数据（供下载）
 * 仅提交者本人或管理员可访问；多个 WA 时只返回第一个。
 */
export async function getFirstWaTestCaseForDownload(
  submissionId: string,
  requester: { id: string; role?: string }
) {
  const detail = await getSubmissionDetail(submissionId)
  if (!detail) throw AppError.notFound('提交记录不存在')

  const isOwnerOrAdmin = detail.userId === requester.id || canAccessAdmin(requester)
  if (!isOwnerOrAdmin) throw AppError.forbidden('无权下载该提交的测试点')

  // 题目仍须当前可访问，避免历史 IDOR 提交继续泄露隐藏测点
  const problem = await prisma.problem.findUnique({
    where: { id: detail.problemId },
    select: {
      id: true,
      authorId: true,
      visibility: true,
    },
  })
  if (!problem) throw AppError.notFound('题目不存在')
  await assertCanAccessProblem(
    problem,
    { id: requester.id, role: requester.role },
    { contestId: detail.contestId ?? undefined }
  )

  // 竞赛进行中禁止下载隐藏测例（防 WA 神谕）；管理员除外
  if (detail.contestId && !canAccessAdmin(requester)) {
    const contest = await prisma.contest.findUnique({
      where: { id: detail.contestId },
      select: { endTime: true, authorId: true },
    })
    if (contest && new Date() < contest.endTime && contest.authorId !== requester.id) {
      throw AppError.forbidden('竞赛进行中不可下载测试点')
    }
  }

  const waIndex = detail.testResults.findIndex(
    (r) => r.status === SubmissionStatus.WRONG_ANSWER
  )
  if (waIndex < 0) {
    throw AppError.badRequest('NO_WA_TESTCASE', '该提交没有 WA 测试点可下载')
  }

  const waResult = detail.testResults[waIndex]
  const testCase = await prisma.testCase.findFirst({
    where: { id: waResult.testId, problemId: detail.problemId },
    select: { id: true, input: true, output: true },
  })
  if (!testCase) throw AppError.notFound('测试点数据不存在')

  return {
    caseIndex: waIndex + 1,
    testId: testCase.id,
    input: testCase.input,
    output: testCase.output,
    problemNumber: detail.problem?.problemNumber ?? null,
    submissionId: detail.id,
  }
}

/* ============================================================================
 * 管理员提交列表（原 /api/admin/submissions）
 * ========================================================================== */

export interface ListAdminSubmissionsResult {
  submissions: Array<
    Prisma.SubmissionGetPayload<{
      select: {
        id: true
        userId: true
        problemId: true
        language: true
        code: true
        status: true
        score: true
        time: true
        memory: true
        passedTests: true
        totalTests: true
        message: true
        submittedAt: true
      }
    }> & {
      user: { id: string; username: string; nickname: string | null }
      problem: { id: string; problemNumber: string | null; title: string }
    }
  >
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
  const where: Prisma.SubmissionWhereInput = {}
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
    const or: Prisma.SubmissionWhereInput[] = []
    if (userIds.length) or.push({ userId: { in: userIds } })
    if (problemIds.length) or.push({ problemId: { in: problemIds } })
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: or }]
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
  const userIds = [...new Set(submissionsRaw.map((s) => s.userId).filter(Boolean))]
  const problemIds = [...new Set(submissionsRaw.map((s) => s.problemId).filter(Boolean))]
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
  const userMap = new Map(users.map((u) => [u.id, u]))
  const problemMap = new Map(problems.map((p) => [p.id, p]))
  const submissions = submissionsRaw.map((sub) => ({
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
