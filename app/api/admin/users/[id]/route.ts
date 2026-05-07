import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import bcrypt from 'bcryptjs'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// PATCH /api/admin/users/[id] - 更新用户权限、状态或重置密码（管理员）
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 验证管理员权限
    const auth = await requireAdmin(request)
    if (!auth.isAdmin || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // 检查用户是否存在
    const targetUser = await prisma.user.findUnique({
      where: { id }
    })

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 防止修改超级管理员
    if (targetUser.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: '超级管理员不可被修改' },
        { status: 403 }
      )
    }

    // 防止管理员修改自己的管理员权限或封禁自己
    if (id === auth.user.userId) {
      if ('isAdmin' in body || 'isBanned' in body || 'role' in body) {
        return NextResponse.json(
          { success: false, error: '不能修改自己的权限或状态' },
          { status: 400 }
        )
      }
    }

    // 准备更新数据
    const updateData: any = {}
    
    if ('role' in body) {
      const validRoles = ['ADMIN', 'TEACHER', 'USER']
      if (!validRoles.includes(body.role)) {
        return NextResponse.json(
          { success: false, error: '无效的角色类型' },
          { status: 400 }
        )
      }
      updateData.role = body.role
      updateData.isAdmin = body.role === 'ADMIN'
    }
    
    if ('isAdmin' in body) {
      updateData.isAdmin = Boolean(body.isAdmin)
    }
    
    if ('isBanned' in body) {
      updateData.isBanned = Boolean(body.isBanned)
    }

    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { success: false, error: '密码长度至少为6位' },
          { status: 400 }
        )
      }
      const hashedPassword = await bcrypt.hash(body.password, 10)
      updateData.password = hashedPassword
    }

    // 更新用户
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        role: true,
        isBanned: true
      }
    })

    return NextResponse.json({
      success: true,
      data: user
    })
  } catch (error) {
    console.error('更新用户失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/users/[id] - 删除用户（管理员）
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 验证管理员权限
    const auth = await requireAdmin(request)
    if (!auth.isAdmin || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 防止删除自己
    if (id === auth.user.userId) {
      return NextResponse.json(
        { success: false, error: '不能删除自己的账号' },
        { status: 400 }
      )
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 防止删除超级管理员
    if (user.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: '超级管理员不可被删除' },
        { status: 403 }
      )
    }

    // 删除用户（级联删除会自动删除相关数据）
    await prisma.user.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: '用户已删除'
    })
  } catch (error) {
    console.error('删除用户失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
