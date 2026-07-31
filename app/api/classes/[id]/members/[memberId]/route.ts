/**
 * 班级成员管理
 * - PATCH  /api/classes/[id]/members/[memberId]  更新成员（备注/角色）或转让班主任
 * - DELETE /api/classes/[id]/members/[memberId]  移除成员
 */
import {
  withApi,
  ok,
  readJson,
  throw400,
} from '@/lib/api/withApi'
import { ApiError } from '@/lib/api/errors'
import { isObjectId } from '@/lib/api/validation'
import {
  patchClassMember,
  requireClassAdminRole,
  requireManageableTarget,
} from '@/lib/class/service'
import {
  removeClassMember as removeClassMemberDirect,
  updateClassMemberRole,
  transferClassOwnership,
} from '@/lib/class/member'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id, memberId } = ctx.params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<{
    remark?: string
    role?: 'student' | 'assistant' | 'owner'
    transferOwnership?: boolean
  }>(req)

  // 班主任转让：仅当前 owner 可将目标成员升为 owner，并同步 Class.ownerId
  if (body.transferOwnership === true || body.role === 'owner') {
    await transferClassOwnership(id, user.id, memberId)
    const { normalizeClassRoleToApi } = await import('@/lib/class/roles')
    return ok({
      id: memberId,
      role: normalizeClassRoleToApi('owner'),
      message: '班主任已转让',
    })
  }

  const operator = await requireClassAdminRole(id, user.id)
  await requireManageableTarget(id, memberId, operator.role)

  let updated
  if (body.role === 'student' || body.role === 'assistant') {
    updated = await updateClassMemberRole(id, memberId, body.role)
    if (body.remark !== undefined) {
      updated = await patchClassMember(id, memberId, { remark: body.remark })
    }
  } else {
    const updateData: { remark?: string } = {}
    if (body.remark !== undefined) updateData.remark = body.remark
    if (Object.keys(updateData).length === 0) {
      throw400('VALIDATION', '请提供要更新的字段')
    }
    updated = await patchClassMember(id, memberId, updateData)
  }

  const { normalizeClassRoleToApi } = await import('@/lib/class/roles')
  return ok({
    id: updated!.userId,
    remark: updated!.remark,
    role: normalizeClassRoleToApi(updated!.role),
  })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, memberId } = ctx.params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  // 学生自退：允许删除自己（owner 不能退，须先转让）
  if (memberId === user.id) {
    const { getClassMembership } = await import('@/lib/class/auth')
    const { isClassOwnerRole } = await import('@/lib/class/roles')
    const self = await getClassMembership(id, user.id)
    if (!self) {
      throw new ApiError('NOT_FOUND', '你不是该班级成员', 404)
    }
    if (isClassOwnerRole(self.role)) {
      throw400('OWNER_CANNOT_LEAVE', '班主任不能直接退出，请先转让班主任')
    }
    await removeClassMemberDirect(id, memberId)
    return ok({ message: '已退出班级' })
  }

  const operator = await requireClassAdminRole(id, user.id)
  await requireManageableTarget(id, memberId, operator.role)

  await removeClassMemberDirect(id, memberId)
  return ok({ message: '成员已移除' })
})
