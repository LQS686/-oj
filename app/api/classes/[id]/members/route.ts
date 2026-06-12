import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// GET /api/classes/[id]/members - 获取班级成员列表
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

    // 检查班级可见性和成员身份
    const classData = await prisma.class.findUnique({
      where: { id },
    })

    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 检查班级可见性
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

    // 构建成员查询条件
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

    // 获取成员列表（包含用户信息）
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

    // 处理成员数据
    let memberDetails = members.map(member => ({
      id: member.id,
      userId: member.userId,
      username: member.user.username,
      nickname: member.user.nickname,
      avatar: member.user.avatar,
      role: member.role,
      permissions: member.permissions || {},
      joinedAt: member.joinedAt,
      lastActiveAt: member.lastActiveAt,
      remark: member.remark
    }))

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      memberDetails = memberDetails.filter(m => 
        m.username?.toLowerCase().includes(query) ||
        (m.nickname && m.nickname.toLowerCase().includes(query)) ||
        (m.remark && m.remark.toLowerCase().includes(query))
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

    return NextResponse.json({
      success: true,
      data: memberDetails
    })
  } catch (error) {
    console.error('获取班级成员失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// POST /api/classes/[id]/members - 邀请成员加入班级
export async function POST(
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

    const body = await request.json()
    const { username } = body

    if (!username) {
      return NextResponse.json(
        { success: false, error: '请提供用户名' },
        { status: 400 }
      )
    }

    // 检查邀请者权限
    const inviter = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: auth.userId
        }
      }
    })

    const isAdmin = inviter && (inviter.role === 'owner' || inviter.role === 'assistant')
    
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    // 查找要邀请的用户
    const targetUser = await prisma.user.findUnique({
      where: { username }
    })

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 检查是否已经是成员
    const existingMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: targetUser.id
        }
      }
    })

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: '该用户已是班级成员' },
        { status: 400 }
      )
    }

    // 检查班级人数限制
    const classData = await prisma.class.findUnique({ where: { id } })
    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }
    
    const memberCount = await prisma.classMember.count({ where: { classId: id } })

    if (memberCount >= classData.maxMembers) {
      return NextResponse.json(
        { success: false, error: '班级人数已达上限' },
        { status: 400 }
      )
    }

    // 添加成员
    await prisma.classMember.create({
      data: {
        classId: id,
        userId: targetUser.id,
        role: 'student',
        joinedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: `成功邀请 ${username} 加入班级`
    })
  } catch (error) {
    console.error('邀请成员失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/classes/[id]/members?userId=xxx - 移除成员
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
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    if (!targetUserId || !isValidObjectId(targetUserId)) {
      return NextResponse.json(
        { success: false, error: '无效的用户ID' },
        { status: 400 }
      )
    }

    // 检查操作者权限
    const operator = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: auth.userId
        }
      }
    })
    
    const operatorIsAdmin = operator && (operator.role === 'owner' || operator.role === 'assistant')
    
    // 可以移除成员的情况：
    // 1. 操作者是管理员
    // 2. 操作者是成员本人（退出班级）
    const isSelf = auth.userId === targetUserId
    
    if (!operatorIsAdmin && !isSelf) {
      return NextResponse.json(
        { success: false, error: '权限不足' },
        { status: 403 }
      )
    }

    // 检查目标成员
    const targetMember = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: targetUserId
        }
      }
    })

    if (!targetMember) {
      return NextResponse.json(
        { success: false, error: '该用户不是班级成员' },
        { status: 404 }
      )
    }

    // 不能移除班级创建人
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { success: false, error: '不能移除班级创建人' },
        { status: 400 }
      )
    }

    // 移除成员
    await prisma.classMember.delete({
      where: {
        classId_userId: {
          classId: id,
          userId: targetUserId
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: isSelf ? '已退出班级' : '成员已移除'
    })
  } catch (error) {
    console.error('移除成员失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PATCH /api/classes/[id]/members - 更新成员角色
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
    const body = await request.json()
    const { userId, role } = body

    if (!isValidObjectId(id) || !isValidObjectId(userId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    if (!['assistant', 'student'].includes(role)) {
      return NextResponse.json(
        { success: false, error: '无效的角色' },
        { status: 400 }
      )
    }

    // 只有班级创建人可以设置管理员
    const operator = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: auth.userId
        }
      }
    })

    const isOwner = operator && operator.role === 'owner'

    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: '只有班级创建人可以设置管理员' },
        { status: 403 }
      )
    }

    // 更新角色
    try {
      await prisma.classMember.update({
        where: {
          classId_userId: {
            classId: id,
            userId: userId
          }
        },
        data: { role }
      })
    } catch (e) {
      return NextResponse.json(
        { success: false, error: '成员不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '成员角色已更新'
    })
  } catch (error) {
    console.error('更新成员角色失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
