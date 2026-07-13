/**
 * lib/class/member.ts
 * 班级成员管理
 */

import { prisma } from '@/lib/prisma'
import {
  getClassMembership,
  isClassOwner,
  isClassTeacher,
  isClassAssistant,
  type ClassMembership,
} from './auth'
import { normalizeClassRoleToApi, dbRolesMatchingApiFilter, isClassOwnerRole } from './roles'

export interface MemberListFilter {
  role?: string
  search?: string
  active?: 'true' | 'false'
  sortBy?: 'joinedAt' | 'lastActiveAt' | 'role' | 'username'
  sortOrder?: 'asc' | 'desc'
}

/**
 * 列出班级成员（带用户信息）
 */
export async function listClassMembers(
  classId: string,
  filter: MemberListFilter = {}
) {
  const { role, search, active, sortBy = 'joinedAt', sortOrder = 'desc' } = filter

  const where: any = { classId }
  if (role) {
    const dbRoles = dbRolesMatchingApiFilter(role)
    where.role = dbRoles.length === 1 ? dbRoles[0] : { in: dbRoles }
  }

  if (active) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    if (active === 'true') {
      where.lastActiveAt = { gte: thirtyDaysAgo }
    } else {
      where.OR = [
        { lastActiveAt: { lt: thirtyDaysAgo } },
        { lastActiveAt: null },
      ]
    }
  }

  if (search) {
    const searchOr = [
      { user: { username: { contains: search, mode: 'insensitive' } } },
      { user: { nickname: { contains: search, mode: 'insensitive' } } },
      { remark: { contains: search, mode: 'insensitive' } },
    ]
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }]
      delete where.OR
    } else {
      where.OR = searchOr
    }
  }

  let orderBy: any
  switch (sortBy) {
    case 'lastActiveAt':
      orderBy = { lastActiveAt: sortOrder }
      break
    case 'username':
      orderBy = { user: { username: sortOrder } }
      break
    case 'joinedAt':
    default:
      orderBy = { joinedAt: sortOrder }
      break
  }

  const members = await prisma.classMember.findMany({
    where,
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
    orderBy,
  })

  const details = members.map((m: any) => ({
    id: m.id,
    userId: m.userId,
    username: m.user.username,
    nickname: m.user.nickname,
    avatar: m.user.avatar,
    role: normalizeClassRoleToApi(m.role),
    dbRole: m.role,
    permissions: m.permissions || {},
    joinedAt: m.joinedAt,
    lastActiveAt: m.lastActiveAt,
    remark: m.remark,
  }))

  if (sortBy === 'role') {
    const order: Record<string, number> = { owner: 3, assistant: 2, student: 1 }
    details.sort((a: any, b: any) => {
      const av = order[a.role] ?? 0
      const bv = order[b.role] ?? 0
      return sortOrder === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
    })
  }

  return details
}

/**
 * 添加班级成员
 */
export async function addClassMember(
  classId: string,
  userId: string,
  role: 'owner' | 'assistant' | 'student' = 'student'
) {
  return prisma.classMember.create({
    data: {
      classId,
      userId,
      role,
      joinedAt: new Date(),
    },
  })
}

/**
 * 移除班级成员（不能移除班主任）
 */
export async function removeClassMember(classId: string, userId: string) {
  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!target) return { ok: false, reason: '该用户不是班级成员' } as const
  if (isClassOwnerRole(target.role))
    return { ok: false, reason: '不能移除班级创建人' } as const
  await prisma.classMember.delete({
    where: { classId_userId: { classId, userId } },
  })
  return { ok: true } as const
}

/**
 * 更新成员角色（班主任才能设置）
 */
export async function updateClassMemberRole(
  classId: string,
  userId: string,
  newRole: 'assistant' | 'student'
) {
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: { role: newRole },
  })
}

/**
 * 更新成员权限位
 */
export async function updateClassMemberPermissions(
  classId: string,
  userId: string,
  permissions: Record<string, any>
) {
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: { permissions },
  })
}

/**
 * 更新成员最后活跃时间
 */
export async function touchClassMemberActivity(classId: string, userId: string) {
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: { lastActiveAt: new Date() },
  })
}

export { getClassMembership, isClassOwner, isClassTeacher, isClassAssistant }
export type { ClassMembership }
