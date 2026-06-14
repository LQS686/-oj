/**
 * lib/permissions/role.ts
 * 系统级角色判定
 */

import type { PermissionUser } from './types'

/**
 * 是否为系统管理员（SYSTEM_ADMIN）
 * - role 字段为 SYSTEM_ADMIN，或
 * - isSuperAdmin 标记为 true（硬卡唯一性，保留字段）
 */
export function isSystemAdmin(user: PermissionUser | null | undefined): boolean {
  if (!user) return false
  if (user.isSuperAdmin === true) return true
  return user.role === 'SYSTEM_ADMIN'
}

/**
 * 是否为教师（TEACHER）
 */
export function isTeacher(user: PermissionUser | null | undefined): boolean {
  if (!user) return false
  return user.role === 'TEACHER'
}

/**
 * 是否为学生（STUDENT）
 */
export function isStudent(user: PermissionUser | null | undefined): boolean {
  if (!user) return false
  return user.role === 'STUDENT'
}
