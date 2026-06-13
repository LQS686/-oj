/**
 * /api/admin/users/batch-delete - 批量删除用户（管理员）
 *
 * POST { userIds: string[] }
 * - 跳过自己
 * - 跳过超级管理员
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import {
  batchDeleteUsers,
  filterUserIdsForBatchAction,
} from '@/lib/user/service'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{ userIds?: string[] }>(req)
  const userIds = body.userIds ?? []

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw400('INVALID_USER_IDS', 'userIds 必须是非空数组')
  }

  const { finalUserIds, skippedCount } = await filterUserIdsForBatchAction(
    userIds,
    user.id,
    'delete'
  )

  const result = await batchDeleteUsers(finalUserIds)

  return ok({
    deletedCount: result.count,
    requestedCount: userIds.length,
    skippedCount,
  })
})
