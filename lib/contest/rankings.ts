/**
 * lib/contest/rankings.ts
 * 竞赛排行榜（按 ACM / OI 规则计算 + 排名）
 */
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/* ============================================================================
 * 竞赛排行榜（按 ACM / OI 规则计算 + 排名）
 * ========================================================================== */

const PENALTY_PER_WA = 20 * 60 * 1000

interface ContestUserStats {
  user: any
  solved: number
  totalScore: number
  penalty: number
  problems: Record<
    string,
    { status: string; time: number; tries: number; score: number }
  >
}

/**
 * 拉取题目+参赛者+提交，并计算排行榜
 */
export async function computeContestRankings(contestId: string) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      problems: {
        include: {
          problem: { select: { id: true, title: true, problemNumber: true } },
        },
        orderBy: { orderIndex: 'asc' },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
              rating: true,
              rank: true,
              color: true,
            },
          },
        },
      },
    },
  })
  if (!contest) return null

  // 只获取必要的字段以减少数据量
  const submissions = await prisma.submission.findMany({
    where: { contestId },
    select: {
      userId: true,
      problemId: true,
      status: true,
      submittedAt: true,
      score: true, // 添加分数
    },
    orderBy: { submittedAt: 'asc' },
  })

  const startTime = contest.startTime.getTime()
  const endTime = contest.endTime ? contest.endTime.getTime() : null
  const userStatsMap = new Map<string, ContestUserStats>()

  // 预填充
  contest.participants.forEach((p: any) => {
    userStatsMap.set(p.userId, {
      user: p.user,
      solved: 0,
      totalScore: 0,
      penalty: 0,
      problems: {},
    })
  })

  submissions.forEach((sub: any) => {
    if (!userStatsMap.has(sub.userId)) return
    const stats = userStatsMap.get(sub.userId)!

    if (!stats.problems[sub.problemId]) {
      stats.problems[sub.problemId] = {
        status: 'Unsubmitted',
        time: 0,
        tries: 0,
        score: 0,
      }
    }

    const problemStats = stats.problems[sub.problemId]
    const relativeTime = new Date(sub.submittedAt).getTime() - startTime
    if (relativeTime < 0) return
    // 过滤竞赛结束后的提交（管理员补提交或评测延迟不应计入排名）
    if (endTime && new Date(sub.submittedAt).getTime() > endTime) return

    // ACM 逻辑
    if (contest.type === 'ACM') {
      if (problemStats.status === 'AC') return
      if (sub.status === 'AC') {
        // 兼容不同状态写法
        problemStats.status = 'AC'
        problemStats.time = relativeTime
        problemStats.score = 1 // ACM 1题1分
        stats.penalty += relativeTime + problemStats.tries * PENALTY_PER_WA
        stats.solved += 1
        stats.totalScore += 1
      } else if (
        ['WA', 'TLE', 'MLE', 'RE'].includes(sub.status) ||
        sub.status === 'Wrong Answer'
      ) {
        problemStats.status = 'WA'
        problemStats.tries += 1
      }
    } else {
      // OI 逻辑 (取最高分)
      const currentScore = sub.score || 0
      if (currentScore > problemStats.score) {
        // 更新最高分，同时更新总分
        stats.totalScore += currentScore - problemStats.score
        problemStats.score = currentScore
        problemStats.status =
          currentScore === 100 ? 'AC' : currentScore > 0 ? 'Partial' : 'WA'
      }
      // OI 也可以记录最后一次提交时间作为罚时？或者不计算罚时
    }
  })

  // 4. 排序
  const rankList = Array.from(userStatsMap.values()).sort((a, b) => {
    if (contest.type === 'ACM') {
      if (a.solved !== b.solved) return b.solved - a.solved
      return a.penalty - b.penalty
    } else {
      // OI: 分数优先
      return b.totalScore - a.totalScore
    }
  })

  // 5. 赋予排名
  const finalRankList = rankList.map((item, index) => ({
    rank: index + 1,
    ...item,
    penaltyMinutes: Math.floor(item.penalty / 60000),
  }))

  return {
    rankings: finalRankList,
    contestType: contest.type,
    problems: contest.problems.map((cp: any) => ({
      id: cp.problem.id,
      title: cp.problem.title,
      problemNumber: cp.problem.problemNumber,
      orderIndex: cp.orderIndex,
    })),
  }
}

/**
 * 竞赛结束后将最终排名写入 ContestParticipant 表
 * 应在竞赛结束时调用（定时任务或管理员手动触发）
 */
export async function finalizeContestRankings(contestId: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } })
  if (!contest) throw new Error('竞赛不存在')

  const result = await computeContestRankings(contestId)
  if (!result) return

  const rankList = result.rankings

  // 批量更新 rank 和 score
  await Promise.all(
    rankList.map((entry: any) =>
      prisma.contestParticipant.update({
        where: { contestId_userId: { contestId, userId: entry.user.id } },
        data: {
          rank: entry.rank,
          score: entry.totalScore,
        },
      }).catch(() => {
        // 忽略：可能参与者已退出
      })
    )
  )

  logger.info(`竞赛 ${contestId} 排名已落库，共 ${rankList.length} 名参赛者`)
}
