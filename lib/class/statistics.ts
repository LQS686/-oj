/**
 * lib/class/statistics.ts
 * 班级统计 + 访问检查
 */

import { prisma } from '@/lib/prisma'

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
