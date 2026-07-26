/**
 * 题目提交记录（主 Submission 表；含作业关联提交）
 * GET /api/problems/[id]/submissions
 *
 * 权限策略：
 * - 普通用户：仅可查看自己的提交记录（强制 userId = 当前用户）
 * - 管理员（SYSTEM_ADMIN / ADMIN）：可查看所有人的提交记录
 *
 * 防止未登录用户通过题目详情页读取他人提交。
 */
import { withApi, ok, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { listProblemSubmissions } from '@/lib/problem/service'
import { canAccessAdmin } from '@/lib/permissions'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  const q = readQuery<{ page?: string; pageSize?: string; userId?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

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
  if (!result) throw404('题目不存在')

  return ok(result)
})
