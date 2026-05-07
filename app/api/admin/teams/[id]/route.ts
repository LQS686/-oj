import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// PATCH /api/admin/teams/[id] - 更新团队可见性
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { isPublic } = body

    const team = await prisma.team.findUnique({
      where: { id }
    })

    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    await prisma.team.update({
      where: { id },
      data: { isPublic }
    })

    return NextResponse.json({
      success: true,
      message: isPublic ? '团队已设为公开' : '团队已设为私有'
    })
  } catch (error) {
    console.error('更新团队失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/teams/[id] - 删除团队
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    await prisma.team.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: '团队已删除'
    })
  } catch (error) {
    console.error('删除团队失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
