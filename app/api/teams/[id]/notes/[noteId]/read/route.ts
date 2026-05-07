/**
 * 笔记阅读记录（触发积分发放）
 * POST /api/teams/[id]/notes/[noteId]/read
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { awardNoteReadPoints } from '@/lib/points/award'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const { id: teamId, noteId } = await params
    const userId = user.userId

    // 验证 ObjectId 格式
    const objectIdRegex = /^[0-9a-fA-F]{24}$/
    if (!objectIdRegex.test(teamId) || !objectIdRegex.test(noteId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 查询笔记信息
    const note = await prisma.teamNote.findUnique({
      where: {
        id: noteId,
        teamId: teamId
      }
    })

    if (!note) {
      return NextResponse.json(
        { success: false, error: '笔记不存在' },
        { status: 404 }
      )
    }

    // 发放积分（如果是首次阅读）
    const awardResult = await awardNoteReadPoints(
      teamId,
      userId,
      noteId,
      note.title
    )

    if (!awardResult.success) {
      console.error('[API] 发放积分失败:', 'error' in awardResult ? awardResult.error : '未知错误')
      // 即使发放失败也返回成功，不影响阅读体验
    }

    return NextResponse.json({
      success: true,
      pointsAwarded: awardResult.success && !('alreadyRead' in awardResult && awardResult.alreadyRead)
    })
  } catch (error) {
    console.error('[API] 记录笔记阅读失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
