/**
 * lib/admin/dashboard.ts
 * 管理员仪表盘数据
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'

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

interface DashboardAggregates {
  totalUsers: number
  totalProblems: number
  totalSubmissions: number
  todaySubmissions: number
  userGrowth: number
  submissionGrowth: number
}

/** 聚合统计与最近提交无关，单独缓存：数据量增长后 count/groupBy 不必每次页面加载都扫全表 */
async function loadDashboardAggregates(today: Date, lastWeek: Date): Promise<DashboardAggregates> {
  const [totalUsers, totalProblems, totalSubmissions, todaySubmissions, newUsers, newSubmissions] =
    await Promise.all([
      prisma.user.count(),
      prisma.problem.count(),
      prisma.submission.count(),
      prisma.submission.count({ where: { submittedAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
      prisma.submission.count({ where: { submittedAt: { gte: lastWeek } } }),
    ])

  return {
    totalUsers,
    totalProblems,
    totalSubmissions,
    todaySubmissions,
    userGrowth: totalUsers > 0 ? Number(((newUsers / totalUsers) * 100).toFixed(1)) : 0,
    submissionGrowth:
      totalSubmissions > 0 ? Number(((newSubmissions / totalSubmissions) * 100).toFixed(1)) : 0,
  }
}

/**
 * 仪表盘聚合数据：用户/题目/提交统计 + 增长率 + 最近 10 条提交
 */
export async function computeAdminDashboard(now: Date = new Date()): Promise<DashboardData> {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const lastWeek = new Date(now)
  lastWeek.setDate(lastWeek.getDate() - 7)
  const dayKey = today.toISOString().slice(0, 10)

  const [aggregates, recentSubmissionsRaw] = await Promise.all([
    cache.get(
      CacheKeys.admin.dashboardStats(),
      [dayKey],
      () => loadDashboardAggregates(today, lastWeek),
      { ttl: 15_000 }
    ),
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

  return {
    ...aggregates,
    recentSubmissions,
  }
}
