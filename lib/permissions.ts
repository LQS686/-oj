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
  return user.role === 'ADMIN' || user.isAdmin === true
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
  return isAdmin(user) || isTeacher(user)
}

export function getRoleLabel(role?: string, isAdminFlag?: boolean): string {
  if (isAdminFlag === true) return '管理员'
  if (role === 'ADMIN') return '管理员'
  if (role === 'TEACHER') return '教师'
  return '用户'
}

export function getRoleColor(role?: string, isAdminFlag?: boolean): string {
  if (isAdminFlag === true || role === 'ADMIN') return 'tag-error'
  if (role === 'TEACHER') return 'tag-warning'
  return 'tag-info'
}
