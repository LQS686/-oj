/**
 * 作业提交记录列表
 * GET /api/classes/[id]/assignments/[assignmentId]/submissions
 */
import { withApi, ok, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  findClassAssignment,
  getCurrentClassMember,
  getUserCanManageContent,
  listAssignmentSubmissions,
} from '@/lib/class/service'
import { isClassAdminApiRole } from '@/lib/class/roles'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = ctx.params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看提交记录')
  const memberRole = member!.role

  const q = readQuery<{
    problemId?: string
    userId?: string
    status?: string
    page?: string
    pageSize?: string
    limit?: string
  }>(req)

  // 判断是否为管理员（系统管理员 / 班级 owner / 班级 assistant）
  const canManageContent = await getUserCanManageContent(user.id)
  const isClassStaff = isClassAdminApiRole(memberRole)
  const isAdmin = canManageContent || isClassStaff

  // 非管理员强制 userId = user.id，仅能查看自己的提交
  let effectiveUserId = q.userId
  if (!isAdmin) {
    // 如果带了 userId 但不是自己的，返回 403
    if (q.userId && q.userId !== user.id) {
      throw403('无权查看其他用户的提交记录')
    }
    // 强制只查自己的
    effectiveUserId = user.id
  }

  const assignment = await findClassAssignment(assignmentId, id)
  if (!assignment) throw404('作业不存在')

  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || q.limit || '20') || 20)

  const result = await listAssignmentSubmissions(id, assignmentId, {
    problemId: q.problemId,
    userId: effectiveUserId,
    status: q.status,
    page,
    pageSize,
  })

  return ok(result)
})
