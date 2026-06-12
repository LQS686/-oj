import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getUserFromRequest(request)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const { id: classId } = await params

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId }
    })

    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    if (!classData.isPublic) {
      const member = await prisma.classMember.findUnique({
        where: {
          classId_userId: {
            classId,
            userId: auth.userId
          }
        }
      })

      if (!member) {
        return NextResponse.json(
          { success: false, error: '私有班级，只有受邀成员可访问' },
          { status: 403 }
        )
      }
    }

    const now = new Date()
    const todayStart = new Date(now.setHours(0, 0, 0, 0))
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
      recentSubmissions
    ] = await Promise.all([
      prisma.classMember.count({ where: { classId } }),
      prisma.classMember.groupBy({
        by: ['role'],
        where: { classId },
        _count: true
      }),
      Promise.all([
        prisma.classAssignmentSubmission.count({
          where: { assignment: { classId } }
        }),
        prisma.classAssignmentSubmission.count({
          where: {
            assignment: { classId },
            submittedAt: { gte: todayStart }
          }
        }),
        prisma.classAssignmentSubmission.count({
          where: {
            assignment: { classId },
            submittedAt: { gte: weekStart }
          }
        })
      ]),
      (async () => {
        const submissions = await prisma.classAssignmentSubmission.findMany({
          where: {
            assignment: { classId },
            status: 'AC'
          },
          select: { userId: true, problemId: true },
          distinct: ['userId', 'problemId']
        })
        const totalSolved = new Set(submissions.map(s => `${s.userId}-${s.problemId}`)).size
        const memberCount = await prisma.classMember.count({ where: { classId } })
        return {
          totalSolved,
          averageSolved: memberCount > 0 ? Math.round((totalSolved / memberCount) * 10) / 10 : 0
        }
      })(),
      Promise.all([
        prisma.classAssignmentSubmission.findMany({
          where: {
            assignment: { classId },
            submittedAt: { gte: sevenDaysAgo }
          },
          select: { userId: true },
          distinct: ['userId']
        }).then(s => s.length),
        prisma.classAssignmentSubmission.findMany({
          where: {
            assignment: { classId },
            submittedAt: { gte: thirtyDaysAgo }
          },
          select: { userId: true },
          distinct: ['userId']
        }).then(s => s.length)
      ]),
      (async () => {
        const assignments = await prisma.classAssignment.findMany({
          where: { classId },
          select: {
            id: true,
            endTime: true,
          }
        })

        let inProgress = 0
        let overdue = 0

        for (const a of assignments) {
          if (a.endTime && new Date(a.endTime) < now) {
            overdue++
          } else {
            inProgress++
          }
        }

        return { inProgress, overdue, completed: 0 }
      })(),
      prisma.classAssignmentSubmission.findMany({
        where: { assignment: { classId } },
        orderBy: { submittedAt: 'desc' },
        take: 10
      })
    ])

    const userMap = new Map<string, { nickname: string | null; username: string; avatar: string | null }>()
    const problemMap = new Map<string, string>()
    if (recentSubmissions.length > 0) {
      const userIds = [...new Set(recentSubmissions.map(s => s.userId))]
      const problemIds = [...new Set(recentSubmissions.map(s => s.problemId).filter(Boolean))]
      const [users, problems] = await Promise.all(
        userIds.length > 0 ? [
          prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, username: true, avatar: true } }),
          problemIds.length > 0 ? prisma.problem.findMany({ where: { id: { in: problemIds } }, select: { id: true, title: true } }) : Promise.resolve([])
        ] : [Promise.resolve([]), Promise.resolve([])]
      )
      users.forEach(u => userMap.set(u.id, u))
      problems.forEach(p => problemMap.set(p.id, p.title))
    }

    const roleBreakdown: Record<string, number> = {}
    for (const role of roleCounts) {
      roleBreakdown[role.role] = role._count
    }

    return NextResponse.json({
      success: true,
      data: {
        members: {
          total: memberStats,
          roles: roleBreakdown
        },
        submissions: {
          total: submissionStats[0],
          today: submissionStats[1],
          thisWeek: submissionStats[2]
        },
        problems: {
          totalSolved: problemStats.totalSolved,
          averageSolved: problemStats.averageSolved
        },
        activity: {
          last7Days: activeStats[0],
          last30Days: activeStats[1]
        },
        assignments: {
          inProgress: assignmentStats.inProgress,
          overdue: assignmentStats.overdue,
          completed: assignmentStats.completed
        },
        recentActivity: recentSubmissions.map(sub => {
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
            submittedAt: sub.submittedAt
          }
        })
      }
    })
  } catch (error) {
    console.error('获取班级统计失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
