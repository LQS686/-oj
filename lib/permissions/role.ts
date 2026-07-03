/**
 * lib/permissions/role.ts
 * 系统级角色判定
 */

import type { PermissionUser } from './types'

/**
 * 是否为系统管理员（SYSTEM_ADMIN）
 */
export function isSystemAdmin(user: PermissionUser | null | undefined): boolean {
  if (!user) return false
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
