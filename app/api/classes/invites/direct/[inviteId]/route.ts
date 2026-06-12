import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{
    inviteId: string
  }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// 获取邀请详情
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { inviteId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(inviteId)) {
      return NextResponse.json(
        { success: false, error: '无效的邀请ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId

    // 获取邀请信息
    const invite = await prisma.classDirectInvite.findUnique({
      where: { id: inviteId }
    })

    if (!invite) {
      return NextResponse.json(
        { success: false, error: '邀请不存在' },
        { status: 404 }
      )
    }

    // 验证当前用户是否是被邀请人
    if (invite.inviteeId !== currentUserId) {
      return NextResponse.json(
        { success: false, error: '无权访问此邀请' },
        { status: 403 }
      )
    }

    // 获取班级信息
    const classData = await prisma.class.findUnique({
      where: { id: invite.classId }
    })

    // 获取邀请人信息
    const inviter = await prisma.user.findUnique({
      where: { id: invite.inviterId },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        invite: {
          id: invite.id,
          classId: invite.classId,
          status: invite.status,
          message: invite.message,
          expiresAt: invite.expiresAt?.toISOString(),
          createdAt: invite.createdAt.toISOString()
        },
        class: classData ? {
          id: classData.id,
          name: classData.name,
          description: classData.description,
          avatar: classData.avatar
        } : null,
        inviter: inviter ? {
          id: inviter.id,
          username: inviter.username,
          nickname: inviter.nickname,
          avatar: inviter.avatar
        } : null
      }
    })

  } catch (error: any) {
    console.error('获取邀请详情失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '获取邀请详情失败' },
      { status: 500 }
    )
  }
}

// 响应邀请
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { inviteId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(inviteId)) {
      return NextResponse.json(
        { success: false, error: '无效的邀请ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId
    const body = await request.json()
    const { action } = body // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: '无效的操作' },
        { status: 400 }
      )
    }

    // 获取邀请信息
    const invite = await prisma.classDirectInvite.findUnique({
      where: { id: inviteId }
    })

    if (!invite) {
      return NextResponse.json(
        { success: false, error: '邀请不存在' },
        { status: 404 }
      )
    }

    // 验证当前用户是否是被邀请人
    if (invite.inviteeId !== currentUserId) {
      return NextResponse.json(
        { success: false, error: '无权响应此邀请' },
        { status: 403 }
      )
    }

    // 检查邀请状态
    if (invite.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: '该邀请已被处理' },
        { status: 400 }
      )
    }

    // 检查是否过期
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      await prisma.classDirectInvite.update({
        where: { id: inviteId },
        data: {
          status: 'expired',
          respondedAt: new Date()
        }
      })
      return NextResponse.json(
        { success: false, error: '邀请已过期' },
        { status: 400 }
      )
    }

    // 更新邀请状态
    const newStatus = action === 'accept' ? 'accepted' : 'rejected'

    await prisma.classDirectInvite.update({
      where: { id: inviteId },
      data: {
        status: newStatus,
        respondedAt: new Date()
      }
    })

    // 如果接受邀请，添加成员
    if (action === 'accept') {
      const existingMember = await prisma.classMember.findUnique({
        where: {
          classId_userId: {
            classId: invite.classId,
            userId: currentUserId
          }
        }
      })

      if (!existingMember) {
        await prisma.classMember.create({
          data: {
            classId: invite.classId,
            userId: currentUserId,
            role: 'student',
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

    // 获取班级和被邀请人信息
    const classData = await prisma.class.findUnique({
      where: { id: invite.classId }
    })

    const invitee = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    // 通知邀请人
    await createNotification({
      userId: invite.inviterId,
      type: 'class_invite_result',
      title: action === 'accept' ? '邀请已接受' : '邀请被拒绝',
      content: action === 'accept'
        ? `${invitee?.nickname || invitee?.username} 已接受您的班级邀请并加入 "${classData?.name}"`
        : `${invitee?.nickname || invitee?.username} 拒绝了您的班级邀请`,
      link: action === 'accept' ? `/classes/${invite.classId}` : null
    })

    return NextResponse.json({
      success: true,
      data: {
        status: newStatus,
        classId: invite.classId
      }
    })

  } catch (error: any) {
    console.error('响应邀请失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '响应邀请失败' },
      { status: 500 }
    )
  }
}
