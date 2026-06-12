import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'

// GET /api/classes - 获取班级列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(pageSize) || pageSize < 1) pageSize = 20
    if (pageSize > 50) pageSize = 50
    
    const search = searchParams.get('search') || ''
    const myClasses = searchParams.get('myClasses') === 'true'

    // 构建查询条件
    const where: Prisma.ClassWhereInput = {}

    // 只显示公开班级
    if (!myClasses) {
      where.isPublic = true
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    // 如果查询我的班级
    if (myClasses) {
      const currentUser = getUserFromRequest(request)
      if (!currentUser) {
        return NextResponse.json(
          { success: false, error: '请先登录' },
          { status: 401 }
        )
      }

      // 查询用户加入的班级
      where.members = {
        some: {
          userId: currentUser.userId
        }
      }
    }

    // 分页查询
    const [classes, total] = await Promise.all([
      prisma.class.findMany({
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
      prisma.class.count({ where })
    ])

    // 格式化返回数据
    const classesWithStats = classes.map(classData => ({
      id: classData.id,
      name: classData.name,
      description: classData.description,
      avatar: classData.avatar,
      isPublic: classData.isPublic,
      maxMembers: classData.maxMembers,
      memberCount: classData._count.members,
      createdAt: classData.createdAt
    }))

    return NextResponse.json({
      success: true,
      data: {
        classes: classesWithStats,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    })
  } catch (error) {
    logger.error('获取班级列表失败', error)
    return NextResponse.json(
      { success: false, error: '服务器内部错误，请稍后重试' },
      { status: 500 }
    )
  }
}

// POST /api/classes - 创建班级
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
        { success: false, error: '班级名称不能为空' },
        { status: 400 }
      )
    }

    // 检查班级名是否已存在
    const existing = await prisma.class.findUnique({
      where: { name: name.trim() }
    })
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: '班级名称已存在' },
        { status: 400 }
      )
    }

    // 创建班级并添加创建者为owner
    const classData = await prisma.class.create({
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
        id: classData.id,
        name: classData.name,
        description: classData.description,
        avatar: classData.avatar,
        isPublic: classData.isPublic,
        maxMembers: classData.maxMembers,
        ownerId: classData.ownerId,
        createdAt: classData.createdAt
      },
      message: '班级创建成功'
    })
  } catch (error) {
    logger.error('创建班级失败', error)
    return NextResponse.json(
      { success: false, error: '服务器内部错误，请稍后重试' },
      { status: 500 }
    )
  }
}
