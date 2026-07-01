/**
 * lib/class/auth.ts
 * 班级鉴权 / 角色判断 helper
 *
 * 角色语义：
 * - teacher（班主任，对应数据库 owner）—— 班级创建人，拥有一切权限
 * - assistant（助教，对应数据库 admin）—— 协助管理
 * - student（学生，对应数据库 member）—— 普通成员
 */

import { prisma } from '@/lib/prisma'
import { normalizeClassRoleToApi, isClassAdminApiRole } from './roles'

export type ClassRole = 'teacher' | 'assistant' | 'student'

/**
 * 数据库存储值（保持向后兼容）→ 业务角色
 */

export function mapClassRole(dbRole: string): ClassRole {
  const api = normalizeClassRoleToApi(dbRole)
  if (api === 'owner') return 'teacher'
  if (api === 'assistant') return 'assistant'
  return 'student'
}

/**
 * 业务角色 → 数据库存储值
 */
export function toDbRole(role: ClassRole): string {
  if (role === 'teacher') return 'owner'
  if (role === 'assistant') return 'admin'
  return 'member'
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
  isAdmin: boolean
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
    isOwner: normalizeClassRoleToApi(member.role) === 'owner',
    isTeacher: role === 'teacher',
    isAssistant: role === 'assistant',
    isAdmin: isClassAdminApiRole(member.role),
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
  if (membership.isTeacher) return true // 班主任拥有所有权限
  if (!membership.permissions) return false
  return !!membership.permissions[key]
}

/**
 * 便捷鉴权：要求当前用户为班主任/助教
 * 失败时返回 null，路由层可继续后续逻辑
 */
export async function requireClassRole(
  classId: string,
  userId: string | undefined | null,
  allowedRoles: ClassRole[] = ['teacher', 'assistant']
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
