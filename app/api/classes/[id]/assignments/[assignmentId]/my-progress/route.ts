/**
 * 当前用户在某作业的题目得分进度
 * GET /api/classes/[id]/assignments/[assignmentId]/my-progress
 */
import { withApi, ok, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getCurrentClassMember, getMyAssignmentProgress } from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看进度')

  const progress = await getMyAssignmentProgress(id, assignmentId, user.id)
  if (!progress) throw404('作业不存在')

  return ok(progress)
})
