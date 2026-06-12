/**
 * 班级邀请码管理
 * - GET  /api/classes/[id]/invites  邀请码列表
 * - POST /api/classes/[id]/invites  创建邀请码
 */
import {
  withApi,
  ok,
  readJson,
  throw400,
  throw403,
  throw404,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  listClassInvitesWithCreators,
  createClassInviteCodeUnique,
} from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw403('只有管理员可以查看邀请码')
  }

  const items = await listClassInvitesWithCreators(id)
  return ok(items)
})

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const body = await readJson<{ maxUses?: number; expiresAt?: string | Date | null }>(req)

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  const isAdmin = member && (member.role === 'owner' || member.role === 'admin')
  const permissions = (member?.permissions as any) || {}
  const canInvite = !!permissions.canInviteMembers

  if (!isAdmin && !canInvite) throw403('没有权限创建邀请码')

  const classData = await prisma.class.findUnique({ where: { id } })
  if (!classData) throw404('班级不存在')

  const maxUses = body.maxUses ?? 1
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null

  const invite = await createClassInviteCodeUnique(
    id,
    user.id,
    parseInt(String(maxUses)),
    expiresAt
  )

  return ok(
    {
      id: invite.id,
      code: invite.code,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt,
      inviteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/classes/join?code=${invite.code}`,
    },
    { status: 201 }
  )
})
