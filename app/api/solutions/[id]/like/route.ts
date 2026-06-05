import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { canViewSolutions } from '@/lib/solution/permissions'
import { getSolutionLikeModel } from '@/lib/solution/like-helper'
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

// POST /api/solutions/[id]/like
// toggle 模式：已点赞 → 取消点赞（-1），未点赞 → 点赞（+1）
// 用 SolutionLike 表 + 唯一索引保证单用户只能点赞一次
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const payload = getUserFromRequest(request)
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const solution = await prisma.solution.findUnique({
      where: { id },
      select: { id: true, problemId: true }
    })

    if (!solution) {
      return NextResponse.json(
        { success: false, error: '题解不存在' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const isAssignmentContext = searchParams.get('isAssignmentContext') === 'true'

    const user = await loadSolutionUser(request)
    const permission = await canViewSolutions(user, solution.problemId, { isAssignmentContext })

    if (!permission.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: '无权操作此题解',
          permission
        },
        { status: 403 }
      )
    }

    // 检查 prisma client 是否已包含 SolutionLike 模型
    const solutionLikeModel = getSolutionLikeModel()
    if (!solutionLikeModel) {
      logger.error(
        'prisma.solutionLike 模型不可用，请执行 `npx prisma generate` + `npx prisma db push`'
      )
      return NextResponse.json(
        {
          success: false,
          error: '点赞功能暂不可用，请联系管理员执行 prisma generate'
        },
        { status: 503 }
      )
    }

    // 1) 查是否已点赞
    const existing = await solutionLikeModel.findUnique({
      where: {
        solutionId_userId: {
          solutionId: id,
          userId: payload.userId
        }
      }
    })

    if (existing) {
      // 取消点赞：删记录 + 减计数
      await prisma.$transaction([
        solutionLikeModel.delete({
          where: { id: existing.id }
        }),
        prisma.solution.update({
          where: { id },
          data: { likes: { decrement: 1 } }
        })
      ])
      const updated = await prisma.solution.findUnique({
        where: { id },
        select: { likes: true }
      })
      return NextResponse.json({
        success: true,
        data: { liked: false, likes: updated?.likes ?? 0 },
        message: '已取消点赞'
      })
    } else {
      // 点赞：创记录 + 加计数
      // 唯一约束可能撞 P2002（高并发下两个请求同时尝试）
      try {
        await prisma.$transaction([
          solutionLikeModel.create({
            data: {
              solutionId: id,
              userId: payload.userId
            }
          }),
          prisma.solution.update({
            where: { id },
            data: { likes: { increment: 1 } }
          })
        ])
      } catch (err: any) {
        // 并发下唯一冲突：忽略（其他请求已成功）
        if (err?.code !== 'P2002') throw err
      }
      const updated = await prisma.solution.findUnique({
        where: { id },
        select: { likes: true }
      })
      return NextResponse.json({
        success: true,
        data: { liked: true, likes: updated?.likes ?? 0 },
        message: '点赞成功'
      })
    }
  } catch (error) {
    logger.error('题解点赞错误', error)
    return NextResponse.json(
      { success: false, error: '点赞失败' },
      { status: 500 }
    )
  }
}
