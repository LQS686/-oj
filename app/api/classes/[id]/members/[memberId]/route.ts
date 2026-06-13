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
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  patchClassMember,
  requireClassAdminRole,
  requireManageableTarget,
} from '@/lib/class/service'
import { removeClassMember as removeClassMemberDirect } from '@/lib/class/member'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id, memberId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<{ remark?: string; role?: 'student' | 'assistant' | 'owner' }>(req)
  const operator = await requireClassAdminRole(id, user.id)
  await requireManageableTarget(id, memberId, operator.role)

  const updateData: { remark?: string; role?: 'student' | 'assistant' | 'owner' } = {}
  if (body.remark !== undefined) updateData.remark = body.remark
  if (body.role !== undefined) updateData.role = body.role

  const updated = await patchClassMember(id, memberId, updateData)
  return ok({ id: updated!.userId, remark: updated!.remark, role: updated!.role })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, memberId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const operator = await requireClassAdminRole(id, user.id)
  await requireManageableTarget(id, memberId, operator.role)

  await removeClassMemberDirect(id, memberId)
  return ok({ message: '成员已移除' })
})
