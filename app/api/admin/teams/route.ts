import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/teams - 获取团队列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const teams = await prisma.team.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: true,
            assignments: true,
            notes: true
          }
        }
      }
    })

    const ownerIds = [...new Set(teams.map(t => t.ownerId))]
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, username: true }
    })

    const ownerMap = new Map(owners.map(o => [o.id, o.username]))

    const teamsWithOwner = teams.map(team => ({
      ...team,
      owner: { username: ownerMap.get(team.ownerId) || '未知用户' }
    }))

    return NextResponse.json({
      success: true,
      data: teamsWithOwner
    })
  } catch (error) {
    console.error('获取团队列表失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
