import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'

// GET /api/contests/[id]/rank - 获取竞赛排行榜
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contestId } = await params
    
    // 验证访问权限
    const currentUser = getUserFromRequest(request)
    const access = await checkContestAccess(contestId, currentUser, request)
    
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      )
    }

    // 1. 获取竞赛信息和题目列表
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        problems: {
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                problemNumber: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
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
                color: true
              }
            }
          }
        }
      }
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    // 2. 获取所有提交记录
    // 只获取必要的字段以减少数据量
    const submissions = await prisma.submission.findMany({
      where: {
        contestId: contestId,
      },
      select: {
        userId: true,
        problemId: true,
        status: true,
        submittedAt: true,
        score: true // 添加分数
      },
      orderBy: {
        submittedAt: 'asc' // 按时间正序处理
      }
    })

    // 3. 计算排名
    const startTime = contest.startTime.getTime()
    const PENALTY_PER_WA = 20 * 60 * 1000 

    const userStatsMap = new Map<string, {
      user: any,
      solved: number,
      totalScore: number, // 总分
      penalty: number, 
      problems: Record<string, {
        status: string, 
        time: number, 
        tries: number, 
        score: number // 单题得分
      }>
    }>()

    // 预填充
    contest.participants.forEach(p => {
      userStatsMap.set(p.userId, {
        user: p.user,
        solved: 0,
        totalScore: 0,
        penalty: 0,
        problems: {}
      })
    })

    submissions.forEach(sub => {
      if (!userStatsMap.has(sub.userId)) return 

      const stats = userStatsMap.get(sub.userId)!
      
      if (!stats.problems[sub.problemId]) {
        stats.problems[sub.problemId] = {
          status: 'Unsubmitted',
          time: 0,
          tries: 0,
          score: 0
        }
      }

      const problemStats = stats.problems[sub.problemId]
      const relativeTime = new Date(sub.submittedAt).getTime() - startTime
      if (relativeTime < 0) return

      // ACM 逻辑
      if (contest.type === 'ACM') {
        if (problemStats.status === 'AC') return

        if (sub.status === 'AC' || sub.status === 'Accepted') { // 兼容不同状态写法
          problemStats.status = 'AC'
          problemStats.time = relativeTime
          problemStats.score = 1 // ACM 1题1分
          stats.penalty += relativeTime + problemStats.tries * PENALTY_PER_WA
          stats.solved += 1
          stats.totalScore += 1
        } else if (['WA', 'TLE', 'MLE', 'RE'].includes(sub.status) || sub.status === 'Wrong Answer') {
           problemStats.status = 'WA'
           problemStats.tries += 1
        }
      } else {
        // OI 逻辑 (取最高分)
        // 假设 sub.score 是该次提交的得分
        const currentScore = sub.score || 0
        if (currentScore > problemStats.score) {
           // 更新最高分，同时更新总分
           stats.totalScore += (currentScore - problemStats.score)
           problemStats.score = currentScore
           problemStats.status = currentScore === 100 ? 'AC' : (currentScore > 0 ? 'Partial' : 'WA')
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
      penaltyMinutes: Math.floor(item.penalty / 60000) 
    }))

    return NextResponse.json({
      success: true,
      data: {
        rankings: finalRankList,
        contestType: contest.type, // 返回赛制
        problems: contest.problems.map(cp => ({
          id: cp.problem.id,
          title: cp.problem.title,
          problemNumber: cp.problem.problemNumber,
          orderIndex: cp.orderIndex
        }))
      }
    })

  } catch (error) {
    console.error('获取竞赛排行榜失败:', error)
    return NextResponse.json(
      { success: false, error: '获取数据失败' },
      { status: 500 }
    )
  }
}
