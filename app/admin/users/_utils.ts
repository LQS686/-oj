/**
 * 用户管理页面的类型、常量与纯函数。
 *
 * 角色展示映射与 lib/permissions.ts 的旧 API 保持独立，避免污染权限系统实现。
 * 四级角色体系：SYSTEM_ADMIN / ADMIN / TEACHER / STUDENT
 */

export interface User {
  id: string
  username: string
  email: string
  role: string
  createdAt: string
  _count?: {
    submissions: number
    problems: number
  }
}

export interface BatchUser {
  username: string
  email?: string
  password: string
  role: string
}

export interface BatchResult {
  success: boolean
  message: string
  user?: {
    username: string
    email: string
  }
}

/** 角色展示映射（标签 + 颜色） */
const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
  SYSTEM_ADMIN: { label: '系统管理员', color: 'tag-error' },
  ADMIN: { label: '管理员', color: 'tag-error' },
  TEACHER: { label: '教师', color: 'tag-warning' },
  STUDENT: { label: '学生', color: 'tag-info' },
}

export function getRoleDisplay(role?: string) {
  if (role === 'SYSTEM_ADMIN') return ROLE_DISPLAY.SYSTEM_ADMIN
  if (role === 'ADMIN') return ROLE_DISPLAY.ADMIN
  if (role === 'TEACHER') return ROLE_DISPLAY.TEACHER
  if (role === 'STUDENT') return ROLE_DISPLAY.STUDENT
  return ROLE_DISPLAY.STUDENT
}

/** 角色展示顺序（用于统计卡的角色分布横向条形） */
export const ROLE_ORDER: string[] = ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']

export const ROLE_BAR_COLOR: Record<string, string> = {
  SYSTEM_ADMIN: 'bg-error',
  ADMIN: 'bg-error',
  TEACHER: 'bg-warning',
  STUDENT: 'bg-info',
}

/**
 * 计算最近 7 天内新增的用户数（本周增长）。
 * 复用现有 users 数据，不引入新数据源。
 */
export function getWeeklyGrowth(users: User[]): number {
  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  return users.filter(u => {
    const created = new Date(u.createdAt).getTime()
    return !isNaN(created) && now - created <= sevenDaysMs
  }).length
}

/**
 * 判断目标用户是否被锁定（不可编辑/删除）。
 * - SYSTEM_ADMIN 永远锁定
 * - 非系统管理员操作者不能管理其他 ADMIN
 */
export function isUserLocked(user: User, operatorIsSystemAdmin: boolean): boolean {
  return user.role === 'SYSTEM_ADMIN' || (!operatorIsSystemAdmin && user.role === 'ADMIN')
}

/** 锁定原因（用于按钮 title 提示） */
export function getLockReason(user: User, operatorIsSystemAdmin: boolean): string {
  if (user.role === 'SYSTEM_ADMIN') return '系统管理员不可修改'
  if (!operatorIsSystemAdmin && user.role === 'ADMIN') return '管理员不能管理其他管理员'
  return ''
}
