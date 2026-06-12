import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// GET /api/classes/[id] - 获取班级详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url)
    const sortBy = searchParams.get('sortBy') || 'joinedAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const roleFilter = searchParams.get('role') // owner, admin, member
    const activeFilter = searchParams.get('active') // true, false
    const searchQuery = searchParams.get('search')

    // 获取用户认证信息
    const auth = getUserFromRequest(request)

    // 1. 获取班级基本信息
    const classData = await prisma.class.findUnique({
      where: { id },
    })

    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 2. 检查班级可见性和成员身份
    if (!classData.isPublic) {
      if (!auth) {
        return NextResponse.json(
          { success: false, error: '私有班级，只有受邀成员可访问' },
          { status: 404 }
        )
      }

      const member = await prisma.classMember.findUnique({
        where: {
          classId_userId: {
            classId: id,
            userId: auth.userId
          }
        }
      })

      if (!member) {
        return NextResponse.json(
          { success: false, error: '私有班级，只有受邀成员可访问' },
          { status: 404 }
        )
      }
    }

    // 3. 对于公开班级或已加入的私有班级，继续处理

    // 2. 构建成员查询条件
    const memberWhere: any = { classId: id }
    if (roleFilter) {
      memberWhere.role = roleFilter
    }
    
    // 活跃度筛选
    if (activeFilter) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      if (activeFilter === 'true') {
        memberWhere.lastActiveAt = { gte: thirtyDaysAgo }
      } else {
        memberWhere.OR = [
          { lastActiveAt: { lt: thirtyDaysAgo } },
          { lastActiveAt: null }
        ]
      }
    }

    // 3. 获取成员列表（包含用户信息）
    const members = await prisma.classMember.findMany({
      where: memberWhere,
      include: {
        user: {
          select: {
            username: true,
            nickname: true,
            avatar: true
          }
        }
      }
    })

    // 4. 处理成员数据
    let memberDetails = members.map(member => ({
      id: member.id,
      userId: member.userId,
      username: member.user.username,
      nickname: member.user.nickname,
      avatar: member.user.avatar,
      role: member.role,
      permissions: member.permissions || {},
      joinedAt: member.joinedAt,
      lastActiveAt: member.lastActiveAt
    }))

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      memberDetails = memberDetails.filter(m => 
        m.username?.toLowerCase().includes(query) ||
        (m.nickname && m.nickname.toLowerCase().includes(query))
      )
    }

    // 排序
    memberDetails.sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortBy) {
        case 'role':
          const roleOrder: any = { owner: 3, admin: 2, member: 1 }
          aValue = roleOrder[a.role] || 0
          bValue = roleOrder[b.role] || 0
          break
        case 'joinedAt':
          aValue = new Date(a.joinedAt).getTime()
          bValue = new Date(b.joinedAt).getTime()
          break
        case 'lastActiveAt':
          aValue = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
          bValue = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
          break
        case 'username':
          aValue = a.username || ''
          bValue = b.username || ''
          break
        default:
          aValue = new Date(a.joinedAt).getTime()
          bValue = new Date(b.joinedAt).getTime()
          break
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    // 5. 获取统计数据
    const [memberCount, assignmentCount, noteCount] = await Promise.all([
      prisma.classMember.count({ where: { classId: id } }),
      prisma.classAssignment.count({ where: { classId: id } }),
      prisma.classNote.count({ where: { classId: id } })
    ])

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
        createdAt: classData.createdAt,
        members: memberDetails,
        stats: {
          memberCount,
          assignmentCount,
          noteCount
        }
      }
    })
  } catch (error) {
    console.error('获取班级详情失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PATCH /api/classes/[id] - 更新班级信息
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getUserFromRequest(request)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    // 检查权限：必须是 Owner 或 Admin
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: auth.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'assistant')) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, avatar, isPublic, maxMembers } = body

    const updateData: any = {}
    if (name) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description
    if (avatar !== undefined) updateData.avatar = avatar
    if (isPublic !== undefined) updateData.isPublic = isPublic
    if (maxMembers) updateData.maxMembers = maxMembers

    await prisma.class.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      message: '班级信息更新成功'
    })
  } catch (error) {
    console.error('更新班级信息失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/classes/[id] - 解散班级
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getUserFromRequest(request)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    const classData = await prisma.class.findUnique({
      where: { id }
    })

    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 只有班级创建人可以解散班级
    if (classData.ownerId !== auth.userId) {
      return NextResponse.json(
        { success: false, error: '只有班级创建人可以解散班级' },
        { status: 403 }
      )
    }

    // 删除班级（Prisma 级联删除会处理关联数据，但为了保险，可以显式删除）
    // 注意：MongoDB 的 Prisma 级联删除需要正确配置 schema.prisma
    // schema.prisma 中 ClassMember, ClassAssignment 等都有 onDelete: Cascade
    // 所以直接删除 Class 即可
    
    await prisma.class.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: '班级已解散'
    })
  } catch (error) {
    console.error('解散班级失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
