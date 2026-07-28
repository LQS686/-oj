/**
 * 公共题目详情（按 ObjectId 或 problemNumber 解析）
 * GET /api/problems/[id]
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { findProblemByIdOrNumber, getProblemStatusCounts } from '@/lib/problem/service'
import { assertCanAccessProblem } from '@/lib/problem/access'
import { getUserFromRequest } from '@/lib/auth'
import { getCachedUser } from '@/lib/api/handler'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  const problem = await findProblemByIdOrNumber(id)
  if (!problem) throw404('题目不存在')

  const p = problem!
  // 可选登录：公开题无需登录；私有/班级/竞赛题需通过访问校验
  const session = getUserFromRequest(req)
  const viewer = session?.userId
    ? await getCachedUser(session.userId, session.tokenVersion)
    : null
  const contestId = req.nextUrl.searchParams.get('contestId') || undefined
  await assertCanAccessProblem(
    {
      id: p.id,
      authorId: p.authorId,
      visibility: p.visibility,
      classId: p.classId ?? null,
    },
    viewer,
    { contestId }
  )

  const acRate =
    p.totalSubmit > 0
      ? Math.round((p.totalAccepted / p.totalSubmit) * 100)
      : 0

  const statusCounts = await getProblemStatusCounts(p.id)

  return ok({
    id: p.id,
    title: p.title,
    description: p.description,
    background: p.background,
    input: p.input,
    output: p.output,
    samples: p.samples || [],
    hint: p.hint,
    source: p.source,
    difficulty: p.difficulty,
    tags: p.tags || [],
    timeLimit: p.timeLimit,
    memoryLimit: p.memoryLimit,
    isPublic: p.isPublic,
    problemNumber: p.problemNumber,
    author: p.author,
    testCases: p.testCases.map((tc: any) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.output,
      isSample: tc.isSample,
    })),
    stats: {
      acCount: p.totalAccepted,
      totalSubmissions: p.totalSubmit,
      acRate,
      statusCounts,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  })
})
