/**
 * 获取用户对题目的完成状态
 * GET /api/problems/status?problemIds=id1,id2,id3
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { prismaRo } from '@/lib/prisma'

export const GET = withApi.auth(async (req, _ctx, { user }) => {
  const q = readQuery<{ problemIds?: string }>(req)
  const problemIdsParam = q.problemIds

  if (!problemIdsParam) {
    return ok({})
  }

  const problemIds = problemIdsParam.split(',').filter((id) => id.trim())
  if (problemIds.length === 0) {
    return ok({})
  }

  const [submissions, classSubmissions] = await Promise.all([
    prismaRo.submission.findMany({
      where: { userId: user.id, problemId: { in: problemIds } },
      select: { problemId: true, score: true },
    }),
    prismaRo.classAssignmentSubmission.findMany({
      where: { userId: user.id, problemId: { in: problemIds } },
      select: { problemId: true, score: true },
    }),
  ])

  const allSubmissions = [...submissions, ...classSubmissions]

  const problemStatus: { [problemId: string]: { score: number; submitted: boolean } } = {}

  problemIds.forEach((problemId) => {
    const problemSubmissions = allSubmissions.filter((s) => s.problemId === problemId)
    if (problemSubmissions.length > 0) {
      const maxScore = Math.max(...problemSubmissions.map((s) => s.score || 0))
      problemStatus[problemId] = { score: maxScore, submitted: true }
    } else {
      problemStatus[problemId] = { score: 0, submitted: false }
    }
  })

  return ok(problemStatus)
})
