/**
 * 班级直接邀请（按用户名）
 * - POST /api/classes/[id]/invites/direct  创建直接邀请
 * - GET  /api/classes/[id]/invites/direct  邀请列表
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  findDirectInvite,
  updateDirectInvite,
  listClassDirectInvitesDetailed,
  sendClassDirectInviteNotification,
} from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const body = await readJson<{ username?: string; message?: string }>(req)
  if (!body.username) throw400('MISSING_FIELDS', '请输入用户名')

  const currentMember = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: user.id } },
  })
  if (!currentMember) throw403('您不是班级成员')

  const isAdmin = currentMember!.role === 'owner' || currentMember!.role === 'admin'
  const permissions = (currentMember!.permissions as any) || {}
  const hasInvitePermission = !!permissions.canInviteMembers
  if (!isAdmin && !hasInvitePermission) throw403('您没有邀请权限')

  const inviteeUser = await prisma.user.findUnique({ where: { username: body.username } })
  if (!inviteeUser) throw404('用户不存在')

  const existingMember = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: inviteeUser!.id } },
  })
  if (existingMember) throw400('ALREADY_MEMBER', '该用户已是班级成员')

  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) throw404('班级不存在')

  const existingInvite = await findDirectInvite(classId, inviteeUser!.id)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  let inviteId: string
  if (existingInvite) {
    if (existingInvite.status === 'pending') {
      throw400('PENDING_INVITE', '已向该用户发送过邀请，请等待对方响应')
    }
    const updated = await updateDirectInvite(existingInvite.id, {
      inviterId: user.id,
      status: 'pending',
      message: body.message || null,
      expiresAt,
      respondedAt: null,
      createdAt: new Date(),
    })
    inviteId = updated.id
  } else {
    const created = await prisma.classDirectInvite.create({
      data: {
        classId,
        inviterId: user.id,
        inviteeId: inviteeUser!.id,
        status: 'pending',
        message: body.message || null,
        expiresAt,
        respondedAt: null,
      },
    })
    inviteId = created.id
  }

  const inviterUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true, nickname: true },
  })

  await sendClassDirectInviteNotification(
    inviteeUser!.id,
    inviterUser,
    classData!.name,
    inviteId
  )

  return ok({ inviteId }, { status: 201 })
})

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const currentMember = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: user.id } },
  })
  if (!currentMember) throw403('您不是班级成员')
  if (currentMember!.role !== 'owner' && currentMember!.role !== 'admin') {
    throw403('只有管理员可以查看邀请列表')
  }

  const invites = await listClassDirectInvitesDetailed(classId)
  const items = invites.map((invite) => ({
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
