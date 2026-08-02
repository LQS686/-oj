/**
 * /api/admin/reviews - 题解审核列表（管理员）
 *
 * GET 鉴权（管理员）：按审核状态分页列出题解
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { listSolutionsForReview } from '@/lib/solution/service'
import { toInt } from '@/lib/api/validation'

/**
 * GET /api/admin/reviews?status=pending&page=1&pageSize=20
 */
export const GET = withApi.admin(async (req) => {
  const q = readQuery<{ status?: string; page?: string; pageSize?: string }>(req)
  const page = Math.max(1, toInt(q.page, 'page', 1))
  const pageSize = Math.max(1, Math.min(100, toInt(q.pageSize, 'pageSize', 20)))

  const result = await listSolutionsForReview({ status: q.status }, { page, pageSize })
  return ok(result)
})
