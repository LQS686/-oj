/**
 * 成员权限管理 API
 * - PATCH /api/teams/[id]/members/[memberId]/permissions - 更新成员权限
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * PATCH /api/teams/[id]/members/[memberId]/permissions - 更新成员权限
 * 
 * Body:
 * - permissions: {
 *     canViewProblems?: boolean,
 *     canSubmit?: boolean,
 *     canViewNotes?: boolean,
 *     canCreateNotes?: boolean,
 *     canManageAssignments?: boolean,
 *     canInviteMembers?: boolean
 *   }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id, memberId } = await context.params
    if (!isValidObjectId(id) || !isValidObjectId(memberId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { permissions } = body

    if (!permissions) {
      return NextResponse.json(
        { success: false, error: '请提供权限配置' },
        { status: 400 }
      )
    }

    // 检查操作者权限（需要管理员）
    const operator = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    const isOperatorAdmin = operator && (operator.role === 'owner' || operator.role === 'admin')

    if (!isOperatorAdmin) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以修改成员权限' },
        { status: 403 }
      )
    }

    // 检查目标成员是否存在
    const targetMember = await prisma.teamMember.findUnique({
      where: {
        id: memberId,
        teamId: id
      }
    })

    if (!targetMember) {
      return NextResponse.json(
        { success: false, error: '成员不存在' },
        { status: 404 }
      )
    }

    // 不能修改团队所有者的权限
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { success: false, error: '不能修改团队所有者的权限' },
        { status: 400 }
      )
    }

    // 只有所有者可以修改管理员的权限
    if (targetMember.role === 'admin' && operator.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: '只有团队所有者可以修改管理员的权限' },
        { status: 403 }
      )
    }

    // 获取当前权限
    const currentPermissions = (targetMember.permissions as any) || {}

    // 合并新权限
    const updatedPermissions = {
      ...currentPermissions,
      ...permissions
    }

    // 更新权限
    await prisma.teamMember.update({
      where: { id: memberId },
      data: { permissions: updatedPermissions }
    })

    return NextResponse.json({
      success: true,
      data: {
        permissions: updatedPermissions
      },
      message: '成员权限已更新'
    })
  } catch (error: any) {
    console.error('更新成员权限失败:', error)
    return NextResponse.json(
      { success: false, error: '更新成员权限失败' },
      { status: 500 }
    )
  }
}
