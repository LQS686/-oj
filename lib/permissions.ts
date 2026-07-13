/**
 * lib/permissions.ts
 * 系统角色判定函数（唯一真相源，详见 docs/ROLE_SYSTEM.md）
 *
 * 角色体系：SYSTEM_ADMIN / ADMIN / TEACHER / STUDENT
 * 判定逻辑必须经过本文件，禁止在业务代码中硬编码 role 字符串比较。
 */

/** 系统支持的 4 个固定角色 */
export type RoleCode = 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT'

/** 角色判定的最小入参类型（仅需 role 字段） */
export interface RoleUser {
  id?: string
  role?: string | null
}

/** 是否为系统管理员（SYSTEM_ADMIN） */
export function isSystemAdmin(user: RoleUser | null): boolean {
  if (!user) return false
  return user.role === 'SYSTEM_ADMIN'
}

/** 是否为管理员（ADMIN） */
export function isAdmin(user: RoleUser | null): boolean {
  if (!user) return false
  return user.role === 'ADMIN'
}

/** @internal 仅供测试使用 */
/** 是否为教师（TEACHER） */
export function isTeacher(user: RoleUser | null): boolean {
  if (!user) return false
  return user.role === 'TEACHER'
}

/** @internal 仅供测试使用 */
/** 是否为学生（STUDENT） */
export function isStudent(user: RoleUser | null): boolean {
  if (!user) return false
  return user.role === 'STUDENT'
}

/** 是否可访问后台（SYSTEM_ADMIN 和 ADMIN） */
export function canAccessAdmin(user: RoleUser | null): boolean {
  return isSystemAdmin(user) || isAdmin(user)
}

/** @internal 仅供测试使用 */
/** 是否可管理系统设置（仅 SYSTEM_ADMIN） */
export function canManageSystemSettings(user: RoleUser | null): boolean {
  return isSystemAdmin(user)
}

/** 是否可管理前台内容（SYSTEM_ADMIN / ADMIN / TEACHER） */
export function canManageContent(user: RoleUser | null): boolean {
  return isSystemAdmin(user) || isAdmin(user) || isTeacher(user)
}

/** 是否可创建竞赛（等同 canManageContent） */
export function canCreateContest(user: RoleUser | null): boolean {
  return canManageContent(user)
}

/** 是否可创建班级（等同 canManageContent） */
export function canCreateClass(user: RoleUser | null): boolean {
  return canManageContent(user)
}

/** 角色中文标签 */
export function getRoleLabel(role?: string): string {
  if (role === 'SYSTEM_ADMIN') return '系统管理员'
  if (role === 'ADMIN') return '管理员'
  if (role === 'TEACHER') return '教师'
  if (role === 'STUDENT') return '学生'
  return '用户'
}

/** @internal 仅供测试使用 */
/** 角色 Tag 颜色类名 */
export function getRoleColor(role?: string): string {
  if (role === 'SYSTEM_ADMIN') return 'tag-error'
  if (role === 'ADMIN') return 'tag-error'
  if (role === 'TEACHER') return 'tag-warning'
  return 'tag-info'
}
