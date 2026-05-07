import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateRequired,
} from '@/lib/validation'
import { trimAll, escapeHtml } from '@/lib/sanitize'
import { getSystemSettings } from '@/lib/settings'
import { errorHandler } from '@/lib/error-handler'
import { logger } from '@/lib/logger'
import { errorMonitor } from '@/lib/error-monitor'
import { badRequest, forbidden, created } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const settings = await getSystemSettings()
    
    if (!settings.allowRegistration) {
      return forbidden('系统已关闭注册功能')
    }
    
    const body = await request.json()
    const trimmedBody = trimAll(body)
    const { username, email, password, nickname } = trimmedBody

    const requiredError = validateRequired(trimmedBody, ['username', 'email', 'password'])
    if (requiredError) {
      return badRequest(requiredError)
    }

    if (!validateUsername(username as string)) {
      return badRequest('用户名必须为3-20位字母、数字、下划线或中文')
    }

    if (!validateEmail(email as string)) {
      return badRequest('邮箱格式不正确')
    }

    const passwordValidation = validatePassword(password as string)
    if (!passwordValidation.valid) {
      return badRequest(passwordValidation.errors.join('；'))
    }

    const sanitizedUsername = escapeHtml(username as string)
    const sanitizedEmail = (email as string).toLowerCase()
    const sanitizedNickname = nickname ? escapeHtml(nickname as string) : sanitizedUsername

    const existingUsername = await prisma.user.findUnique({
      where: { username: sanitizedUsername }
    })

    if (existingUsername) {
      return badRequest('用户名已被使用')
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: sanitizedEmail }
    })

    if (existingEmail) {
      return badRequest('邮箱已被注册')
    }

    const hashedPassword = await bcrypt.hash(password as string, 10)

    const userCount = await prisma.user.count()
    const isFirstUser = userCount === 0

    const user = await prisma.user.create({
      data: {
        username: sanitizedUsername,
        email: sanitizedEmail,
        password: hashedPassword,
        nickname: sanitizedNickname,
        rating: 1500,
        rank: isFirstUser ? '管理员' : '新手',
        color: isFirstUser ? '#FF6B6B' : '#808080',
        isAdmin: isFirstUser,
        role: isFirstUser ? 'ADMIN' : 'USER',
        isSuperAdmin: isFirstUser,
        isBanned: false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        rating: true,
        rank: true,
        color: true,
        isAdmin: true,
        role: true,
        isSuperAdmin: true,
        createdAt: true,
      }
    })

    const token = signToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
    })

    const response = created(
      { user, token },
      '注册成功'
    )

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    })

    return response
  } catch (error) {
    logger.error('注册错误:', error)
    await errorMonitor.trackError(error instanceof Error ? error : String(error), { errorType: 'auth', endpoint: '/api/auth/register' })
    return errorHandler.handle(error, request)
  }
}
