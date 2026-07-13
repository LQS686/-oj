/**
 * 作业提交记录列表
 * GET /api/classes/[id]/assignments/[assignmentId]/submissions
 */
import { withApi, ok, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  findClassAssignment,
  getCurrentClassMember,
  getUserIsAdmin,
  hasFullScoreOnProblem,
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

  // 权限校验：查看其他用户的提交需要满足以下条件之一
  if (q.userId && q.userId !== user.id) {
    const isSystemAdmin = await getUserIsAdmin(user.id)
    const isClassStaff = isClassAdminApiRole(memberRole)

    let hasFullScore = false
    if (q.problemId) {
      hasFullScore = await hasFullScoreOnProblem(user.id, assignmentId, q.problemId)
    }

    if (!isSystemAdmin && !isClassStaff && !hasFullScore) {
      throw403(
        '只有系统管理员、班级创建人、班级管理员或完成该题目并获得满分的用户可以查看他人的提交记录'
      )
    }
  }

  const assignment = await findClassAssignment(assignmentId, id)
  if (!assignment) throw404('作业不存在')

  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || q.limit || '20') || 20)

  const result = await listAssignmentSubmissions(id, assignmentId, {
    problemId: q.problemId,
    userId: q.userId,
    status: q.status,
    page,
    pageSize,
  })

  return ok(result)
})
