/**
 * lib/user/admin.ts
 * 管理员用户管理：角色分配、用户 CRUD、批量操作
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isSystemAdmin, isAdmin } from '@/lib/permissions'
import { AppError } from '@/lib/errors'
import { clearUserCache } from './profile'
import { sanitizeAvatarUrl } from './avatar-url'

/* ============================================================================
 * 管理员用户管理（原 /api/admin/users/* 路由）
 * ========================================================================== */

const VALID_ADMIN_ROLES = ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']

/**
 * 可被分配的角色（不含 SYSTEM_ADMIN —— 系统管理员唯一且不可被赋予）
 */
const ASSIGNABLE_ROLES = ['ADMIN', 'TEACHER', 'STUDENT']

/**
 * 根据操作者角色返回其可分配的目标角色列表
 * - SYSTEM_ADMIN 可赋予 ADMIN / TEACHER / STUDENT
 * - ADMIN 只能赋予 TEACHER / STUDENT（不能管理其他管理员）
 */
export function getAssignableRoles(operatorRole: string | undefined | null): string[] {
  if (isSystemAdmin({ role: operatorRole })) return ASSIGNABLE_ROLES
  if (isAdmin({ role: operatorRole })) return ['TEACHER', 'STUDENT']
  return []
}

/**
 * 校验目标角色是否可被当前操作者分配
 */
export function assertAssignableRole(
  role: string | undefined,
  operatorRole: string | undefined | null
): asserts role is 'ADMIN' | 'TEACHER' | 'STUDENT' {
  const assignable = getAssignableRoles(operatorRole)
  if (!role || !assignable.includes(role)) {
    throw AppError.badRequest('INVALID_ROLE', '无效的角色类型或无权分配该角色')
  }
}

/**
 * 列出所有用户（管理员）
 */
export async function listAllUsersForAdmin(opts?: {
  page?: number
  pageSize?: number
  search?: string
  role?: string
}) {
  const page = opts?.page
  const rawPageSize = opts?.pageSize
  const pageSize =
    typeof rawPageSize === 'number' && rawPageSize > 0 ? Math.min(rawPageSize, 100) : undefined
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  const take = usePaging ? (pageSize as number) : 100
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0

  // 服务端过滤：搜索（用户名/邮箱/昵称，模糊）+ 角色（精确）
  const where: Prisma.UserWhereInput = {}
  const search = opts?.search?.trim()
  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { nickname: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (opts?.role && opts.role !== 'all') {
    where.role = opts.role as Prisma.UserWhereInput['role']
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take,
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        avatar: true,
        rank: true,
        role: true,
        isBanned: true,
        createdAt: true,
        _count: {
          select: {
            submissions: true,
            problems: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ])
  return {
    data: data.map((u) => ({ ...u, avatar: sanitizeAvatarUrl(u.avatar) })),
    pagination: {
      page: usePaging ? (page as number) : 1,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  }
}

/**
 * 校验入参中的角色字段
 */
export function assertValidRole(role: string | undefined): asserts role is 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT' {
  if (!role || !VALID_ADMIN_ROLES.includes(role)) {
    throw AppError.badRequest('INVALID_ROLE', '无效的角色类型')
  }
}

/**
 * 校验管理员更新用户的合法性
 * - 自己不能改
 * - 超级管理员不能改
 * - 管理员不能修改其他管理员
 */
export async function assertCanUpdateUser(
  targetUserId: string,
  operatorUserId: string,
  operatorRole: string | undefined | null,
  body: { role?: string; isBanned?: boolean }
) {
  if (targetUserId === operatorUserId) {
    if ('isBanned' in body || 'role' in body) {
      throw AppError.badRequest('CANNOT_MODIFY_SELF', '不能修改自己的权限或状态')
    }
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target) {
    throw AppError.notFound('用户不存在')
  }
  if (isSystemAdmin(target)) {
    throw AppError.forbidden('超级管理员不可被修改')
  }
  // 管理员不能管理其他管理员
  if (isAdmin({ role: operatorRole }) && isAdmin(target)) {
    throw AppError.forbidden('管理员不能管理其他管理员')
  }
  return target
}

/**
 * 校验管理员删除用户的合法性
 * - 不能删除自己
 * - 超级管理员不能删除
 * - 管理员不能删除其他管理员
 */
export async function assertCanDeleteUser(
  targetUserId: string,
  operatorUserId: string,
  operatorRole: string | undefined | null
) {
  if (targetUserId === operatorUserId) {
    throw AppError.badRequest('CANNOT_DELETE_SELF', '不能删除自己的账号')
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target) {
    throw AppError.notFound('用户不存在')
  }
  if (isSystemAdmin(target)) {
    throw AppError.forbidden('超级管理员不可被删除')
  }
  // 管理员不能管理其他管理员
  if (isAdmin({ role: operatorRole }) && isAdmin(target)) {
    throw AppError.forbidden('管理员不能管理其他管理员')
  }
}

/**
 * 管理员更新用户：role / isBanned / password
 */
export async function adminUpdateUser(
  targetUserId: string,
  body: {
    role?: 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT'
    isBanned?: boolean
    password?: string
  },
  bcryptModule: { hash(data: string, saltOrRounds: number): Promise<string> }
) {
  const updateData: Record<string, unknown> = {}
  // 修改密码或封禁时需递增 tokenVersion，使旧 Token 失效
  let shouldInvalidateTokens = false

  if ('role' in body) {
    assertValidRole(body.role)
    updateData.role = body.role
    // 角色变更必须吊销旧 token，否则 60s 缓存窗口内仍以旧角色通过 withApi.admin
    shouldInvalidateTokens = true
  }
  if ('isBanned' in body) {
    updateData.isBanned = Boolean(body.isBanned)
    // 封禁与解封均递增 tokenVersion：封禁立即失效；解封后旧 JWT 也不应继续复用
    shouldInvalidateTokens = true
  }
  if (body.password) {
    const { validatePassword } = await import('@/lib/api/validation')
    const passwordValidation = validatePassword(body.password)
    if (!passwordValidation.valid) {
      throw AppError.badRequest(
        'INVALID_PASSWORD',
        passwordValidation.errors[0] || '密码不符合要求'
      )
    }
    updateData.password = await bcryptModule.hash(body.password, 10)
    shouldInvalidateTokens = true
  }
  if (shouldInvalidateTokens) {
    updateData.tokenVersion = { increment: 1 }
  }
  const result = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isBanned: true,
    },
  })
  clearUserCache(targetUserId, { clearRanking: true })
  return result
}

/**
 * 管理员删除用户
 */
export async function adminDeleteUser(targetUserId: string) {
  const result = await prisma.user.delete({ where: { id: targetUserId } })
  clearUserCache(targetUserId, { clearRanking: true })
  return result
}

/**
 * 过滤批量操作的目标用户
 * - 跳过自己
 * - 跳过超级管理员
 * - ADMIN 操作时跳过其他管理员
 */
export async function filterUserIdsForBatchAction(
  userIds: string[],
  operatorUserId: string,
  operatorRole: string | undefined | null,
  action: 'update' | 'delete'
) {
  // 跳过自己
  const filtered = userIds.filter((id) => id !== operatorUserId)
  if (filtered.length === 0) {
    throw AppError.badRequest(
      action === 'update' ? 'CANNOT_MODIFY_SELF' : 'CANNOT_DELETE_SELF',
      action === 'update' ? '不能修改自己的角色' : '不能删除自己的账号'
    )
  }
  // 跳过超级管理员；ADMIN 操作时还要跳过其他管理员
  const protectedRoles = (isAdmin({ role: operatorRole })
    ? ['SYSTEM_ADMIN', 'ADMIN']
    : ['SYSTEM_ADMIN']) as Array<'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT'>
  const protectedUsers = await prisma.user.findMany({
    where: { id: { in: filtered }, role: { in: protectedRoles } },
    select: { id: true },
  })
  const protectedIds = new Set(protectedUsers.map((u) => u.id))
  const finalUserIds = filtered.filter((id) => !protectedIds.has(id))
  if (finalUserIds.length === 0) {
    throw AppError.forbidden('选中的用户不可被' + (action === 'update' ? '修改' : '删除'))
  }
  return { finalUserIds, skippedCount: userIds.length - finalUserIds.length }
}

/**
 * 批量更新用户角色
 *
 * 项目约束：lib 层独立校验 `assertAssignableRole(role, operatorRole)`，
 * 即使被管理员脚本/迁移工具绕过 API 路由调用，仍能保证权限合法性。
 */
export async function batchUpdateUserRole(
  finalUserIds: string[],
  role: 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT',
  operatorRole?: string | undefined | null
) {
  // lib 层防御性校验：API 层已校验，此处二次校验防止脚本/迁移绕过
  assertAssignableRole(role, operatorRole)
  const result = await prisma.user.updateMany({
    where: { id: { in: finalUserIds } },
    data: {
      role,
      // 批量提权/降权后吊销旧 JWT，避免 60s 缓存窗口内仍以旧 role 通过 withApi.admin
      tokenVersion: { increment: 1 },
    },
  })
  finalUserIds.forEach((id) => clearUserCache(id, { clearRanking: true }))
  return result
}

/**
 * 批量删除用户
 */
export async function batchDeleteUsers(finalUserIds: string[]) {
  const result = await prisma.user.deleteMany({ where: { id: { in: finalUserIds } } })
  finalUserIds.forEach((id) => clearUserCache(id, { clearRanking: true }))
  return result
}
