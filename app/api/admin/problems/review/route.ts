/**
 * /api/admin/problems/review - 待审核题目列表（管理员）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listProblemsForReview } from '@/lib/problem/service'

export const GET = withApi.admin(async () => {
  const data = await listProblemsForReview()
  return ok(data)
})
