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

export interface DashboardAiToday {
  pending: number
  processing: number
  completed: number
  failed: number
  totalTokens: number
}

export interface DashboardData {
  totalUsers: number
  totalProblems: number
  totalSubmissions: number
  todaySubmissions: number
  userGrowth: number
  submissionGrowth: number
  recentSubmissions: DashboardRecentSubmission[]
  aiToday: DashboardAiToday
}

/**
 * 仪表盘聚合数据：用户/题目/提交统计 + 增长率 + 最近 10 条提交
 */
export async function computeAdminDashboard(now: Date = new Date()): Promise<DashboardData> {
  // 总数（一次查询）
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

  // 手动补全 user / problem 信息（避免 MongoDB include 触发 500）
  const recentSubmissions: DashboardRecentSubmission[] = await Promise.all(
    recentSubmissionsRaw.map(async (sub: any) => {
      const [user, problem] = await Promise.all([
        prisma.user.findUnique({
          where: { id: sub.userId },
          select: { username: true, nickname: true },
        }),
        prisma.problem.findUnique({
          where: { id: sub.problemId },
          select: { title: true, problemNumber: true },
        }),
      ])
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
  )

  // 今日 / 本周增量
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const lastWeek = new Date(now)
  lastWeek.setDate(lastWeek.getDate() - 7)

  const [
    todaySubmissions,
    newUsersThisWeek,
    newSubmissionsThisWeek,
    aiPending,
    aiProcessing,
    aiCompleted,
    aiFailed,
    aiTokensAgg,
  ] = await Promise.all([
    prisma.submission.count({ where: { submittedAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
    prisma.submission.count({ where: { submittedAt: { gte: lastWeek } } }),
    prisma.aiGenerationLog.count({ where: { status: 'PENDING', createdAt: { gte: today } } }),
    prisma.aiGenerationLog.count({ where: { status: 'PROCESSING', createdAt: { gte: today } } }),
    prisma.aiGenerationLog.count({ where: { status: 'COMPLETED', createdAt: { gte: today } } }),
    prisma.aiGenerationLog.count({ where: { status: 'FAILED', createdAt: { gte: today } } }),
    prisma.aiGenerationLog.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { tokensUsed: true },
    }),
  ])

  const userGrowth = totalUsers > 0 ? Number(((newUsersThisWeek / totalUsers) * 100).toFixed(1)) : 0
  const submissionGrowth =
    totalSubmissions > 0 ? Number(((newSubmissionsThisWeek / totalSubmissions) * 100).toFixed(1)) : 0

  const aiToday: DashboardAiToday = {
    pending: aiPending,
    processing: aiProcessing,
    completed: aiCompleted,
    failed: aiFailed,
    totalTokens: aiTokensAgg._sum.tokensUsed ?? 0,
  }

  return {
    totalUsers,
    totalProblems,
    totalSubmissions,
    todaySubmissions,
    userGrowth,
    submissionGrowth,
    recentSubmissions,
    aiToday,
  }
}
