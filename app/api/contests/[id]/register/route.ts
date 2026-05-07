import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { registerContestParticipantDirect } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import bcrypt from 'bcryptjs'

async function verifyContestPassword(inputPassword: string, storedPassword: string | null): Promise<boolean> {
  if (!storedPassword) return false

  if (storedPassword.startsWith('$2')) {
    return bcrypt.compare(inputPassword, storedPassword)
  }

  const isMatch = inputPassword === storedPassword
  return isMatch
}

// POST /api/contests/[id]/register - 报名参加竞赛
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    // 检查是否已经报名
    const existingParticipant = await prisma.contestParticipant.findUnique({
      where: {
        contestId_userId: {
          contestId: id,
          userId: currentUser.userId,
        },
      },
    })

    if (existingParticipant) {
      return NextResponse.json(
        { success: false, error: '您已经报名过此竞赛' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // 验证报名条件
    if (contest.type === 'password') {
      if (!body.password) {
        return NextResponse.json(
          { success: false, error: '请输入竞赛密码' },
          { status: 400 }
        )
      }
      const passwordValid = await verifyContestPassword(body.password, contest.password)
      if (!passwordValid) {
        return NextResponse.json(
          { success: false, error: '密码错误' },
          { status: 403 }
        )
      }
    } else if (contest.type === 'invite') {
      if (!body.inviteCode) {
        return NextResponse.json(
          { success: false, error: '请输入邀请码' },
          { status: 400 }
        )
      }
      const inviteValid = await verifyContestPassword(body.inviteCode, contest.password)
      if (!inviteValid) {
        return NextResponse.json(
          { success: false, error: '邀请码无效' },
          { status: 403 }
        )
      }
    }

    // 创建报名记录
    // Use direct helper to bypass Prisma transaction requirement
    await registerContestParticipantDirect({
      contestId: id,
      userId: currentUser.userId,
      inviteCode: body.inviteCode,
    })

    return NextResponse.json({
      success: true,
      message: '报名成功',
    })
  } catch (error) {
    logger.error('竞赛报名错误', error)
    return NextResponse.json(
      { success: false, error: '报名失败' },
      { status: 500 }
    )
  }
}
