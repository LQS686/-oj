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

    const { id: teamId } = await params

    if (!isValidObjectId(teamId)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId }
    })

    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    if (!team.isPublic) {
      const member = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId: auth.userId
          }
        }
      })

      if (!member) {
        return NextResponse.json(
          { success: false, error: '私有团队，只有受邀成员可访问' },
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
      prisma.teamMember.count({ where: { teamId } }),
      prisma.teamMember.groupBy({
        by: ['role'],
        where: { teamId },
        _count: true
      }),
      Promise.all([
        prisma.teamAssignmentSubmission.count({
          where: { assignment: { teamId } }
        }),
        prisma.teamAssignmentSubmission.count({
          where: {
            assignment: { teamId },
            submittedAt: { gte: todayStart }
          }
        }),
        prisma.teamAssignmentSubmission.count({
          where: {
            assignment: { teamId },
            submittedAt: { gte: weekStart }
          }
        })
      ]),
      (async () => {
        const submissions = await prisma.teamAssignmentSubmission.findMany({
          where: {
            assignment: { teamId },
            status: 'AC'
          },
          select: { userId: true, problemId: true },
          distinct: ['userId', 'problemId']
        })
        const totalSolved = new Set(submissions.map(s => `${s.userId}-${s.problemId}`)).size
        const memberCount = await prisma.teamMember.count({ where: { teamId } })
        return {
          totalSolved,
          averageSolved: memberCount > 0 ? Math.round((totalSolved / memberCount) * 10) / 10 : 0
        }
      })(),
      Promise.all([
        prisma.teamMember.count({
          where: {
            teamId,
            lastActiveAt: { gte: sevenDaysAgo }
          }
        }),
        prisma.teamMember.count({
          where: {
            teamId,
            lastActiveAt: { gte: thirtyDaysAgo }
          }
        })
      ]),
      (async () => {
        const assignments = await prisma.teamAssignment.findMany({
          where: { teamId },
          select: {
            id: true,
            endTime: true,
            problemIds: true,
            _count: {
              select: {
                submissions: {
                  where: {
                    status: 'AC'
                  }
                }
              }
            }
          }
        })

        let inProgress = 0
        let overdue = 0
        let completed = 0

        for (const assignment of assignments) {
          const totalProblems = assignment.problemIds.length
          const completedMembers = assignment._count.submissions
          const totalRequired = totalProblems

          if (assignment.endTime && new Date(assignment.endTime) < now) {
            overdue++
          } else if (completedMembers >= totalRequired && totalRequired > 0) {
            completed++
          } else {
            inProgress++
          }
        }

        return { inProgress, overdue, completed }
      })(),
      prisma.teamAssignmentSubmission.findMany({
        where: { assignment: { teamId } },
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
    console.error('获取团队统计失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
