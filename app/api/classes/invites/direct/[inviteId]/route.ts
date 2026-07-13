/**
 * /api/classes/invites/direct/[inviteId] - 直接邀请详情/响应
 *
 * GET  获取邀请详情
 * PUT  接受/拒绝邀请
 */
import { withApi, ok, readJson, throw400, fail } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  getClassById,
  getDirectInviteRaw,
  getDirectInviteDetail,
  getUserProfile,
  respondDirectInvite,
  notifyInviterForDirectInvite,
} from '@/lib/class/service'

/** 获取邀请详情 */
export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { inviteId } = ctx.params
  if (!isObjectId(inviteId)) throw400('INVALID_ID', '无效的邀请ID')

  const result = await getDirectInviteDetail(inviteId, user.id)
  if ('error' in result) {
    return fail('ERR', result.error, result.code)
  }
  return ok(result)
})

/** 响应邀请 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { inviteId } = ctx.params
  if (!isObjectId(inviteId)) throw400('INVALID_ID', '无效的邀请ID')

  const body = await readJson<{ action: string }>(req)
  const { action } = body
  if (!['accept', 'reject'].includes(action)) {
    throw400('INVALID_ACTION', '无效的操作')
  }

  const result = await respondDirectInvite(inviteId, user.id, action as 'accept' | 'reject')
  if (!result.ok) {
    return fail('ERR', result.error, result.code)
  }

  // 获取班级和被邀请人信息（用于通知邀请人）
  const invite = await getDirectInviteRaw(inviteId)
  const classData = invite ? await getClassById(invite.classId) : null
  const invitee = await getUserProfile(user.id)

  if (invite) {
    await notifyInviterForDirectInvite(
      invite.inviterId,
      invitee,
      classData,
      invite.classId,
      action === 'accept'
    )
  }

  return ok({ status: result.status, classId: result.classId })
})
