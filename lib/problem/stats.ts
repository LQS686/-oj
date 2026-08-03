/**
 * lib/problem/stats.ts
 * 题目统计聚合：状态分布、语言分布、AC 率、近 7 天趋势、AC 平均耗时/内存
 *
 * 参考 HOJ ProblemStatistics.vue 与 Hydro OJ 题目统计页：
 *   - 状态分布（AC/WA/TLE/MLE/RE/CE/PENDING）
 *   - 语言分布
 *   - 近 7 天提交趋势
 *   - AC 平均耗时与内存
 *
 * 缓存策略：30s TTL（与 getProblemStatusCounts 保持一致），平衡实时性与数据库压力。
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { logger } from '@/lib/logger'

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
 * 获取题目统计信息（含缓存；封榜期间剔除封榜后竞赛提交）
 */
export async function getProblemStats(
  problemId: string,
  options: {
    contestId?: string
    viewer?: { id: string; role?: string | null } | null
  } = {}
): Promise<ProblemStats | null> {
  const { buildProblemSubmissionWhere } = await import('@/lib/contest/seal-stats')
  const baseWhere = await buildProblemSubmissionWhere(problemId, options)
  const cacheKey = [problemId, options.contestId || '', options.viewer?.id || 'guest']

  return cache.get('problem:stats', cacheKey, async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentWhere = {
      AND: [baseWhere, { submittedAt: { gte: sevenDaysAgo } }],
    }
    const acWhere = { AND: [baseWhere, { status: 'AC' as const }] }

    const [statusGroups, languageGroups, recentSubmissions, acAgg] = await Promise.all([
      prisma.submission.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { status: true },
      }),
      prisma.submission.groupBy({
        by: ['language'],
        where: baseWhere,
        _count: { language: true },
      }),
      prisma.submission.findMany({
        where: recentWhere,
        select: { status: true, submittedAt: true },
        // C-P2-10：近 7 天趋势只需按天聚合计数，加 take 上限防极端提交量拖垮内存
        take: 5000,
      }),
      prisma.submission.aggregate({
        where: acWhere,
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
  }, { ttl: 10_000 })
}

/** 重算单题 denormalized totalSubmit / totalAccepted */
export async function recountProblemSubmissionStats(problemId: string): Promise<void> {
  const [submitCount, acCount] = await Promise.all([
    prisma.submission.count({ where: { problemId } }),
    prisma.submission.count({ where: { problemId, status: 'AC' } }),
  ])
  await prisma.problem.update({
    where: { id: problemId },
    data: { totalSubmit: submitCount, totalAccepted: acCount },
  })
  cache.deleteByPrefix('problem:stats')
  cache.deleteByPrefix('problem:statusCounts')
  cache.deleteByPrefix('problem:sealedCutoffs')
}

/**
 * 从 Submission 重算全部题目的 totalSubmit / totalAccepted（提交次数口径）。
 * 用于修复历史「仅首次 AC 计入 totalAccepted」导致的 AC 率偏低。
 */
export async function recountAllProblemSubmissionStats(): Promise<{
  problemCount: number
  updatedCount: number
}> {
  const [problems, submitGroups, acGroups] = await Promise.all([
    prisma.problem.findMany({ select: { id: true, totalSubmit: true, totalAccepted: true } }),
    prisma.submission.groupBy({
      by: ['problemId'],
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { status: 'AC' },
      _count: { _all: true },
    }),
  ])

  const submitMap = new Map(submitGroups.map((g) => [g.problemId, g._count._all]))
  const acMap = new Map(acGroups.map((g) => [g.problemId, g._count._all]))

  let updatedCount = 0
  for (const p of problems) {
    const totalSubmit = submitMap.get(p.id) ?? 0
    const totalAccepted = acMap.get(p.id) ?? 0
    if (p.totalSubmit === totalSubmit && p.totalAccepted === totalAccepted) continue

    await prisma.problem.update({
      where: { id: p.id },
      data: { totalSubmit, totalAccepted },
    })
    cache.delete(CacheKeys.problem.byId(p.id))
    cache.delete(CacheKeys.problem.statusCounts(p.id))
    cache.delete(CacheKeys.problem.stats(p.id))
    updatedCount++
  }

  logger.info('题目提交统计重算完成', {
    problemCount: problems.length,
    updatedCount,
  })

  return { problemCount: problems.length, updatedCount }
}
