/**
 * POST /api/auth/register - 用户注册
 *
 * 注：使用 NextResponse 自行构造响应以便设置 cookie
 */
import { NextResponse } from 'next/server'
import { withApi, readJson, fail } from '@/lib/api/withApi'
import { registerNewUser } from '@/lib/user/service'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateRequired,
} from '@/lib/api/validation'
import { trimAll } from '@/lib/sanitize'
import { getSystemSettings } from '@/lib/settings'
import { setAuthCookie } from '@/lib/auth/cookie'
import { setCsrfCookie, generateCsrfToken } from '@/lib/security/csrf'

export const POST = withApi.public(async (req) => {
  // 首用户判定优先于「关闭注册」：空库必须允许创建第一个 SYSTEM_ADMIN
  const userCount = await prisma.user.count()
  const isFirstUser = userCount === 0

  const settings = await getSystemSettings()
  if (!settings.allowRegistration && !isFirstUser) {
    return fail('FORBIDDEN', '系统已关闭注册功能', 403)
  }

  const body = await readJson<{
    username: string
    email: string
    password: string
    nickname?: string
  }>(req)
  const trimmedBody = trimAll(body)
  const { username, email, password, nickname } = trimmedBody

  const requiredError = validateRequired(trimmedBody, ['username', 'email', 'password'])
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

  const sanitizedUsername = username as string
  const sanitizedEmail = (email as string).toLowerCase()
  const sanitizedNickname = nickname
    ? String(nickname).trim().slice(0, 50) || sanitizedUsername
    : sanitizedUsername

  const hashedPassword = await bcrypt.hash(password as string, 12)

  const user = await registerNewUser({
    sanitizedUsername,
    sanitizedEmail,
    sanitizedNickname,
    hashedPassword,
  })

  const token = signToken({
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    tokenVersion: 0,
  })

  const response = NextResponse.json(
    {
      success: true,
      data: { user },
    },
    { status: 201 }
  )

  setAuthCookie(response, token)
  setCsrfCookie(response, generateCsrfToken())

  return response
})
