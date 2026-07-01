/**
 * 班级成员角色：数据库存 owner | admin | member
 * 对外 API / 前端统一：owner | assistant | student
 */

export type ClassRoleApi = 'owner' | 'assistant' | 'student'
export type ClassRoleDb = 'owner' | 'admin' | 'member'

/** 任意存储值 → 前端/API 标准角色 */
export function normalizeClassRoleToApi(role: string | null | undefined): ClassRoleApi {
  if (!role) return 'student'
  if (role === 'owner') return 'owner'
  if (role === 'admin' || role === 'assistant' || role === 'teacher') return 'assistant'
  if (role === 'member' || role === 'student') return 'student'
  return 'student'
}

/** 前端/API 角色 → 写入数据库 */
export function apiRoleToDb(role: ClassRoleApi): ClassRoleDb {
  if (role === 'owner') return 'owner'
  if (role === 'assistant') return 'admin'
  return 'member'
}

export function isClassAdminApiRole(role: string | null | undefined): boolean {
  const r = normalizeClassRoleToApi(role)
  return r === 'owner' || r === 'assistant'
}

export function isClassStudentApiRole(role: string | null | undefined): boolean {
  return normalizeClassRoleToApi(role) === 'student'
}

/** API 角色筛选 → 数据库可能出现的存储值 */
export function dbRolesMatchingApiFilter(apiRole: string): string[] {
  if (apiRole === 'owner') return ['owner']
  if (apiRole === 'assistant') return ['admin', 'assistant', 'teacher']
  if (apiRole === 'student') return ['member', 'student']
  return [apiRole]
}

export function classRoleDisplayLabel(role: string | null | undefined): string {
  const r = normalizeClassRoleToApi(role)
  if (r === 'owner') return '管理员'
  if (r === 'assistant') return '老师'
  return '学生'
}