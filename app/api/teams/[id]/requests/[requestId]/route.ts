import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{
    id: string
    requestId: string
  }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// 审批加入申请
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: teamId, requestId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(teamId) || !isValidObjectId(requestId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId
    const body = await request.json()
    const { action } = body // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: '无效的操作' },
        { status: 400 }
      )
    }

    // 验证当前用户是否是团队管理员
    const currentMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: currentUserId
        }
      }
    })

    if (!currentMember) {
      return NextResponse.json(
        { success: false, error: '您不是团队成员' },
        { status: 403 }
      )
    }

    const isAdmin = ['owner', 'admin'].includes(currentMember.role)

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以审批申请' },
        { status: 403 }
      )
    }

    // 获取申请信息
    const joinRequest = await prisma.teamJoinRequest.findUnique({
      where: {
        id: requestId,
        teamId
      }
    })

    if (!joinRequest) {
      return NextResponse.json(
        { success: false, error: '申请不存在' },
        { status: 404 }
      )
    }

    if (joinRequest.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: '该申请已被处理' },
        { status: 400 }
      )
    }

    // 更新申请状态
    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    await prisma.teamJoinRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        reviewerId: currentUserId,
        reviewedAt: new Date()
      }
    })

    // 如果批准，添加成员
    if (action === 'approve') {
      const existingMember = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId: joinRequest.userId
          }
        }
      })

      if (!existingMember) {
        await prisma.teamMember.create({
          data: {
            teamId,
            userId: joinRequest.userId,
            role: 'member',
            permissions: {
              canViewProblems: true,
              canSubmit: true,
              canViewNotes: true,
              canCreateNotes: false,
              canManageAssignments: false,
              canInviteMembers: false,
              canManageMembers: false,
              canViewStats: false
            },
            joinedAt: new Date(),
            lastActiveAt: new Date()
          }
        })
      }
    }

    // 获取团队和审批人信息
    const team = await prisma.team.findUnique({
      where: { id: teamId }
    })

    const reviewer = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    // 通知申请人
    await createNotification({
      userId: joinRequest.userId,
      type: 'team_join_result',
      title: action === 'approve' ? '申请已通过' : '申请被拒绝',
      content: action === 'approve'
        ? `您加入团队 "${team?.name}" 的申请已通过`
        : `您加入团队 "${team?.name}" 的申请被拒绝`,
      link: action === 'approve' ? `/teams/${teamId}` : null
    })

    return NextResponse.json({
      success: true,
      data: {
        status: newStatus
      }
    })

  } catch (error: any) {
    console.error('审批申请失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '审批失败' },
      { status: 500 }
    )
  }
}
