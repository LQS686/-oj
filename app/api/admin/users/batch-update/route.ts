/**
 * /api/admin/users/batch-update - 批量更新用户角色（管理员）
 *
 * POST { userIds: string[], role: 'ADMIN' | 'TEACHER' | 'USER' }
 * - 跳过自己
 * - 跳过超级管理员
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

const VALID_ROLES = ['ADMIN', 'TEACHER', 'USER']

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{ userIds?: string[]; role?: string }>(req)
  const { userIds, role } = body

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw400('INVALID_USER_IDS', 'userIds 必须是非空数组')
  }

  if (!role || !VALID_ROLES.includes(role)) {
    throw400('INVALID_ROLE', '无效的角色类型')
  }

  const filteredUserIds = userIds!.filter((id) => id !== user.id)

  if (filteredUserIds.length === 0) {
    throw400('CANNOT_MODIFY_SELF', '不能修改自己的角色')
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
    throw403('选中的用户包含超级管理员，不可被修改')
  }

  const result = await prisma.user.updateMany({
    where: {
      id: { in: finalUserIds },
    },
    data: {
      role: role,
      isAdmin: role === 'ADMIN',
    },
  })

  return ok({
    updatedCount: result.count,
    requestedCount: userIds!.length,
    skippedCount: userIds!.length - finalUserIds.length,
  })
})
