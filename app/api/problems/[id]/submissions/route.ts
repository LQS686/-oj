/**
 * 题目提交记录（公共题库 + 班级作业合并流）
 * GET /api/problems/[id]/submissions
 */
import { withApi, ok, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { listProblemSubmissionsMerged } from '@/lib/problem/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  const q = readQuery<{ page?: string; pageSize?: string; userId?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

  const result = await listProblemSubmissionsMerged(id, {
    page,
    pageSize,
    userId: q.userId,
  })
  if (!result) throw404('题目不存在')

  return ok(result)
})
