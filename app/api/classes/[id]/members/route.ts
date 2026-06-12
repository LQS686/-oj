/**
 * /api/classes/[id]/members - 班级成员列表
 */
import { withApi, ok, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { listClassMembers } from '@/lib/class/member'
import { isObjectId } from '@/lib/api/validation'
import { getUserFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const q = readQuery<{ sortBy?: string; sortOrder?: string; role?: string; active?: string; search?: string }>(req)
  const auth = getUserFromRequest(req)

  const classData = await prisma.class.findUnique({ where: { id } })
  if (!classData) throw404('班级不存在')

  // 私有班级需要登录 + 成员
  if (!classData!.isPublic) {
    if (!auth) throw404('私有班级，只有受邀成员可访问')
    const member = await prisma.classMember.findUnique({
      where: { classId_userId: { classId: id, userId: auth!.userId } },
    })
    if (!member) throw404('私有班级，只有受邀成员可访问')
  }

  const members = await listClassMembers(id, {
    role: q.role,
    search: q.search,
    active: q.active as 'true' | 'false' | undefined,
    sortBy: q.sortBy as any,
    sortOrder: q.sortOrder as 'asc' | 'desc' | undefined,
  })

  return ok({ members })
})
