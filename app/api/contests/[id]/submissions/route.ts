/**
 * /api/contests/[id]/submissions - 竞赛代码提交 + 提交列表
 *
 * POST   提交竞赛代码（需登录）
 * GET    获取竞赛提交列表（按访问权限）
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readJson, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId, toInt } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'
import { addJudgeJob } from '@/lib/judge/queue'
import {
  createSubmissionDirect,
  incrementProblemSubmitCount,
  updateSubmissionDirect,
} from '@/lib/mongodb-direct'

// POST /api/contests/[id]/submissions - 提交竞赛代码
export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: contestId } = (ctx as any).params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  const body = await readJson<{ problemId: string; code: string; language: string }>(req)
  if (!body.problemId || !body.code || !body.language) {
    throw400('MISSING_FIELDS', '缺少必需字段: problemId, code, language')
  }

  // 1. 获取竞赛信息并验证状态
  const contest = await prisma.contest.findUnique({ where: { id: contestId } })
  if (!contest) throw404('竞赛不存在')

  const now = new Date()
  // 管理员可以随时提交（用于测试），普通用户需在比赛期间提交
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isAdmin) {
    if (now < contest!.startTime) throw403('竞赛尚未开始')
    if (now > contest!.endTime) throw403('竞赛已结束')

    // 2. 验证用户是否报名
    const participant = await prisma.contestParticipant.findFirst({
      where: { contestId, userId: user.id },
    })
    if (!participant) throw403('未报名该竞赛，无法提交')
  }

  // 3. 验证题目是否属于该竞赛
  // body.problemId 可能是真实 problemId，也可能是 contestProblem 的 id 或者 orderIndex
  // 假设前端传的是真实 problemId
  const contestProblem = await prisma.contestProblem.findFirst({
    where: { contestId, problemId: body.problemId },
    include: { problem: { include: { testCases: true } } },
  })
  if (!contestProblem) throw400('PROBLEM_NOT_IN_CONTEST', '该题目不属于当前竞赛')

  const problem = contestProblem!.problem

  // 4. 创建提交记录
  const submission = await createSubmissionDirect({
    problemId: problem.id,
    userId: user.id,
    contestId: contestId!,
    language: body.language,
    code: body.code,
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
      userId: user.id,
      code: body.code,
      language: body.language,
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

  return ok(
    {
      submissionId: submission.id,
      submission,
      message: '代码已提交，正在评测中...',
    },
    { status: 201 }
  )
})

// GET /api/contests/[id]/submissions - 获取竞赛提交列表
export const GET = withApi.public(async (req, ctx) => {
  const { id: contestId } = (ctx as any).params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  // 验证访问权限
  const currentUser = getUserFromRequest(req)
  const access = await checkContestAccess(contestId!, currentUser, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  const q = readQuery<{ page?: string; limit?: string; userId?: string; problemId?: string }>(req)
  const page = toInt(q.page, 'page', 1)
  const limit = toInt(q.limit, 'limit', 20)
  const userId = q.userId
  const problemId = q.problemId

  const where: any = { contestId }
  if (userId) where.userId = userId
  if (problemId) where.problemId = problemId

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

  return ok({
    submissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})
