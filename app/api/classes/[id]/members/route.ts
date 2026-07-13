/**
 * /api/classes/[id]/members - 班级成员列表
 */
import { withApi, ok, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { listClassMembers } from '@/lib/class/member'
import { isObjectId } from '@/lib/api/validation'
import { getUserFromRequest } from '@/lib/auth'
import { getClassById, getCurrentClassMember } from '@/lib/class/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const q = readQuery<{ sortBy?: string; sortOrder?: string; role?: string; active?: string; search?: string }>(req)
  const auth = getUserFromRequest(req)
  const authUserId = auth?.userId

  const classData = await getClassById(id)
  if (!classData) throw404('班级不存在')
  const classIsPublic = classData!.isPublic

  // 私有班级需要登录 + 成员
  if (!classIsPublic) {
    if (!auth || !authUserId) throw404('私有班级，只有受邀成员可访问')
    const member = await getCurrentClassMember(id, authUserId!)
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
