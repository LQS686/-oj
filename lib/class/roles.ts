/**
 * 班级成员角色：数据库与 API 统一使用 owner | assistant | student
 *
 * 历史数据可能仍为 admin / member，由 normalizeClassRoleToApi 映射到新值。
 */

export type ClassRole = 'owner' | 'assistant' | 'student'

export function normalizeClassRoleToApi(role: string | null | undefined): ClassRole {
  if (!role) return 'student'
  if (role === 'owner') return 'owner'
  if (role === 'assistant' || role === 'admin') return 'assistant'
  if (role === 'student' || role === 'member') return 'student'
  return 'student'
}

export function isClassAdminApiRole(role: string | null | undefined): boolean {
  const r = normalizeClassRoleToApi(role)
  return r === 'owner' || r === 'assistant'
}

export function isClassStudentApiRole(role: string | null | undefined): boolean {
  return normalizeClassRoleToApi(role) === 'student'
}

/** 查询用：含历史 DB 值，避免漏掉旧数据 */
export function dbRolesMatchingApiFilter(apiRole: string): string[] {
  if (apiRole === 'owner') return ['owner']
  if (apiRole === 'assistant') return ['assistant', 'admin']
  if (apiRole === 'student') return ['student', 'member']
  return [apiRole]
}

export function classRoleDisplayLabel(role: string | null | undefined): string {
  const r = normalizeClassRoleToApi(role)
  if (r === 'owner') return '班主任'
  if (r === 'assistant') return '助教'
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
