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
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  mergeClassMemberPermissions,
  requireClassAdminRole,
  requireManageableTarget,
} from '@/lib/class/service'
import { isClassOwnerRole } from '@/lib/class/roles'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id, memberId } = ctx.params
  if (!isObjectId(id) || !isObjectId(memberId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<Record<string, any>>(req)
  if (!body || Object.keys(body).length === 0) {
    throw400('EMPTY_BODY', '权限位不能为空')
  }

  const operator = await requireClassAdminRole(id, user.id)
  const target = await requireManageableTarget(id, memberId, operator.role)

  // 额外的业务规则：助教不能修改班级创建人（owner）
  if (!isClassOwnerRole(operator.role) && isClassOwnerRole(target.role)) {
    throw403('助教无法修改班级创建人')
  }

  const updated = await mergeClassMemberPermissions(id, memberId, body)
  return ok({ permissions: updated?.permissions ?? body })
})
