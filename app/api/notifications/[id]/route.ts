import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// 标记通知为已读
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id: notificationId } = await context.params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(notificationId)) {
      return NextResponse.json(
        { success: false, error: '无效的通知ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId

    // 验证通知是否属于当前用户
    const notification = await prisma.notification.findUnique({
      where: {
        id: notificationId,
        userId: currentUserId
      }
    })

    if (!notification) {
      return NextResponse.json(
        { success: false, error: '通知不存在' },
        { status: 404 }
      )
    }

    // 标记为已读
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    })

    return NextResponse.json({
      success: true,
      message: '已标记为已读'
    })
  } catch (error: any) {
    console.error('标记通知失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '操作失败' },
      { status: 500 }
    )
  }
}

// 删除通知
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id: notificationId } = await context.params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(notificationId)) {
      return NextResponse.json(
        { success: false, error: '无效的通知ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId

    // 验证通知是否属于当前用户
    const notification = await prisma.notification.findUnique({
      where: {
        id: notificationId,
        userId: currentUserId
      }
    })

    if (!notification) {
      return NextResponse.json(
        { success: false, error: '通知不存在' },
        { status: 404 }
      )
    }

    // 删除通知
    await prisma.notification.delete({
      where: { id: notificationId }
    })

    return NextResponse.json({
      success: true,
      message: '通知已删除'
    })
  } catch (error: any) {
    console.error('删除通知失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '删除失败' },
      { status: 500 }
    )
  }
}
