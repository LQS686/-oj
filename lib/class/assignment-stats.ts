/**
 * lib/class/assignment-stats.ts
 * 班级作业：列表 / 详情 / 统计 / 提交列表 / 个人进度（只读）
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isAcceptedStatus, SubmissionStatus } from '@/lib/constants/submission-status'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

/** 统计/列表默认排除已从作业移除的提交 */
const ACTIVE_SUBMISSION_WHERE = { status: { not: SubmissionStatus.REMOVED } }

/* ============================================================================
 * 班级作业（增强 service：列表统计 / 创建 / 详情 / 统计 / 提交 / 进度）
 * ========================================================================== */

export type AssignmentStatus = 'upcoming' | 'active' | 'ended'

/**
 * 根据作业的 startTime / endTime 推断当前状态。
 *  - 无 startTime：视为已开始
 *  - 无 endTime：视为永不结束
 */
export function getAssignmentStatus(
  startTime: Date | null | undefined,
  endTime: Date | null | undefined
): AssignmentStatus {
  const now = new Date()
  if (startTime && new Date(startTime) > now) return 'upcoming'
  if (endTime && new Date(endTime) < now) return 'ended'
  return 'active'
}

export interface ListClassAssignmentsFilter {
  page?: number
  pageSize?: number
  status?: 'upcoming' | 'active' | 'ended'
}

export async function listClassAssignmentsWithStats(
  classId: string,
  filter: ListClassAssignmentsFilter = {}
) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const where: Prisma.ClassAssignmentWhereInput = { classId }
  const now = new Date()
  if (filter.status === 'upcoming') {
    where.startTime = { gt: now }
  } else if (filter.status === 'active') {
    // 已开始且未结束：无 startTime 视为已开始；无 endTime 视为永不结束
    where.AND = [
      { OR: [{ startTime: { lte: now } }, { startTime: null }, { startTime: { isSet: false } }] },
      { OR: [{ endTime: { gte: now } }, { endTime: null }, { endTime: { isSet: false } }] },
    ]
  } else if (filter.status === 'ended') {
    where.endTime = { lt: now }
  }

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
          where: { assignmentId: { in: assignmentIds }, ...ACTIVE_SUBMISSION_WHERE },
          // C-P2-14：统计仅需 assignmentId/userId/problemId/status 四个字段，避免拉取 code 等大字段
          select: {
            id: true,
            assignmentId: true,
            userId: true,
            problemId: true,
            status: true,
          },
          // C-P2-14：take 上限防超大班级提交量拖垮内存（单页作业数有限，10000 已足够）
          take: 10000,
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

    const memberSolvedProblems = new Map<string, Set<string>>()
    submissions.forEach((sub) => {
      if (!isAcceptedStatus(sub.status)) return
      let solved = memberSolvedProblems.get(sub.userId)
      if (!solved) {
        solved = new Set()
        memberSolvedProblems.set(sub.userId, solved)
      }
      solved.add(sub.problemId)
    })

    let completedMembersCount = 0
    let totalCompletedProblems = 0
    memberSolvedProblems.forEach((solved) => {
      totalCompletedProblems += solved.size
      if (problemCount > 0 && solved.size >= problemCount) {
        completedMembersCount += 1
      }
    })

    const totalProblems = memberCount * problemCount
    const completionRate =
      totalProblems > 0 ? Math.round((totalCompletedProblems / totalProblems) * 100) : 0

    return {
      id: a.id,
      title: a.title,
      description: a.description,
      startTime: a.startTime,
      endTime: a.endTime,
      problemCount,
      stats: {
        totalMembers: memberCount,
        /** 完成全部题目的成员数 */
        completedMembers: completedMembersCount,
        /** 全体成员已完成的「成员×题目」实例总数（用于 completionRate） */
        completedProblemInstances: totalCompletedProblems,
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
    prisma.classAssignmentSubmission.findMany({
      where: { assignmentId, ...ACTIVE_SUBMISSION_WHERE },
    }),
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
    prisma.classAssignmentSubmission.findMany({
      where: { assignmentId, ...ACTIVE_SUBMISSION_WHERE },
    }),
    prisma.problem.findMany({
      where: { id: { in: assignment.problemIds } },
    }),
  ])

  const totalMembers = members.length
  const totalProblems = assignment.problemIds.length

  // C-P2-23：按 userId 分组提交为 Map，成员循环 O(1) 查 Map，避免 O(成员×提交) 双重循环
  const submissionsByUser = new Map<string, typeof submissions>()
  for (const s of submissions) {
    const list = submissionsByUser.get(s.userId)
    if (list) list.push(s)
    else submissionsByUser.set(s.userId, [s])
  }

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

  // 平均分 / 正确率：按「每题最高分」汇总（逾期记 0）
  const memberScores = Array.from(memberCompletionMap.entries()).map(
    ([userId, solvedSet]) => {
      const ms = submissionsByUser.get(userId) || []
      const bestByProblem = new Map<string, number>()
      for (const s of ms) {
        const score = s.isLate ? 0 : s.score || 0
        bestByProblem.set(s.problemId, Math.max(bestByProblem.get(s.problemId) || 0, score))
      }
      const totalScore = Array.from(bestByProblem.values()).reduce((a, b) => a + b, 0)
      const avgScore = totalProblems > 0 ? totalScore / totalProblems : 0
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
    const totalScore = (() => {
      const best = new Map<string, number>()
      for (const s of ps) {
        const score = s.isLate ? 0 : s.score || 0
        best.set(s.userId, Math.max(best.get(s.userId) || 0, score))
      }
      // 按提交用户取该题最高分后再平均
      const vals = Array.from(best.values())
      return vals.reduce((a, b) => a + b, 0)
    })()
    const avgProblemScore = uniqueUsers.size > 0 ? totalScore / uniqueUsers.size : 0
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
    const us = submissionsByUser.get(userId) || []
    const solved = memberCompletionMap.get(userId) || new Set()
    const bestByProblem = new Map<string, number>()
    for (const s of us) {
      const score = s.isLate ? 0 : s.score || 0
      bestByProblem.set(s.problemId, Math.max(bestByProblem.get(s.problemId) || 0, score))
    }
    const totalUserScore = Array.from(bestByProblem.values()).reduce((a, b) => a + b, 0)
    const avgUserScore = totalProblems > 0 ? totalUserScore / totalProblems : 0
    const accuracy = totalProblems > 0 ? (solved.size / totalProblems) * 100 : 0
    const lateSubmissions = us.filter((s) => {
      return s.isLate || false
    }).length

    const problemScores: { [k: string]: number | string } = {}
    const problemStatuses: { [k: string]: string } = {}
    assignment.problemIds.forEach((problemId) => {
      const ps = us.filter((s) => s.problemId === problemId)
      if (ps.length > 0) {
        const valid = ps.map((s) => {
          const isLate = s.isLate || false
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
      avatar: sanitizeAvatarUrl(m.user.avatar),
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
    const _d = new Date(s.submittedAt)
    const date = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
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
  const where: Prisma.ClassAssignmentSubmissionWhereInput = { assignmentId }
  if (filter.userId) where.userId = filter.userId
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.status) where.status = filter.status
  else where.status = { not: SubmissionStatus.REMOVED }

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
      : Promise.resolve([] as never[]),
    problemIds.length
      ? prisma.problem.findMany({
          where: { id: { in: problemIds } },
          select: { id: true, title: true, problemNumber: true },
        })
      : Promise.resolve([] as never[]),
  ])
  const userMap = new Map(users.map((u) => [u.id, u]))
  const problemMap = new Map(problems.map((p) => [p.id, p]))

  const casIds = submissions.map((s) => s.id as string)
  const linkedMain =
    casIds.length > 0
      ? await prisma.submission.findMany({
          where: { assignmentSubmissionId: { in: casIds } },
          select: { id: true, assignmentSubmissionId: true },
        })
      : []
  const mainIdByCas = new Map(
    linkedMain
      .filter((s) => s.assignmentSubmissionId)
      .map((s) => [s.assignmentSubmissionId as string, s.id])
  )

  const items = submissions
    .map((s) => {
      const mainId = mainIdByCas.get(s.id)
      if (!mainId) return null
      const u = userMap.get(s.userId)
      const p = problemMap.get(s.problemId)
      return {
        id: mainId,
        assignmentSubmissionId: s.id,
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
        timeElapsedMs: s.timeElapsedMs || 0,
        isFirstAc: s.isFirstAc || false,
      }
    })
    .filter(Boolean)

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
    where: { assignmentId, userId, ...ACTIVE_SUBMISSION_WHERE },
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
