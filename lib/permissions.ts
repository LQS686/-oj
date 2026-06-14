/**
 * lib/permissions.ts
 * 旧版粗粒度权限函数（保留兼容，内部已迁移到 lib/permissions/ 目录）
 * 新代码请直接 import 自 '@/lib/permissions'（本文件 re-export 自 ./permissions/）
 */

// ============== 旧 API（保留兼容） ==============

export interface User {
  id: string
  username: string
  email: string
  role?: string
  isAdmin?: boolean
  [key: string]: any
}

export function isAdmin(user: User | null): boolean {
  if (!user) return false
  if (user.isSuperAdmin === true) return true
  if (user.role === 'SYSTEM_ADMIN') return true
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.isAdmin === true
}

export function isTeacher(user: User | null): boolean {
  if (!user) return false
  return user.role === 'TEACHER'
}

export function canCreateContest(user: User | null): boolean {
  return isAdmin(user) || isTeacher(user)
}

export function canCreateClass(user: User | null): boolean {
  return isAdmin(user) || isTeacher(user)
}

export function canAccessAdmin(user: User | null): boolean {
  if (!user) return false
  if (user.isSuperAdmin === true) return true
  if (user.role === 'SYSTEM_ADMIN') return true
  // 旧字段兜底（与原行为一致）
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.isAdmin === true
}

export function getRoleLabel(role?: string, isAdminFlag?: boolean): string {
  if (role === 'SYSTEM_ADMIN') return '系统管理员'
  if (isAdminFlag === true) return '管理员'
  if (role === 'ADMIN') return '管理员'
  if (role === 'TEACHER') return '教师'
  return '用户'
}

export function getRoleColor(role?: string, isAdminFlag?: boolean): string {
  if (role === 'SYSTEM_ADMIN') return 'tag-error'
  if (isAdminFlag === true || role === 'ADMIN') return 'tag-error'
  if (role === 'TEACHER') return 'tag-warning'
  return 'tag-info'
}

// ============== 新 API（来自 lib/permissions/ 目录） ==============
// 新代码统一从 '@/lib/permissions' 导入即可。
// 使用具名 re-export 以避免与旧 API 的 isTeacher / 类型冲突

export type { RoleCode, PermissionCode, PermissionUser } from './permissions/types'
export { isSystemAdmin, isStudent } from './permissions/role'
export { hasPermission, clearUserPermissionCache } from './permissions/permissions'
export { requirePermission, PermissionDeniedError } from './permissions/guard'
