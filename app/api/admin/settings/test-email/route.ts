/**
 * POST /api/admin/settings/test-email - 发送测试邮件
 *
 * 用于在管理后台验证 SMTP 配置是否正确。仅 SYSTEM_ADMIN 可调用。
 *
 * Body: { email: string }
 */
import { withApi, ok, fail, readJson } from '@/lib/api/withApi'
import { sendTestEmail } from '@/lib/email'

export const POST = withApi.systemAdmin(async (req) => {
  const { email } = await readJson<{ email: string }>(req)

  if (!email) {
    return fail('VALIDATION', '请输入收件邮箱', 400)
  }

  const result = await sendTestEmail(email)

  if (!result.success) {
    return fail('EMAIL_ERROR', result.error || '邮件发送失败', 500)
  }

  return ok({ message: '测试邮件已发送，请查收' })
})
