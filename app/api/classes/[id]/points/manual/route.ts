/**
 * 管理员手动发放/扣除积分
 * POST /api/classes/[id]/points/manual
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { addPoints, deductPoints } from '@/lib/points/account'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const { id: classId } = await params

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    // 检查管理员权限
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: user.userId
        }
      }
    })

    if (!member || !['owner', 'assistant'].includes(member.role)) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    // 解析请求数据
    const body = await request.json()
    const { targetUserId, points, type, reason } = body

    if (!targetUserId || !points || !type || !reason) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }

    if (points <= 0) {
      return NextResponse.json(
        { success: false, error: '积分必须大于0' },
        { status: 400 }
      )
    }

    let result

    if (type === 'ADD') {
      result = await addPoints(
        classId,
        targetUserId,
        points,
        reason,
        'MANUAL_AWARD'
      )
    } else if (type === 'DEDUCT') {
      result = await deductPoints(
        classId,
        targetUserId,
        points,
        reason,
        'MANUAL_DEDUCT'
      )
    } else {
      return NextResponse.json(
        { success: false, error: '无效的操作类型' },
        { status: 400 }
      )
    }

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] 手动发放/扣除积分失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
