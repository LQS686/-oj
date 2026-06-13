/**
 * /api/admin/problems/review - 待审核题目列表（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { listProblemsForReview } from '@/lib/problem/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const data = await listProblemsForReview()
  return ok({ data })
})
