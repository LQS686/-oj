import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createContestDirect } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import type { ContestWithRegistration } from '@/types/api'
import type { Prisma } from '@prisma/client'

// GET /api/contests - 获取竞赛列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let limit = parseInt(searchParams.get('limit') || '20')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 50) limit = 50
    
    const status = searchParams.get('status') // ongoing, upcoming, ended
    const keyword = searchParams.get('keyword')

    const where: Prisma.ContestWhereInput = { isPublic: true }
    const now = new Date()

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ]
    }

    if (status === 'ongoing') {
      where.startTime = { lte: now }
      where.endTime = { gte: now }
    } else if (status === 'upcoming') {
      where.startTime = { gt: now }
    } else if (status === 'ended') {
      where.endTime = { lt: now }
    }

    const [contests, total] = await Promise.all([
      prisma.contest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startTime: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: {
              participants: true,
              problems: true,
            },
          },
        },
      }),
      prisma.contest.count({ where }),
    ])

    // Check if user is registered for these contests
    const currentUser = getUserFromRequest(request)
    let contestsWithRegistration = contests

    if (currentUser) {
      const contestIds = contests.map(c => c.id)
      const participations = await prisma.contestParticipant.findMany({
        where: {
          userId: currentUser.userId,
          contestId: { in: contestIds }
        },
        select: {
          contestId: true
        }
      })
      
      const registeredContestIds = new Set(participations.map(p => p.contestId))
      
      contestsWithRegistration = contests.map(c => ({
        ...c,
        isRegistered: registeredContestIds.has(c.id)
      })) as ContestWithRegistration[]
    } else {
      contestsWithRegistration = contests.map(c => ({
        ...c,
        isRegistered: false
      })) as ContestWithRegistration[]
    }

    return NextResponse.json({
      success: true,
      data: {
        contests: contestsWithRegistration,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    logger.error('获取竞赛列表错误', error)
    return NextResponse.json(
      { success: false, error: '获取竞赛列表失败' },
      { status: 500 }
    )
  }
}

// POST /api/contests - 创建竞赛
export async function POST(request: NextRequest) {
  try {
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Use direct helper to avoid Prisma transaction issues on non-replica set MongoDB
    const contest = await createContestDirect({
      title: body.title,
      description: body.description,
      type: body.type || 'OI',
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      duration: body.duration,
      isPublic: body.isPublic ?? true,
      password: body.password,
      authorId: currentUser.userId,
      problemIds: body.problemIds
    })

    return NextResponse.json(
      {
        success: true,
        data: contest,
        message: '竞赛创建成功',
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('创建竞赛错误', error)
    return NextResponse.json(
      { success: false, error: '创建竞赛失败' },
      { status: 500 }
    )
  }
}
