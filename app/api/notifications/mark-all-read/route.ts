import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// 标记所有通知为已读
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const currentUserId = user.userId

    // 标记所有未读通知为已读
    const result = await prisma.notification.updateMany({
      where: {
        userId: currentUserId,
        isRead: false
      },
      data: { isRead: true }
    })

    return NextResponse.json({
      success: true,
      data: {
        modifiedCount: result.count
      }
    })
  } catch (error: any) {
    console.error('标记所有通知失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '操作失败' },
      { status: 500 }
    )
  }
}
