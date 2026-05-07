import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/users/[id]/stats - 获取用户统计数据
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params

    // 获取用户基本信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        rating: true,
        rank: true,
        color: true,
        bio: true,
        createdAt: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 获取提交统计
    const submissions = await prisma.submission.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        language: true,
        problemId: true,
        submittedAt: true,
        problem: {
          select: {
            title: true,
            difficulty: true,
            problemNumber: true
          }
        }
      },
      orderBy: {
        submittedAt: 'desc'
      }
    })

    type SubmissionData = typeof submissions[0]

    // 获取最近10条提交
    const recentSubmissions = submissions.slice(0, 10).map(sub => ({
      id: sub.id,
      problemId: sub.problem?.problemNumber || sub.problemId,
      realProblemId: sub.problemId,
      problemTitle: sub.problem?.title || '未知题目',
      status: sub.status,
      language: sub.language,
      time: new Date(sub.submittedAt).toLocaleString('zh-CN'),
      submittedAt: sub.submittedAt
    }))

    // 计算难度分布 (只计算AC的)
    const acSubmissions = submissions.filter(sub => sub.status === 'AC' || sub.status === 'Accepted')
    // 使用Map去重，同一题只算一次
    const solvedProblemsMap = new Map()
    acSubmissions.forEach(sub => {
      if (sub.problem && !solvedProblemsMap.has(sub.problemId)) {
        solvedProblemsMap.set(sub.problemId, sub.problem.difficulty)
      }
    })
    
    const difficultyCount: Record<string, number> = {}
    solvedProblemsMap.forEach((difficulty) => {
      if (difficulty) {
        difficultyCount[difficulty] = (difficultyCount[difficulty] || 0) + 1
      }
    })
    
    const difficultyDistribution = Object.entries(difficultyCount).map(([difficulty, count]) => ({
      difficulty,
      count
    })).sort((a, b) => b.count - a.count)

    // 计算各状态提交数
    const statusCount = submissions.reduce((acc: any, sub: SubmissionData) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1
      return acc
    }, {})

    // 计算AC的题目数（去重）
    const acProblems = new Set(
      submissions
        .filter((sub: SubmissionData) => sub.status === 'AC' || sub.status === 'Accepted')
        .map((sub: SubmissionData) => sub.problemId)
    )

    // 计算语言使用统计
    const languageCount = submissions.reduce((acc: any, sub: SubmissionData) => {
      acc[sub.language] = (acc[sub.language] || 0) + 1
      return acc
    }, {})

    // 获取最近7天的提交热力图数据
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // 全局通过去重：对每个题目只保留最近的一次通过记录
    const uniqueAcSubmissionsMap = new Map<string, SubmissionData>()
    // 因为 submissions 是按时间倒序排列的 (orderBy: { submittedAt: 'desc' })
    // 所以我们遍历时，第一个遇到的就是最近的，后续遇到的（更早的）忽略
    for (const sub of acSubmissions) {
      if (!uniqueAcSubmissionsMap.has(sub.problemId)) {
        uniqueAcSubmissionsMap.set(sub.problemId, sub)
      }
    }
    const uniqueAcSubmissions = Array.from(uniqueAcSubmissionsMap.values())
    
    const lastWeekSubmissions = uniqueAcSubmissions.filter(
      (sub: SubmissionData) => new Date(sub.submittedAt) >= sevenDaysAgo
    )

    const heatmapData = lastWeekSubmissions.reduce((acc: any, sub: SubmissionData) => {
      const date = new Date(sub.submittedAt).toISOString().split('T')[0] // Use YYYY-MM-DD
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {})

    // 获取最近365天的数据（用于年度热力图）
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    
    const yearSubmissions = uniqueAcSubmissions.filter(
      (sub: SubmissionData) => new Date(sub.submittedAt) >= oneYearAgo
    )

    const yearHeatmap = yearSubmissions.reduce((acc: any, sub: SubmissionData) => {
      const date = new Date(sub.submittedAt).toISOString().split('T')[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {})

    // 获取用户创建的题目数
    const createdProblems = await prisma.problem.count({
      where: { authorId: userId }
    })

    // 获取用户发布的帖子数
    const postsCount = await prisma.post.count({
      where: { authorId: userId }
    })

    // 获取用户的评论数
    const commentsCount = await prisma.comment.count({
      where: { authorId: userId }
    })

    // 获取参加的竞赛数
    const contestsCount = await prisma.contestParticipant.count({
      where: { userId }
    })

    // 构建统计数据
    const stats = {
      user,
      submissions: {
        total: submissions.length,
        accepted: statusCount['AC'] || statusCount['Accepted'] || 0,
        wrongAnswer: statusCount['WA'] || statusCount['Wrong Answer'] || 0,
        timeLimitExceeded: statusCount['TLE'] || statusCount['Time Limit Exceeded'] || 0,
        memoryLimitExceeded: statusCount['MLE'] || statusCount['Memory Limit Exceeded'] || 0,
        runtimeError: statusCount['RE'] || statusCount['Runtime Error'] || 0,
        compileError: statusCount['CE'] || statusCount['Compile Error'] || 0,
        pending: statusCount['Pending'] || 0,
        statusCount
      },
      problems: {
        solved: acProblems.size,
        attempted: new Set(submissions.map((s: SubmissionData) => s.problemId)).size,
        created: createdProblems
      },
      languages: languageCount,
      community: {
        posts: postsCount,
        comments: commentsCount
      },
      contests: {
        participated: contestsCount
      },
      activity: {
        lastWeek: heatmapData,
        lastYear: yearHeatmap,
        totalDays: Object.keys(yearHeatmap).length
      },
      recentSubmissions,
      difficultyDistribution
    }

    return NextResponse.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('获取用户统计失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
