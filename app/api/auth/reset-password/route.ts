/**
 * POST /api/auth/reset-password - 通过签名重置链接设置新密码
 *
 * 安全：
 *   - 校验签名 token（purpose=password-reset，30 分钟有效）
 *   - token 绑定签发时的 tokenVersion：期间改密/登出会使 token 失效
 *   - 新密码走统一 validatePassword 策略
 *   - 成功后递增 tokenVersion，使所有旧会话失效（与改密语义一致）
 */
import { withApi, ok, fail, readJson } from '@/lib/api/withApi'
import { verifyPasswordResetToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth/service'
import { validatePassword } from '@/lib/api/validation'
import { clearUserCache } from '@/lib/user/profile'

export const POST = withApi.public(async (req) => {
  const { token, password } = await readJson<{ token?: string; password?: string }>(req)

  if (!token || typeof token !== 'string') {
    return fail('VALIDATION', '重置链接无效或已过期', 400)
  }
  if (!password || typeof password !== 'string') {
    return fail('VALIDATION', '请提供新密码', 400)
  }

  const payload = verifyPasswordResetToken(token)
  if (!payload) {
    return fail('INVALID_TOKEN', '重置链接无效或已过期', 400)
  }

  const trimmedPassword = password.trim()
  const passwordValidation = validatePassword(trimmedPassword)
  if (!passwordValidation.valid) {
    return fail('WEAK_PASSWORD', passwordValidation.errors.join('；'), 400)
  }

  // 重新查库校验 tokenVersion：链接签发后若用户改密/登出/被重置，旧链接失效
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, tokenVersion: true, password: true },
  })
  if (!user) {
    return fail('INVALID_TOKEN', '重置链接无效或已过期', 400)
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    return fail('INVALID_TOKEN', '重置链接已失效，请重新发起', 400)
  }

  const hashed = await hashPassword(trimmedPassword)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, tokenVersion: { increment: 1 } },
  })
  clearUserCache(user.id)

  return ok({ message: '密码重置成功，请使用新密码登录' })
})
