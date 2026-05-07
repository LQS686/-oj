/**
 * 商品兑换
 * POST /api/teams/[id]/points/shop/exchange
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { exchangeItem } from '@/lib/points/shop'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const { id: teamId } = await context.params
    const userId = user.userId

    // 解析请求数据
    const body = await request.json()
    const { itemId, quantity, deliveryInfo } = body

    if (!itemId) {
      return NextResponse.json(
        { success: false, error: '缺少商品ID' },
        { status: 400 }
      )
    }

    const result = await exchangeItem(
      teamId,
      userId,
      itemId,
      quantity || 1,
      deliveryInfo
    )

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] 兑换商品失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
