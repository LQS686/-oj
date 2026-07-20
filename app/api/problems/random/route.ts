/**
 * 随机一题：返回一道随机公开题目的 ID 与题号
 * GET /api/problems/random?search=&difficulty=&tag=
 *
 * 公开接口（题目本身是公开的）。
 * 前端拿到 ID 后跳转到 /problem/{problemNumber || id}。
 */
import { withApi, ok, throw404, readQuery } from '@/lib/api/withApi'
import { getRandomPublicProblem } from '@/lib/problem/crud'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ search?: string; difficulty?: string; tag?: string }>(req)
  const problem = await getRandomPublicProblem({
    search: q.search,
    difficulty: q.difficulty,
    tag: q.tag,
  })
  if (!problem) throw404('没有符合条件的题目')
  return ok(problem)
})
