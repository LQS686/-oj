import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { encrypt, decrypt, maskApiKey, isEncryptedSecret } from '@/lib/crypto'
import {
  defaultSettings,
  mergeJudgeSettings,
  type SystemSettings,
  type JudgeSettings,
} from '@/lib/settings-defaults'
import { errorLike } from '@/lib/api/errors'

const SETTINGS_KEY = 'system_settings'

let memorySettings: Record<string, unknown> | null = null

export type { SystemSettings, JudgeSettings }
export { defaultSettings, mergeJudgeSettings }
export { defaultJudgeSettings, normalizeFailFast } from '@/lib/settings-defaults'

function normalizeMerged(raw: Record<string, unknown>): SystemSettings {
  const judgeRaw =
    raw.judge && typeof raw.judge === 'object'
      ? (raw.judge as Partial<JudgeSettings>)
      : undefined
  const merged = {
    ...defaultSettings,
    ...raw,
    judge: mergeJudgeSettings(judgeRaw ?? defaultSettings.judge),
  } as SystemSettings
  merged.siteName = (merged.siteName && merged.siteName.trim()) || defaultSettings.siteName
  merged.siteDescription =
    (merged.siteDescription && merged.siteDescription.trim()) || defaultSettings.siteDescription
  // 历史脏数据可能含 java/javascript；与评测支持语言对齐
  if (!['cpp', 'c', 'python'].includes(merged.defaultLanguage)) {
    merged.defaultLanguage = defaultSettings.defaultLanguage
  }
  return merged
}

/**
 * 读取原始设置（smtpPassword 保持加密态），供内部发信服务使用。
 *
 * 兜底：若数据库中 siteName/siteDescription 为空字符串（历史脏数据或绕过校验写入），
 * 回退到默认值，确保对外永不返回空品牌信息。
 */
/**
 * 读取原始设置。DB 失败且无内存缓存时抛错，避免调用方误用 defaultSettings 开注册。
 */
async function getRawSystemSettings(): Promise<SystemSettings> {
  try {
    const setting = await prisma.systemConfig.findUnique({
      where: { key: SETTINGS_KEY },
    })
    if (setting && setting.value && typeof setting.value === 'object') {
      const merged = normalizeMerged(setting.value as Record<string, unknown>)
      memorySettings = merged as unknown as Record<string, unknown>
      return merged
    }
    // 无配置行：合法空库，返回默认值（允许首次部署）
    const defaults = { ...defaultSettings, judge: { ...defaultSettings.judge } }
    memorySettings = defaults as unknown as Record<string, unknown>
    return defaults
  } catch (error) {
    logger.error('获取系统设置失败', error)
    if (memorySettings) {
      return normalizeMerged(memorySettings)
    }
    throw error
  }
}

/**
 * 启动预热：失败时写入 fail-closed 内存快照（关闭注册），避免评测同步读崩溃。
 */
export async function warmSystemSettingsCache(): Promise<SystemSettings> {
  try {
    return await getRawSystemSettings()
  } catch {
    const closed = {
      ...defaultSettings,
      allowRegistration: false,
      judge: { ...defaultSettings.judge },
    }
    memorySettings = closed as unknown as Record<string, unknown>
    return closed
  }
}

/**
 * 读取系统设置（对外/前端用）：smtpPassword 返回掩码，避免泄露授权码。
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  const raw = await getRawSystemSettings()
  return { ...raw, smtpPassword: raw.smtpPassword ? maskApiKey(raw.smtpPassword) : '' }
}

export function getSystemSettingsSync(): SystemSettings {
  if (memorySettings) {
    const merged = normalizeMerged(memorySettings)
    return {
      ...merged,
      smtpPassword: merged.smtpPassword ? maskApiKey(merged.smtpPassword) : '',
    }
  }
  return { ...defaultSettings, judge: { ...defaultSettings.judge } }
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

    // 仅当 smtpHost 相对已存值发生变化时做 DNS/SSRF 校验，
    // 避免「只改允许注册」等无关开关时因 DNS 抖动导致整次保存失败。
    if ('smtpHost' in incoming && typeof incoming.smtpHost === 'string' && incoming.smtpHost) {
      const host = (incoming.smtpHost as string).trim()
      const prevHost = (currentRaw.smtpHost || '').trim()
      if (host !== prevHost) {
        // 禁止 IP / localhost；仅允许 FQDN，降低 SSRF/内网 SMTP 滥用面
        if (
          !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
            host
          ) ||
          host.toLowerCase() === 'localhost' ||
          host.endsWith('.local') ||
          host.endsWith('.internal')
        ) {
          throw new Error('SMTP Host 必须是合法公网域名（禁止 IP / localhost）')
        }
        const dns = await import('dns')
        const { ssrf } = await import('@/lib/security/safe-fetch')
        let addresses: { address: string; family: number }[]
        try {
          addresses = await dns.promises.lookup(host, { all: true })
        } catch {
          throw new Error('SMTP Host DNS 解析失败')
        }
        if (!addresses.length || addresses.some((a) => ssrf.isPrivateIp(a.address))) {
          throw new Error('SMTP Host 解析结果包含内网地址，已拒绝')
        }
      }
      incoming.smtpHost = host
    }

    // 网站名称/描述：trim 后若为空，回退到默认值，避免前端显示空白
    if ('siteName' in incoming && typeof incoming.siteName === 'string') {
      const trimmed = (incoming.siteName as string).trim()
      incoming.siteName = trimmed || defaultSettings.siteName
    }
    if ('siteDescription' in incoming && typeof incoming.siteDescription === 'string') {
      const trimmed = (incoming.siteDescription as string).trim()
      incoming.siteDescription = trimmed || defaultSettings.siteDescription
    }

    if ('smtpPassword' in incoming) {
      const pwd = (incoming.smtpPassword as string) || ''
      if (!pwd || pwd.includes('****')) {
        incoming.smtpPassword = currentRaw.smtpPassword
      } else {
        incoming.smtpPassword = encrypt(pwd)
      }
    }

    // 深度合并 + 校验评测配置
    if ('judge' in incoming && incoming.judge && typeof incoming.judge === 'object') {
      incoming.judge = mergeJudgeSettings({
        ...currentRaw.judge,
        ...(incoming.judge as Partial<JudgeSettings>),
      })
    }

    const newSettings = normalizeMerged({
      ...(currentRaw as unknown as Record<string, unknown>),
      ...incoming,
    })

    await prisma.systemConfig.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: newSettings as unknown as object },
      create: { key: SETTINGS_KEY, value: newSettings as unknown as object },
    })

    memorySettings = newSettings as unknown as Record<string, unknown>

    // 热更新评测运行时（动态 import 避免 settings ↔ judge 循环依赖）
    try {
      const { applyJudgeRuntimeConfig } = await import('@/lib/judge/config')
      applyJudgeRuntimeConfig()
    } catch (e) {
      logger.warn('评测配置热更新失败（不影响设置保存）', {
        error: e instanceof Error ? e.message : String(e),
      })
    }

    return true
  } catch (error) {
    logger.error('保存系统设置失败', error)
    // 向上抛出可读错误，避免管理端只看到笼统「保存设置失败」
    if (error instanceof Error) throw error
    throw new Error(String(error))
  }
}

/**
 * 解密 SMTP 授权码。仅接受 AES-GCM 密文，拒绝明文。
 */
function tryDecryptPassword(stored: string): string {
  if (!stored) return ''
  if (!isEncryptedSecret(stored)) {
    throw new Error('SMTP 授权码必须为加密存储，请重新保存邮件设置')
  }
  try {
    return decrypt(stored)
  } catch (err: unknown) {
    const e = errorLike(err)
    logger.error('[settings] SMTP 授权码解密失败', { reason: e.message })
    throw new Error('SMTP 授权码解密失败，请重新保存邮件设置')
  }
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
  const host = (raw.smtpHost || '').trim()
  const user = (raw.smtpUser || '').trim()
  const from = (raw.smtpFrom || '').trim()
  if (!host || !user || !raw.smtpPassword) return null
  let pass: string
  try {
    pass = tryDecryptPassword(raw.smtpPassword)
  } catch {
    // 密文损坏时 fail-closed：视为未配置，禁止用错误凭据发信
    return null
  }
  return {
    host,
    port: raw.smtpPort,
    secure: raw.smtpSecure,
    user,
    pass,
    from: from || user,
  }
}

export function setMemorySettings(settings: Record<string, unknown>) {
  memorySettings = settings
}
