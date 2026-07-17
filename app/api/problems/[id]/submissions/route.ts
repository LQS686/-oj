/**
 * 题目提交记录（公共题库 + 班级作业合并流）
 * GET /api/problems/[id]/submissions
 *
 * 权限策略：
 * - 普通用户：仅可查看自己的提交记录（强制 userId = 当前用户）
 * - 管理员（SYSTEM_ADMIN / ADMIN）：可查看所有人的提交记录
 *
 * 防止未登录用户通过题目详情页读取他人提交。
 */
import { withApi, ok, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { listProblemSubmissionsMerged } from '@/lib/problem/service'
import { canAccessAdmin } from '@/lib/permissions'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  const q = readQuery<{ page?: string; pageSize?: string; userId?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

  // 权限校验：普通用户仅能查询自己的提交记录；
  // 仅管理员可查看所有人的提交（不限定 userId）。
  const isAdmin = canAccessAdmin(user)
  if (!isAdmin) {
    // 普通用户请求他人提交时直接拒绝（防止越权）
    if (q.userId && q.userId !== user.id) {
      throw403('只能查看自己的提交记录')
    }
  }

  const effectiveUserId = isAdmin ? q.userId : user.id

  const result = await listProblemSubmissionsMerged(id, {
    page,
    pageSize,
    userId: effectiveUserId,
  })
  if (!result) throw404('题目不存在')

  return ok(result)
})
