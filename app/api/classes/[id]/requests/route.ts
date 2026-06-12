import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createNotifications } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// 创建加入申请
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: classId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId
    const body = await request.json()
    const { message } = body

    // 检查班级是否存在
    const classData = await prisma.class.findUnique({
      where: { id: classId }
    })

    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 检查用户是否已是班级成员
    const existingMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: currentUserId
        }
      }
    })

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: '您已是班级成员' },
        { status: 400 }
      )
    }

    // 检查是否已有申请记录(任何状态)
    const existingRequest = await prisma.classJoinRequest.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: currentUserId
        }
      }
    })

    let requestId

    if (existingRequest) {
      // 如果已有待处理的申请,不允许重复提交
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { success: false, error: '您已提交过申请，请等待审批' },
          { status: 400 }
        )
      }

      // 如果之前的申请已被处理(approved/rejected),更新为新的pending状态
      const updatedRequest = await prisma.classJoinRequest.update({
        where: { id: existingRequest.id },
        data: {
          status: 'pending',
          message: message || null,
          reviewerId: null,
          reviewedAt: null,
          createdAt: new Date()
        }
      })
      requestId = updatedRequest.id
    } else {
      // 创建新的加入申请
      const newRequest = await prisma.classJoinRequest.create({
        data: {
          classId,
          userId: currentUserId,
          status: 'pending',
          message: message || null,
        }
      })
      requestId = newRequest.id
    }

    // 获取申请人信息
    const applicantUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    // 通知班级创建人和管理员
    const adminMembers = await prisma.classMember.findMany({
      where: {
        classId,
        role: { in: ['owner', 'assistant'] }
      }
    })

    const notifications = adminMembers.map(member => ({
      userId: member.userId,
      type: 'class_join_request',
      title: '班级加入申请',
      content: `${applicantUser?.nickname || applicantUser?.username} 申请加入班级 "${classData.name}"`,
      link: `/classes/${classId}/requests`
    }))

    if (notifications.length > 0) {
      await createNotifications(notifications)
    }

    return NextResponse.json({
      success: true,
      data: {
        requestId
      }
    })

  } catch (error: any) {
    console.error('创建加入申请失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '创建申请失败' },
      { status: 500 }
    )
  }
}

// 获取加入申请列表
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: classId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId

    // 验证当前用户是否是班级管理员
    const currentMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: currentUserId
        }
      }
    })

    if (!currentMember) {
      return NextResponse.json(
        { success: false, error: '您不是班级成员' },
        { status: 403 }
      )
    }

    const isAdmin = ['owner', 'assistant'].includes(currentMember.role)

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以查看申请列表' },
        { status: 403 }
      )
    }

    // 获取加入申请列表
    const requests = await prisma.classJoinRequest.findMany({
      where: { classId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true
          }
        },
        reviewer: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true
          }
        }
      }
    })

    // 组装数据
    const requestsWithUsers = requests.map(request => {
      return {
        id: request.id,
        classId: request.classId,
        applicant: {
          id: request.user.id,
          username: request.user.username,
          nickname: request.user.nickname,
          avatar: request.user.avatar
        },
        reviewer: request.reviewer ? {
          id: request.reviewer.id,
          username: request.reviewer.username,
          nickname: request.reviewer.nickname,
          avatar: request.reviewer.avatar
        } : null,
        status: request.status,
        message: request.message,
        reviewedAt: request.reviewedAt?.toISOString(),
        createdAt: request.createdAt.toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      data: requestsWithUsers
    })

  } catch (error: any) {
    console.error('获取加入申请列表失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '获取申请列表失败' },
      { status: 500 }
    )
  }
}
