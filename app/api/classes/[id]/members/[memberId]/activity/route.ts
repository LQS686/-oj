/**
 * 班级成员活动概况
 * GET /api/classes/[id]/members/[memberId]/activity
 */
import { withApi, ok, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getClassMemberActivity, isClassAdminRole, getCurrentClassMember } from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, memberId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('您不是班级成员')
  const memberRole = member!.role

  const isOwnerOrAdmin = isClassAdminRole(memberRole)
  const isSelf = memberId === user.id
  if (!isOwnerOrAdmin && !isSelf) throw403('只有管理员或本人可查看该成员活动')

  const activity = await getClassMemberActivity(id, memberId)
  if (!activity) throw404('成员不存在')

  return ok(activity)
})
