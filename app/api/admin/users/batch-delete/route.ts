/**
 * /api/admin/users/batch-delete - 批量删除用户（管理员）
 *
 * POST { userIds: string[] }
 * - 跳过自己
 * - 跳过超级管理员
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{ userIds?: string[] }>(req)
  const { userIds } = body

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw400('INVALID_USER_IDS', 'userIds 必须是非空数组')
  }

  const filteredUserIds = userIds!.filter((id) => id !== user.id)

  if (filteredUserIds.length === 0) {
    throw400('CANNOT_DELETE_SELF', '不能删除自己的账号')
  }

  const superAdmins = await prisma.user.findMany({
    where: {
      id: { in: filteredUserIds },
      isSuperAdmin: true,
    },
    select: { id: true },
  })

  const superAdminIds = new Set(superAdmins.map((u) => u.id))
  const finalUserIds = filteredUserIds.filter((id) => !superAdminIds.has(id))

  if (finalUserIds.length === 0) {
    throw403('选中的用户包含超级管理员，不可被删除')
  }

  const result = await prisma.user.deleteMany({
    where: {
      id: { in: finalUserIds },
    },
  })

  return ok({
    deletedCount: result.count,
    requestedCount: userIds!.length,
    skippedCount: userIds!.length - finalUserIds.length,
  })
})
