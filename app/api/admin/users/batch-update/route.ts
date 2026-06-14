/**
 * /api/admin/users/batch-update - 批量更新用户角色（管理员）
 *
 * POST { userIds: string[], role: 'ADMIN' | 'TEACHER' | 'USER' }
 * - 跳过自己
 * - 跳过超级管理员
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isSystemAdmin } from '@/lib/permissions'
import {
  assertValidRole,
  batchUpdateUserRole,
  filterUserIdsForBatchAction,
} from '@/lib/user/service'

export const POST = withApi.auth(withPermission('admin.access')(async (req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }

  const body = await readJson<{ userIds?: string[]; role?: string }>(req)
  const userIds = body.userIds ?? []
  const { role } = body

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw400('INVALID_USER_IDS', 'userIds 必须是非空数组')
  }
  assertValidRole(role)

  const { finalUserIds, skippedCount } = await filterUserIdsForBatchAction(
    userIds,
    user.id,
    'update'
  )

  const result = await batchUpdateUserRole(finalUserIds, role as 'ADMIN' | 'TEACHER' | 'USER')

  return ok({
    updatedCount: result.count,
    requestedCount: userIds.length,
    skippedCount,
  })
}))
