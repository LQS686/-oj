/**
 * 团队邀请码管理 API
 * - GET /api/teams/[id]/invites - 获取邀请码列表
 * - POST /api/teams/[id]/invites - 创建邀请码
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * 生成随机邀请码
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/teams/[id]/invites - 获取邀请码列表
 */
export async function GET(
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

    const { id } = await context.params
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    // 检查权限（需要管理员权限）
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以查看邀请码' },
        { status: 403 }
      )
    }

    // 获取邀请码列表
    const invites = await prisma.teamInvite.findMany({
      where: { teamId: id },
      orderBy: { createdAt: 'desc' },
    })

    // 获取创建者信息
    // 优化：批量获取用户信息
    const userIds = Array.from(new Set(invites.map(invite => invite.createdBy)))
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, nickname: true }
    })
    const userMap = new Map(users.map(u => [u.id, u]))

    const enrichedInvites = invites.map(invite => {
      const creator = userMap.get(invite.createdBy)
      const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date()
      const isExhausted = invite.maxUses !== -1 && invite.usedCount >= invite.maxUses

      return {
        id: invite.id,
        code: invite.code,
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        creator: {
          id: creator?.id,
          username: creator?.username,
          nickname: creator?.nickname
        },
        status: isExpired ? 'expired' : isExhausted ? 'exhausted' : 'active',
        inviteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/teams/join?code=${invite.code}`
      }
    })

    return NextResponse.json({
      success: true,
      data: enrichedInvites
    })
  } catch (error: any) {
    console.error('获取邀请码列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取邀请码列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/teams/[id]/invites - 创建邀请码
 * 
 * Body:
 * - maxUses: number (可选，默认1，-1表示无限)
 * - expiresAt: Date (可选)
 */
export async function POST(
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

    const { id } = await context.params
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { maxUses = 1, expiresAt } = body

    // 检查权限
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    const isAdmin = member && (member.role === 'owner' || member.role === 'admin')
    const permissions = member?.permissions as any
    const canInvite = permissions?.canInviteMembers

    // 需要管理员权限或拥有邀请成员权限
    if (!isAdmin && !canInvite) {
      return NextResponse.json(
        { success: false, error: '没有权限创建邀请码' },
        { status: 403 }
      )
    }

    // 检查团队是否存在
    const team = await prisma.team.findUnique({ where: { id } })
    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    // 生成唯一邀请码
    let code = generateInviteCode()
    let exists = await prisma.teamInvite.findUnique({ where: { code } })
    
    // 如果邀请码已存在，重新生成
    while (exists) {
      code = generateInviteCode()
      exists = await prisma.teamInvite.findUnique({ where: { code } })
    }

    // 创建邀请码
    const invite = await prisma.teamInvite.create({
      data: {
        teamId: id,
        code,
        createdBy: user.userId,
        maxUses: parseInt(maxUses),
        usedCount: 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        code,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt,
        inviteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/teams/join?code=${code}`
      },
      message: '邀请码创建成功'
    })
  } catch (error: any) {
    console.error('创建邀请码失败:', error)
    return NextResponse.json(
      { success: false, error: '创建邀请码失败' },
      { status: 500 }
    )
  }
}
