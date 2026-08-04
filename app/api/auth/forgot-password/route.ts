/**
 * POST /api/auth/forgot-password - 忘记密码：发送签名重置链接到邮箱
 *
 * 安全：
 *   - 无论邮箱是否注册、发信是否成功（SMTP 未配置除外的业务路径），对外文案一致，防枚举
 *   - SMTP 全局未配置时统一 503（不依赖邮箱是否存在）
 *   - 不立即改密、不吊销会话：仅在用户通过链接确认后才执行重置（防会话吊销 DoS / 重置轰炸）
 *   - 重置链接为短期签名 token（30 分钟，绑定 tokenVersion，改密/登出后自动失效）
 *   - IP 限流由 middleware（3/5min）；另加按邮箱限流降低重置轰炸
 */
import { withApi, ok, fail, readJson } from '@/lib/api/withApi'
import type { NextRequest } from 'next/server'
import { findUserByEmail } from '@/lib/auth/service'
import { signPasswordResetToken } from '@/lib/auth'
import { sendMail } from '@/lib/email'
import { getSystemSettings } from '@/lib/settings'
import { checkRateLimit } from '@/lib/rate-limit'

const GENERIC_OK = '如果该邮箱已注册，你将收到一封包含重置链接的邮件'

/**
 * 解析站点对外基础 URL（邮件链接使用）。
 * 优先级：显式配置的 NEXT_PUBLIC_BASE_URL（部署脚本写入 https://dsoj.run）
 *  → 反代头（x-forwarded-proto/x-forwarded-host）→ 请求 Host 反射。
 * 不能用 req.nextUrl.host 直接反射：绕过反向代理访问（如 0.0.0.0:3000）时
 * 会把内网地址写进邮件链接，导致用户无法打开。
 * 反代头可能被客户端伪造：仅接受合法 host（域名[:端口]），x-forwarded-proto 取首值。
 */
function resolveSiteBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL
  if (configured && configured.trim()) {
    return configured.replace(/\/+$/, '')
  }
  const rawProto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(/:$/, '')
  const scheme = rawProto.split(',')[0].trim() === 'http' ? 'http' : 'https'
  const rawHost = req.headers.get('x-forwarded-host') || req.nextUrl.host
  const host = rawHost.split(',')[0].trim().toLowerCase()
  const hostOk = /^[a-z0-9.-]+(:\d{1,5})?$/.test(host) && !host.startsWith('.') && !host.includes('..')
  if (!hostOk) {
    return `${req.nextUrl.protocol}//${req.nextUrl.host}`
  }
  return `${scheme}://${host}`
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

  // 生成短期签名重置链接（绑定当前 tokenVersion；用户改密/登出后链接失效）
  const resetToken = signPasswordResetToken(user.id, user.tokenVersion)
  const resetUrl = `${resolveSiteBaseUrl(req)}/reset-password?token=${encodeURIComponent(resetToken)}`

  const result = await sendMail({
    to: normalized,
    subject: `[${siteName}] 密码重置`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb; margin-bottom: 16px;">密码重置</h2>
        <p>你好 <strong>${user.username}</strong>，</p>
        <p>你正在重置 <strong>${siteName}</strong> 账号的密码。请点击下方链接设置新密码：</p>
        <div style="margin: 20px 0; padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: bold;">
            重置密码
          </a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">链接 30 分钟内有效；如果链接无法点击，请复制以下地址到浏览器：</p>
        <p style="color: #1f2937; font-size: 12px; word-break: break-all;">${resetUrl}</p>
        <p style="color: #dc2626; font-size: 13px;">⚠️ 如果不是你本人发起的请求，请忽略此邮件，你的密码不会被修改。</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">这是一封系统自动发送的邮件，请勿直接回复。</p>
      </div>
    `,
    text: `${siteName} 密码重置\n\n你好 ${user.username}，\n\n你正在重置 ${siteName} 账号的密码。请打开以下链接设置新密码（30 分钟内有效）：\n\n${resetUrl}\n\n如果不是你本人发起的请求，请忽略此邮件，你的密码不会被修改。\n\n（这是一封系统自动发送的邮件，请勿回复）`
  })

  if (!result.success) {
    // 发信失败也不区分「邮箱是否存在」文案，避免侧信道
    return ok({ message: GENERIC_OK })
  }

  return ok({ message: GENERIC_OK })
})
