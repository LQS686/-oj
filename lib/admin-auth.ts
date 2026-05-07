import { NextRequest } from 'next/server'
import { getUserFromRequest } from './auth'
import { prisma } from '@/lib/prisma'

/**
 * 验证用户是否为管理员
 */
export async function requireAdmin(request: NextRequest): Promise<{ 
  isAdmin: boolean
  user: { userId: string, username: string } | null
  error?: string
}> {
  console.log('🔐 开始验证管理员权限...')
  
  // 验证登录状态
  const currentUser = getUserFromRequest(request)
  console.log('👤 获取用户信息:', currentUser ? { userId: currentUser.userId, username: currentUser.username, isAdmin: currentUser.isAdmin } : 'null')
  
  if (!currentUser) {
    console.error('❌ 权限验证失败: 未登录')
    return {
      isAdmin: false,
      user: null,
      error: '请先登录'
    }
  }

  // 验证管理员权限
  try {
    console.log('🔍 查询数据库验证管理员权限...')
    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: { isAdmin: true, isBanned: true }
    })
    console.log('📊 数据库查询结果:', user)

    if (!user) {
      console.error('❌ 权限验证失败: 用户不存在')
      return {
        isAdmin: false,
        user: null,
        error: '用户不存在'
      }
    }

    if (user.isBanned) {
      console.error('❌ 权限验证失败: 账号已被封禁')
      return {
        isAdmin: false,
        user: currentUser,
        error: '账号已被封禁'
      }
    }

    if (!user.isAdmin) {
      console.error('❌ 权限验证失败: 不是管理员')
      return {
        isAdmin: false,
        user: currentUser,
        error: '需要管理员权限'
      }
    }

    console.log('✅ 权限验证通过: 用户是管理员')
    return {
      isAdmin: true,
      user: currentUser
    }
  } catch (error) {
    console.error('💥 验证管理员权限异常:', error)
    return {
      isAdmin: false,
      user: currentUser,
      error: '验证失败'
    }
  }
}

/**
 * 获取管理员权限（不抛出错误，只返回状态）
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, isBanned: true }
    })

    return user?.isAdmin === true && user?.isBanned === false
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return false
  }
}
