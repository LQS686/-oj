/**
 * /api/admin/problems/review - 待审核题目列表（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { isSystemAdmin } from '@/lib/permissions'
import { listProblemsForReview } from '@/lib/problem/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const data = await listProblemsForReview()
  return ok(data)
})
