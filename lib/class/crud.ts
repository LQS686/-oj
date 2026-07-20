/**
 * lib/class/crud.ts
 * 班级 CRUD / 列表 / 创建
 */

import { prisma } from '@/lib/prisma'
import { normalizeClassRoleToApi } from '@/lib/class/roles'

/* ============================================================================
 * 班级 CRUD
 * ========================================================================== */

export interface ClassDetailResult {
  id: string
  name: string
  description: string | null
  announcement: string | null
  avatar: string | null
  isPublic: boolean
  maxMembers: number | null
  ownerId: string
  createdAt: Date
  members: Array<{
    id: string
    userId: string
    username: string | null
    nickname: string | null
    avatar: string | null
    role: string
    permissions: Record<string, any>
    joinedAt: Date
    lastActiveAt: Date | null
  }>
  stats: {
    memberCount: number
    problemCount: number
    assignmentCount: number
    noteCount: number
  }
}

export async function getClassDetail(classId: string): Promise<ClassDetailResult | null> {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) return null

  const [members, memberCount, assignmentCount, noteCount, problemCount] = await Promise.all([
    prisma.classMember.findMany({
      where: { classId },
      include: {
        user: { select: { username: true, nickname: true, avatar: true } },
      },
    }),
    prisma.classMember.count({ where: { classId } }),
    prisma.classAssignment.count({ where: { classId } }),
    prisma.classNote.count({ where: { classId } }),
    prisma.problem.count({ where: { classId } }),
  ])

  return {
    id: classData.id,
    name: classData.name,
    description: classData.description,
    announcement: classData.announcement ?? null,
    avatar: classData.avatar,
    isPublic: classData.isPublic,
    maxMembers: classData.maxMembers,
    ownerId: classData.ownerId,
    createdAt: classData.createdAt,
    members: members.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      nickname: m.user.nickname,
      avatar: m.user.avatar,
      role: normalizeClassRoleToApi(m.role),
      permissions: (m.permissions || {}) as Record<string, any>,
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt,
    })),
    stats: { memberCount, problemCount, assignmentCount, noteCount },
  }
}

export interface ClassUpdateInput {
  name?: string
  description?: string | null
  announcement?: string | null
  avatar?: string | null
  isPublic?: boolean
  maxMembers?: number
}

export async function updateClass(classId: string, data: ClassUpdateInput) {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name.trim()
  if (data.description !== undefined) updateData.description = data.description
  if (data.announcement !== undefined) updateData.announcement = data.announcement
  if (data.avatar !== undefined) updateData.avatar = data.avatar
  if (data.isPublic !== undefined) updateData.isPublic = data.isPublic
  if (data.maxMembers !== undefined) updateData.maxMembers = data.maxMembers

  return prisma.class.update({ where: { id: classId }, data: updateData })
}

export async function deleteClass(classId: string) {
  return prisma.class.delete({ where: { id: classId } })
}

/* ============================================================================
 * 班级列表 / 创建
 * ========================================================================== */

export interface ListClassesFilter {
  page?: number
  pageSize?: number
  search?: string
  myClasses?: boolean
  userId?: string
}

export interface CreateClassInput {
  name: string
  announcement?: string | null
  avatar?: string
  isPublic?: boolean
  maxMembers?: number
  ownerId: string
}

export async function listClasses(filter: ListClassesFilter = {}) {
  const page = filter.page ?? 1
  const pageSize = Math.min(filter.pageSize ?? 20, 50)
  const { search, myClasses, userId } = filter

  const where: any = {}
  if (!myClasses) where.isPublic = true
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (myClasses && userId) {
    where.members = { some: { userId } }
  }

  const [classes, total] = await Promise.all([
    prisma.class.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, assignments: true, notes: true } },
      },
    }),
    prisma.class.count({ where }),
  ])

  // 班级私有题目数（Problem.classId 无反向关系，需单独聚合）
  const classIds = classes.map((c: any) => c.id)
  const problemCountsRaw = classIds.length
    ? await prisma.problem.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds } },
        _count: { _all: true },
      })
    : []
  const problemCountMap = new Map<string, number>(
    problemCountsRaw.map((r: any) => [r.classId, r._count._all])
  )

  return {
    classes: classes.map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      avatar: c.avatar,
      isPublic: c.isPublic,
      maxMembers: c.maxMembers,
      memberCount: c._count.members,
      createdAt: c.createdAt,
      stats: {
        memberCount: c._count.members,
        problemCount: problemCountMap.get(c.id) || 0,
        assignmentCount: c._count.assignments,
        noteCount: c._count.notes,
      },
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function createClass(input: CreateClassInput) {
  return prisma.class.create({
    data: {
      name: input.name.trim(),
      description: '',
      announcement: input.announcement?.trim() || null,
      avatar: input.avatar || '',
      isPublic: input.isPublic !== false,
      maxMembers: input.maxMembers || 50,
      ownerId: input.ownerId,
      members: {
        create: {
          userId: input.ownerId,
          role: 'owner',
        },
      },
    },
  })
}
