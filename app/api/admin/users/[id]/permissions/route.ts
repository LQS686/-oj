/**
 * /api/admin/users/[id]/permissions - 单用户的用户级权限覆盖（管理员）
 *
 * GET  返回用户信息 + 角色默认权限 + 用户级覆盖
 * PUT  全量替换该用户的 UserPermission
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { clearUserPermissionCache } from '@/lib/permissions'
import type { RoleCode } from '@/lib/permissions/types'

/**
 * GET /api/admin/users/[id]/permissions
 */
export const GET = withApi.auth(withPermission('admin.access')(async (_req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      isSuperAdmin: true,
    },
  })
  if (!user) {
    throw404('用户不存在')
    return
  }

  const userRole = user.role as RoleCode

  // 角色默认权限（带 Permission 详情）
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role: userRole },
    include: { permission: true },
    orderBy: { permission: { code: 'asc' } },
  })
  const rolePermList = rolePermissions.map((rp: any) => rp.permission)

  // 用户级覆盖
  const userPermissions = await prisma.userPermission.findMany({
    where: { userId: id },
    orderBy: { permissionCode: 'asc' },
  })

  return ok({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    },
    rolePermissions: rolePermList,
    userPermissions,
  })
}))

/**
 * PUT /api/admin/users/[id]/permissions
 * body: { permissions: Array<{ permissionCode: string, value: boolean }> }
 */
export const PUT = withApi.auth(withPermission('admin.access')(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  const exists = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!exists) {
    throw404('用户不存在')
    return
  }

  const body = await readJson<{
    permissions?: Array<{ permissionCode?: string; value?: boolean }>
  }>(req)

  const incoming = Array.isArray(body.permissions) ? body.permissions : []
  if (!Array.isArray(body.permissions)) {
    throw400('INVALID_PERMISSIONS', 'permissions 必须是数组')
  }

  // 清洗：去重 + 过滤非法项
  const seen = new Set<string>()
  const cleaned: Array<{ permissionCode: string; value: boolean }> = []
  for (const p of incoming) {
    if (!p || typeof p.permissionCode !== 'string' || !p.permissionCode) continue
    if (typeof p.value !== 'boolean') continue
    if (seen.has(p.permissionCode)) continue
    seen.add(p.permissionCode)
    cleaned.push({ permissionCode: p.permissionCode, value: p.value })
  }

  // 全量替换
  await prisma.$transaction(async (tx: any) => {
    await tx.userPermission.deleteMany({ where: { userId: id } })
    if (cleaned.length > 0) {
      await tx.userPermission.createMany({
        data: cleaned.map(p => ({
          userId: id,
          permissionCode: p.permissionCode,
          value: p.value,
        })),
      })
    }
  })

  // 失效该用户权限缓存
  clearUserPermissionCache(id)

  return ok({ message: '用户权限已更新', data: { count: cleaned.length } })
}))
