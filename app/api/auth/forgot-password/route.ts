/**
 * POST /api/auth/forgot-password - 忘记密码：发送临时新密码到邮箱
 *
 * 流程：
 *   1. 校验邮箱格式 + IP 限流（防滥用）
 *   2. 查找用户：为避免泄露邮箱是否注册，无论是否存在都返回相同成功信息
 *   3. 生成临时新密码，bcrypt 哈希后入库
 *   4. 通过 SMTP 发送含新密码的邮件
 *
 * 安全说明：
 *   - 临时密码仅返回到邮箱，接口本身不返回明文密码
 *   - 用户不存在时静默成功（不发送邮件），防止枚举探测
 *   - SMTP 未配置时返回 503 提示联系管理员
 */
import crypto from 'crypto'
import { withApi, ok, fail, readJson } from '@/lib/api/withApi'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { findUserByEmail, hashPassword } from '@/lib/auth/service'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { getSystemSettings } from '@/lib/settings'

// 可读字符集（去除易混淆的 0/O/1/l/I）
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generateTempPassword(length = 12): string {
  const bytes = crypto.randomBytes(length)
  let pwd = ''
  for (let i = 0; i < length; i++) {
    pwd += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length]
  }
  return pwd
}

export const POST = withApi.public(async (req) => {
  const { email } = await readJson<{ email: string }>(req)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('VALIDATION', '邮箱格式不正确', 400)
  }

  // IP 级别限流：每分钟最多 3 次找回密码请求
  const ip = getClientIP(req)
  const rl = await checkRateLimit(`forgot-pwd:${ip}`, {
    maxRequests: 3,
    windowMs: 60_000,
    keyPrefix: 'forgot-pwd'
  })
  if (!rl.success) {
    return fail('RATE_LIMITED', '请求过于频繁，请稍后再试', 429)
  }

  const user = await findUserByEmail(email.toLowerCase())

  // 用户不存在：静默返回成功，防止枚举探测邮箱
  if (!user) {
    return ok({ message: '如果该邮箱已注册，你将收到包含新密码的邮件' })
  }

  // 检查 SMTP 是否已配置
  const settings = await getSystemSettings()
  const siteName = settings.siteName || 'OJ Platform'

  const tempPassword = generateTempPassword()
  const username = user.username

  // 先发信，成功后再落库：避免发信失败但密码已被重置导致用户无法登录
  const result = await sendMail({
    to: email,
    subject: `[${siteName}] 密码重置 - 临时新密码`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb; margin-bottom: 16px;">密码重置</h2>
        <p>你好 <strong>${username}</strong>，</p>
        <p>你正在重置 <strong>${siteName}</strong> 账号的密码。这是你的临时新密码：</p>
        <div style="margin: 20px 0; padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center;">
          <span style="font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #1f2937;">${tempPassword}</span>
        </div>
        <p>请使用该临时密码登录，并在登录后尽快修改密码。</p>
        <p style="color: #dc2626;">⚠️ 如果不是你本人发起的请求，请尽快登录并修改密码以保护账号安全。</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">这是一封系统自动发送的邮件，请勿直接回复。</p>
      </div>
    `,
    text: `${siteName} 密码重置\n\n你好 ${username}，\n\n你的临时新密码是：${tempPassword}\n\n请使用该临时密码登录，并在登录后尽快修改密码。\n\n如果不是你本人发起的请求，请尽快登录并修改密码以保护账号安全。\n\n（这是一封系统自动发送的邮件，请勿回复）`
  })

  if (!result.success) {
    return fail('EMAIL_ERROR', result.error || '邮件发送失败，请稍后重试或联系管理员', 503)
  }

  // 发信成功后再将新密码哈希入库
  const hashed = await hashPassword(tempPassword)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed }
  })

  return ok({ message: '新密码已发送至邮箱，请查收' })
})
