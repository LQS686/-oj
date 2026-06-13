/**
 * /api/classes/invites/direct/[inviteId] - 直接邀请详情/响应
 *
 * GET  获取邀请详情
 * PUT  接受/拒绝邀请
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readJson, throw400, fail } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import {
  getDirectInviteDetail,
  respondDirectInvite,
  notifyInviterForDirectInvite,
} from '@/lib/class/service'

// 获取邀请详情
export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { inviteId } = (ctx as any).params
  if (!isObjectId(inviteId)) throw400('INVALID_ID', '无效的邀请ID')

  const result = await getDirectInviteDetail(inviteId!, user.id)
  if ('error' in result) {
    return fail('ERR', result.error, result.code)
  }
  return ok(result)
})

// 响应邀请
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { inviteId } = (ctx as any).params
  if (!isObjectId(inviteId)) throw400('INVALID_ID', '无效的邀请ID')

  const body = await readJson<{ action: string }>(req)
  const { action } = body
  if (!['accept', 'reject'].includes(action)) {
    throw400('INVALID_ACTION', '无效的操作')
  }

  const result = await respondDirectInvite(inviteId!, user.id, action as 'accept' | 'reject')
  if (!result.ok) {
    return fail('ERR', result.error, result.code)
  }

  // 获取班级和被邀请人信息（用于通知邀请人）
  const invite = await prisma.classDirectInvite.findUnique({ where: { id: inviteId } })
  const classData = invite
    ? await prisma.class.findUnique({ where: { id: invite.classId } })
    : null
  const invitee = await prisma.user.findUnique({ where: { id: user.id } })

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
