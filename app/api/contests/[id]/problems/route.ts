import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'
import { logger } from '@/lib/logger'

const ObjectIdRegex = /^[a-f\d]{24}$/i

// GET /api/contests/[id]/problems - 获取竞赛题目列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!ObjectIdRegex.test(id)) {
      return NextResponse.json(
        { success: false, error: '无效的竞赛ID' },
        { status: 400 }
      )
    }

    const currentUser = getUserFromRequest(request)

    const access = await checkContestAccess(id, currentUser, request)
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      )
    }

    const contestProblems = await prisma.contestProblem.findMany({
      where: { contestId: id },
      orderBy: { orderIndex: 'asc' },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            problemNumber: true,
            difficulty: true,
            visibility: true,
            isPublic: true,
            totalAccepted: true,
            totalSubmit: true,
          },
        },
      },
    })

    const problemIds = contestProblems.map(cp => cp.problemId)

    let userSubmissionStatus: Record<string, 'Accepted' | 'Attempted' | null> = {}
    let contestStats: Record<string, { accepted: number; submitted: number }> = {}

    if (currentUser) {
      const submissions = await prisma.submission.findMany({
        where: {
          contestId: id,
          problemId: { in: problemIds },
          userId: currentUser.userId,
        },
        select: {
          problemId: true,
          status: true,
        },
      })

      const problemSubmissionMap = new Map<string, Set<string>>()
      for (const sub of submissions) {
        if (!problemSubmissionMap.has(sub.problemId)) {
          problemSubmissionMap.set(sub.problemId, new Set())
        }
        problemSubmissionMap.get(sub.problemId)!.add(sub.status)
      }

      for (const problemId of problemIds) {
        const statuses = problemSubmissionMap.get(problemId)
        if (statuses?.has('Accepted')) {
          userSubmissionStatus[problemId] = 'Accepted'
        } else if (statuses && statuses.size > 0) {
          userSubmissionStatus[problemId] = 'Attempted'
        } else {
          userSubmissionStatus[problemId] = null
        }
      }
    }

    const contestSubmissions = await prisma.submission.groupBy({
      by: ['problemId'],
      where: {
        contestId: id,
        problemId: { in: problemIds },
      },
      _count: {
        _all: true,
      },
    })

    const acceptedSubmissions = await prisma.submission.groupBy({
      by: ['problemId'],
      where: {
        contestId: id,
        problemId: { in: problemIds },
        status: 'Accepted',
      },
      _count: {
        _all: true,
      },
    })

    const acceptedMap = new Map(acceptedSubmissions.map(s => [s.problemId, s._count._all]))
    for (const sub of contestSubmissions) {
      contestStats[sub.problemId] = {
        accepted: acceptedMap.get(sub.problemId) || 0,
        submitted: sub._count._all,
      }
    }

    const problemsWithStatus = contestProblems.map(cp => {
      const stats = contestStats[cp.problemId] || { accepted: 0, submitted: 0 }
      return {
        id: cp.problemId,
        orderIndex: cp.orderIndex,
        score: cp.score,
        label: String.fromCharCode(65 + cp.orderIndex),
        title: cp.problem.title,
        problemNumber: cp.problem.problemNumber,
        difficulty: cp.problem.difficulty,
        visibility: cp.problem.visibility,
        isPublic: cp.problem.isPublic,
        accepted: stats.accepted,
        submitted: stats.submitted,
        status: currentUser ? userSubmissionStatus[cp.problemId] : null,
      }
    })

    return NextResponse.json({
      success: true,
      data: problemsWithStatus,
    })
  } catch (error) {
    logger.error('获取竞赛题目失败', error)
    return NextResponse.json(
      { success: false, error: '获取竞赛题目失败' },
      { status: 500 }
    )
  }
}
