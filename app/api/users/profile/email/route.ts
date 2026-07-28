/**
 * /api/users/profile/email - 修改邮箱
 *
 * PUT：校验密码 + 唯一性 + 改绑冷却后，仅通过 Prisma 更新
 */
import { withApi, ok, fail, readJson, throw400, throw401, throw404, throw409 } from '@/lib/api/withApi'
import bcrypt from 'bcryptjs'
import { getUserWithPassword, changeCurrentUserEmail, isEmailTaken } from '@/lib/user/service'
import { AppError } from '@/lib/errors'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PUT = withApi.auth(async (req, _ctx, { user }) => {
  const { checkRateLimit, getClientIP } = await import('@/lib/rate-limit')
  const ip = getClientIP(req)
  const rl = await checkRateLimit(`email-change:${user.id}:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    keyPrefix: 'profile',
  })
  if (!rl.success) {
    return fail('RATE_LIMITED', '邮箱修改过于频繁，请稍后再试', 429)
  }

  const body = await readJson<{ newEmail?: string; password?: string }>(req)
  const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!newEmail || !password) throw400('VALIDATION', '请提供新邮箱和当前密码')
  if (!EMAIL_REGEX.test(newEmail)) throw400('VALIDATION', '邮箱格式不正确')
  if (newEmail.length > 100) throw400('VALIDATION', '邮箱长度不能超过100个字符')

  const userRecord = await getUserWithPassword(user.id)
  if (!userRecord) {
    throw404('用户不存在')
    return
  }

  const isPasswordValid = await bcrypt.compare(password, userRecord.password)
  if (!isPasswordValid) throw401('当前密码错误')

  if (userRecord.email === newEmail.toLowerCase()) {
    return ok({ message: '邮箱未发生变化' })
  }

  const taken = await isEmailTaken(newEmail, user.id)
  if (taken) throw409('该邮箱已被使用或处于改绑冷却期')

  try {
    await changeCurrentUserEmail(user.id, newEmail)
  } catch (e) {
    if (e instanceof AppError) throw e
    throw e
  }

  return ok({ message: '邮箱修改成功，请重新登录', newEmail: newEmail.toLowerCase() })
})
