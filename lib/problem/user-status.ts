/**
 * lib/problem/user-status.ts
 * 当前用户对一批题目的完成状态（题库列表与 /api/problems/status 共用）
 */
import { isObjectId } from '@/lib/api/validation'
import { prismaRo } from '@/lib/prisma'

/** 单次查询的题目数量上限：防止超大 id 数组造成 DB 压力 */
export const MAX_PROBLEM_STATUS_IDS = 500

export type ProblemStatusMap = Record<string, { score: number; submitted: boolean }>

/**
 * 批量取用户对指定题目的最高分。
 * 非法/重复 id 自动忽略；超过上限的 id 截断。
 */
export async function getProblemStatusesForUser(
  userId: string,
  problemIds: string[]
): Promise<ProblemStatusMap> {
  const ids = Array.from(new Set(problemIds.filter((id) => isObjectId(id)))).slice(
    0,
    MAX_PROBLEM_STATUS_IDS
  )
  if (ids.length === 0) return {}

  const [submissions, classSubmissions] = await Promise.all([
    prismaRo.submission.findMany({
      where: { userId, problemId: { in: ids } },
      select: { problemId: true, score: true },
    }),
    prismaRo.classAssignmentSubmission.findMany({
      where: { userId, problemId: { in: ids } },
      select: { problemId: true, score: true },
    }),
  ])

  // 单次遍历按 problemId 归组取最高分：O(n+m)，避免 Math.max(...largeArray) 栈溢出
  const bestByProblem = new Map<string, number>()
  for (const s of [...submissions, ...classSubmissions]) {
    const score = s.score || 0
    const prev = bestByProblem.get(s.problemId)
    if (prev === undefined || score > prev) bestByProblem.set(s.problemId, score)
  }

  const statuses: ProblemStatusMap = {}
  for (const problemId of ids) {
    const best = bestByProblem.get(problemId)
    statuses[problemId] = { score: best ?? 0, submitted: best !== undefined }
  }
  return statuses
}
