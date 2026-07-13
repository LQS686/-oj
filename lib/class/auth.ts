/**
 * lib/class/auth.ts
 * 班级鉴权 / 角色判断 helper
 *
 * 角色语义（统一使用 lib/class/roles.ts 的体系）：
 * - owner（班主任/班级创建人）—— 拥有一切权限
 * - assistant（助教）—— 协助管理
 * - student（学生）—— 普通成员
 *
 * DB 与 API 已统一为 owner | assistant | student。
 * normalizeClassRoleToApi 自动处理历史数据中的 admin/member 值。
 */

import { prisma } from '@/lib/prisma'
import { normalizeClassRoleToApi } from './roles'

export type ClassRole = 'owner' | 'assistant' | 'student'

export function mapClassRole(dbRole: string): ClassRole {
  return normalizeClassRoleToApi(dbRole)
}

export interface ClassMembership {
  classId: string
  userId: string
  dbRole: string
  role: ClassRole
  permissions: Record<string, any> | null
  isOwner: boolean
  isTeacher: boolean
  isAssistant: boolean
  isStudent: boolean
  isMember: boolean
}

/**
 * 读取当前用户在该班级的成员信息
 * 未加入返回 null
 */
export async function getClassMembership(
  classId: string,
  userId: string
): Promise<ClassMembership | null> {
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })

  if (!member) return null

  const role = mapClassRole(member.role)
  return {
    classId,
    userId,
    dbRole: member.role,
    role,
    permissions: (member.permissions as Record<string, any>) || null,
    isOwner: role === 'owner',
    isTeacher: role === 'owner',
    isAssistant: role === 'assistant',
    isStudent: role === 'student',
    isMember: true,
  }
}

export function isClassTeacher(membership: ClassMembership | null): boolean {
  return !!membership && (membership.isTeacher || membership.isAssistant)
}

export function isClassAssistant(membership: ClassMembership | null): boolean {
  return !!membership && membership.isAssistant
}

export function isClassOwner(membership: ClassMembership | null): boolean {
  return !!membership && membership.isOwner
}

/**
 * 检查权限位（如 canManageAssignments / canViewNotes）
 */
export function hasClassPermission(
  membership: ClassMembership | null,
  key: string
): boolean {
  if (!membership) return false
  if (membership.isTeacher) return true
  if (!membership.permissions) return false
  return !!membership.permissions[key]
}

/**
 * 便捷鉴权：要求当前用户为班主任/助教
 */
export async function requireClassRole(
  classId: string,
  userId: string | undefined | null,
  allowedRoles: ClassRole[] = ['owner', 'assistant']
): Promise<{ ok: true; membership: ClassMembership } | { ok: false; reason: string }> {
  if (!userId) return { ok: false, reason: '未登录' }

  const membership = await getClassMembership(classId, userId)
  if (!membership) return { ok: false, reason: '不是班级成员' }
  if (!allowedRoles.includes(membership.role))
    return { ok: false, reason: '权限不足' }
  return { ok: true, membership }
}

export function isValidObjectId(id: string): boolean {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
}
