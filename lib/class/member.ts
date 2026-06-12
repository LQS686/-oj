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
  mapClassRole,
  toDbRole,
  type ClassMembership,
} from './auth'

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
  if (role) where.role = role

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

  const members = await prisma.classMember.findMany({
    where,
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })

  let details = members.map(m => ({
    id: m.id,
    userId: m.userId,
    username: m.user.username,
    nickname: m.user.nickname,
    avatar: m.user.avatar,
    role: mapClassRole(m.role),
    dbRole: m.role,
    permissions: m.permissions || {},
    joinedAt: m.joinedAt,
    lastActiveAt: m.lastActiveAt,
    remark: m.remark,
  }))

  if (search) {
    const q = search.toLowerCase()
    details = details.filter(
      m =>
        m.username?.toLowerCase().includes(q) ||
        (m.nickname && m.nickname.toLowerCase().includes(q)) ||
        (m.remark && m.remark.toLowerCase().includes(q))
    )
  }

  details.sort((a, b) => {
    let av: any
    let bv: any
    switch (sortBy) {
      case 'role': {
        const order: any = { teacher: 3, assistant: 2, student: 1 }
        av = order[a.role] || 0
        bv = order[b.role] || 0
        break
      }
      case 'lastActiveAt':
        av = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
        bv = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
        break
      case 'username':
        av = a.username || ''
        bv = b.username || ''
        break
      case 'joinedAt':
      default:
        av = new Date(a.joinedAt).getTime()
        bv = new Date(b.joinedAt).getTime()
        break
    }
    return sortOrder === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
  })

  return details
}

/**
 * 添加班级成员
 */
export async function addClassMember(
  classId: string,
  userId: string,
  role: 'teacher' | 'assistant' | 'student' = 'student'
) {
  return prisma.classMember.create({
    data: {
      classId,
      userId,
      role: toDbRole(role),
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
  if (target.role === 'owner')
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
    data: { role: toDbRole(newRole) },
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
