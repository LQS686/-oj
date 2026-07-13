/**
 * 班级作业详细统计
 * GET /api/classes/[id]/assignments/[assignmentId]/statistics
 */
import { withApi, ok, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { computeAssignmentStatistics, getCurrentClassMember } from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, assignmentId } = ctx.params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看统计数据')

  const stats = await computeAssignmentStatistics(id, assignmentId)
  if (!stats) throw404('作业不存在')

  return ok(stats)
})
