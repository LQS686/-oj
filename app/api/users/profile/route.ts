import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

// GET /api/users/profile - 获取当前用户资料
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    // 从数据库获取完整用户信息
    const userProfile = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        avatar: true,
        bio: true,
        rating: true,
        rank: true,
        color: true,
        isAdmin: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            submissions: true,
            problems: true,
            posts: true,
            comments: true,
          }
        }
      }
    })

    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: userProfile
    })
  } catch (error) {
    console.error('获取用户资料失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PUT /api/users/profile - 更新当前用户资料
export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { nickname, bio, avatar } = body

    // 验证昵称长度
    if (nickname && (nickname.length < 1 || nickname.length > 50)) {
      return NextResponse.json(
        { success: false, error: '昵称长度应在1-50个字符之间' },
        { status: 400 }
      )
    }

    // 验证个人简介长度
    if (bio && bio.length > 500) {
      return NextResponse.json(
        { success: false, error: '个人简介不能超过500个字符' },
        { status: 400 }
      )
    }

    // 更新用户资料
    // Use native MongoDB driver to avoid transaction requirement on standalone MongoDB
    const client = await clientPromise
    const db = client.db()
    
    await db.collection('User').updateOne(
      { _id: new ObjectId(user.userId) },
      { 
        $set: {
          ...(nickname !== undefined && { nickname }),
          ...(bio !== undefined && { bio }),
          ...(avatar !== undefined && { avatar }),
          updatedAt: new Date()
        } 
      }
    )

    // Fetch updated user to return (using Prisma is fine for reading)
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        avatar: true,
        bio: true,
        rating: true,
        rank: true,
        color: true,
        isAdmin: true,
        updatedAt: true
      }
    })

    return NextResponse.json({
      success: true,
      message: '资料更新成功',
      data: updatedUser
    })
  } catch (error) {
    console.error('更新用户资料失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PATCH /api/users/profile/password - 修改密码
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: '请提供当前密码和新密码' },
        { status: 400 }
      )
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: '新密码长度至少为6位' },
        { status: 400 }
      )
    }

    // 获取用户当前密码
    const userRecord = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { password: true }
    })

    if (!userRecord) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 验证当前密码
    const isPasswordValid = await bcrypt.compare(currentPassword, userRecord.password)
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: '当前密码错误' },
        { status: 401 }
      )
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // 更新密码
    // Use native MongoDB driver to avoid transaction requirement on standalone MongoDB
    const client = await clientPromise
    const db = client.db()

    await db.collection('User').updateOne(
      { _id: new ObjectId(user.userId) },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date()
        }
      }
    )

    return NextResponse.json({
      success: true,
      message: '密码修改成功'
    })
  } catch (error) {
    console.error('修改密码失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
