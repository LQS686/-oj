/**
 * lib/class/service.ts
 * 班级业务层（CRUD / 成员 / 邀请 / 笔记 / 作业 / 邀请 / 商品）
 */

import { prisma } from '@/lib/prisma'
import { addJudgeJob } from '@/lib/judge/queue'
import {
  createClassAssignmentSubmissionDirect,
  createSubmissionDirect,
  incrementProblemSubmitCount,
  updateClassAssignmentSubmissionDirect,
  updateSubmissionDirect,
} from '@/lib/mongodb-direct'
import { createNotification } from '@/lib/notifications'

/* ============================================================================
 * 班级 CRUD
 * ========================================================================== */

export interface ClassDetailResult {
  id: string
  name: string
  description: string | null
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
    assignmentCount: number
    noteCount: number
  }
}

export async function getClassDetail(classId: string): Promise<ClassDetailResult | null> {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) return null

  const [members, memberCount, assignmentCount, noteCount] = await Promise.all([
    prisma.classMember.findMany({
      where: { classId },
      include: {
        user: { select: { username: true, nickname: true, avatar: true } },
      },
    }),
    prisma.classMember.count({ where: { classId } }),
    prisma.classAssignment.count({ where: { classId } }),
    prisma.classNote.count({ where: { classId } }),
  ])

  return {
    id: classData.id,
    name: classData.name,
    description: classData.description,
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
      avatar: m.user.avatar,
      role: m.role,
      permissions: (m.permissions || {}) as Record<string, any>,
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt,
    })),
    stats: { memberCount, assignmentCount, noteCount },
  }
}

export interface ClassUpdateInput {
  name?: string
  description?: string | null
  avatar?: string | null
  isPublic?: boolean
  maxMembers?: number
}

export async function updateClass(classId: string, data: ClassUpdateInput) {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name.trim()
  if (data.description !== undefined) updateData.description = data.description
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
  description?: string
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
      include: { _count: { select: { members: true } } },
    }),
    prisma.class.count({ where }),
  ])

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
      description: input.description || '',
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

/** 更新成员角色 / 备注 */
export async function patchClassMember(
  classId: string,
  userId: string,
  data: { remark?: string; role?: 'student' | 'assistant' | 'owner' }
) {
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data,
  })
}

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
  const merged = { ...((current.permissions as any) || {}), ...permissions }
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: { permissions: merged },
  })
}

/** 获取成员活动概况（提交 / 笔记 / 积分） */
export async function getClassMemberActivity(classId: string, memberId: string) {
  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: memberId } },
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })
  if (!target) return null

  const [submissions, notes, points] = await Promise.all([
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
    prisma.pointsHistory.findMany({
      where: { classId, userId: memberId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const [totalSubmissions, acCount, totalNotes, account] = await Promise.all([
    prisma.classAssignmentSubmission.count({
      where: { assignment: { classId }, userId: memberId },
    }),
    prisma.classAssignmentSubmission.count({
      where: { assignment: { classId }, userId: memberId, status: 'AC' },
    }),
    prisma.classNote.count({ where: { classId, authorId: memberId } }),
    prisma.pointsAccount.findUnique({
      where: { classId_userId: { classId, userId: memberId } },
      select: { total: true },
    }),
  ])

  const recentActivities = [
    ...submissions.map((s) => ({
      type: 'submission',
      title: `提交了作业 "${s.assignment.title}"`,
      status: s.status,
      score: s.score,
      createdAt: s.submittedAt,
    })),
    ...notes.map((n) => ({
      type: 'note',
      title: `发布了笔记 "${n.title}"`,
      status: 'published',
      createdAt: n.createdAt,
    })),
    ...points.map((p) => ({
      type: 'points',
      title: `获得了 ${p.amount} 积分: ${p.reason}`,
      status: 'earned',
      createdAt: p.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
      totalPoints: account?.total || 0,
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
    new Set(assignments.map((a) => a.createdBy).filter(Boolean) as string[])
  )
  let creatorMap = new Map<string, string>()
  if (creatorIds.length) {
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, nickname: true, username: true },
    })
    creatorMap = new Map(creators.map((u) => [u.id, u.nickname || u.username || '']))
  }

  // 拉取所有作业的提交（一次查询）
  const assignmentIds = assignments.map((a) => a.id)
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

  const items = assignments.map((a) => {
    const submissions = submissionsByAssignment.get(a.id) || []
    const problemIds = a.problemIds || []
    const problemCount = problemIds.length

    const memberProblemScores = new Map<string, Map<string, number>>()
    submissions.forEach((sub) => {
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
  members.forEach((m) => memberCompletionMap.set(m.userId, new Set()))

  submissions.forEach((sub) => {
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
      const ms = submissions.filter((s) => s.userId === userId)
      const totalScore = ms.reduce((sum, s) => {
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
  const problemMap = new Map(problems.map((p) => [p.id, p]))
  const problemStats = assignment.problemIds.map((problemId) => {
    const info = problemMap.get(problemId)
    const ps = submissions.filter((s) => s.problemId === problemId)
    const acs = ps.filter((s) => s.status === 'AC')
    const uniqueUsers = new Set(ps.map((s) => s.userId))
    const acUsers = new Set(acs.map((s) => s.userId))
    const totalScore = ps.reduce((sum, s) => {
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
  const memberStats = members.map((m) => {
    const userId = m.userId
    const us = submissions.filter((s) => s.userId === userId)
    const solved = memberCompletionMap.get(userId) || new Set()
    const totalUserScore = us.reduce((sum, s) => {
      const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
      return sum + (isLate ? 0 : s.score || 0)
    }, 0)
    const avgUserScore = us.length > 0 ? totalUserScore / us.length : 0
    const accuracy = totalProblems > 0 ? (solved.size / totalProblems) * 100 : 0
    const lateSubmissions = us.filter((s) => {
      return s.isLate || (deadline ? s.submittedAt > deadline : false)
    }).length

    const problemScores: { [k: string]: number | string } = {}
    const problemStatuses: { [k: string]: string } = {}
    assignment.problemIds.forEach((problemId) => {
      const ps = us.filter((s) => s.problemId === problemId)
      if (ps.length > 0) {
        const valid = ps.map((s) => {
          const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
          return { score: isLate ? 0 : s.score || 0, status: s.status, isLate }
        })
        const max = valid.reduce((m, c) => (c.score > m.score ? c : m))
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

  memberStats.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    if (b.solved !== a.solved) return b.solved - a.solved
    return b.avgScore - a.avgScore
  })

  // 提交趋势
  const trendMap = new Map<string, { date: string; count: number; acCount: number }>()
  submissions.forEach((s) => {
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
  const userIds = Array.from(new Set(submissions.map((s) => s.userId)))
  const problemIds = Array.from(new Set(submissions.map((s) => s.problemId)))
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
  const userMap = new Map(users.map((u) => [u.id, u]))
  const problemMap = new Map(problems.map((p) => [p.id, p]))

  const items = submissions.map((s) => {
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

  const submission = await createSubmissionDirect({
    problemId: input.problemId,
    userId: input.userId,
    code: input.code,
    language: input.language,
    status: 'Pending',
    totalTests: problem.testCases.length,
    assignmentSubmissionId: assignmentSubmission.id,
  })

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
      testCases: problem.testCases.map((tc) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        score: tc.score,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
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
  assignment.problemIds.forEach((problemId) => {
    const ps = submissions.filter((s) => s.problemId === problemId)
    if (ps.length > 0) {
      const maxScore = Math.max(...ps.map((s) => s.score || 0))
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
    problems: problems.map((p) => ({
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
  const problemNumber = `T${Date.now().toString().slice(-6)}${Math.floor(
    Math.random() * 100
  )}`
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
        create: source.testCases.map((tc, idx) => ({
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
  const problemNumber = `T${Date.now().toString().slice(-6)}${Math.floor(
    Math.random() * 100
  )}`
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
    notes: notes.map((n) => ({
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
 * 班级邀请码 / 直接邀请
 * ========================================================================== */

export async function listClassInvitesWithCreators(classId: string) {
  const invites = await prisma.classInvite.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
  })
  const userIds = Array.from(new Set(invites.map((i) => i.createdBy)))
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return invites.map((invite) => {
    const creator = userMap.get(invite.createdBy)
    const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date()
    const isExhausted = invite.maxUses !== -1 && invite.usedCount >= invite.maxUses
    return {
      id: invite.id,
      code: invite.code,
      maxUses: invite.maxUses,
      usedCount: invite.usedCount,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      creator: {
        id: creator?.id,
        username: creator?.username,
        nickname: creator?.nickname,
      },
      status: isExpired ? 'expired' : isExhausted ? 'exhausted' : 'active',
      inviteLink: `${
        process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      }/classes/join?code=${invite.code}`,
    }
  })
}

export async function getClassInviteSimple(classId: string, inviteId: string) {
  return prisma.classInvite.findUnique({ where: { id: inviteId, classId } })
}

export async function deleteClassInviteSimple(inviteId: string) {
  return prisma.classInvite.delete({ where: { id: inviteId } })
}

export async function createClassInviteCodeUnique(
  classId: string,
  createdBy: string,
  maxUses: number,
  expiresAt: Date | null
) {
  // 生成唯一的 8 位邀请码
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let attempt = 0; attempt < 20; attempt++) {
    code = ''
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const exists = await prisma.classInvite.findUnique({ where: { code } })
    if (!exists) break
  }
  return prisma.classInvite.create({
    data: {
      classId,
      code,
      createdBy,
      maxUses,
      usedCount: 0,
      expiresAt,
    },
  })
}

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
 * 加入班级（通过邀请码）
 * ========================================================================== */

export interface JoinClassResult {
  ok: boolean
  code?: number
  reason?: string
  classId?: string
  className?: string
}

export async function joinClassByCode(
  code: string,
  userId: string
): Promise<JoinClassResult> {
  const invite = await prisma.classInvite.findUnique({ where: { code } })
  if (!invite) return { ok: false, code: 404, reason: '邀请码不存在或已失效' }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { ok: false, code: 400, reason: '邀请码已过期' }
  }
  if (invite.maxUses !== -1 && invite.usedCount >= invite.maxUses) {
    return { ok: false, code: 400, reason: '邀请码使用次数已达上限' }
  }

  const classId = invite.classId

  const existingMember = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (existingMember) return { ok: false, code: 400, reason: '您已经是班级成员' }

  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) return { ok: false, code: 404, reason: '班级不存在' }

  const memberCount = await prisma.classMember.count({ where: { classId } })
  if (memberCount >= classData.maxMembers) {
    return { ok: false, code: 400, reason: '班级人数已达上限' }
  }

  // 乐观更新 usedCount
  const now = new Date()
  const maxUsesCondition =
    invite.maxUses === -1 ? { usedCount: { lt: 999999 } } : { usedCount: { lt: invite.maxUses } }
  const updatedInvite = await prisma.classInvite.updateMany({
    where: {
      id: invite.id,
      ...maxUsesCondition,
      ...(invite.expiresAt ? { expiresAt: { gt: now } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  })
  if (updatedInvite.count === 0) {
    return { ok: false, code: 400, reason: '邀请码已失效或使用次数已达上限' }
  }

  try {
    await prisma.classMember.create({
      data: {
        classId,
        userId,
        role: 'student',
        permissions: {
          canViewProblems: true,
          canSubmit: true,
          canViewNotes: true,
          canCreateNotes: false,
          canManageAssignments: false,
          canInviteMembers: false,
        },
        joinedAt: new Date(),
        lastActiveAt: new Date(),
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      await prisma.classInvite.update({
        where: { id: invite.id },
        data: { usedCount: { decrement: 1 } },
      })
      return { ok: false, code: 400, reason: '您已经是班级成员' }
    }
    throw err
  }

  return { ok: true, classId, className: classData.name }
}

/* ============================================================================
 * 权限检查 helper（业务层使用）
 * ========================================================================== */

/** 检查用户是否班级管理员 */
export function isClassAdminRole(dbRole: string | undefined | null) {
  return dbRole === 'owner' || dbRole === 'admin'
}

/** 检查当前用户是否可管理目标成员（owner / assistant 但 assistant 不能动 assistant） */
export function canManageMember(
  operatorRole: string | null | undefined,
  targetRole: string | null | undefined
) {
  if (!operatorRole) return false
  if (operatorRole === 'owner') return targetRole !== 'owner'
  if (operatorRole === 'admin') return targetRole !== 'owner' && targetRole !== 'admin'
  return false
}
