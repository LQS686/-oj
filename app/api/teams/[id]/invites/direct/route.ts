import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// 创建直接邀请
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: teamId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(teamId)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId
    const body = await request.json()
    const { username, message } = body

    if (!username) {
      return NextResponse.json(
        { success: false, error: '请输入用户名' },
        { status: 400 }
      )
    }

    // 验证当前用户是否是团队成员且有邀请权限
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

    // 检查权限
    const isAdmin = ['owner', 'admin'].includes(currentMember.role)
    const permissions = currentMember.permissions as any
    const hasInvitePermission = permissions?.canInviteMembers || false

    if (!isAdmin && !hasInvitePermission) {
      return NextResponse.json(
        { success: false, error: '您没有邀请权限' },
        { status: 403 }
      )
    }

    // 查找被邀请用户
    const inviteeUser = await prisma.user.findUnique({
      where: { username }
    })

    if (!inviteeUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 检查被邀请用户是否已是团队成员
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: inviteeUser.id
        }
      }
    })

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: '该用户已是团队成员' },
        { status: 400 }
      )
    }

    // 获取团队信息
    const team = await prisma.team.findUnique({
      where: { id: teamId }
    })

    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    // 检查是否已有邀请记录(任何状态)
    const existingInvite = await prisma.teamDirectInvite.findUnique({
      where: {
        teamId_inviteeId: {
          teamId,
          inviteeId: inviteeUser.id
        }
      }
    })

    let inviteId
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7天后过期

    if (existingInvite) {
      // 如果已有待处理的邀请,不允许重复发送
      if (existingInvite.status === 'pending') {
        return NextResponse.json(
          { success: false, error: '已向该用户发送过邀请，请等待对方响应' },
          { status: 400 }
        )
      }

      // 如果之前的邀请已被处理(accepted/rejected/expired),更新为新的pending状态
      const updatedInvite = await prisma.teamDirectInvite.update({
        where: { id: existingInvite.id },
        data: {
          inviterId: currentUserId,
          status: 'pending',
          message: message || null,
          expiresAt: expiresAt,
          respondedAt: null,
          createdAt: new Date()
        }
      })
      inviteId = updatedInvite.id
    } else {
      // 创建新的直接邀请
      const newInvite = await prisma.teamDirectInvite.create({
        data: {
          teamId,
          inviterId: currentUserId,
          inviteeId: inviteeUser.id,
          status: 'pending',
          message: message || null,
          expiresAt: expiresAt,
          respondedAt: null,
        }
      })
      inviteId = newInvite.id
    }

    // 获取邀请人信息
    const inviterUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    // 创建通知并推送
    await createNotification({
      userId: inviteeUser.id,
      type: 'team_invite',
      title: '团队邀请',
      content: `${inviterUser?.nickname || inviterUser?.username} 邀请您加入团队 "${team.name}"`,
      link: `/teams/invites/direct/${inviteId}`
    })

    return NextResponse.json({
      success: true,
      data: {
        inviteId
      }
    })

  } catch (error: any) {
    console.error('创建直接邀请失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '创建邀请失败' },
      { status: 500 }
    )
  }
}

// 获取直接邀请列表
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: teamId } = await params
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    if (!isValidObjectId(teamId)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    const currentUserId = user.userId

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
        { success: false, error: '只有管理员可以查看邀请列表' },
        { status: 403 }
      )
    }

    // 获取直接邀请列表
    const invites = await prisma.teamDirectInvite.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      include: {
        inviter: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true
          }
        },
        invitee: {
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
    const invitesWithUsers = invites.map(invite => {
      return {
        id: invite.id,
        teamId: invite.teamId,
        inviter: {
          id: invite.inviter.id,
          username: invite.inviter.username,
          nickname: invite.inviter.nickname,
          avatar: invite.inviter.avatar
        },
        invitee: {
          id: invite.invitee.id,
          username: invite.invitee.username,
          nickname: invite.invitee.nickname,
          avatar: invite.invitee.avatar
        },
        status: invite.status,
        message: invite.message,
        expiresAt: invite.expiresAt?.toISOString(),
        respondedAt: invite.respondedAt?.toISOString(),
        createdAt: invite.createdAt.toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      data: invitesWithUsers
    })

  } catch (error: any) {
    console.error('获取直接邀请列表失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '获取邀请列表失败' },
      { status: 500 }
    )
  }
}
