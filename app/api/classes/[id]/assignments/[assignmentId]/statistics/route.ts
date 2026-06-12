/**
 * 班级作业统计 API
 * - GET /api/classes/[id]/assignments/[assignmentId]/statistics - 获取作业详细统计数据
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>
}

/**
 * GET /api/classes/[id]/assignments/[assignmentId]/statistics - 获取作业详细统计数据
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id, assignmentId } = await context.params
    const classId = id
    const currentUserId = user.userId

    // 检查是否为班级成员
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: currentUserId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有班级成员可以查看统计数据' },
        { status: 403 }
      )
    }

    // 检查作业是否存在
    const assignment = await prisma.classAssignment.findUnique({
      where: {
        id: assignmentId,
        classId
      }
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '作业不存在' },
        { status: 404 }
      )
    }

    // 获取所有成员
    const members = await prisma.classMember.findMany({
      where: { classId },
      include: {
        user: {
          select: {
            username: true,
            nickname: true,
            avatar: true
          }
        }
      }
    })

    // ✅ 【数据隔离】获取所有提交记录（仅限当前作业）
    const submissions = await prisma.classAssignmentSubmission.findMany({
      where: { assignmentId }
    })

    console.log(`[DataIsolation] 作业统计查询 - 作业ID: ${assignmentId}, 提交记录总数: ${submissions.length}, 题目数: ${assignment.problemIds.length}`)
    
    // 调试：检查作业截止时间
    const deadline = assignment.endTime ? new Date(assignment.endTime) : null
    
    // 1. 整体统计
    const totalMembers = members.length
    const totalProblems = assignment.problemIds.length

    // 计算完成人数（每题都AC的成员数）
    const memberCompletionMap = new Map<string, Set<string>>()
    members.forEach(m => {
      memberCompletionMap.set(m.userId, new Set())
    })

    submissions.forEach(sub => {
      if (sub.status === 'AC' && memberCompletionMap.has(sub.userId)) {
        memberCompletionMap.get(sub.userId)!.add(sub.problemId)
      }
    })

    const completedMembers = Array.from(memberCompletionMap.values())
      .filter(solvedSet => solvedSet.size === totalProblems).length

    // 计算平均分和平均正确率
    const memberScores = Array.from(memberCompletionMap.entries()).map(([userId, solvedSet]) => {
      const memberSubmissions = submissions.filter(s => s.userId === userId)
      // 计算有效分数（逾期提交视为0）
      const totalScore = memberSubmissions.reduce((sum, s) => {
        const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
        return sum + (isLate ? 0 : (s.score || 0))
      }, 0)
      const avgScore = memberSubmissions.length > 0 ? totalScore / memberSubmissions.length : 0
      const accuracy = totalProblems > 0 ? (solvedSet.size / totalProblems) * 100 : 0

      return { avgScore, accuracy }
    })

    const avgScore = memberScores.length > 0
      ? memberScores.reduce((sum, s) => sum + s.avgScore, 0) / memberScores.length
      : 0

    const avgAccuracy = memberScores.length > 0
      ? memberScores.reduce((sum, s) => sum + s.accuracy, 0) / memberScores.length
      : 0

    // 2. 题目统计
    // 批量获取题目信息
    const problems = await prisma.problem.findMany({
      where: {
        id: { in: assignment.problemIds }
      }
    })
    const problemMap = new Map(problems.map(p => [p.id, p]))

    const problemStats = assignment.problemIds.map((problemId) => {
      const problemInfo = problemMap.get(problemId)

      const problemSubmissions = submissions.filter(
        s => s.problemId === problemId
      )

      const acSubmissions = problemSubmissions.filter(s => s.status === 'AC')
      const uniqueUsers = new Set(problemSubmissions.map(s => s.userId))
      const acUsers = new Set(acSubmissions.map(s => s.userId))

      // 计算有效分数（逾期提交视为0）
      const totalScore = problemSubmissions.reduce((sum, s) => {
        const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
        return sum + (isLate ? 0 : (s.score || 0))
      }, 0)
      const avgProblemScore = problemSubmissions.length > 0
        ? totalScore / problemSubmissions.length
        : 0

      return {
        problemId: problemId,
        title: problemInfo?.title,
        difficulty: problemInfo?.difficulty,
        problemNumber: problemInfo?.problemNumber,
        totalSubmissions: problemSubmissions.length,
        uniqueSubmitters: uniqueUsers.size,
        acCount: acUsers.size,
        acRate: uniqueUsers.size > 0 ? (acUsers.size / uniqueUsers.size) * 100 : 0,
        avgScore: avgProblemScore
      }
    })

    // 3. 成员统计
    const memberStats = members.map((member) => {
      const userId = member.userId
      const userSubmissions = submissions.filter(
        s => s.userId === userId
      )

      const solvedProblems = memberCompletionMap.get(userId) || new Set()
      // 计算有效分数（逾期提交视为0）
      const totalUserScore = userSubmissions.reduce((sum, s) => {
        const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
        return sum + (isLate ? 0 : (s.score || 0))
      }, 0)
      const avgUserScore = userSubmissions.length > 0
        ? totalUserScore / userSubmissions.length
        : 0

      const accuracy = totalProblems > 0
        ? (solvedProblems.size / totalProblems) * 100
        : 0

      // 计算是否逾期
      const lateSubmissions = userSubmissions.filter(s => {
        return s.isLate || (deadline ? s.submittedAt > deadline : false)
      }).length

      // ✅ 【数据隔离】为每道题计算得分和状态（仅统计当前作业的提交记录）
      const problemScores: { [problemId: string]: number | string } = {}
      const problemStatuses: { [problemId: string]: string } = {}
      assignment.problemIds.forEach((problemId) => {
        const problemSubmissions = userSubmissions.filter(
          s => s.problemId === problemId
        )
        if (problemSubmissions.length > 0) {
          // 过滤掉逾期提交的记录，或者将逾期提交的分数视为0
          const validSubmissions = problemSubmissions.map(s => {
            const isLate = s.isLate || (deadline ? s.submittedAt > deadline : false)
            return {
              score: isLate ? 0 : (s.score || 0),
              status: s.status,
              isLate
            }
          })
          // 找到最高分的提交
          const maxScoreSubmission = validSubmissions.reduce((max, current) => 
            current.score > max.score ? current : max
          )
          problemScores[problemId] = maxScoreSubmission.score
          problemStatuses[problemId] = maxScoreSubmission.status
        } else {
          problemScores[problemId] = "-"  // 未提交则为"-"
          problemStatuses[problemId] = "NOT_SUBMITTED"  // 未提交状态
        }
      })

      // 计算总分（所有题目得分之和，忽略未提交的题目）
      const totalScore = Object.values(problemScores).reduce((sum, score) => {
        return typeof score === 'number' ? (sum as number) + score : sum
      }, 0) as number

      return {
        userId: userId,
        username: member.user.username,
        nickname: member.user.nickname,
        avatar: member.user.avatar,
        // remark: member.remark,  // Prisma schema ClassMember doesn't seem to have remark? 
        // Let's check schema. ClassMember has no remark.
        // I'll omit remark for now.
        solved: solvedProblems.size,
        total: totalProblems,
        completionRate: accuracy,
        totalSubmissions: userSubmissions.length,
        avgScore: avgUserScore,
        lateSubmissions: lateSubmissions,
        problemScores: problemScores,  // ✅ 每道题的得分
        problemStatuses: problemStatuses,  // ✅ 每道题的完成状态
        totalScore: totalScore  // ✅ 总分（所有题目分数之和）
      }
    })

    // 按总分排序，再按已完成题数排序
    memberStats.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      if (b.solved !== a.solved) return b.solved - a.solved
      return b.avgScore - a.avgScore
    })

    // 4. 提交趋势（按天统计）
    const submissionTrend: any = {}
    submissions.forEach(sub => {
      const date = new Date(sub.submittedAt).toISOString().split('T')[0]
      if (!submissionTrend[date]) {
        submissionTrend[date] = { date, count: 0, acCount: 0 }
      }
      submissionTrend[date].count++
      if (sub.status === 'AC') {
        submissionTrend[date].acCount++
      }
    })

    const trendData = Object.values(submissionTrend).sort((a: any, b: any) =>
      a.date.localeCompare(b.date)
    )

    return NextResponse.json({
      success: true,
      data: {
        overall: {
          totalMembers,
          totalProblems,
          completedMembers,
          completionRate: totalMembers > 0 ? (completedMembers / totalMembers) * 100 : 0,
          avgScore: Math.round(avgScore * 100) / 100,
          avgAccuracy: Math.round(avgAccuracy * 100) / 100,
          totalSubmissions: submissions.length
        },
        problemStats,
        memberStats,
        submissionTrend: trendData
      }
    })
  } catch (error: any) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    )
  }
}
