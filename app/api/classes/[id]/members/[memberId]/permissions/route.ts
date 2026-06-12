/**
 * 班级成员权限位更新
 * PATCH /api/classes/[id]/members/[memberId]/permissions
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
import { mergeClassMemberPermissions, isClassAdminRole } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id, memberId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<Record<string, any>>(req)
  if (!body || Object.keys(body).length === 0) {
    throw400('EMPTY_BODY', '权限位不能为空')
  }

  const operator = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!operator || !isClassAdminRole(operator.role)) throw403('您没有权限管理成员')

  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: memberId } },
  })
  if (!target) throw404('成员不存在')

  if (operator!.role === 'admin' && target!.role === 'owner') {
    throw403('管理员无法修改班级创建人')
  }

  const updated = await mergeClassMemberPermissions(id, memberId, body)
  return ok({ permissions: updated?.permissions ?? body })
})
