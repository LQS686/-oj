/**
 * 班级直接邀请（按用户名）
 * - POST /api/classes/[id]/invites/direct  创建直接邀请
 * - GET  /api/classes/[id]/invites/direct  邀请列表
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  createOrReactivateDirectInvite,
  getInviterProfile,
  listClassDirectInvitesDetailed,
  sendClassDirectInviteNotification,
  getCurrentClassMember,
  getClassById,
  findUserByUsername,
  isUserClassMember,
} from '@/lib/class/service'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const body = await readJson<{ username?: string; message?: string }>(req)
  const inviteUsernameRaw = body.username
  if (!inviteUsernameRaw) throw400('MISSING_FIELDS', '请输入用户名')
  const inviteUsername = inviteUsernameRaw!

  // 校验当前成员身份与邀请权限
  const currentMember = await getCurrentClassMember(classId, user.id)
  if (!currentMember) throw403('您不是班级成员')
  const currentMemberRole = currentMember!.role
  const currentMemberPerms = (currentMember!.permissions as any) || {}

  const isAdmin = currentMemberRole === 'owner' || currentMemberRole === 'assistant'
  const hasInvitePermission = !!currentMemberPerms.canInviteMembers
  if (!isAdmin && !hasInvitePermission) throw403('您没有邀请权限')

  // 查找被邀请用户
  const inviteeUserResult = await findUserByUsername(inviteUsername)
  if (!inviteeUserResult) throw404('用户不存在')
  const inviteeUser = inviteeUserResult!
  const inviteeUserId = inviteeUser.id

  // 校验重复成员
  const isMember = await isUserClassMember(classId, inviteeUserId)
  if (isMember) throw400('ALREADY_MEMBER', '该用户已是班级成员')

  const classData = await getClassById(classId)
  if (!classData) throw404('班级不存在')
  const classDataName = classData!.name

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const inviteId = await createOrReactivateDirectInvite({
    classId,
    inviterId: user.id,
    inviteeId: inviteeUserId,
    message: body.message,
    expiresAt,
  })

  const inviterUser = await getInviterProfile(user.id)
  await sendClassDirectInviteNotification(
    inviteeUserId,
    inviterUser,
    classDataName,
    inviteId
  )

  return ok({ inviteId }, { status: 201 })
})

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  // 只有管理员可以查看邀请列表
  const currentMember = await getCurrentClassMember(classId, user.id)
  if (!currentMember) throw403('您不是班级成员')
  const currentMemberRole = currentMember!.role
  if (currentMemberRole !== 'owner' && currentMemberRole !== 'assistant') {
    throw403('只有管理员可以查看邀请列表')
  }

  const invites = await listClassDirectInvitesDetailed(classId)
  const items = invites.map((invite: any) => ({
    id: invite.id,
    classId: invite.classId,
    inviter: {
      id: invite.inviter.id,
      username: invite.inviter.username,
      nickname: invite.inviter.nickname,
      avatar: invite.inviter.avatar,
    },
    invitee: {
      id: invite.invitee.id,
      username: invite.invitee.username,
      nickname: invite.invitee.nickname,
      avatar: invite.invitee.avatar,
    },
    status: invite.status,
    message: invite.message,
    expiresAt: invite.expiresAt?.toISOString(),
    respondedAt: invite.respondedAt?.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  }))

  return ok(items)
})
