/**
 * 题目提交记录（主 Submission 表；含作业关联提交）
 * GET /api/problems/[id]/submissions
 *
 * 权限策略：
 * - 须先通过题目可见性校验（私有/竞赛题不可枚举）
 * - 普通用户：仅可查看自己的提交记录（强制 userId = 当前用户）
 * - 管理员（SYSTEM_ADMIN / ADMIN）：可查看所有人的提交记录
 */
import { withApi, ok, readQuery, throw400, throw403 } from '@/lib/api/withApi'
import { listProblemSubmissions } from '@/lib/problem/service'
import { canAccessAdmin } from '@/lib/permissions'
import { requireAccessibleProblem } from '@/lib/problem/access'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  await requireAccessibleProblem(id, { id: user.id, role: user.role })

  const q = readQuery<{ page?: string; pageSize?: string; userId?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, Math.min(100, parseInt(q.pageSize || '20') || 20))

  const isAdmin = canAccessAdmin(user)
  if (!isAdmin) {
    if (q.userId && q.userId !== user.id) {
      throw403('只能查看自己的提交记录')
    }
  }

  const effectiveUserId = isAdmin ? q.userId : user.id

  const result = await listProblemSubmissions(id, {
    page,
    pageSize,
    userId: effectiveUserId,
  })
  return ok(result ?? { items: [], total: 0, page, pageSize })
})
