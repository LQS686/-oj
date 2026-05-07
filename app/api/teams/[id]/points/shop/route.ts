/**
 * 积分商城商品管理
 * GET /api/teams/[id]/points/shop - 获取商品列表
 * POST /api/teams/[id]/points/shop - 创建商品（管理员）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { getShopItems, createShopItem } from '@/lib/points/shop'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const { id: teamId } = await params

    if (!isValidObjectId(teamId)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    // 解析查询参数
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category') || undefined
    const isActive = searchParams.get('isActive') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const result = await getShopItems(teamId, {
      category,
      isActive,
      page,
      limit
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] 获取商品列表失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const { id: teamId } = await params

    if (!isValidObjectId(teamId)) {
      return NextResponse.json(
        { success: false, error: '无效的团队ID' },
        { status: 400 }
      )
    }

    // 检查管理员权限
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    // 解析请求数据
    const body = await request.json()
    const {
      name,
      description,
      category,
      pointsRequired,
      stock,
      isUnlimited,
      imageUrl,
      sortOrder
    } = body

    if (!name || !category || !pointsRequired) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }

    if (pointsRequired <= 0) {
      return NextResponse.json(
        { success: false, error: '积分必须大于0' },
        { status: 400 }
      )
    }

    const result = await createShopItem(teamId, {
      name,
      description,
      category,
      pointsRequired,
      stock,
      isUnlimited,
      imageUrl,
      sortOrder
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 500 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] 创建商品失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
