import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// GET /api/classes/[id]/members/[memberId]/activity - 获取成员活动概况
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
    }

    const { id: classId, memberId } = await params

    // 验证 classId 和 memberId 是否为有效的 ObjectId
    if (!isValidObjectId(classId)) {
      return NextResponse.json({ success: false, error: '无效的班级ID' }, { status: 400 })
    }
    if (!isValidObjectId(memberId)) {
      return NextResponse.json({ success: false, error: '无效的成员ID' }, { status: 400 })
    }

    // 检查是否为班级成员
    const currentMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: user.userId
        }
      }
    })

    if (!currentMember) {
      return NextResponse.json({ success: false, error: '您不是班级成员' }, { status: 403 })
    }

    // 获取目标成员信息
    const targetMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: memberId
        }
      },
      include: {
        user: {
          select: {
            username: true,
            nickname: true,
            avatar: true
          }
        }
      }
    })

    if (!targetMember) {
      return NextResponse.json({ success: false, error: '成员不存在' }, { status: 404 })
    }

    // 获取活动数据 (并行查询)
    const [submissions, notes, points] = await Promise.all([
      // 1. 作业提交记录 (本班级)
      prisma.classAssignmentSubmission.findMany({
        where: {
          assignment: {
            classId: classId
          },
          userId: memberId
        },
        orderBy: { submittedAt: 'desc' },
        take: 50, // 最近50条
        include: {
          assignment: {
            select: { title: true }
          }
        }
      }),
      // 2. 笔记记录 (本班级)
      prisma.classNote.findMany({
        where: {
          classId,
          authorId: memberId
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // 3. 积分历史 (本班级)
      prisma.pointsHistory.findMany({
        where: {
          classId,
          userId: memberId
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ])

    // 统计数据
    const stats = {
      totalSubmissions: await prisma.classAssignmentSubmission.count({
        where: {
          assignment: { classId },
          userId: memberId
        }
      }),
      acCount: await prisma.classAssignmentSubmission.count({
        where: {
          assignment: { classId },
          userId: memberId,
          status: 'AC'
        }
      }),
      totalNotes: await prisma.classNote.count({
        where: {
          classId,
          authorId: memberId
        }
      }),
      totalPoints: await prisma.pointsAccount.findUnique({
        where: {
          classId_userId: {
            classId,
            userId: memberId
          }
        },
        select: { total: true }
      }).then(res => res?.total || 0)
    }

    // 整合最近活动
    const recentActivities = [
      ...submissions.map(s => ({
        type: 'submission',
        title: `提交了作业 "${s.assignment.title}"`,
        status: s.status,
        score: s.score,
        createdAt: s.submittedAt
      })),
      ...notes.map(n => ({
        type: 'note',
        title: `发布了笔记 "${n.title}"`,
        status: 'published',
        createdAt: n.createdAt
      })),
      ...points.map(p => ({
        type: 'points',
        title: `获得了 ${p.amount} 积分: ${p.reason}`,
        status: 'earned',
        createdAt: p.createdAt
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20) // 只返回最近20条

    return NextResponse.json({
      success: true,
      data: {
        member: {
          id: targetMember.userId,
          username: targetMember.user.username,
          nickname: targetMember.user.nickname,
          avatar: targetMember.user.avatar,
          role: targetMember.role,
          joinedAt: targetMember.joinedAt
        },
        stats,
        recentActivities
      }
    })

  } catch (error) {
    console.error('[API] 获取成员活动失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
