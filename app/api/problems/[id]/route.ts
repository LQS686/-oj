/**
 * 公共题目详情（按 ObjectId 或 problemNumber 解析）
 * GET /api/problems/[id]
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { findProblemByIdOrNumber, getProblemStatusCounts } from '@/lib/problem/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  const problem = await findProblemByIdOrNumber(id)
  if (!problem) throw404('题目不存在')

  const p = problem!
  const acRate =
    p.totalSubmit > 0
      ? Math.round((p.totalAccepted / p.totalSubmit) * 100)
      : 0

  const statusCounts = await getProblemStatusCounts(p.id)

  return ok({
    id: p.id,
    title: p.title,
    description: p.description,
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
