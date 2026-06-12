/**
 * /api/classes/[id] - 班级详情/更新/解散
 *
 * GET    获取班级详情（成员列表 + 统计）
 * PATCH  更新班级信息（教师/助教）
 * DELETE 解散班级（仅创建人）
 */
import { withApi, ok, readJson, throw400, throw403, throw404, readQuery } from '@/lib/api/withApi'
import { getClassDetail, updateClass, deleteClass } from '@/lib/class/service'
import { isObjectId } from '@/lib/api/validation'
import { getUserFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/classes/[id]
 * 公开班级任何人都可访问；私有班级需要是成员
 */
export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const q = readQuery<{ sortBy?: string; sortOrder?: string; role?: string; active?: string; search?: string }>(req)
  const auth = getUserFromRequest(req)

  const detail = await getClassDetail(id)
  if (!detail) throw404('班级不存在')

  // 私有班级必须登录且为成员
  if (!detail!.isPublic) {
    if (!auth) throw404('私有班级，只有受邀成员可访问')
    const member = await prisma.classMember.findUnique({
      where: { classId_userId: { classId: id, userId: auth!.userId } },
    })
    if (!member) throw404('私有班级，只有受邀成员可访问')
  }

  // 角色 + 活跃度 + 搜索 + 排序
  let members = detail!.members
  if (q.role) members = members.filter((m) => m.role === q.role)
  if (q.active) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    members = q.active === 'true'
      ? members.filter((m) => m.lastActiveAt && new Date(m.lastActiveAt) >= cutoff)
      : members.filter((m) => !m.lastActiveAt || new Date(m.lastActiveAt) < cutoff)
  }
  if (q.search) {
    const s = q.search.toLowerCase()
    members = members.filter(
      (m) => m.username?.toLowerCase().includes(s) || m.nickname?.toLowerCase().includes(s)
    )
  }
  const sortOrder = q.sortOrder === 'asc' ? 1 : -1
  members.sort((a, b) => {
    let av: any, bv: any
    switch (q.sortBy) {
      case 'role': {
        const order: any = { owner: 3, admin: 2, member: 1 }
        av = order[a.role] || 0
        bv = order[b.role] || 0
        break
      }
      case 'lastActiveAt':
        av = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
        bv = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
        break
      case 'username':
        av = a.username || ''
        bv = b.username || ''
        break
      case 'joinedAt':
      default:
        av = new Date(a.joinedAt).getTime()
        bv = new Date(b.joinedAt).getTime()
        break
    }
    return av > bv ? sortOrder : av < bv ? -sortOrder : 0
  })

  return ok({ ...detail, members })
})

/**
 * PATCH /api/classes/[id]
 * 教师/助教可更新班级信息
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    name?: string
    description?: string | null
    avatar?: string | null
    isPublic?: boolean
    maxMembers?: number
  }>(req)

  await updateClass(id, body)
  return ok({ message: '班级信息更新成功' })
})

/**
 * DELETE /api/classes/[id]
 * 仅班级创建人可解散
 */
export const DELETE = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const classData = await prisma.class.findUnique({ where: { id } })
  if (!classData) throw404('班级不存在')
  if (classData!.ownerId !== user.id) throw403('只有班级创建人可以解散班级')

  await deleteClass(id)
  return ok({ message: '班级已解散' })
})
