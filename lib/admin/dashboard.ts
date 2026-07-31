/**
 * lib/admin/dashboard.ts
 * 管理员仪表盘数据
 */
import { prisma } from '@/lib/prisma'

export interface DashboardRecentSubmission {
  id: string
  user: { username: string }
  problem: { title: string; problemNumber: string }
  status: string
  submittedAt: Date
}

export interface DashboardData {
  totalUsers: number
  totalProblems: number
  totalSubmissions: number
  todaySubmissions: number
  userGrowth: number
  submissionGrowth: number
  recentSubmissions: DashboardRecentSubmission[]
}

/**
 * 仪表盘聚合数据：用户/题目/提交统计 + 增长率 + 最近 10 条提交
 */
export async function computeAdminDashboard(now: Date = new Date()): Promise<DashboardData> {
  const [totalUsers, totalProblems, totalSubmissions, recentSubmissionsRaw] = await Promise.all([
    prisma.user.count(),
    prisma.problem.count(),
    prisma.submission.count(),
    prisma.submission.findMany({
      take: 10,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        problemId: true,
        status: true,
        submittedAt: true,
      },
    }),
  ])

  // 批量补全 user / problem，避免 N+1
  const userIds = [...new Set(recentSubmissionsRaw.map((s) => s.userId))]
  const problemIds = [...new Set(recentSubmissionsRaw.map((s) => s.problemId))]
  const [users, problems] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, nickname: true },
        })
      : Promise.resolve([]),
    problemIds.length > 0
      ? prisma.problem.findMany({
          where: { id: { in: problemIds } },
          select: { id: true, title: true, problemNumber: true },
        })
      : Promise.resolve([]),
  ])
  const userMap = new Map(users.map((u) => [u.id, u]))
  const problemMap = new Map(problems.map((p) => [p.id, p]))

  const recentSubmissions: DashboardRecentSubmission[] = recentSubmissionsRaw.map((sub) => {
    const user = userMap.get(sub.userId)
    const problem = problemMap.get(sub.problemId)
    return {
      id: sub.id,
      user: {
        username: user?.nickname || user?.username || '未知用户',
      },
      problem: {
        title: problem?.title || '题目已删除',
        problemNumber: problem?.problemNumber || '',
      },
      status: sub.status,
      submittedAt: sub.submittedAt,
    }
  })

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const lastWeek = new Date(now)
  lastWeek.setDate(lastWeek.getDate() - 7)

  const [todaySubmissions, newUsersThisWeek, newSubmissionsThisWeek] = await Promise.all([
    prisma.submission.count({ where: { submittedAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
    prisma.submission.count({ where: { submittedAt: { gte: lastWeek } } }),
  ])

  const userGrowth = totalUsers > 0 ? Number(((newUsersThisWeek / totalUsers) * 100).toFixed(1)) : 0
  const submissionGrowth =
    totalSubmissions > 0 ? Number(((newSubmissionsThisWeek / totalSubmissions) * 100).toFixed(1)) : 0

  return {
    totalUsers,
    totalProblems,
    totalSubmissions,
    todaySubmissions,
    userGrowth,
    submissionGrowth,
    recentSubmissions,
  }
}
