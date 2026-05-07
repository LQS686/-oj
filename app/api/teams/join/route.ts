import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { code } = body

    if (!code) {
      return NextResponse.json(
        { success: false, error: '请提供邀请码' },
        { status: 400 }
      )
    }

    const userId = user.userId

    const invite = await prisma.teamInvite.findUnique({
      where: { code }
    })

    if (!invite) {
      return NextResponse.json(
        { success: false, error: '邀请码不存在或已失效' },
        { status: 404 }
      )
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json(
        { success: false, error: '邀请码已过期' },
        { status: 400 }
      )
    }

    if (invite.maxUses !== -1 && invite.usedCount >= invite.maxUses) {
      return NextResponse.json(
        { success: false, error: '邀请码使用次数已达上限' },
        { status: 400 }
      )
    }

    const teamId = invite.teamId

    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId
        }
      }
    })

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: '您已经是团队成员' },
        { status: 400 }
      )
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    const memberCount = await prisma.teamMember.count({ where: { teamId } })

    if (memberCount >= team.maxMembers) {
      return NextResponse.json(
        { success: false, error: '团队人数已达上限' },
        { status: 400 }
      )
    }

    const now = new Date()
    const maxUsesCondition = invite.maxUses === -1
      ? { usedCount: { lt: 999999 } }
      : { usedCount: { lt: invite.maxUses } }

    const updatedInvite = await prisma.teamInvite.updateMany({
      where: {
        id: invite.id,
        ...maxUsesCondition,
        ...(invite.expiresAt ? { expiresAt: { gt: now } } : {}),
      },
      data: {
        usedCount: { increment: 1 }
      }
    })

    if (updatedInvite.count === 0) {
      return NextResponse.json(
        { success: false, error: '邀请码已失效或使用次数已达上限' },
        { status: 400 }
      )
    }

    try {
      await prisma.teamMember.create({
        data: {
          teamId,
          userId,
          role: 'member',
          permissions: {
            canViewProblems: true,
            canSubmit: true,
            canViewNotes: true,
            canCreateNotes: false,
            canManageAssignments: false,
            canInviteMembers: false
          },
          joinedAt: new Date(),
          lastActiveAt: new Date()
        }
      })
    } catch (memberError: any) {
      if (memberError.code === 'P2002') {
        await prisma.teamInvite.update({
          where: { id: invite.id },
          data: { usedCount: { decrement: 1 } }
        })
        return NextResponse.json(
          { success: false, error: '您已经是团队成员' },
          { status: 400 }
        )
      }
      throw memberError
    }

    return NextResponse.json({
      success: true,
      data: {
        teamId: teamId,
        teamName: team.name
      },
      message: `成功加入团队 ${team.name}`
    })
  } catch (error: any) {
    console.error('加入团队失败:', error)
    return NextResponse.json(
      { success: false, error: '加入团队失败' },
      { status: 500 }
    )
  }
}
