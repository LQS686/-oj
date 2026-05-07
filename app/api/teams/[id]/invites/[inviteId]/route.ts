/**
 * 团队邀请管理 API
 * - DELETE /api/teams/[id]/invites/[inviteId] - 撤销/删除邀请码
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; inviteId: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

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

    const { id, inviteId } = await context.params
    const teamId = id

    if (!isValidObjectId(teamId) || !isValidObjectId(inviteId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 检查权限（只有管理员可以删除邀请码）
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以管理邀请码' },
        { status: 403 }
      )
    }

    // 检查邀请码是否存在
    const invite = await prisma.teamInvite.findUnique({
      where: {
        id: inviteId,
        teamId: teamId
      }
    })

    if (!invite) {
      return NextResponse.json(
        { success: false, error: '邀请码不存在' },
        { status: 404 }
      )
    }

    // 删除邀请码
    await prisma.teamInvite.delete({
      where: { id: inviteId }
    })

    return NextResponse.json({
      success: true,
      message: '邀请码已删除'
    })
  } catch (error: any) {
    console.error('删除邀请码失败:', error)
    return NextResponse.json(
      { success: false, error: '删除邀请码失败' },
      { status: 500 }
    )
  }
}
