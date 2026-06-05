import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { canViewSolutions, REQUIRED_SOLUTION_SCORE } from '@/lib/solution/permissions'
import { resolveProblemId } from '@/lib/solution/problem-resolver'
import { logger } from '@/lib/logger'

async function loadSolutionUser(request: NextRequest) {
  const payload = getUserFromRequest(request)
  if (!payload) return null
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isAdmin: true }
  })
  if (!dbUser) return null
  return {
    id: dbUser.id,
    role: dbUser.role,
    isAdmin: dbUser.isAdmin || payload.isAdmin === true
  }
}

// GET /api/solutions/check-permission?problemId=xxx&isAssignmentContext=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const problemId = searchParams.get('problemId')
    const isAssignmentContext = searchParams.get('isAssignmentContext') === 'true'

    if (!problemId) {
      return NextResponse.json(
        { success: false, error: 'problemId 不能为空' },
        { status: 400 }
      )
    }

    const user = await loadSolutionUser(request)
    const realProblemId = await resolveProblemId(problemId)
    if (!realProblemId) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }
    const result = await canViewSolutions(user, realProblemId, { isAssignmentContext })

    return NextResponse.json({
      success: true,
      data: {
        allowed: result.allowed,
        reason: result.reason,
        ...(result.bestScore !== undefined ? { bestScore: result.bestScore } : {}),
        requiredScore: REQUIRED_SOLUTION_SCORE
      }
    })
  } catch (error) {
    logger.error('检查题解权限错误', error)
    return NextResponse.json(
      { success: false, error: '检查题解权限失败' },
      { status: 500 }
    )
  }
}
