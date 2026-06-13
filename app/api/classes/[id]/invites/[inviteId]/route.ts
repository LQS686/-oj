/**
 * 班级邀请码删除
 * DELETE /api/classes/[id]/invites/[inviteId]
 */
import { withApi, ok, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  assertClassAdmin,
  deleteClassInviteSimple,
  getClassInviteSimple,
} from '@/lib/class/service'

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, inviteId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(inviteId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  await assertClassAdmin(id, user.id, '只有管理员可以管理邀请码')

  const invite = await getClassInviteSimple(id, inviteId)
  if (!invite) throw404('邀请码不存在')

  await deleteClassInviteSimple(inviteId)
  return ok({ message: '邀请码已删除' })
})
