/**
 * lib/class/service.ts
 * 班级业务层（CRUD / 成员 / 邀请 / 笔记 / 作业 / 邀请 / 商品）
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { canManageContent } from '@/lib/permissions'
import { addJudgeJob } from '@/lib/judge/queue'
import {
  createClassAssignmentSubmissionDirect,
  createSubmissionDirect,
  deleteClassAssignmentSubmissionDirect,
  incrementProblemSubmitCount,
  updateClassAssignmentSubmissionDirect,
  updateSubmissionDirect,
} from '@/lib/mongodb-direct'
import { createNotification, createNotifications } from '@/lib/notification/service'
import { normalizeClassRoleToApi, apiRoleToDb, isClassAdminApiRole } from '@/lib/class/roles'

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

/* ============================================================================
 * 班级成员 / 权限 / 活动
 * ========================================================================== */

/** 列出班级成员（带可搜索的 user 信息） */
export async function listClassMembersWithUser(classId: string) {
  return prisma.classMember.findMany({
    where: { classId },
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })
}

/** 读取班级成员（带目标 userId） */
export async function getClassMemberByUserId(classId: string, userId: string) {
  return prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
}

/** 更新成员角色 / 备注（班级角色与系统角色解耦，不再同步 User.role） */
export async function patchClassMember(
  classId: string,
  userId: string,
  data: { remark?: string; role?: 'student' | 'assistant' | 'owner' }
) {
  const update: { remark?: string; role?: string } = {}
  if (data.remark !== undefined) update.remark = data.remark
  if (data.role !== undefined) update.role = apiRoleToDb(data.role)

  const updated = await prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: update,
  })

  // 班级角色与系统角色彻底解耦：班级角色变更不再同步修改 User.role
  return updated
}

/** 合法权限位白名单 */
const ALLOWED_PERMISSION_KEYS = [
  'canViewProblems',
  'canSubmit',
  'canViewNotes',
  'canCreateNotes',
  'canManageAssignments',
  'canInviteMembers',
  'canManageMembers',
  'canViewStats',
] as const

/** 合并成员权限位 */
export async function mergeClassMemberPermissions(
  classId: string,
  userId: string,
  permissions: Record<string, any>
) {
  const current = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!current) return null
  // 仅允许白名单内的权限位写入，防止注入未知字段
  const filtered: Record<string, any> = {}
  for (const key of ALLOWED_PERMISSION_KEYS) {
    if (key in permissions) {
      filtered[key] = permissions[key]
    }
  }
  const merged = { ...((current.permissions as any) || {}), ...filtered }
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: { permissions: merged },
  })
}

/** 获取成员活动概况（提交 / 笔记） */
export async function getClassMemberActivity(classId: string, memberId: string) {
  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: memberId } },
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })
  if (!target) return null

  const [submissions, notes] = await Promise.all([
    prisma.classAssignmentSubmission.findMany({
      where: { assignment: { classId }, userId: memberId },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      include: { assignment: { select: { title: true } } },
    }),
    prisma.classNote.findMany({
      where: { classId, authorId: memberId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const [totalSubmissions, acCount, totalNotes] = await Promise.all([
    prisma.classAssignmentSubmission.count({
      where: { assignment: { classId }, userId: memberId },
    }),
    prisma.classAssignmentSubmission.count({
      where: { assignment: { classId }, userId: memberId, status: 'AC' },
    }),
    prisma.classNote.count({ where: { classId, authorId: memberId } }),
  ])

  const recentActivities = [
    ...submissions.map((s: any) => ({
      type: 'submission',
      title: `提交了作业 "${s.assignment.title}"`,
      status: s.status,
      score: s.score,
      createdAt: s.submittedAt,
    })),
    ...notes.map((n: any) => ({
      type: 'note',
      title: `发布了笔记 "${n.title}"`,
      status: 'published',
      createdAt: n.createdAt,
    })),
  ]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)

  return {
    member: {
      id: target.userId,
      username: target.user.username,
      nickname: target.user.nickname,
      avatar: target.user.avatar,
      role: target.role,
      joinedAt: target.joinedAt,
    },
    stats: {
      totalSubmissions,
      acCount,
      totalNotes,
    },
    recentActivities,
  }
}

/* ============================================================================
 * 班级作业（增强 service：列表统计 / 创建 / 详情 / 统计 / 提交 / 进度）
 * ========================================================================== */

export interface ListClassAssignmentsFilter {
  page?: number
  pageSize?: number
  status?: 'ongoing' | 'ended'
}

export async function listClassAssignmentsWithStats(
  classId: string,
  filter: ListClassAssignmentsFilter = {}
) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const where: any = { classId }
  const now = new Date()
  if (filter.status === 'ongoing') where.endTime = { gte: now }
  else if (filter.status === 'ended') where.endTime = { lt: now }

  const [assignments, total, memberCount] = await Promise.all([
    prisma.classAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.classAssignment.count({ where }),
    prisma.classMember.count({ where: { classId } }),
  ])

  // 批量拉取创建者
  const creatorIds = Array.from(
    new Set(assignments.map((a: any) => a.createdBy).filter(Boolean) as string[])
  )
  let creatorMap = new Map<string, string>()
  if (creatorIds.length) {
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, nickname: true, username: true },
    })
    creatorMap = new Map(creators.map((u: any) => [u.id, u.nickname || u.username || '']))
  }

  // 拉取所有作业的提交（一次查询）
  const assignmentIds = assignments.map((a: any) => a.id)
  const allSubmissions =
    assignmentIds.length > 0
      ? await prisma.classAssignmentSubmission.findMany({
          where: { assignmentId: { in: assignmentIds } },
        })
      : []

  const submissionsByAssignment = new Map<string, typeof allSubmissions>()
  for (const s of allSubmissions) {
    const list = submissionsByAssignment.get(s.assignmentId) || []
    list.push(s)
    submissionsByAssignment.set(s.assignmentId, list)
  }

  const items = assignments.map((a: any) => {
    const submissions = submissionsByAssignment.get(a.id) || []
    const problemIds = a.problemIds || []
    const problemCount = problemIds.length

    const memberProblemScores = new Map<string, Map<string, number>>()
    submissions.forEach((sub: any) => {
      let m = memberProblemScores.get(sub.userId)
      if (!m) {
        m = new Map()
        memberProblemScores.set(sub.userId, m)
      }
      const cur = m.get(sub.problemId) || 0
      m.set(sub.problemId, Math.max(cur, sub.score || 0))
    })

    let totalCompletedProblems = 0
    memberProblemScores.forEach((m) =>
      m.forEach((score) => {
        if (score === 100) totalCompletedProblems++
      })
    )

    const totalProblems = memberCount * problemCount
    const completionRate =
      totalProblems > 0 ? Math.round((totalCompletedProblems / totalProblems) * 100) : 0

    return {
      id: a.id,
      title: a.title,
      description: a.description,
      startTime: a.startTime,
      endTime: a.endTime,
      deadline: a.endTime,
      problemCount,
      stats: {
        totalMembers: memberCount,
        completedMembers: totalCompletedProblems,
        completionRate,
      },
      createdAt: a.createdAt,
      createdBy: a.createdBy,
      createdByName:
        creatorMap.get(a.createdBy || '') || a.createdBy || '-',
    }
  })

  return {
    assignments: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

/* ============================================================================
 * 班级直接邀请（按用户名）
 * ========================================================================== */

/** 创建一条直接邀请（含 upsert：未邀请过则新建，邀请过且非 pending 则重置） */
export async function createOrReactivateDirectInvite(input: {
  classId: string
  inviterId: string
  inviteeId: string
  message?: string | null
  expiresAt: Date
}): Promise<string> {
  const existingInvite = await findDirectInvite(input.classId, input.inviteeId)
  if (existingInvite) {
    if (existingInvite.status === 'pending') {
      throw new ApiError('PENDING_INVITE', '已向该用户发送过邀请，请等待对方响应', 400)
    }
    const updated = await updateDirectInvite(existingInvite.id, {
      inviterId: input.inviterId,
      status: 'pending',
      message: input.message || null,
      expiresAt: input.expiresAt,
      respondedAt: null,
      createdAt: new Date(),
    })
    return updated.id
  }
  const created = await prisma.classDirectInvite.create({
    data: {
      classId: input.classId,
      inviterId: input.inviterId,
      inviteeId: input.inviteeId,
      status: 'pending',
      message: input.message || null,
      expiresAt: input.expiresAt,
      respondedAt: null,
    },
  })
  return created.id
}

/** 邀请者本人信息（用于通知展示） */
export async function getInviterProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, nickname: true },
  })
}

/** 读某用户在某班级中的成员记录（无则返回 null） */
export async function getCurrentClassMember(classId: string, userId: string) {
  return prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
}

/** 按 id 读取班级（无则返回 null） */
export async function getClassById(classId: string) {
  return prisma.class.findUnique({ where: { id: classId } })
}

/** 按用户名读用户（无则返回 null） */
export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } })
}

/** 是否已是班级成员 */
export async function isUserClassMember(classId: string, userId: string) {
  const m = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { id: true },
  })
  return !!m
}

/** 校验当前用户是否是班级 owner/admin */
export async function assertClassAdmin(classId: string, userId: string, failMsg: string) {
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!member || !isClassAdminApiRole(member.role)) {
    throw new ApiError('FORBIDDEN', failMsg, 403)
  }
  return member
}

/** 按 id + classId 查题目（确保题目归属该班级） */
export async function findClassProblem(problemId: string, classId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId, classId },
  })
}

/** 按 id + classId 查作业（确保作业归属该班级） */
export async function findClassAssignment(assignmentId: string, classId: string) {
  return prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
}

/** 读当前用户是否为站点管理员/教师（SYSTEM_ADMIN 或 TEACHER） */
export async function getUserIsAdmin(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!u) return false
  return canManageContent(u)
}

/** 检查当前用户是否在指定题上获得满分（用于提交记录越权校验） */
export async function hasFullScoreOnProblem(
  userId: string,
  assignmentId: string,
  problemId: string
) {
  const submissions = await prisma.classAssignmentSubmission.findMany({
    where: { assignmentId, userId, problemId },
    select: { score: true },
  })
  if (submissions.length === 0) return false
  const maxScore = Math.max(...submissions.map((s: any) => s.score || 0))
  return maxScore === 100
}

/** 校验当前操作者是班级 owner/admin，否则 throw403 */
export async function requireClassAdminRole(classId: string, userId: string) {
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!member || !isClassAdminRole(member.role)) {
    throw new ApiError('FORBIDDEN', '您没有权限管理成员', 403)
  }
  return member
}

/** 校验目标成员存在 + 当前操作者可管理其角色 */
export async function requireManageableTarget(classId: string, memberId: string, operatorRole: string) {
  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: memberId } },
  })
  if (!target) {
    throw new ApiError('NOT_FOUND', '成员不存在', 404)
  }
  if (!canManageMember(operatorRole, target.role)) {
    throw new ApiError('FORBIDDEN', '没有权限管理该成员', 403)
  }
  return target
}

/** 读取当前用户的基础 profile（用于加入申请通知） */
export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

/** 读直接邀请详情（含班级/邀请人/被邀请人） */
export async function getDirectInviteRaw(inviteId: string) {
  return prisma.classDirectInvite.findUnique({ where: { id: inviteId } })
}

/** 读班级笔记的最小信息（id/classId/title） */
export async function getClassNoteBasic(noteId: string, classId: string) {
  return prisma.classNote.findUnique({
    where: { id: noteId, classId },
  })
}

/** 查找同名班级（创建班级时校验重名） */
export async function findClassByName(name: string) {
  return prisma.class.findUnique({ where: { name } })
}

/** 校验作业内的所有题目是否都在公共题库中且公开 */
export async function validateAssignmentProblems(problemIds: string[]) {
  const problems = await prisma.problem.findMany({
    where: { id: { in: problemIds }, isPublic: true },
  })
  return problems.length === problemIds.length
}

export async function getClassAssignmentDetail(
  classId: string,
  assignmentId: string
) {
  const [assignment, members, submissions] = await Promise.all([
    prisma.classAssignment.findUnique({
      where: { id: assignmentId, classId },
    }),
    prisma.classMember.findMany({
      where: { classId },
      include: {
        user: { select: { username: true, nickname: true, avatar: true } },
      },
    }),
    prisma.classAssignmentSubmission.findMany({ where: { assignmentId } }),
  ])
  if (!assignment) return null
  return { assignment, members, submissions }
}

/** 计算作业统计数据：整体 / 题目 / 成员 / 趋势 */
export async function computeAssignmentStatistics(
  classId: string,
  assignmentId: string
) {
  const assignment = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
  if (!assignment) return null

  const [members, submissions, problems] = await Promise.all([
    prisma.classMember.findMany({
      where: { classId },
      include: {
        user: { select: { username: true, nickname: true, avatar: true } },
      },
    }),
    prisma.classAssignmentSubmission.findMany({ where: { assignmentId } }),
    prisma.problem.findMany({
      where: { id: { in: assignment.problemIds } },
    }),
  ])

  const totalMembers = members.length
  const totalProblems = assignment.problemIds.length
  const deadline = assignment.endTime ? new Date(assignment.endTime) : null

  const memberCompletionMap = new Map<string, Set<string>>()
  members.forEach((m: any) => memberCompletionMap.set(m.userId, new Set()))

  submissions.forEach((sub: any) => {
    if (sub.status === 'AC' && memberCompletionMap.has(sub.userId)) {
      memberCompletionMap.get(sub.userId)!.add(sub.problemId)
    }
  })

  const completedMembers = Array.from(memberCompletionMap.values()).filter(
    (s) => s.size === totalProblems
  ).length

  // 平均分 / 正确率
  const memberScores = Array.from(memberCompletionMap.entries()).map(
    ([userId, solvedSet]) => {
      const ms = submissions.filter((s: any) => s.userId === userId)
      const totalScore = ms.reduce((sum: any, s: any) => {
        const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
        return sum + (isLate ? 0 : s.score || 0)
      }, 0)
      const avgScore = ms.length > 0 ? totalScore / ms.length : 0
      const accuracy = totalProblems > 0 ? (solvedSet.size / totalProblems) * 100 : 0
      return { avgScore, accuracy }
    }
  )

  const avgScore =
    memberScores.length > 0
      ? memberScores.reduce((s, m) => s + m.avgScore, 0) / memberScores.length
      : 0
  const avgAccuracy =
    memberScores.length > 0
      ? memberScores.reduce((s, m) => s + m.accuracy, 0) / memberScores.length
      : 0

  // 题目维度
  const problemMap = new Map<any, any>(problems.map((p: any) => [p.id, p]))
  const problemStats = assignment.problemIds.map((problemId: any) => {
    const info = problemMap.get(problemId)
    const ps = submissions.filter((s: any) => s.problemId === problemId)
    const acs = ps.filter((s: any) => s.status === 'AC')
    const uniqueUsers = new Set(ps.map((s: any) => s.userId))
    const acUsers = new Set(acs.map((s: any) => s.userId))
    const totalScore = ps.reduce((sum: any, s: any) => {
      const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
      return sum + (isLate ? 0 : s.score || 0)
    }, 0)
    const avgProblemScore = ps.length > 0 ? totalScore / ps.length : 0
    return {
      problemId,
      title: info?.title,
      difficulty: info?.difficulty,
      problemNumber: info?.problemNumber,
      totalSubmissions: ps.length,
      uniqueSubmitters: uniqueUsers.size,
      acCount: acUsers.size,
      acRate: uniqueUsers.size > 0 ? (acUsers.size / uniqueUsers.size) * 100 : 0,
      avgScore: avgProblemScore,
    }
  })

  // 成员维度
  const memberStats = members.map((m: any) => {
    const userId = m.userId
    const us = submissions.filter((s: any) => s.userId === userId)
    const solved = memberCompletionMap.get(userId) || new Set()
    const totalUserScore = us.reduce((sum: any, s: any) => {
      const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
      return sum + (isLate ? 0 : s.score || 0)
    }, 0)
    const avgUserScore = us.length > 0 ? totalUserScore / us.length : 0
    const accuracy = totalProblems > 0 ? (solved.size / totalProblems) * 100 : 0
    const lateSubmissions = us.filter((s: any) => {
      return s.isLate || (deadline ? s.submittedAt > deadline : false)
    }).length

    const problemScores: { [k: string]: number | string } = {}
    const problemStatuses: { [k: string]: string } = {}
    assignment.problemIds.forEach((problemId: any) => {
      const ps = us.filter((s: any) => s.problemId === problemId)
      if (ps.length > 0) {
        const valid = ps.map((s: any) => {
          const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
          return { score: isLate ? 0 : s.score || 0, status: s.status, isLate }
        })
        const max = valid.reduce((m: any, c: any) => (c.score > m.score ? c : m))
        problemScores[problemId] = max.score
        problemStatuses[problemId] = max.status
      } else {
        problemScores[problemId] = '-'
        problemStatuses[problemId] = 'NOT_SUBMITTED'
      }
    })

    const totalScore = Object.values(problemScores).reduce((sum, sc) => {
      return typeof sc === 'number' ? (sum as number) + sc : sum
    }, 0) as number

    return {
      userId,
      username: m.user.username,
      nickname: m.user.nickname,
      avatar: m.user.avatar,
      solved: solved.size,
      total: totalProblems,
      completionRate: accuracy,
      totalSubmissions: us.length,
      avgScore: avgUserScore,
      lateSubmissions,
      problemScores,
      problemStatuses,
      totalScore,
    }
  })

  memberStats.sort((a: any, b: any) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    if (b.solved !== a.solved) return b.solved - a.solved
    return b.avgScore - a.avgScore
  })

  // 提交趋势
  const trendMap = new Map<string, { date: string; count: number; acCount: number }>()
  submissions.forEach((s: any) => {
    const date = new Date(s.submittedAt).toISOString().split('T')[0]
    let row = trendMap.get(date)
    if (!row) {
      row = { date, count: 0, acCount: 0 }
      trendMap.set(date, row)
    }
    row.count++
    if (s.status === 'AC') row.acCount++
  })
  const submissionTrend = Array.from(trendMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return {
    overall: {
      totalMembers,
      totalProblems,
      completedMembers,
      completionRate: totalMembers > 0 ? (completedMembers / totalMembers) * 100 : 0,
      avgScore: Math.round(avgScore * 100) / 100,
      avgAccuracy: Math.round(avgAccuracy * 100) / 100,
      totalSubmissions: submissions.length,
    },
    problemStats,
    memberStats,
    submissionTrend,
  }
}

/** 列出作业提交记录（带权限校验） */
export interface ListAssignmentSubmissionsFilter {
  problemId?: string
  userId?: string
  status?: string
  page?: number
  pageSize?: number
}

export async function listAssignmentSubmissions(
  classId: string,
  assignmentId: string,
  filter: ListAssignmentSubmissionsFilter = {}
) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const limit = pageSize
  const where: any = { assignmentId }
  if (filter.userId) where.userId = filter.userId
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.status) where.status = filter.status

  const [total, submissions] = await Promise.all([
    prisma.classAssignmentSubmission.count({ where }),
    prisma.classAssignmentSubmission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  // 批量回填 user + problem 信息
  const userIds = Array.from(new Set(submissions.map((s: any) => s.userId)))
  const problemIds = Array.from(new Set(submissions.map((s: any) => s.problemId)))
  const [users, problems] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, nickname: true },
        })
      : Promise.resolve([] as any[]),
    problemIds.length
      ? prisma.problem.findMany({
          where: { id: { in: problemIds } },
          select: { id: true, title: true, problemNumber: true },
        })
      : Promise.resolve([] as any[]),
  ])
  const userMap = new Map<any, any>(users.map((u: any) => [u.id, u]))
  const problemMap = new Map<any, any>(problems.map((p: any) => [p.id, p]))

  const items = submissions.map((s: any) => {
    const u = userMap.get(s.userId)
    const p = problemMap.get(s.problemId)
    return {
      id: s.id,
      problem: {
        id: s.problemId,
        title: p?.title || 'Unknown Problem',
        problemNumber: p?.problemNumber,
      },
      userId: s.userId,
      user: { id: s.userId, username: u?.username, nickname: u?.nickname },
      language: s.language,
      code: s.code,
      status: s.status,
      score: s.score || 0,
      time: s.time || 0,
      memory: s.memory || 0,
      passedTests: s.passedTests,
      totalTests: s.totalTests,
      message: s.message,
      submittedAt: s.submittedAt,
      isLate: s.isLate,
    }
  })

  return {
    submissions: items,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      pageSize: limit,
      total,
    },
  }
}

/** 提交班级作业代码（写入评测队列） */
export interface SubmitAssignmentInput {
  classId: string
  assignmentId: string
  userId: string
  problemId: string
  code: string
  language: string
}

export async function submitAssignmentCode(input: SubmitAssignmentInput) {
  const assignment = await prisma.classAssignment.findUnique({
    where: { id: input.assignmentId, classId: input.classId },
  })
  if (!assignment) return { ok: false, code: 404, reason: '作业不存在' as const }

  if (!assignment.problemIds.includes(input.problemId)) {
    return { ok: false, code: 400, reason: '该题目不在当前作业中' as const }
  }

  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  })
  if (!problem) return { ok: false, code: 404, reason: '题目不存在' as const }
  if (!problem.testCases || problem.testCases.length === 0) {
    return { ok: false, code: 400, reason: '题目没有测试用例，无法评测' as const }
  }

  const deadline = assignment.endTime ? new Date(assignment.endTime) : null
  const now = new Date()
  const isLate = deadline ? now > deadline : false

  const assignmentSubmission = await createClassAssignmentSubmissionDirect({
    assignmentId: input.assignmentId,
    userId: input.userId,
    problemId: input.problemId,
    code: input.code,
    language: input.language,
    status: 'Pending',
    totalTests: problem.testCases.length,
    isLate,
  })

  // 两次写入使用原生驱动（非 Prisma），用补偿逻辑保证一致性：
  // 第二步 createSubmissionDirect 失败时回滚第一步，避免孤立作业提交记录
  let submission
  try {
    submission = await createSubmissionDirect({
      problemId: input.problemId,
      userId: input.userId,
      code: input.code,
      language: input.language,
      status: 'Pending',
      totalTests: problem.testCases.length,
      assignmentSubmissionId: assignmentSubmission.id,
    })
  } catch (err) {
    await deleteClassAssignmentSubmissionDirect(assignmentSubmission.id).catch(() => {})
    throw err
  }

  await incrementProblemSubmitCount(input.problemId)

  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: input.problemId,
      userId: input.userId,
      code: input.code,
      language: input.language,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      comparisonMode: problem.comparisonMode as any,
      realPrecision: problem.realPrecision,
      testCases: problem.testCases.map((tc: any) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        score: tc.score,
        timeLimit: tc.timeLimit ?? undefined,
        memoryLimit: tc.memoryLimit ?? undefined,
      })),
    })
  } catch (err) {
    console.error('加入队列失败:', err)
    await updateSubmissionDirect(submission.id, {
      status: 'SE',
      message: '评测系统错误，请稍后重试',
    })
    await updateClassAssignmentSubmissionDirect(assignmentSubmission.id, {
      status: 'SE',
      message: '评测系统错误，请稍后重试',
    })
  }

  return {
    ok: true as const,
    submissionId: submission.id,
    submission,
    isLate,
  }
}

/** 获取当前用户在某作业的题目得分（最高分） */
export async function getMyAssignmentProgress(
  classId: string,
  assignmentId: string,
  userId: string
) {
  const assignment = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
  if (!assignment) return null

  const submissions = await prisma.classAssignmentSubmission.findMany({
    where: { assignmentId, userId },
  })

  const problemScores: { [k: string]: { score: number; submitted: boolean } } = {}
  assignment.problemIds.forEach((problemId: any) => {
    const ps = submissions.filter((s: any) => s.problemId === problemId)
    if (ps.length > 0) {
      const maxScore = Math.max(...ps.map((s: any) => s.score || 0))
      problemScores[problemId] = { score: maxScore, submitted: true }
    } else {
      problemScores[problemId] = { score: 0, submitted: false }
    }
  })

  return { problemScores, totalSubmissions: submissions.length }
}

/* ============================================================================
 * 班级题目（私有题库）
 * ========================================================================== */

export interface ListClassProblemsFilter {
  page?: number
  pageSize?: number
  difficulty?: string
  search?: string
}

export async function listClassProblems(
  classId: string,
  filter: ListClassProblemsFilter = {}
) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const where: any = { classId }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { tags: { has: filter.search } },
    ]
  }

  const [problems, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { author: { select: { username: true, nickname: true } } },
    }),
    prisma.problem.count({ where }),
  ])

  return {
    problems: problems.map((p: any) => ({
      id: p.id,
      title: p.title,
      problemNumber: p.problemNumber,
      difficulty: p.difficulty,
      tags: p.tags || [],
      acCount: p.totalAccepted,
      totalSubmissions: p.totalSubmit,
      acRate: p.totalSubmit > 0 ? Math.round((p.totalAccepted / p.totalSubmit) * 100) : 0,
      createdAt: p.createdAt,
      createdBy: p.authorId,
      authorName: p.author.nickname || p.author.username,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getClassProblem(classId: string, problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId, classId },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  })
}

export async function updateClassProblemFields(
  problemId: string,
  data: {
    title?: string
    description?: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
  }
) {
  return prisma.problem.update({ where: { id: problemId }, data })
}

export async function deleteClassProblem(problemId: string) {
  return prisma.problem.delete({ where: { id: problemId } })
}

/** 生成班级题目编号：T + 6 位时间戳 + 4 位随机 hex（避免 Math.random 可预测性） */
function generateClassProblemNumber(): string {
  const suffix = crypto.randomBytes(2).toString('hex')
  return `T${Date.now().toString().slice(-6)}${suffix}`
}

/** 复制一道公共题到班级题库 */
export async function cloneProblemToClass(
  sourceProblemId: string,
  classId: string,
  authorId: string
) {
  const source = await prisma.problem.findUnique({
    where: { id: sourceProblemId },
    include: { testCases: true },
  })
  if (!source) return null
  const problemNumber = generateClassProblemNumber()
  return prisma.problem.create({
    data: {
      problemNumber,
      classId,
      title: source.title,
      description: source.description,
      input: source.input,
      output: source.output,
      samples: source.samples || [],
      hint: source.hint,
      source: source.source,
      difficulty: source.difficulty,
      tags: source.tags,
      timeLimit: source.timeLimit,
      memoryLimit: source.memoryLimit,
      isPublic: false,
      authorId,
      testCases: {
        create: source.testCases.map((tc: any, idx: any) => ({
          input: tc.input,
          output: tc.output,
          isSample: tc.isSample,
          score: tc.score,
          orderIndex: idx,
        })),
      },
    },
  })
}

/** 在班级题库下创建新题 */
export async function createNewClassProblem(
  classId: string,
  authorId: string,
  data: {
    title: string
    description: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
  }
) {
  const problemNumber = generateClassProblemNumber()
  return prisma.problem.create({
    data: {
      problemNumber,
      classId,
      title: data.title,
      description: data.description,
      input: '',
      output: '',
      samples: [],
      difficulty: data.difficulty || 'Medium',
      tags: data.tags || [],
      timeLimit: data.timeLimit || 1000,
      memoryLimit: data.memoryLimit || 256,
      isPublic: false,
      authorId,
    },
  })
}

/* ============================================================================
 * 班级笔记
 * ========================================================================== */

export interface ListClassNotesInput {
  page?: number
  pageSize?: number
  category?: string
  search?: string
}

export async function listClassNotesPaged(classId: string, filter: ListClassNotesInput = {}) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const where: any = { classId }
  if (filter.category) where.category = filter.category
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { content: { contains: filter.search, mode: 'insensitive' } },
      { tags: { has: filter.search } },
    ]
  }

  const [notes, total] = await Promise.all([
    prisma.classNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    }),
    prisma.classNote.count({ where }),
  ])

  return {
    notes: notes.map((n: any) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      category: n.category,
      tags: n.tags || [],
      author: {
        id: n.author.id,
        username: n.author.username,
        nickname: n.author.nickname,
        avatar: n.author.avatar,
      },
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function createClassNoteSimple(
  classId: string,
  authorId: string,
  data: { title: string; content: string; category?: string; tags?: string[] }
) {
  return prisma.classNote.create({
    data: {
      classId,
      authorId,
      title: data.title,
      content: data.content,
      category: data.category || 'General',
      tags: data.tags || [],
    },
  })
}

export async function getClassNoteWithAuthor(noteId: string) {
  return prisma.classNote.findUnique({
    where: { id: noteId },
    include: {
      author: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  })
}

export async function getClassNoteSimple(classId: string, noteId: string) {
  return prisma.classNote.findUnique({ where: { id: noteId, classId } })
}

export async function updateClassNoteFields(
  noteId: string,
  data: { title?: string; content?: string; category?: string; tags?: string[] }
) {
  return prisma.classNote.update({ where: { id: noteId }, data })
}

export async function deleteClassNoteSimple(noteId: string) {
  return prisma.classNote.delete({ where: { id: noteId } })
}

/* ============================================================================
 * 班级直接邀请（按用户名）
 * ========================================================================== */

export async function listClassDirectInvitesDetailed(classId: string) {
  return prisma.classDirectInvite.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    include: {
      inviter: { select: { id: true, username: true, nickname: true, avatar: true } },
      invitee: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  })
}

export async function findDirectInvite(classId: string, inviteeId: string) {
  return prisma.classDirectInvite.findUnique({
    where: { classId_inviteeId: { classId, inviteeId } },
  })
}

export async function updateDirectInvite(inviteId: string, data: any) {
  return prisma.classDirectInvite.update({ where: { id: inviteId }, data })
}

export async function sendClassDirectInviteNotification(
  inviteeId: string,
  inviter: { nickname: string | null; username: string } | null | undefined,
  className: string,
  inviteId: string
) {
  await createNotification({
    userId: inviteeId,
    type: 'class_invite',
    title: '班级邀请',
    content: `${inviter?.nickname || inviter?.username} 邀请您加入班级 "${className}"`,
    link: `/classes/invites/direct/${inviteId}`,
  })
}

/* ============================================================================
 * 直接邀请响应（GET / PUT 路由使用）
 * ========================================================================== */

export interface DirectInviteDetailResult {
  invite: {
    id: string
    classId: string
    status: string
    message: string | null
    expiresAt: string | null
    createdAt: string
  }
  class: {
    id: string
    name: string
    description: string | null
    avatar: string | null
  } | null
  inviter: {
    id: string
    username: string
    nickname: string | null
    avatar: string | null
  } | null
}

export async function getDirectInviteDetail(
  inviteId: string,
  currentUserId: string
): Promise<DirectInviteDetailResult | { error: string; code: number }> {
  const invite = await prisma.classDirectInvite.findUnique({
    where: { id: inviteId },
  })
  if (!invite) return { error: '邀请不存在', code: 404 }
  if (invite.inviteeId !== currentUserId) {
    return { error: '无权访问此邀请', code: 403 }
  }

  const [classData, inviter] = await Promise.all([
    prisma.class.findUnique({ where: { id: invite.classId } }),
    prisma.user.findUnique({
      where: { id: invite.inviterId },
      select: { id: true, username: true, nickname: true, avatar: true },
    }),
  ])

  return {
    invite: {
      id: invite.id,
      classId: invite.classId,
      status: invite.status,
      message: invite.message,
      expiresAt: invite.expiresAt?.toISOString() || null,
      createdAt: invite.createdAt.toISOString(),
    },
    class: classData
      ? {
          id: classData.id,
          name: classData.name,
          description: classData.description,
          avatar: classData.avatar,
        }
      : null,
    inviter: inviter
      ? {
          id: inviter.id,
          username: inviter.username,
          nickname: inviter.nickname,
          avatar: inviter.avatar,
        }
      : null,
  }
}

export type RespondDirectInviteResult =
  | { ok: true; status: 'accepted' | 'rejected' | 'expired'; classId: string }
  | { ok: false; error: string; code: number }

export async function respondDirectInvite(
  inviteId: string,
  currentUserId: string,
  action: 'accept' | 'reject'
): Promise<RespondDirectInviteResult> {
  const invite = await prisma.classDirectInvite.findUnique({
    where: { id: inviteId },
  })
  if (!invite) return { ok: false, error: '邀请不存在', code: 404 }
  if (invite.inviteeId !== currentUserId) {
    return { ok: false, error: '无权响应此邀请', code: 403 }
  }
  if (invite.status !== 'pending') {
    return { ok: false, error: '该邀请已被处理', code: 400 }
  }

  // 过期
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    await prisma.classDirectInvite.update({
      where: { id: inviteId },
      data: { status: 'expired', respondedAt: new Date() },
    })
    return { ok: false, error: '邀请已过期', code: 400 }
  }

  const newStatus = action === 'accept' ? 'accepted' : 'rejected'

  // 接受邀请时：更新邀请状态 + 建成员需事务保证，避免"已接受但未入班"且 unique 约束阻断重试
  if (action === 'accept') {
    await prisma.$transaction(async (tx) => {
      await tx.classDirectInvite.update({
        where: { id: inviteId },
        data: { status: newStatus, respondedAt: new Date() },
      })
      const existingMember = await tx.classMember.findUnique({
        where: {
          classId_userId: { classId: invite.classId, userId: currentUserId },
        },
      })
      if (!existingMember) {
        await tx.classMember.create({
          data: {
            classId: invite.classId,
            userId: currentUserId,
            role: apiRoleToDb('student'),
            permissions: {
              canViewProblems: true,
              canSubmit: true,
              canViewNotes: true,
              canCreateNotes: false,
              canManageAssignments: false,
              canInviteMembers: false,
              canManageMembers: false,
              canViewStats: false,
            },
            joinedAt: new Date(),
            lastActiveAt: new Date(),
          },
        })
      }
    })
  } else {
    // 拒绝：仅需更新邀请状态，单次写无需事务
    await prisma.classDirectInvite.update({
      where: { id: inviteId },
      data: { status: newStatus, respondedAt: new Date() },
    })
  }

  return { ok: true, status: newStatus, classId: invite.classId }
}

/** 通知邀请人（接受/拒绝结果） */
export async function notifyInviterForDirectInvite(
  inviterId: string,
  invitee: { nickname: string | null; username: string } | null | undefined,
  classData: { name: string } | null,
  classId: string,
  accepted: boolean
) {
  await createNotification({
    userId: inviterId,
    type: 'class_invite_result',
    title: accepted ? '邀请已接受' : '邀请被拒绝',
    content: accepted
      ? `${invitee?.nickname || invitee?.username} 已接受您的班级邀请并加入 "${classData?.name}"`
      : `${invitee?.nickname || invitee?.username} 拒绝了您的班级邀请`,
    link: accepted ? `/classes/${classId}` : null,
  })
}

/* ============================================================================
 * 加入申请
 * ========================================================================== */

export type CreateJoinRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; code: number }

export async function createOrReuseJoinRequest(
  classId: string,
  userId: string,
  message?: string | null
): Promise<CreateJoinRequestResult> {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) return { ok: false, error: '班级不存在', code: 404 }

  const existingMember = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (existingMember) return { ok: false, error: '您已是班级成员', code: 400 }

  const existingRequest = await prisma.classJoinRequest.findUnique({
    where: { classId_userId: { classId, userId } },
  })

  if (existingRequest) {
    if (existingRequest.status === 'pending') {
      return { ok: false, error: '您已提交过申请，请等待审批', code: 400 }
    }
    // 已被处理（approved/rejected）：更新为新申请
    const updated = await prisma.classJoinRequest.update({
      where: { id: existingRequest.id },
      data: {
        status: 'pending',
        message: message || null,
        reviewerId: null,
        reviewedAt: null,
        createdAt: new Date(),
      },
    })
    return { ok: true, requestId: updated.id }
  }

  const created = await prisma.classJoinRequest.create({
    data: {
      classId,
      userId,
      status: 'pending',
      message: message || null,
    },
  })
  return { ok: true, requestId: created.id }
}

/** 通知班级创建人和管理员有新申请 */
export async function notifyAdminsAboutJoinRequest(
  classId: string,
  applicant: { nickname: string | null; username: string } | null | undefined,
  className: string
) {
  const adminMembers = await prisma.classMember.findMany({
    where: { classId, role: { in: ['owner', 'admin', 'assistant'] } },
  })
  const notifications = adminMembers.map((member: any) => ({
    userId: member.userId,
    type: 'class_join_request',
    title: '班级加入申请',
    content: `${applicant?.nickname || applicant?.username} 申请加入班级 "${className}"`,
    link: `/classes/${classId}/requests`,
  }))
  if (notifications.length > 0) {
    await createNotifications(notifications)
  }
}

export async function listClassJoinRequestsDetailed(classId: string) {
  const requests = await prisma.classJoinRequest.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, nickname: true, avatar: true } },
      reviewer: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  })
  return requests.map((r: any) => ({
    id: r.id,
    classId: r.classId,
    applicant: {
      id: r.user.id,
      username: r.user.username,
      nickname: r.user.nickname,
      avatar: r.user.avatar,
    },
    reviewer: r.reviewer
      ? {
          id: r.reviewer.id,
          username: r.reviewer.username,
          nickname: r.reviewer.nickname,
          avatar: r.reviewer.avatar,
        }
      : null,
    status: r.status,
    message: r.message,
    reviewedAt: r.reviewedAt?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
  }))
}

/* ============================================================================
 * 班级统计
 * ========================================================================== */

export interface ClassStatisticsResult {
  members: {
    total: number
    roles: Record<string, number>
  }
  submissions: {
    total: number
    today: number
    thisWeek: number
  }
  problems: {
    totalSolved: number
    averageSolved: number
  }
  activity: {
    last7Days: number
    last30Days: number
  }
  assignments: {
    inProgress: number
    overdue: number
    completed: number
  }
  recentActivity: Array<{
    id: string
    userId: string
    username: string
    avatar: string | null
    problemId: string
    problemTitle: string
    assignmentId: string
    status: string | null
    score: number | null
    language: string | null
    submittedAt: Date
  }>
}

export async function computeClassStatistics(
  classId: string,
  now: Date = new Date()
): Promise<ClassStatisticsResult> {
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [
    memberStats,
    roleCounts,
    submissionStats,
    problemStats,
    activeStats,
    assignmentStats,
    recentSubmissions,
  ] = await Promise.all([
    prisma.classMember.count({ where: { classId } }),
    prisma.classMember.groupBy({ by: ['role'], where: { classId }, _count: true }),
    Promise.all([
      prisma.classAssignmentSubmission.count({ where: { assignment: { classId } } }),
      prisma.classAssignmentSubmission.count({
        where: { assignment: { classId }, submittedAt: { gte: todayStart } },
      }),
      prisma.classAssignmentSubmission.count({
        where: { assignment: { classId }, submittedAt: { gte: weekStart } },
      }),
    ]),
    (async () => {
      const submissions = await prisma.classAssignmentSubmission.findMany({
        where: { assignment: { classId }, status: 'AC' },
        select: { userId: true, problemId: true },
        distinct: ['userId', 'problemId'],
      })
      const totalSolved = new Set(submissions.map((s: any) => `${s.userId}-${s.problemId}`)).size
      const memberCount = await prisma.classMember.count({ where: { classId } })
      return {
        totalSolved,
        averageSolved: memberCount > 0 ? Math.round((totalSolved / memberCount) * 10) / 10 : 0,
      }
    })(),
    Promise.all([
      prisma.classAssignmentSubmission
        .findMany({
          where: { assignment: { classId }, submittedAt: { gte: sevenDaysAgo } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((s: any) => s.length),
      prisma.classAssignmentSubmission
        .findMany({
          where: { assignment: { classId }, submittedAt: { gte: thirtyDaysAgo } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((s: any) => s.length),
    ]),
    (async () => {
      const assignments = await prisma.classAssignment.findMany({
        where: { classId },
        select: { id: true, endTime: true },
      })
      let inProgress = 0
      let overdue = 0
      for (const a of assignments) {
        if (a.endTime && new Date(a.endTime) < now) overdue++
        else inProgress++
      }
      return { inProgress, overdue, completed: 0 }
    })(),
    prisma.classAssignmentSubmission.findMany({
      where: { assignment: { classId } },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    }),
  ])

  const userMap = new Map<
    string,
    { nickname: string | null; username: string; avatar: string | null }
  >()
  const problemMap = new Map<string, string>()
  if (recentSubmissions.length > 0) {
    const userIds = [...new Set(recentSubmissions.map((s: any) => s.userId))]
    const problemIds = [
      ...new Set(recentSubmissions.map((s: any) => s.problemId).filter(Boolean) as string[]),
    ]
    const [users, problems] = await Promise.all([
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, nickname: true, username: true, avatar: true },
          })
        : Promise.resolve([] as any[]),
      problemIds.length > 0
        ? prisma.problem.findMany({
            where: { id: { in: problemIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([] as any[]),
    ])
    users.forEach((u: any) => userMap.set(u.id, u))
    problems.forEach((p: any) => problemMap.set(p.id, p.title))
  }

  const roleBreakdown: Record<string, number> = {}
  for (const role of roleCounts) {
    roleBreakdown[role.role] = role._count
  }

  return {
    members: { total: memberStats, roles: roleBreakdown },
    submissions: {
      total: submissionStats[0],
      today: submissionStats[1],
      thisWeek: submissionStats[2],
    },
    problems: {
      totalSolved: problemStats.totalSolved,
      averageSolved: problemStats.averageSolved,
    },
    activity: { last7Days: activeStats[0], last30Days: activeStats[1] },
    assignments: {
      inProgress: assignmentStats.inProgress,
      overdue: assignmentStats.overdue,
      completed: assignmentStats.completed,
    },
    recentActivity: recentSubmissions.map((sub: any) => {
      const u = userMap.get(sub.userId)
      return {
        id: sub.id,
        userId: sub.userId,
        username: u?.nickname || u?.username || '未知用户',
        avatar: u?.avatar || null,
        problemId: sub.problemId,
        problemTitle: problemMap.get(sub.problemId) || '未知题目',
        assignmentId: sub.assignmentId,
        status: sub.status,
        score: sub.score,
        language: sub.language,
        submittedAt: sub.submittedAt,
      }
    }),
  }
}

/** 检查当前用户对班级有访问权（公开直接通过，私有需是成员） */
export async function ensureClassAccessible(
  classId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; code: number; error: string }> {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) return { ok: false, code: 404, error: '班级不存在' }
  if (classData.isPublic) return { ok: true }
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!member) {
    return { ok: false, code: 403, error: '私有班级，只有受邀成员可访问' }
  }
  return { ok: true }
}

/* ============================================================================
 * 权限检查 helper（业务层使用）
 * ========================================================================== */

/** 检查用户是否班级管理员（兼容 DB / API 角色值） */
export function isClassAdminRole(dbRole: string | undefined | null) {
  return isClassAdminApiRole(dbRole)
}

/** 检查当前用户是否可管理目标成员（owner 可管所有；assistant 不能管 owner 和 assistant） */
export function canManageMember(
  operatorRole: string | null | undefined,
  targetRole: string | null | undefined
) {
  const op = normalizeClassRoleToApi(operatorRole)
  const tgt = normalizeClassRoleToApi(targetRole)
  if (op === 'owner') return tgt !== 'owner'
  if (op === 'assistant') return tgt === 'student'
  return false
}

/* ============================================================================
 * 班级作业详情视图 / 更新 / 删除（原 /api/classes/[id]/assignments/[assignmentId]）
 * ========================================================================== */

import { ApiError } from '@/lib/api/withApi'

/** 班级作业详情视图：题目 + 成员完成进度 + 当前用户提交 + 题目统计 */
export async function buildClassAssignmentDetail(
  classId: string,
  assignmentId: string,
  viewerUserId: string,
  viewerRole: string
) {
  const detail = await getClassAssignmentDetail(classId, assignmentId)
  if (!detail) return null
  const { assignment, members, submissions } = detail

  const problemsRaw = await prisma.problem.findMany({
    where: { id: { in: assignment.problemIds } },
    select: {
      id: true,
      title: true,
      problemNumber: true,
      difficulty: true,
      tags: true,
      totalSubmit: true,
      totalAccepted: true,
    },
  })
  const problemById = new Map(problemsRaw.map((p) => [p.id, p]))
  const problems = assignment.problemIds
    .map((id) => problemById.get(id))
    .filter(Boolean) as typeof problemsRaw

  // 成员完成情况
  const memberProgress: any[] = members
    .map((m: any) => {
      const us = submissions.filter((s: any) => s.userId === m.userId)
      if (us.length === 0) return null
      const solved = new Set(us.filter((s: any) => s.status === 'AC').map((s: any) => s.problemId))
      return {
        userId: m.userId,
        username: m.user.username,
        nickname: m.user.nickname,
        avatar: m.user.avatar,
        role: normalizeClassRoleToApi(m.role),
        progress: {
          solved: solved.size,
          total: assignment.problemIds.length,
          percentage:
            assignment.problemIds.length > 0
              ? Math.round((solved.size / assignment.problemIds.length) * 100)
              : 0,
        },
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.progress.solved - a.progress.solved)

  const userSubmissions = submissions.filter((s: any) => s.userId === viewerUserId)
  const viewerIsClassAdmin = isClassAdminApiRole(viewerRole)
  const viewerIsSiteAdmin = await getUserIsAdmin(viewerUserId)
  const canViewAllSubmissions = viewerIsClassAdmin || viewerIsSiteAdmin
  const allSubmissions = canViewAllSubmissions
    ? submissions.map((s: any) => ({
        id: s.id,
        userId: s.userId,
        problemId: s.problemId,
        status: s.status,
        score: s.score || 0,
        submittedAt: s.submittedAt,
      }))
    : []

  // 题目统计
  const problemStats: Record<
    string,
    { submitCount: number; acceptedCount: number; acceptedUsers: Set<string> }
  > = {}
  assignment.problemIds.forEach((problemId: string) => {
    const ps = submissions.filter((s: any) => s.problemId === problemId)
    const accepted: Set<string> = new Set(
      ps.filter((s: any) => s.status === 'AC').map((s: any) => s.userId as string)
    )
    problemStats[problemId] = {
      submitCount: ps.length,
      acceptedCount: accepted.size,
      acceptedUsers: accepted,
    }
  })

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      deadline: assignment.endTime,
      problems: problems.map((p: any) => ({
        id: p.id,
        title: p.title,
        problemNumber: p.problemNumber || '',
        difficulty: p.difficulty,
        totalSubmit: problemStats[p.id]?.submitCount || 0,
        totalAccepted: problemStats[p.id]?.acceptedCount || 0,
      })),
      classId: assignment.classId,
      memberProgress,
      createdAt: assignment.createdAt,
      createdBy: assignment.createdBy,
    },
    submissions: userSubmissions.map((s: any) => ({
      id: s.id,
      problemId: s.problemId,
      status: s.status,
      score: s.score || 0,
      submittedAt: s.submittedAt,
    })),
    allSubmissions,
  }
}

/** 班级管理员更新作业：含校验、默认值补全、写入 */
export async function updateClassAssignment(
  classId: string,
  assignmentId: string,
  body: {
    title?: string
    description?: string
    startTime?: string | Date
    endTime?: string | Date
    deadline?: string | Date
    problemIds?: string[]
  }
) {
  const finalEndTime = body.endTime || body.deadline
  if (!body.title || !body.problemIds || body.problemIds.length === 0) {
    throw new ApiError('MISSING_FIELDS', '请填写完整的作业信息', 400)
  }
  const existing = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
  if (!existing) {
    throw new ApiError('NOT_FOUND', '作业不存在', 404)
  }
  const valid = await validateAssignmentProblems(body.problemIds)
  if (!valid) {
    throw new ApiError('INVALID_PROBLEMS', '部分题目不存在或未公开', 400)
  }

  const finalStartTime = body.startTime
    ? new Date(body.startTime)
    : existing.startTime || undefined
  const finalEndDate = finalEndTime ? new Date(finalEndTime) : existing.endTime || undefined

  const { updateClassAssignmentDirect } = await import('@/lib/mongodb-direct')
  await updateClassAssignmentDirect(assignmentId, {
    title: body.title,
    description: body.description || '',
    startTime: finalStartTime,
    endTime: finalEndDate,
    problemIds: body.problemIds,
  })
  return { id: assignmentId }
}

/** 班级管理员删除作业：先校验存在，再删除 */
export async function deleteClassAssignment(classId: string, assignmentId: string) {
  const assignment = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
  if (!assignment) {
    throw new ApiError('NOT_FOUND', '作业不存在', 404)
  }
  const { deleteClassAssignmentDirect } = await import('@/lib/mongodb-direct')
  await deleteClassAssignmentDirect(assignmentId)
  return { message: '作业删除成功' }
}

/* ============================================================================
 * 班级加入申请处理：批准 / 拒绝（原 /api/classes/[id]/requests/[requestId]）
 * ========================================================================== */

export interface DecideJoinRequestInput {
  classId: string
  requestId: string
  action: 'approve' | 'reject'
  operatorUserId: string
  operatorRole: string
}

/**
 * 校验班级加入申请：班级存在性、申请存在性、操作者权限（owner / admin）
 */
export async function decideClassJoinRequest(input: DecideJoinRequestInput) {
  const classRecord = await prisma.class.findUnique({ where: { id: input.classId } })
  if (!classRecord) throw new ApiError('NOT_FOUND', '班级不存在', 404)

  if (input.operatorRole !== 'owner' && input.operatorRole !== 'assistant') {
    throw new ApiError('FORBIDDEN', '无权处理加入申请', 403)
  }

  const request = await prisma.classJoinRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!request) throw new ApiError('NOT_FOUND', '申请不存在', 404)
  if (request.classId !== input.classId) {
    throw new ApiError('BAD_REQUEST', '申请与班级不匹配', 400)
  }
  if (request.status !== 'pending') {
    throw new ApiError('ALREADY_PROCESSED', `该申请已被${request.status === 'approved' ? '批准' : '拒绝'}`, 400)
  }
  if (input.action === 'approve') {
    // 检查班级容量
    if (classRecord.maxMembers > 0) {
      const currentCount = await prisma.classMember.count({ where: { classId: input.classId } })
      if (currentCount >= classRecord.maxMembers) {
        throw new ApiError('CLASS_FULL', '班级已满员', 400)
      }
    }
    // 检查是否已存在成员
    const existing = await prisma.classMember.findUnique({
      where: { classId_userId: { classId: input.classId, userId: request.userId } },
    })
    if (existing) {
      // 已经存在成员，仅更新申请状态
      await prisma.classJoinRequest.update({
        where: { id: input.requestId },
        data: { status: 'approved' },
      })
      return { message: '该用户已是班级成员' }
    }
    // 创建成员 + 更新申请
    await prisma.$transaction([
      prisma.classMember.create({
        data: { classId: input.classId, userId: request.userId, role: apiRoleToDb('student') },
      }),
      prisma.classJoinRequest.update({
        where: { id: input.requestId },
        data: { status: 'approved' },
      }),
    ])
    return { message: '已批准加入申请' }
  }

  // 拒绝
  await prisma.classJoinRequest.update({
    where: { id: input.requestId },
    data: { status: 'rejected' },
  })
  return { message: '已拒绝加入申请' }
}

/**
 * 申请者撤销自己提交的加入申请
 */
export async function cancelClassJoinRequest(
  classId: string,
  requestId: string,
  userId: string
) {
  const request = await prisma.classJoinRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new ApiError('NOT_FOUND', '申请不存在', 404)
  if (request.classId !== classId) {
    throw new ApiError('BAD_REQUEST', '申请与班级不匹配', 400)
  }
  if (request.userId !== userId) {
    throw new ApiError('FORBIDDEN', '只能撤销自己的申请', 403)
  }
  if (request.status !== 'pending') {
    throw new ApiError('ALREADY_PROCESSED', '该申请已处理，无法撤销', 400)
  }
  await prisma.classJoinRequest.delete({ where: { id: requestId } })
  return { message: '已撤销申请' }
}

/* ============================================================================
 * 管理员班级管理（原 /api/admin/classes*）
 * ========================================================================== */

/** 管理员列出所有班级（带成员/作业/笔记计数 + owner 用户名） */
export async function listAllClassesForAdmin(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page
  const pageSize = opts?.pageSize
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  // 未传分页参数时加 take 上限防 OOM；传入参数时按 page/pageSize 分页
  const take = usePaging ? (pageSize as number) : 500
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0
  const classes = await prisma.class.findMany({
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { members: true, assignments: true, notes: true } },
    },
  })
  const ownerIds = [...new Set(classes.map((t: any) => t.ownerId))]
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, username: true },
      })
    : []
  const ownerMap = new Map<any, any>(owners.map((o: any) => [o.id, o.username]))
  return classes.map((classData: any) => ({
    ...classData,
    owner: { username: ownerMap.get(classData.ownerId) || '未知用户' },
  }))
}

/** 管理员切换班级可见性（公开/私有） */
export async function adminUpdateClassVisibility(classId: string, isPublic: boolean | undefined) {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) {
    throw new ApiError('NOT_FOUND', '班级不存在', 404)
  }
  await prisma.class.update({ where: { id: classId }, data: { isPublic } })
  return isPublic ? '班级已设为公开' : '班级已设为私有'
}

/** 管理员删除班级 */
export async function adminDeleteClass(classId: string) {
  await prisma.class.delete({ where: { id: classId } })
  return '班级已删除'
}
