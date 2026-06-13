/**
 * POST /api/auth/register - 用户注册
 *
 * 迁移到 withApi 中间件模式（使用 NextResponse 以便设置 cookie）
 */
import { NextResponse } from 'next/server'
import { withApi, readJson, fail } from '@/lib/api/withApi'
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

export const POST = withApi.public(async (req) => {
  const settings = await getSystemSettings()
  if (!settings.allowRegistration) {
    return fail('FORBIDDEN', '系统已关闭注册功能', 403)
  }

  const body = await readJson<{
    username: string
    email: string
    password: string
    nickname?: string
  }>(req)
  const trimmedBody = trimAll(body as any)
  const { username, email, password, nickname } = trimmedBody

  const requiredError = validateRequired(trimmedBody as any, ['username', 'email', 'password'])
  if (requiredError) return fail('BAD_REQUEST', requiredError, 400)

  if (!validateUsername(username as string)) {
    return fail('BAD_REQUEST', '用户名必须为3-20位字母、数字、下划线或中文', 400)
  }

  if (!validateEmail(email as string)) {
    return fail('BAD_REQUEST', '邮箱格式不正确', 400)
  }

  const passwordValidation = validatePassword(password as string)
  if (!passwordValidation.valid) {
    return fail('BAD_REQUEST', passwordValidation.errors.join('；'), 400)
  }

  const sanitizedUsername = escapeHtml(username as string)
  const sanitizedEmail = (email as string).toLowerCase()
  const sanitizedNickname = nickname ? escapeHtml(nickname as string) : sanitizedUsername

  const existingUsername = await prisma.user.findUnique({
    where: { username: sanitizedUsername },
  })
  if (existingUsername) {
    return fail('BAD_REQUEST', '用户名已被使用', 400)
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: sanitizedEmail },
  })
  if (existingEmail) {
    return fail('BAD_REQUEST', '邮箱已被注册', 400)
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
    },
  })

  const token = signToken({
    userId: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  })

  const response = NextResponse.json(
    {
      ok: true,
      success: true,
      data: { user, token },
    },
    { status: 201 }
  )

  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
  })

  return response
})
