import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { encrypt, decrypt, maskApiKey } from '@/lib/crypto'

const SETTINGS_KEY = 'system_settings'

const defaultSettings = {
  siteName: 'OJ Platform',
  siteDescription: '在线评测系统',
  allowRegistration: true,
  allowGuestSubmission: false,
  defaultLanguage: 'cpp',
  maxSubmissionSize: 65536,
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpFrom: '',
  // 授权码：存储时加密，对外展示时掩码
  smtpPassword: '',
  // 是否启用 SSL（QQ 邮箱端口 465 需为 true，587 通常为 false）
  smtpSecure: true
}

let memorySettings: Record<string, unknown> | null = null

export type SystemSettings = typeof defaultSettings

/**
 * 读取原始设置（smtpPassword 保持加密态），供内部发信服务使用。
 */
async function getRawSystemSettings(): Promise<SystemSettings> {
  try {
    const setting = await prisma.systemConfig.findUnique({
      where: { key: SETTINGS_KEY }
    })
    if (setting && setting.value && typeof setting.value === 'object') {
      return { ...defaultSettings, ...(setting.value as Record<string, unknown>) } as SystemSettings
    }
  } catch (error) {
    logger.error('获取系统设置失败', error)
  }

  if (memorySettings) {
    return { ...defaultSettings, ...memorySettings } as SystemSettings
  }

  return defaultSettings
}

/**
 * 读取系统设置（对外/前端用）：smtpPassword 返回掩码，避免泄露授权码。
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  const raw = await getRawSystemSettings()
  // 掩码授权码用于前端显示
  return { ...raw, smtpPassword: raw.smtpPassword ? maskApiKey(raw.smtpPassword) : '' }
}

export function getSystemSettingsSync(): SystemSettings {
  if (memorySettings) {
    const merged = { ...defaultSettings, ...memorySettings } as SystemSettings
    return { ...merged, smtpPassword: merged.smtpPassword ? maskApiKey(merged.smtpPassword) : '' }
  }
  return defaultSettings
}

/**
 * 保存系统设置。
 *
 * smtpPassword 特殊处理：
 *   - 若传入值为空或含掩码占位 `****`，说明前端未修改授权码，保留原加密值；
 *   - 否则视为新授权码，加密后入库。
 */
export async function saveSystemSettings(settings: Partial<SystemSettings>): Promise<boolean> {
  try {
    const currentRaw = await getRawSystemSettings()
    const incoming: Record<string, unknown> = { ...settings }

    // trim 字符串字段，防止粘贴带入的空格/不可见字符
    for (const k of ['smtpHost', 'smtpUser', 'smtpFrom']) {
      if (k in incoming && typeof incoming[k] === 'string') {
        incoming[k] = (incoming[k] as string).trim()
      }
    }

    if ('smtpPassword' in incoming) {
      const pwd = (incoming.smtpPassword as string) || ''
      if (!pwd || pwd.includes('****')) {
        // 未修改，保留原值
        incoming.smtpPassword = currentRaw.smtpPassword
      } else {
        // 新授权码，加密存储
        incoming.smtpPassword = encrypt(pwd)
      }
    }

    const newSettings = { ...currentRaw, ...incoming } as SystemSettings

    await prisma.systemConfig.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: newSettings as unknown as object },
      create: { key: SETTINGS_KEY, value: newSettings as unknown as object }
    })

    memorySettings = newSettings as unknown as Record<string, unknown>
    return true
  } catch (error) {
    // 写入失败时返回 false，调用方可感知失败并重试或提示用户
    // 不更新 memorySettings：避免将未持久化的脏数据写入缓存导致后续读取不一致
    logger.error('保存系统设置失败', error)
    return false
  }
}

/**
 * 解密 SMTP 授权码（兼容历史明文：无法解密时按明文返回）。
 */
function tryDecryptPassword(stored: string): string {
  if (!stored) return ''
  if (stored.includes(':')) {
    try {
      return decrypt(stored)
    } catch (err: any) {
      logger.warn('[settings] SMTP 授权码解密失败，按明文处理', { reason: err?.message })
    }
  }
  return stored
}

/**
 * 供邮件服务使用：返回解密后的 SMTP 配置。未配置关键字段时返回 null。
 */
export async function getSmtpConfig(): Promise<{
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
} | null> {
  const raw = await getRawSystemSettings()
  // trim 防止粘贴带入的空格/不可见字符导致 DNS EBADNAME
  const host = (raw.smtpHost || '').trim()
  const user = (raw.smtpUser || '').trim()
  const from = (raw.smtpFrom || '').trim()
  if (!host || !user || !raw.smtpPassword) return null
  return {
    host,
    port: raw.smtpPort,
    secure: raw.smtpSecure,
    user,
    pass: tryDecryptPassword(raw.smtpPassword),
    from: from || user
  }
}

export function setMemorySettings(settings: Record<string, unknown>) {
  memorySettings = settings
}

export { defaultSettings }
