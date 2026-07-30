/**
 * lib/class/crud.ts
 * 班级 CRUD / 列表 / 创建
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { normalizeClassRoleToApi } from '@/lib/class/roles'
import { ApiError } from '@/lib/api/errors'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'
import type { ClassPermissionFlags } from './permission-flags'

/** 班级头像：允许站内路径或 http(s)；拒绝 javascript: 等危险协议 */
function sanitizeClassAvatar(avatar: string | null | undefined): string | null | undefined {
  if (avatar === undefined) return undefined
  if (avatar === null) return null
  const v = avatar.trim()
  if (!v) return ''
  const local = sanitizeAvatarUrl(v)
  if (local) return local
  if (v.startsWith('/uploads/') || v.startsWith('/api/placeholder/')) return v.slice(0, 500)
  if (/^https?:\/\//i.test(v) && !/[\s<>"']/.test(v)) return v.slice(0, 500)
  throw new ApiError('VALIDATION', '班级头像 URL 不合法', 400)
}

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
    permissions: ClassPermissionFlags
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

export async function getClassDetail(
  classId: string,
  options?: { includePermissions?: boolean }
): Promise<ClassDetailResult | null> {
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

  const includePermissions = options?.includePermissions === true

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
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      nickname: m.user.nickname,
      avatar: sanitizeAvatarUrl(m.user.avatar),
      role: normalizeClassRoleToApi(m.role),
      permissions: includePermissions
        ? ((m.permissions || {}) as ClassPermissionFlags)
        : ({} as ClassPermissionFlags),
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
  const updateData: Prisma.ClassUpdateInput = {}
  if (data.name !== undefined) {
    const name = data.name.trim()
    if (!name || name.length > 100) {
      throw new ApiError('VALIDATION', '班级名称长度须在 1-100 之间', 400)
    }
    updateData.name = name
  }
  if (data.description !== undefined) updateData.description = data.description
  if (data.announcement !== undefined) updateData.announcement = data.announcement
  if (data.avatar !== undefined) updateData.avatar = sanitizeClassAvatar(data.avatar)
  if (data.isPublic !== undefined) {
    if (typeof data.isPublic !== 'boolean') {
      throw new ApiError('VALIDATION', 'isPublic 必须为布尔值', 400)
    }
    updateData.isPublic = data.isPublic
  }
  if (data.maxMembers !== undefined) {
    const n = Number(data.maxMembers)
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      throw new ApiError('VALIDATION', 'maxMembers 须为 1-10000 的整数', 400)
    }
    const currentCount = await prisma.classMember.count({ where: { classId } })
    if (n < currentCount) {
      throw new ApiError(
        'VALIDATION',
        `maxMembers 不能低于当前人数（${currentCount}）`,
        400
      )
    }
    updateData.maxMembers = n
  }

  return prisma.class.update({ where: { id: classId }, data: updateData })
}

export async function deleteClass(classId: string) {
  // MongoDB + Prisma 对多数 Class 子表未声明 onDelete: Cascade。
  // 显式按依赖顺序清理，避免 P2003 或留下孤儿记录。
  await prisma.$transaction(async (tx) => {
    const assignments = await tx.classAssignment.findMany({
      where: { classId },
      select: { id: true },
    })
    const assignmentIds = assignments.map((a) => a.id)
    if (assignmentIds.length > 0) {
      await tx.classAssignmentProblemProgress.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      })
      await tx.classAssignmentSubmission.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      })
      await tx.classAssignmentProblem.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      })
      await tx.classAssignment.deleteMany({ where: { classId } })
    }

    await tx.classNote.deleteMany({ where: { classId } })
    await tx.classDirectInvite.deleteMany({ where: { classId } })
    await tx.classJoinRequest.deleteMany({ where: { classId } })
    await tx.classMember.deleteMany({ where: { classId } })

    // 班级题库：解除 classId 关联（题目本身保留，避免误删公共题数据）
    await tx.problem.updateMany({
      where: { classId },
      data: { classId: null, isPublic: false, visibility: 'private' },
    })

    // Training 在 schema 上声明了 onDelete: Cascade，仍显式清理以保证一致
    await tx.training.deleteMany({ where: { classId } })

    await tx.class.delete({ where: { id: classId } })
  })
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

  const where: Prisma.ClassWhereInput = {}
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
  const classIds = classes.map((c) => c.id)
  const problemCountsRaw = classIds.length
    ? await prisma.problem.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds } },
        _count: { _all: true },
      })
    : []
  const problemCountMap = new Map<string, number>(
    problemCountsRaw.map((r) => [r.classId as string, r._count._all])
  )

  return {
    classes: classes.map((c) => ({
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
      avatar: sanitizeClassAvatar(input.avatar) || '',
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
