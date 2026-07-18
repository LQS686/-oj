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

/** Task 35.2：AI 成本聚合（今日 / 本月） */
export interface DashboardAiCost {
  /** 今日预估成本（estimatedCost 之和） */
  todayCost: number
  /** 本月预估成本（estimatedCost 之和） */
  monthCost: number
  /** 今日任务数（含无成本的任务） */
  todayTaskCount: number
  /** 本月任务数 */
  monthTaskCount: number
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
  /** Task 35.2：AI 成本聚合 */
  aiCost: DashboardAiCost
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
  // Task 35.2：本月起始时间（1 号 0 点）
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    todaySubmissions,
    newUsersThisWeek,
    newSubmissionsThisWeek,
    aiPending,
    aiProcessing,
    aiCompleted,
    aiFailed,
    aiTokensAgg,
    // Task 35.2：AI 成本聚合（今日 / 本月）
    aiTodayCostAgg,
    aiMonthCostAgg,
    aiTodayCount,
    aiMonthCount,
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
    // Task 35.2：今日成本聚合
    prisma.aiGenerationLog.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { estimatedCost: true },
    }),
    // Task 35.2：本月成本聚合
    prisma.aiGenerationLog.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { estimatedCost: true },
    }),
    prisma.aiGenerationLog.count({ where: { createdAt: { gte: today } } }),
    prisma.aiGenerationLog.count({ where: { createdAt: { gte: monthStart } } }),
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

  // Task 35.2：AI 成本聚合结果
  const aiCost: DashboardAiCost = {
    todayCost: Number(aiTodayCostAgg._sum.estimatedCost ?? 0),
    monthCost: Number(aiMonthCostAgg._sum.estimatedCost ?? 0),
    todayTaskCount: aiTodayCount,
    monthTaskCount: aiMonthCount,
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
    aiCost,
  }
}

/**
 * Task 35.2：AI 成本按用户分组聚合（供监控页 detailed 视图使用）
 *
 * 返回今日 / 本月内每个用户的 AI 任务成本（按 estimatedCost 降序）。
 * 仅返回有 estimatedCost 记录的用户。
 */
export async function getAiCostByUser(opts: {
  since?: Date
  limit?: number
}): Promise<Array<{
  userId: string
  username: string
  taskCount: number
  totalCost: number
  totalTokens: number
}>> {
  const since = opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const limit = Math.min(opts.limit ?? 20, 100)

  const logs = await prisma.aiGenerationLog.findMany({
    where: {
      createdAt: { gte: since },
      estimatedCost: { not: null },
    },
    select: {
      userId: true,
      estimatedCost: true,
      tokensUsed: true,
    },
    take: 1000,
  })

  // 按 userId 聚合
  const stats = new Map<string, { taskCount: number; totalCost: number; totalTokens: number }>()
  for (const log of logs) {
    const entry = stats.get(log.userId) || { taskCount: 0, totalCost: 0, totalTokens: 0 }
    entry.taskCount++
    entry.totalCost += Number(log.estimatedCost ?? 0)
    entry.totalTokens += log.tokensUsed
    stats.set(log.userId, entry)
  }

  // 查用户名
  const userIds = Array.from(stats.keys())
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, nickname: true },
  })
  const userMap = new Map(users.map(u => [u.id, u]))

  return Array.from(stats.entries())
    .map(([userId, s]) => ({
      userId,
      username: userMap.get(userId)?.nickname || userMap.get(userId)?.username || '未知用户',
      taskCount: s.taskCount,
      totalCost: Number(s.totalCost.toFixed(6)),
      totalTokens: s.totalTokens,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, limit)
}
