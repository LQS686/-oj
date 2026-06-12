/**
 * 班级成员管理
 * - PATCH  /api/classes/[id]/members/[memberId]  更新成员（备注/角色）
 * - DELETE /api/classes/[id]/members/[memberId]  移除成员
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
import { canManageMember, patchClassMember, isClassAdminRole } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'
import { removeClassMember as removeClassMemberDirect } from '@/lib/class/member'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id, memberId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<{ remark?: string; role?: 'student' | 'assistant' | 'owner' }>(req)
  const operator = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!operator || !isClassAdminRole(operator.role)) throw403('您没有权限管理成员')

  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: memberId } },
  })
  if (!target) throw404('成员不存在')

  if (!canManageMember(operator!.role, target!.role)) {
    throw403('没有权限管理该成员')
  }

  const updateData: { remark?: string; role?: 'student' | 'assistant' | 'owner' } = {}
  if (body.remark !== undefined) updateData.remark = body.remark
  if (body.role !== undefined) updateData.role = body.role

  const updated = await patchClassMember(id, memberId, updateData)
  return ok({ id: updated!.userId, remark: updated!.remark, role: updated!.role })
})

export const DELETE = withApi.auth(async (req, ctx, { user }) => {
  const { id, memberId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const operator = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!operator || !isClassAdminRole(operator.role)) throw403('您没有权限管理成员')

  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: memberId } },
  })
  if (!target) throw404('成员不存在')

  if (!canManageMember(operator!.role, target!.role)) {
    throw403('没有权限移除该成员')
  }

  await removeClassMemberDirect(id, memberId)
  return ok({ message: '成员已移除' })
})
