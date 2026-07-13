/**
 * 班级成员角色：数据库与 API 统一使用 owner | assistant | student
 */

export type ClassRole = 'owner' | 'assistant' | 'student'

export function normalizeClassRoleToApi(role: string | null | undefined): ClassRole {
  if (!role) return 'student'
  if (role === 'owner') return 'owner'
  if (role === 'assistant') return 'assistant'
  if (role === 'student') return 'student'
  return 'student'
}

export function isClassAdminApiRole(role: string | null | undefined): boolean {
  const r = normalizeClassRoleToApi(role)
  return r === 'owner' || r === 'assistant'
}

export function isClassStudentApiRole(role: string | null | undefined): boolean {
  return normalizeClassRoleToApi(role) === 'student'
}

export function dbRolesMatchingApiFilter(apiRole: string): string[] {
  if (apiRole === 'owner') return ['owner']
  if (apiRole === 'assistant') return ['assistant']
  if (apiRole === 'student') return ['student']
  return [apiRole]
}

export function classRoleDisplayLabel(role: string | null | undefined): string {
  const r = normalizeClassRoleToApi(role)
  if (r === 'owner') return '管理员'
  if (r === 'assistant') return '老师'
  return '学生'
}

export function isClassAdminRole(role: string | null | undefined): boolean {
  const r = normalizeClassRoleToApi(role)
  return r === 'owner' || r === 'assistant'
}

export function isClassOwnerRole(role: string | null | undefined): boolean {
  const r = normalizeClassRoleToApi(role)
  return r === 'owner'
}
