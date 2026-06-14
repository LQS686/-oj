/**
 * /api/admin/roles - 系统角色 + 角色默认权限（管理员）
 *
 * GET  列出 3 个系统角色（SYSTEM_ADMIN/TEACHER/STUDENT）及每个角色的 RolePermission
 * PUT  全量替换指定角色的 RolePermission
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { prisma } from '@/lib/prisma'
import { clearUserPermissionCache } from '@/lib/permissions'
import type { RoleCode } from '@/lib/permissions/types'

const VALID_ROLES: RoleCode[] = ['SYSTEM_ADMIN', 'TEACHER', 'STUDENT']
const SYSTEM_ROLE_LABELS: Record<RoleCode, string> = {
  SYSTEM_ADMIN: '系统管理员',
  TEACHER: '教师',
  STUDENT: '学生',
}

/**
 * GET /api/admin/roles
 * 返回 3 个系统角色 + 各自的 RolePermission（含 Permission 详情）
 */
export const GET = withApi.auth(withPermission('admin.access')(async () => {
  const rolePermissions = await prisma.rolePermission.findMany({
    include: { permission: true },
    orderBy: [{ role: 'asc' }, { permission: { module: 'asc' } }],
  })

  // 按 role 分组
  const grouped: Record<RoleCode, Array<{ id: string; permissionId: string; permission: any; createdAt: Date }>> = {
    SYSTEM_ADMIN: [],
    TEACHER: [],
    STUDENT: [],
  }
  for (const rp of rolePermissions) {
    const role = rp.role as RoleCode
    if (grouped[role]) {
      grouped[role].push(rp as any)
    }
  }

  const roles = VALID_ROLES.map(role => ({
    role,
    label: SYSTEM_ROLE_LABELS[role],
    rolePermissions: grouped[role],
  }))

  return ok({ data: roles })
}))

/**
 * PUT /api/admin/roles
 * 全量替换指定角色的 RolePermission
 * body: { role: RoleCode, permissionIds: string[] }
 */
export const PUT = withApi.auth(withPermission('admin.access')(async (req) => {
  const body = await readJson<{ role?: string; permissionIds?: string[] }>(req)

  if (!body.role || !VALID_ROLES.includes(body.role as RoleCode)) {
    throw400('INVALID_ROLE', '无效的角色，必须是 SYSTEM_ADMIN / TEACHER / STUDENT')
  }
  const role = body.role as RoleCode

  const incomingIds = Array.isArray(body.permissionIds) ? body.permissionIds : []
  if (!Array.isArray(body.permissionIds)) {
    throw400('INVALID_PERMISSION_IDS', 'permissionIds 必须是字符串数组')
  }

  // 验证所有 permissionId 都存在
  if (incomingIds.length > 0) {
    const count = await prisma.permission.count({
      where: { id: { in: incomingIds } },
    })
    if (count !== incomingIds.length) {
      throw404('部分 permissionId 不存在')
    }
  }

  // SYSTEM_ADMIN 必须始终包含 system.permission.manage
  const permissionIds = [...new Set(incomingIds)]
  if (role === 'SYSTEM_ADMIN') {
    const requiredPerm = await prisma.permission.findUnique({
      where: { code: 'system.permission.manage' },
      select: { id: true },
    })
    if (requiredPerm && !permissionIds.includes(requiredPerm.id)) {
      permissionIds.push(requiredPerm.id)
    }
  }

  // 事务：先删后插
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { role } })
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map(permissionId => ({ role, permissionId })),
      })
    }
  })

  // 失效缓存：角色权限变更影响所有该角色用户
  const affectedUsers = await prisma.user.findMany({
    where: { role },
    select: { id: true },
  })
  for (const u of affectedUsers) {
    clearUserPermissionCache(u.id)
  }

  return ok({ message: '角色权限已更新', data: { role, permissionCount: permissionIds.length } })
}))
