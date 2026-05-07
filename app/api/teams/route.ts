import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'

// GET /api/teams - 获取团队列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(pageSize) || pageSize < 1) pageSize = 20
    if (pageSize > 50) pageSize = 50
    
    const search = searchParams.get('search') || ''
    const myTeams = searchParams.get('myTeams') === 'true'

    // 构建查询条件
    const where: Prisma.TeamWhereInput = {}

    // 只显示公开团队
    if (!myTeams) {
      where.isPublic = true
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    // 如果查询我的团队
    if (myTeams) {
      const currentUser = getUserFromRequest(request)
      if (!currentUser) {
        return NextResponse.json(
          { success: false, error: '请先登录' },
          { status: 401 }
        )
      }

      // 查询用户加入的团队
      where.members = {
        some: {
          userId: currentUser.userId
        }
      }
    }

    // 分页查询
    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { members: true }
          }
        }
      }),
      prisma.team.count({ where })
    ])

    // 格式化返回数据
    const teamsWithStats = teams.map(team => ({
      id: team.id,
      name: team.name,
      description: team.description,
      avatar: team.avatar,
      isPublic: team.isPublic,
      maxMembers: team.maxMembers,
      memberCount: team._count.members,
      createdAt: team.createdAt
    }))

    return NextResponse.json({
      success: true,
      data: {
        teams: teamsWithStats,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    })
  } catch (error) {
    logger.error('获取团队列表失败', error)
    return NextResponse.json(
      { success: false, error: '服务器内部错误，请稍后重试' },
      { status: 500 }
    )
  }
}

// POST /api/teams - 创建团队
export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, description, avatar, isPublic, maxMembers } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '团队名称不能为空' },
        { status: 400 }
      )
    }

    // 检查团队名是否已存在
    const existing = await prisma.team.findUnique({
      where: { name: name.trim() }
    })
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: '团队名称已存在' },
        { status: 400 }
      )
    }

    // 创建团队并添加创建者为owner
    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        description: description || '',
        avatar: avatar || '',
        isPublic: isPublic !== false,
        maxMembers: maxMembers || 50,
        ownerId: currentUser.userId,
        members: {
          create: {
            userId: currentUser.userId,
            role: 'owner'
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: team.id,
        name: team.name,
        description: team.description,
        avatar: team.avatar,
        isPublic: team.isPublic,
        maxMembers: team.maxMembers,
        ownerId: team.ownerId,
        createdAt: team.createdAt
      },
      message: '团队创建成功'
    })
  } catch (error) {
    logger.error('创建团队失败', error)
    return NextResponse.json(
      { success: false, error: '服务器内部错误，请稍后重试' },
      { status: 500 }
    )
  }
}
