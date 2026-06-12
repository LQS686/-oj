import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// PATCH /api/classes/[id]/members/[memberId] - 更新成员信息（备注、权限）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
    }

    const { id: classId, memberId } = await params
    const body = await request.json()
    const { remark, role } = body

    // 验证 classId 和 memberId 是否为有效的 ObjectId
    if (!isValidObjectId(classId)) {
      return NextResponse.json({ success: false, error: '无效的班级ID' }, { status: 400 })
    }
    if (!isValidObjectId(memberId)) {
      return NextResponse.json({ success: false, error: '无效的成员ID' }, { status: 400 })
    }

    // 检查班级是否存在
    const classData = await prisma.class.findUnique({ where: { id: classId } })
    if (!classData) {
      return NextResponse.json({ success: false, error: '班级不存在' }, { status: 404 })
    }

    // 检查当前用户是否是管理员
    const currentMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: user.userId
        }
      }
    })
    if (!currentMember || !['owner', 'assistant'].includes(currentMember.role)) {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 检查目标成员是否存在
    // memberId 参数可能是 userId 还是 ClassMember 的 id?
    // 原代码 logic: `userId: new ObjectId(memberId)` inside ClassMember collection query.
    // So `memberId` param IS `userId` of the target member.
    // Let's stick to this convention (route is usually /members/[userId]).
    const targetMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
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
    if (currentMember.role === 'assistant' && targetMember.role === 'assistant') {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 构建更新字段
    const updateData: any = {}
    
    if (remark !== undefined) {
      updateData.remark = remark
    }
    
    if (role !== undefined) {
      // 验证角色有效性
      if (!['student', 'assistant'].includes(role)) {
        return NextResponse.json({ success: false, error: '无效的角色' }, { status: 400 })
      }
      updateData.role = role
    }

    // 更新成员信息
    await prisma.classMember.update({
      where: {
        classId_userId: {
          classId,
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

// DELETE /api/classes/[id]/members/[memberId] - 移除成员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
    }

    const { id: classId, memberId } = await params

    // 验证 classId 和 memberId 是否为有效的 ObjectId
    if (!isValidObjectId(classId)) {
      return NextResponse.json({ success: false, error: '无效的班级ID' }, { status: 400 })
    }
    if (!isValidObjectId(memberId)) {
      return NextResponse.json({ success: false, error: '无效的成员ID' }, { status: 400 })
    }

    // 检查班级是否存在
    const classData = await prisma.class.findUnique({ where: { id: classId } })
    if (!classData) {
      return NextResponse.json({ success: false, error: '班级不存在' }, { status: 404 })
    }

    // 检查当前用户是否是管理员
    const currentMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: user.userId
        }
      }
    })
    if (!currentMember || !['owner', 'assistant'].includes(currentMember.role)) {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 检查目标成员是否存在
    const targetMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
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
    if (currentMember.role === 'assistant' && targetMember.role === 'assistant') {
      return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 })
    }

    // 移除成员
    await prisma.classMember.delete({
      where: {
        classId_userId: {
          classId,
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
