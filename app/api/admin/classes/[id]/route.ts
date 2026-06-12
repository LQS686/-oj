import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// PATCH /api/admin/classes/[id] - 更新班级可见性
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

    const classData = await prisma.class.findUnique({
      where: { id }
    })

    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    await prisma.class.update({
      where: { id },
      data: { isPublic }
    })

    return NextResponse.json({
      success: true,
      message: isPublic ? '班级已设为公开' : '班级已设为私有'
    })
  } catch (error) {
    console.error('更新班级失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/classes/[id] - 删除班级
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

    await prisma.class.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: '班级已删除'
    })
  } catch (error) {
    console.error('删除班级失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
