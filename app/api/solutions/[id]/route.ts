import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { canViewSolutions } from '@/lib/solution/permissions'
import { isSolutionLiked } from '@/lib/solution/like-helper'
import { recordUniqueView, fnv1a } from '@/lib/solution/view-helper'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

/**
 * 获取当前用户（包含 role 字段）。
 * canViewSolutions 需要 role（用于区分 TEACHER），
 * 因此从 User 表中二次查询。
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

/**
 * 提取客户端 IP（兼容常见代理头）
 */
function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return (
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

// GET /api/solutions/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const payload = getUserFromRequest(request)

    const solution = await prisma.solution.findUnique({
      where: { id },
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
          error: '无权查看题解',
          permission
        },
        { status: 403 }
      )
    }

    // 查询当前用户是否已点赞（无 prisma client 时降级为 false）
    const isLiked = await isSolutionLiked(payload?.userId, id)

    // 浏览数 +1（按 userId/IP 去重，相同身份重复访问不计数）
    const ip = getClientIp(request)
    recordUniqueView(id, payload?.userId ?? null, ip)
      .then((isNew) => {
        if (isNew) {
          return prisma.solution.update({
            where: { id },
            data: { views: { increment: 1 } }
          })
        }
        return null
      })
      .catch((err) => logger.error('题解浏览数自增失败', err))

    return NextResponse.json({
      success: true,
      data: { ...solution, isLiked },
      permission
    })
  } catch (error) {
    logger.error('获取题解详情错误', error)
    return NextResponse.json(
      { success: false, error: '获取题解详情失败' },
      { status: 500 }
    )
  }
}

// PATCH /api/solutions/[id]
export async function PATCH(
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
      select: { id: true, authorId: true }
    })

    if (!solution) {
      return NextResponse.json(
        { success: false, error: '题解不存在' },
        { status: 404 }
      )
    }

    // 鉴权：作者本人 或 管理员/教师
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, isAdmin: true }
    })
    const isAuthor = solution.authorId === payload.userId
    const isAdmin = dbUser?.isAdmin === true || payload.isAdmin === true
    const isTeacher = dbUser?.role === 'TEACHER'
    if (!isAuthor && !isAdmin && !isTeacher) {
      return NextResponse.json(
        { success: false, error: '无权修改此题解' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { title, content, codeLanguage, code } = body || {}

    const data: Prisma.SolutionUpdateInput = {}

    if (title !== undefined) {
      if (typeof title !== 'string' || title.length < 1 || title.length > 100) {
        return NextResponse.json(
          { success: false, error: '标题长度需在 1-100 字符之间' },
          { status: 400 }
        )
      }
      data.title = title
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || content.length < 10 || content.length > 50000) {
        return NextResponse.json(
          { success: false, error: '内容长度需在 10-50000 字符之间' },
          { status: 400 }
        )
      }
      data.content = content
    }

    if (codeLanguage !== undefined) {
      data.codeLanguage = codeLanguage === null ? null : String(codeLanguage)
    }

    if (code !== undefined) {
      data.code = code === null ? null : String(code)
    }

    const updated = await prisma.solution.update({
      where: { id },
      data,
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

    return NextResponse.json({
      success: true,
      data: updated,
      message: '题解更新成功'
    })
  } catch (error) {
    logger.error('更新题解错误', error)
    return NextResponse.json(
      { success: false, error: '更新题解失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/solutions/[id]
export async function DELETE(
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
      select: { id: true, authorId: true }
    })

    if (!solution) {
      return NextResponse.json(
        { success: false, error: '题解不存在' },
        { status: 404 }
      )
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, isAdmin: true }
    })
    const isAuthor = solution.authorId === payload.userId
    const isAdmin = dbUser?.isAdmin === true || payload.isAdmin === true
    const isTeacher = dbUser?.role === 'TEACHER'
    if (!isAuthor && !isAdmin && !isTeacher) {
      return NextResponse.json(
        { success: false, error: '无权删除此题解' },
        { status: 403 }
      )
    }

    // 先删除关联的评论，再删除题解
    await prisma.comment.deleteMany({ where: { solutionId: id } })
    await prisma.solution.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: '题解已删除'
    })
  } catch (error) {
    logger.error('删除题解错误', error)
    return NextResponse.json(
      { success: false, error: '删除题解失败' },
      { status: 500 }
    )
  }
}
