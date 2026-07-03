import { NextRequest } from 'next/server'
import { getUserFromRequest } from './auth'
import { prisma } from '@/lib/prisma'

/**
 * 验证用户是否为系统管理员（SYSTEM_ADMIN）
 */
export async function requireAdmin(request: NextRequest): Promise<{
  isAdmin: boolean
  user: { userId: string, username: string } | null
  error?: string
}> {
  const currentUser = getUserFromRequest(request)

  if (!currentUser) {
    return {
      isAdmin: false,
      user: null,
      error: '请先登录'
    }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: { role: true, isBanned: true }
    })

    if (!user) {
      return {
        isAdmin: false,
        user: null,
        error: '用户不存在'
      }
    }

    if (user.isBanned) {
      return {
        isAdmin: false,
        user: currentUser,
        error: '账号已被封禁'
      }
    }

    if (user.role !== 'SYSTEM_ADMIN') {
      return {
        isAdmin: false,
        user: currentUser,
        error: '需要管理员权限'
      }
    }

    return {
      isAdmin: true,
      user: currentUser
    }
  } catch (error) {
    console.error('验证管理员权限异常:', error)
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
      select: { role: true, isBanned: true }
    })

    return user?.role === 'SYSTEM_ADMIN' && user?.isBanned === false
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return false
  }
}
