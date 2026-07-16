/**
 * lib/email.ts
 * 基于 nodemailer 的邮件发送服务。
 *
 * SMTP 配置来源于系统设置（lib/settings.ts），授权码在存储时已加密，
 * 此处通过 getSmtpConfig() 获取解密后的配置。
 *
 * QQ 邮箱推荐配置：
 *   - host: smtp.qq.com
 *   - port: 465（SSL，secure=true）或 587（STARTTLS，secure=false）
 *   - user: 完整邮箱地址
 *   - pass: 授权码（非 QQ 密码）
 */
import nodemailer, { type Transporter } from 'nodemailer'
import { getSmtpConfig, getSystemSettings } from './settings'
import { logger } from './logger'

export interface SendMailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

export interface SendMailResult {
  success: boolean
  error?: string
  messageId?: string
}

let transporter: Transporter | null = null
// 配置指纹：用于判断是否需要重建 transporter
let lastConfigSig = ''

function buildSignature(cfg: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}): string {
  return `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}:${cfg.pass.length}`
}

/**
 * 根据端口号推断是否应启用 SSL。
 *
 * 约定（QQ 邮箱等主流服务商通用）：
 *   - 465  → 隐式 SSL（secure=true）
 *   - 587  → STARTTLS（secure=false，nodemailer 会自动升级）
 *   - 25   → 明文（secure=false）
 *
 * 用户在后台勾选的 secure 可能与端口不符（例如 465 + 未勾选 SSL），
 * 此时会导致 "wrong version number" 之类的 SSL 握手错误。
 * 此函数在用户配置明显不符时自动纠正，避免发信失败。
 */
function normalizeSecure(port: number, secure: boolean): boolean {
  if (port === 465) return true
  if (port === 587 || port === 25) return false
  return secure
}

function createTransporter(cfg: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }
  })
}

/**
 * 发送邮件。SMTP 未配置时返回失败而非抛错，便于调用方优雅降级。
 *
 * SSL 容错：若按用户配置的 secure 发送失败且错误疑似 SSL/版本不匹配，
 * 会自动切换 secure 值重试一次（例如 465 端口错配 secure=false 的场景）。
 */
export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  const cfg = await getSmtpConfig()
  if (!cfg) {
    return { success: false, error: '邮件服务未配置，请联系管理员在系统设置中填写 SMTP 参数' }
  }

  // 自动修正 secure 与端口的一致性
  const correctedSecure = normalizeSecure(cfg.port, cfg.secure)
  if (correctedSecure !== cfg.secure) {
    logger.warn('[email] 检测到 SSL 配置与端口不匹配，已自动修正', {
      port: cfg.port,
      original: cfg.secure,
      corrected: correctedSecure
    })
  }
  const effectiveCfg = { ...cfg, secure: correctedSecure }

  const sig = buildSignature(effectiveCfg)
  if (!transporter || sig !== lastConfigSig) {
    transporter = createTransporter(effectiveCfg)
    lastConfigSig = sig
  }

  const to = Array.isArray(opts.to) ? opts.to.join(',') : opts.to
  const sendOnce = async (t: Transporter) => {
    return t.sendMail({
      from: effectiveCfg.from,
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text
    })
  }

  try {
    const info = await sendOnce(transporter)
    logger.info('[email] 邮件发送成功', { to, subject: opts.subject, messageId: info.messageId })
    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    const errMsg = err?.message || '发送失败'
    // 检测疑似 SSL/版本不匹配错误，切换 secure 重试一次
    const looksLikeSslError = /wrong version number|SSL|TLS|EBADNAME|EPROTO|ECONNRESET/i.test(errMsg)
    if (looksLikeSslError) {
      const flippedSecure = !effectiveCfg.secure
      logger.warn('[email] 首次发送失败，切换 SSL 重试', {
        port: effectiveCfg.port,
        originalSecure: effectiveCfg.secure,
        retrySecure: flippedSecure,
        firstError: errMsg
      })
      try {
        const retryTransporter = createTransporter({ ...effectiveCfg, secure: flippedSecure })
        const info2 = await sendOnce(retryTransporter)
        logger.info('[email] 切换 SSL 后发送成功', { to, subject: opts.subject, secure: flippedSecure })
        return { success: true, messageId: info2.messageId }
      } catch (err2: any) {
        const err2Msg = err2?.message || '发送失败'
        logger.error('[email] 切换 SSL 重试仍失败', {
          to, subject: opts.subject,
          host: effectiveCfg.host, port: effectiveCfg.port,
          triedSecure: [effectiveCfg.secure, flippedSecure],
          errors: [errMsg, err2Msg]
        })
        return {
          success: false,
          error: `SMTP 连接失败（已尝试两种 SSL 模式）。请检查：1) 端口与 SSL 是否匹配（465→开, 587→关）；2) 授权码是否正确；3) 网络是否可达。最后错误：${err2Msg}`
        }
      }
    }

    logger.error('[email] 邮件发送失败', {
      to, subject: opts.subject,
      host: effectiveCfg.host, port: effectiveCfg.port, secure: effectiveCfg.secure,
      error: errMsg
    })
    return { success: false, error: errMsg }
  }
}

/**
 * 发送测试邮件（管理后台用于验证 SMTP 配置是否正确）。
 */
export async function sendTestEmail(to: string): Promise<SendMailResult> {
  const settings = await getSystemSettings()
  const siteName = settings.siteName || '大山 OJ'
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  return sendMail({
    to,
    subject: `[${siteName}] 测试邮件`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb; margin-bottom: 16px;">测试邮件</h2>
        <p>你好，</p>
        <p>这是来自 <strong>${siteName}</strong> 的测试邮件，说明 SMTP 配置正常工作。</p>
        <p>发送时间：${time}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">这是一封系统自动发送的邮件，请勿直接回复。</p>
      </div>
    `,
    text: `测试邮件\n\n这是来自 ${siteName} 的测试邮件，说明 SMTP 配置正常工作。\n发送时间：${time}`
  })
}
