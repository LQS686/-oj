/**
 * POST /api/auth/forgot-password - 忘记密码：发送临时新密码到邮箱
 *
 * 安全：
 *   - 无论邮箱是否注册、发信是否成功（SMTP 未配置除外的业务路径），对外文案一致，防枚举
 *   - SMTP 全局未配置时统一 503（不依赖邮箱是否存在）
 *   - IP 限流由 middleware（3/5min）；另加按邮箱限流降低重置 DoS
 */
import crypto from 'crypto'
import { withApi, ok, fail, readJson } from '@/lib/api/withApi'
import { findUserByEmail, hashPassword } from '@/lib/auth/service'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { getSystemSettings } from '@/lib/settings'
import { clearUserCache } from '@/lib/user/profile'
import { checkRateLimit } from '@/lib/rate-limit'

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const GENERIC_OK = '如果该邮箱已注册，你将收到包含新密码的邮件'

function generateTempPassword(length = 12): string {
  // A-P2-6：crypto.randomInt 内部做拒绝采样，字符分布均匀（替代 % 取模导致的模偏差）
  let pwd = ''
  for (let i = 0; i < length; i++) {
    pwd += PASSWORD_CHARS[crypto.randomInt(PASSWORD_CHARS.length)]
  }
  return pwd
}

export const POST = withApi.public(async (req) => {
  const { email } = await readJson<{ email: string }>(req)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('VALIDATION', '邮箱格式不正确', 400)
  }

  const normalized = email.toLowerCase().trim()

  // 按邮箱限流（与 IP middleware 叠加），降低对已知邮箱的重置轰炸
  const emailRl = await checkRateLimit(`forgot-email:${normalized}`, {
    maxRequests: 3,
    windowMs: 300_000,
    keyPrefix: 'forgot-password-email',
  })
  if (!emailRl.success) {
    return fail('RATE_LIMITED', '请求过于频繁，请稍后再试', 429)
  }

  // 先检查 SMTP：未配置时对所有人返回 503，避免「仅已注册邮箱才 503」枚举
  const { getSmtpConfig } = await import('@/lib/settings')
  const smtp = await getSmtpConfig()
  if (!smtp) {
    return fail('EMAIL_ERROR', '邮件服务暂不可用，请联系管理员', 503)
  }

  const settings = await getSystemSettings()
  const siteName = settings.siteName || '大山 OJ'

  const user = await findUserByEmail(normalized)
  if (!user) {
    return ok({ message: GENERIC_OK })
  }

  const tempPassword = generateTempPassword()
  const username = user.username

  const result = await sendMail({
    to: normalized,
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
    // 发信失败也不区分「邮箱是否存在」文案，避免侧信道
    return ok({ message: GENERIC_OK })
  }

  const hashed = await hashPassword(tempPassword)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, tokenVersion: { increment: 1 } },
  })
  clearUserCache(user.id)

  return ok({ message: GENERIC_OK })
})
