/**
 * POST /api/admin/settings/test-email - 发送测试邮件
 *
 * 用于在管理后台验证 SMTP 配置是否正确。仅 SYSTEM_ADMIN 可调用。
 *
 * Body: { email: string }
 */
import { withApi, ok, fail, readJson } from '@/lib/api/withApi'
import { sendTestEmail } from '@/lib/email'
import { validateEmail } from '@/lib/api/validation'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export const POST = withApi.systemAdmin(async (req) => {
  const ip = getClientIP(req)
  const rl = await checkRateLimit(`test-email:${ip}`, {
    maxRequests: 3,
    windowMs: 60_000,
    keyPrefix: 'admin',
  })
  if (!rl.success) {
    return fail('RATE_LIMITED', '测试邮件发送过于频繁，请稍后再试', 429)
  }

  const { email } = await readJson<{ email: string }>(req)

  if (!email || typeof email !== 'string') {
    return fail('VALIDATION', '请输入收件邮箱', 400)
  }
  if (!validateEmail(email.trim())) {
    return fail('VALIDATION', '邮箱格式不正确', 400)
  }

  const result = await sendTestEmail(email.trim())

  if (!result.success) {
    return fail('EMAIL_ERROR', result.error || '邮件发送失败', 500)
  }

  return ok({ message: '测试邮件已发送，请查收' })
})
