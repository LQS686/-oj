/**
 * POST /api/auth/logout - 用户登出
 *
 * 吊销语义：登出时递增 tokenVersion，使已签发但可能泄露的 JWT 立即失效
 * （与改密/封禁/角色变更的吊销策略一致），避免旧 Token 在 7 天过期前仍可访问受保护资源。
 */
import { NextResponse } from 'next/server'
import { withApi } from '@/lib/api/withApi'
import { getUserFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clearAuthCookie } from '@/lib/auth/cookie'
import { clearCsrfCookie } from '@/lib/security/csrf'
import { clearUserCache } from '@/lib/user/profile'
import { logger } from '@/lib/logger'

export const POST = withApi.public(async (req) => {
  // 即使 cookie 已过期/无 token，也走一次吊销尝试（幂等：无 userId 时跳过）
  const session = getUserFromRequest(req)
  if (session?.userId) {
    try {
      await prisma.user.update({
        where: { id: session.userId },
        data: { tokenVersion: { increment: 1 } },
      })
      clearUserCache(session.userId)
    } catch (e) {
      logger.warn('登出吊销 tokenVersion 失败（忽略，cookie 仍会清除）', e instanceof Error ? e : new Error(String(e)))
    }
  }

  const response = NextResponse.json({
    success: true,
    data: { message: '登出成功' },
  })
  clearAuthCookie(response)
  clearCsrfCookie(response)
  return response
})
