/**
 * /api/admin/users/batch-update - 批量更新用户角色（管理员）
 *
 * POST { userIds: string[], role: 'ADMIN' | 'TEACHER' | 'STUDENT' }
 * - 跳过自己
 * - 跳过超级管理员
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import {
  assertAssignableRole,
  batchUpdateUserRole,
  filterUserIdsForBatchAction,
} from '@/lib/user/service'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await readJson<{ userIds?: string[]; role?: string }>(req)
  const userIds = body.userIds ?? []
  const { role } = body

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw400('INVALID_USER_IDS', 'userIds 必须是非空数组')
  }
  // 校验目标角色可被当前操作者分配（SYSTEM_ADMIN 不可被赋予；ADMIN 只能赋予 TEACHER/STUDENT）
  assertAssignableRole(role, user.role)

  const { finalUserIds, skippedCount } = await filterUserIdsForBatchAction(
    userIds,
    user.id,
    user.role,
    'update'
  )

  const result = await batchUpdateUserRole(finalUserIds, role as 'ADMIN' | 'TEACHER' | 'STUDENT')

  return ok({
    updatedCount: result.count,
    requestedCount: userIds.length,
    skippedCount,
  })
})
