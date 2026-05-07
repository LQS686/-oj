import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// PATCH /api/teams/[id]/members/[memberId] - 更新成员信息（备注、权限）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
    }

    const { id: teamId, memberId } = await params
    const body = await request.json()
    const { remark, role } = body

    // 验证 teamId 和 memberId 是否为有效的 ObjectId
    if (!isValidObjectId(teamId)) {
      return NextResponse.json({ success: false, error: '无效的团队ID' }, { status: 400 })
    }
    if (!isValidObjectId(memberId)) {
      return NextResponse.json({ success: false, error: '无效的成员ID' }, { status: 400 })
    }

    // 检查团队是否存在
    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) {
      return NextResponse.json({ success: false, error: '团队不存在' }, { status: 404 })
    }

    // 检查当前用户是否是管理员
    const currentMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })
    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 检查目标成员是否存在
    // memberId 参数可能是 userId 还是 TeamMember 的 id?
    // 原代码 logic: `userId: new ObjectId(memberId)` inside TeamMember collection query.
    // So `memberId` param IS `userId` of the target member.
    // Let's stick to this convention (route is usually /members/[userId]).
    const targetMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: memberId
        }
      }
    })
    if (!targetMember) {
      return NextResponse.json({ success: false, error: '成员不存在' }, { status: 404 })
    }

    // 不能修改所有者
    if (targetMember.role === 'owner') {
      return NextResponse.json({ success: false, error: '不能修改所有者' }, { status: 403 })
    }

    // 普通管理员不能修改其他管理员
    if (currentMember.role === 'admin' && targetMember.role === 'admin') {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 构建更新字段
    const updateData: any = {}
    
    if (remark !== undefined) {
      updateData.remark = remark
    }
    
    if (role !== undefined) {
      // 验证角色有效性
      if (!['member', 'admin'].includes(role)) {
        return NextResponse.json({ success: false, error: '无效的角色' }, { status: 400 })
      }
      updateData.role = role
    }

    // 更新成员信息
    await prisma.teamMember.update({
      where: {
        teamId_userId: {
          teamId,
          userId: memberId
        }
      },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      message: '成员信息已更新',
      data: {
        updated: true
      }
    })
  } catch (error) {
    console.error('[API] 更新成员信息失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id]/members/[memberId] - 移除成员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
    }

    const { id: teamId, memberId } = await params

    // 验证 teamId 和 memberId 是否为有效的 ObjectId
    if (!isValidObjectId(teamId)) {
      return NextResponse.json({ success: false, error: '无效的团队ID' }, { status: 400 })
    }
    if (!isValidObjectId(memberId)) {
      return NextResponse.json({ success: false, error: '无效的成员ID' }, { status: 400 })
    }

    // 检查团队是否存在
    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) {
      return NextResponse.json({ success: false, error: '团队不存在' }, { status: 404 })
    }

    // 检查当前用户是否是管理员
    const currentMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })
    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 检查目标成员是否存在
    const targetMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: memberId
        }
      }
    })
    if (!targetMember) {
      return NextResponse.json({ success: false, error: '成员不存在' }, { status: 404 })
    }

    // 不能移除所有者
    if (targetMember.role === 'owner') {
      return NextResponse.json({ success: false, error: '不能移除所有者' }, { status: 403 })
    }

    // 普通管理员不能移除其他管理员
    if (currentMember.role === 'admin' && targetMember.role === 'admin') {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 移除成员
    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId: memberId
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: '成员已移除'
    })
  } catch (error) {
    console.error('[API] 移除成员失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
