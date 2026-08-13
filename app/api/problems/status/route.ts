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

  // 单次遍历按 problemId 归组取最高分：O(n+m)，替代原先对每个题目重复 filter（O(n*m)），
  // 同时避免 Math.max(...largeArray) 在提交量极大时触发调用栈溢出。
  const bestByProblem = new Map<string, number>()
  for (const s of allSubmissions) {
    const score = s.score || 0
    const prev = bestByProblem.get(s.problemId)
    if (prev === undefined || score > prev) {
      bestByProblem.set(s.problemId, score)
    }
  }

  const problemStatus: { [problemId: string]: { score: number; submitted: boolean } } = {}
  for (const problemId of new Set(problemIds)) {
    const submitted = bestByProblem.has(problemId)
    problemStatus[problemId] = {
      score: submitted ? (bestByProblem.get(problemId) ?? 0) : 0,
      submitted,
    }
  }

  return ok(problemStatus)
})
