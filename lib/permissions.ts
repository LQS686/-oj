/**
 * lib/permissions.ts
 * 系统角色判定函数（唯一真相源，详见 docs/ROLE_SYSTEM.md）
 *
 * 角色体系：SYSTEM_ADMIN / TEACHER / STUDENT
 * 判定逻辑必须经过本文件，禁止在业务代码中硬编码 role 字符串比较。
 */

export interface User {
  id: string
  username: string
  email: string
  role?: string
  [key: string]: any
}

/** 是否为系统管理员（SYSTEM_ADMIN） */
export function isAdmin(user: User | null): boolean {
  if (!user) return false
  return user.role === 'SYSTEM_ADMIN'
}

/** 是否为教师（TEACHER） */
export function isTeacher(user: User | null): boolean {
  if (!user) return false
  return user.role === 'TEACHER'
}

/** 是否可创建竞赛 */
export function canCreateContest(user: User | null): boolean {
  return isAdmin(user) || isTeacher(user)
}

/** 是否可创建班级 */
export function canCreateClass(user: User | null): boolean {
  return isAdmin(user) || isTeacher(user)
}

/** 是否可访问后台 */
export function canAccessAdmin(user: User | null): boolean {
  return isAdmin(user)
}

/** 角色中文标签 */
export function getRoleLabel(role?: string): string {
  if (role === 'SYSTEM_ADMIN') return '系统管理员'
  if (role === 'TEACHER') return '教师'
  if (role === 'STUDENT') return '学生'
  return '用户'
}

/** 角色 Tag 颜色类名 */
export function getRoleColor(role?: string): string {
  if (role === 'SYSTEM_ADMIN') return 'tag-error'
  if (role === 'TEACHER') return 'tag-warning'
  return 'tag-info'
}

// ============== 细粒度权限 API（来自 lib/permissions/ 目录） ==============

export type { RoleCode, PermissionCode, PermissionUser } from './permissions/types'
export { isSystemAdmin, isStudent } from './permissions/role'
export { hasPermission, clearUserPermissionCache } from './permissions/permissions'
export { requirePermission, PermissionDeniedError } from './permissions/guard'
