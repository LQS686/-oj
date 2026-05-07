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
    const invite = await prisma.teamDirectInvite.findUnique({
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

    // 获取团队信息
    const team = await prisma.team.findUnique({
      where: { id: invite.teamId }
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
          teamId: invite.teamId,
          status: invite.status,
          message: invite.message,
          expiresAt: invite.expiresAt?.toISOString(),
          createdAt: invite.createdAt.toISOString()
        },
        team: team ? {
          id: team.id,
          name: team.name,
          description: team.description,
          avatar: team.avatar
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
    const invite = await prisma.teamDirectInvite.findUnique({
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
      await prisma.teamDirectInvite.update({
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

    await prisma.teamDirectInvite.update({
      where: { id: inviteId },
      data: {
        status: newStatus,
        respondedAt: new Date()
      }
    })

    // 如果接受邀请，添加成员
    if (action === 'accept') {
      const existingMember = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: invite.teamId,
            userId: currentUserId
          }
        }
      })

      if (!existingMember) {
        await prisma.teamMember.create({
          data: {
            teamId: invite.teamId,
            userId: currentUserId,
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

    // 获取团队和被邀请人信息
    const team = await prisma.team.findUnique({
      where: { id: invite.teamId }
    })

    const invitee = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    // 通知邀请人
    await createNotification({
      userId: invite.inviterId,
      type: 'team_invite_result',
      title: action === 'accept' ? '邀请已接受' : '邀请被拒绝',
      content: action === 'accept'
        ? `${invitee?.nickname || invitee?.username} 已接受您的团队邀请并加入 "${team?.name}"`
        : `${invitee?.nickname || invitee?.username} 拒绝了您的团队邀请`,
      link: action === 'accept' ? `/teams/${invite.teamId}` : null
    })

    return NextResponse.json({
      success: true,
      data: {
        status: newStatus,
        teamId: invite.teamId
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
