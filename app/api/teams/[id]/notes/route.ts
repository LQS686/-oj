/**
 * 团队笔记管理 API
 * - GET /api/teams/[id]/notes - 获取团队笔记列表
 * - POST /api/teams/[id]/notes - 创建团队笔记
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { Prisma } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/teams/[id]/notes - 获取团队笔记列表
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

    const { id } = await context.params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    // 检查团队是否存在
    const team = await prisma.team.findUnique({ where: { id } })
    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    // 检查是否为团队成员
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有团队成员可以查看笔记' },
        { status: 403 }
      )
    }

    // 获取 URL 参数
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    // 构建查询条件
    const where: Prisma.TeamNoteWhereInput = { teamId: id }

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } } // 注意：Prisma MongoDB connector 对 array 的 has 搜索支持可能有限，视版本而定
      ]
    }

    // 获取笔记列表和总数
    const [notes, total] = await Promise.all([
      prisma.teamNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      prisma.teamNote.count({ where })
    ])

    // 格式化返回数据
    const notesWithAuthor = notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      tags: note.tags || [],
      author: {
        id: note.author.id,
        username: note.author.username,
        nickname: note.author.nickname,
        avatar: note.author.avatar
      },
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    }))

    return NextResponse.json({
      success: true,
      data: {
        notes: notesWithAuthor,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    })
  } catch (error: any) {
    console.error('获取团队笔记列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取团队笔记列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/teams/[id]/notes - 创建团队笔记
 * Body:
 * - title: string
 * - content: string
 * - category?: string
 * - tags?: string[]
 */
export async function POST(
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

    const { id } = await context.params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { title, content, category, tags } = body

    // 验证必填字段
    if (!title || !content) {
      return NextResponse.json(
        { success: false, error: '请填写笔记标题和内容' },
        { status: 400 }
      )
    }

    // 检查团队是否存在
    const team = await prisma.team.findUnique({ where: { id } })
    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    // 检查是否为团队成员
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有团队成员可以创建笔记' },
        { status: 403 }
      )
    }

    // 创建笔记
    const note = await prisma.teamNote.create({
      data: {
        teamId: id,
        authorId: user.userId,
        title,
        content,
        category: category || 'General',
        tags: tags || [],
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: note.id
      },
      message: '笔记创建成功'
    })
  } catch (error: any) {
    console.error('创建团队笔记失败:', error)
    return NextResponse.json(
      { success: false, error: '创建团队笔记失败' },
      { status: 500 }
    )
  }
}
