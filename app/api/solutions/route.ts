import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { canViewSolutions } from '@/lib/solution/permissions'
import { resolveProblemId } from '@/lib/solution/problem-resolver'
import { getLikedSolutionIds } from '@/lib/solution/like-helper'
import { logger } from '@/lib/logger'

/**
 * 获取当前用户（包含 role 字段）。
 * JWT payload 只有 userId/isAdmin/email/username，
 * 调用 canViewSolutions 时需要 role（用于区分 TEACHER），
 * 因此从 User 表中二次查询 role。
 */
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

const SOLUTION_LIST_SELECT = {
  id: true,
  title: true,
  codeLanguage: true,
  views: true,
  likes: true,
  isOfficial: true,
  isAiGenerated: true,
  sourceType: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true
    }
  }
} as const

// GET /api/solutions?problemId=xxx&isAssignmentContext=xxx&page=1&pageSize=20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const problemId = searchParams.get('problemId')
    const isAssignmentContext = searchParams.get('isAssignmentContext') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10) || 20))

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
    const permission = await canViewSolutions(user, realProblemId, { isAssignmentContext })

    if (!permission.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: '无权查看题解',
          permission
        },
        { status: 403 }
      )
    }

    const where = { problemId: realProblemId }

    const [items, total] = await Promise.all([
      prisma.solution.findMany({
        where,
        select: SOLUTION_LIST_SELECT,
        orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.solution.count({ where })
    ])

    // 查询当前用户对这些题解的点赞状态（无 client 或未登录时降级为全部未点赞）
    const likedSet = await getLikedSolutionIds(user?.id, items.map((it) => it.id))
    const itemsWithLiked = items.map((it) => ({ ...it, isLiked: likedSet.has(it.id) }))

    return NextResponse.json({
      success: true,
      data: { items: itemsWithLiked, total, page, pageSize },
      permission
    })
  } catch (error) {
    logger.error('获取题解列表错误', error)
    return NextResponse.json(
      { success: false, error: '获取题解列表失败' },
      { status: 500 }
    )
  }
}

// POST /api/solutions
export async function POST(request: NextRequest) {
  try {
    const payload = getUserFromRequest(request)
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { problemId, title, content, codeLanguage, code } = body || {}

    if (!problemId || typeof problemId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'problemId 不能为空' },
        { status: 400 }
      )
    }

    if (typeof title !== 'string' || title.length < 1 || title.length > 100) {
      return NextResponse.json(
        { success: false, error: '标题长度需在 1-100 字符之间' },
        { status: 400 }
      )
    }

    if (typeof content !== 'string' || content.length < 10 || content.length > 50000) {
      return NextResponse.json(
        { success: false, error: '内容长度需在 10-50000 字符之间' },
        { status: 400 }
      )
    }

    // 接受 ObjectId 或 problemNumber（如 "P1005"）
    const realProblemId = await resolveProblemId(problemId)
    if (!realProblemId) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    const solution = await prisma.solution.create({
      data: {
        problemId: realProblemId,
        authorId: payload.userId,
        title,
        content,
        codeLanguage: codeLanguage ?? null,
        code: code ?? null,
        isOfficial: false,
        isAiGenerated: false,
        sourceType: 'USER'
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true
          }
        }
      }
    })

    return NextResponse.json(
      { success: true, data: solution, message: '题解发布成功' },
      { status: 201 }
    )
  } catch (error) {
    logger.error('创建题解错误', error)
    return NextResponse.json(
      { success: false, error: '创建题解失败' },
      { status: 500 }
    )
  }
}
