/**
 * lib/problem/stats.ts
 * 题目统计聚合：状态分布、语言分布、AC 率、近 7 天趋势、AC 平均耗时/内存
 *
 * 参考 HOJ ProblemStatistics.vue 与 Hydro OJ 题目统计页：
 *   - 状态分布（AC/WA/TLE/MLE/RE/CE/Pending）
 *   - 语言分布
 *   - 近 7 天提交趋势
 *   - AC 平均耗时与内存
 *
 * 缓存策略：30s TTL（与 getProblemStatusCounts 保持一致），平衡实时性与数据库压力。
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'

export interface ProblemStats {
  /** 状态分布：{ 'AC': 100, 'WA': 50, ... } */
  statusCounts: Record<string, number>
  /** 语言分布：{ 'cpp': 80, 'python': 20, ... } */
  languageCounts: Record<string, number>
  /** 总提交数 */
  totalSubmissions: number
  /** AC 提交数 */
  acCount: number
  /** AC 率（百分比，0-100，保留 1 位小数） */
  acRate: number
  /** 近 7 天提交趋势：[{ date: 'MM/DD', count: 12, acCount: 5 }, ...] */
  recentTrend: Array<{ date: string; count: number; acCount: number }>
  /** AC 提交的平均耗时（ms），无 AC 时为 0 */
  avgTimeMs: number
  /** AC 提交的平均内存（KB），无 AC 时为 0 */
  avgMemoryKb: number
}

/**
 * 格式化日期为 YYYY-MM-DD（本地时区，避免 UTC 偏移）
 */
function formatDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 获取题目统计信息（含缓存）
 */
export async function getProblemStats(problemId: string): Promise<ProblemStats | null> {
  return cache.get('problem:stats', [problemId], async () => {
    // 并行查询：状态分布、语言分布、近 7 天提交、AC 平均耗时/内存
    const [statusGroups, languageGroups, recentSubmissions, acAgg] = await Promise.all([
      prisma.submission.groupBy({
        by: ['status'],
        where: { problemId },
        _count: { status: true },
      }),
      prisma.submission.groupBy({
        by: ['language'],
        where: { problemId },
        _count: { language: true },
      }),
      prisma.submission.findMany({
        where: {
          problemId,
          submittedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { status: true, submittedAt: true },
      }),
      prisma.submission.aggregate({
        where: { problemId, status: 'AC' },
        _avg: { time: true, memory: true },
      }),
    ])

    const statusCounts: Record<string, number> = {}
    statusGroups.forEach((g) => { statusCounts[g.status] = g._count.status })

    const languageCounts: Record<string, number> = {}
    languageGroups.forEach((g) => { languageCounts[g.language] = g._count.language })

    const totalSubmissions = Object.values(statusCounts).reduce((s, n) => s + n, 0)
    const acCount = statusCounts['AC'] || 0
    const acRate = totalSubmissions > 0
      ? Math.round((acCount / totalSubmissions) * 1000) / 10
      : 0

    // 近 7 天趋势：按日期聚合（确保 7 天都有数据点）
    const trendMap = new Map<string, { count: number; acCount: number }>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      trendMap.set(formatDateLocal(d), { count: 0, acCount: 0 })
    }
    recentSubmissions.forEach((s) => {
      const d = new Date(s.submittedAt)
      d.setHours(0, 0, 0, 0)
      const key = formatDateLocal(d)
      const entry = trendMap.get(key)
      if (entry) {
        entry.count++
        if (s.status === 'AC') entry.acCount++
      }
    })
    const recentTrend = Array.from(trendMap.entries()).map(([date, v]) => ({
      date: date.slice(5).replace('-', '/'),
      count: v.count,
      acCount: v.acCount,
    }))

    return {
      statusCounts,
      languageCounts,
      totalSubmissions,
      acCount,
      acRate,
      recentTrend,
      avgTimeMs: acAgg._avg.time ? Math.round(acAgg._avg.time) : 0,
      avgMemoryKb: acAgg._avg.memory ? Math.round(acAgg._avg.memory) : 0,
    }
  }, { ttl: 30_000 })
}
