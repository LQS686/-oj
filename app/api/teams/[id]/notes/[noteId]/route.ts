/**
 * 团队单个笔记管理 API
 * - GET /api/teams/[id]/notes/[noteId] - 获取笔记详情
 * - PUT /api/teams/[id]/notes/[noteId] - 更新笔记
 * - DELETE /api/teams/[id]/notes/[noteId] - 删除笔记
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; noteId: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/teams/[id]/notes/[noteId] - 获取笔记详情
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

    const { id, noteId } = await context.params
    
    if (!isValidObjectId(id) || !isValidObjectId(noteId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 获取笔记
    const note = await prisma.teamNote.findUnique({
      where: {
        id: noteId,
        teamId: id
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

    if (!note) {
      return NextResponse.json(
        { success: false, error: '笔记不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
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
      }
    })
  } catch (error: any) {
    console.error('获取笔记详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取笔记详情失败' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/teams/[id]/notes/[noteId] - 更新笔记
 */
export async function PUT(
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

    const { id, noteId } = await context.params
    
    if (!isValidObjectId(id) || !isValidObjectId(noteId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { title, content, category, tags } = body

    // 检查笔记是否存在
    const note = await prisma.teamNote.findUnique({
      where: {
        id: noteId,
        teamId: id
      }
    })

    if (!note) {
      return NextResponse.json(
        { success: false, error: '笔记不存在' },
        { status: 404 }
      )
    }

    // 检查权限（只有作者可以编辑）
    if (note.authorId !== user.userId) {
      return NextResponse.json(
        { success: false, error: '只有作者可以编辑笔记' },
        { status: 403 }
      )
    }

    // 更新笔记
    const updateData: any = {}

    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (category !== undefined) updateData.category = category
    if (tags !== undefined) updateData.tags = tags

    await prisma.teamNote.update({
      where: { id: noteId },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      message: '笔记更新成功'
    })
  } catch (error: any) {
    console.error('更新笔记失败:', error)
    return NextResponse.json(
      { success: false, error: '更新笔记失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/teams/[id]/notes/[noteId] - 删除笔记
 */
export async function DELETE(
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

    const { id, noteId } = await context.params
    
    if (!isValidObjectId(id) || !isValidObjectId(noteId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 检查笔记是否存在
    const note = await prisma.teamNote.findUnique({
      where: {
        id: noteId,
        teamId: id
      }
    })

    if (!note) {
      return NextResponse.json(
        { success: false, error: '笔记不存在' },
        { status: 404 }
      )
    }

    // 检查权限（只有作者可以删除）
    if (note.authorId !== user.userId) {
      return NextResponse.json(
        { success: false, error: '只有作者可以删除笔记' },
        { status: 403 }
      )
    }

    // 删除笔记
    await prisma.teamNote.delete({
      where: { id: noteId }
    })

    return NextResponse.json({
      success: true,
      message: '笔记删除成功'
    })
  } catch (error: any) {
    console.error('删除笔记失败:', error)
    return NextResponse.json(
      { success: false, error: '删除笔记失败' },
      { status: 500 }
    )
  }
}
