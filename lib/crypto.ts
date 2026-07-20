import crypto from 'crypto'
import { logger } from './logger'

let ENCRYPTION_KEY: Buffer | null = null

/**
 * 规范化密钥为 32 字节 Buffer（AES-256-CBC 要求）
 *
 * 支持以下输入格式（自动识别）：
 *  1. base64 字符串（44 字符）→ 32 字节 — 推荐
 *     生成: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *  2. hex 字符串（64 字符）→ 32 字节
 *     生成: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *  3. 原始 32 字节字符串 → 32 字节
 *
 * 长度不是 32 字节时抛错，错误信息含修复指引。
 */
function normalizeKey(keyStr: string): Buffer {
  const candidates: Array<{ name: string; buf: Buffer }> = [
    { name: 'base64', buf: Buffer.from(keyStr, 'base64') },
    { name: 'hex',    buf: Buffer.from(keyStr, 'hex') }
  ]
  for (const { name, buf } of candidates) {
    if (buf.length === 32) return buf
  }
  // 兜底：尝试把字符串本身当 32 字节
  const raw = Buffer.from(keyStr)
  if (raw.length === 32) return raw

  throw new Error(
    `ENCRYPTION_KEY 长度不正确（得到 ${raw.length} 字节，需要 32 字节）。\n` +
    `请重新生成：node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
    `然后把输出填入 .env 的 ENCRYPTION_KEY 并重启服务。`
  )
}

/**
 * 读取加密密钥。必须已通过环境变量配置。
 * 仅供 encrypt() 写入路径使用 — 一旦调用此函数就说明要写入了，必须有 key。
 * 读取路径（maskApiKey / decrypt）应使用 tryGetEncryptionKey()，缺 key 时降级而非 500。
 */
function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY) return ENCRYPTION_KEY
  const keyStr = process.env.ENCRYPTION_KEY
  if (!keyStr) {
    throw new Error(
      'ENCRYPTION_KEY 环境变量未设置！请在 .env 文件中配置 32 字节密钥。\n' +
      '生成方式: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }
  ENCRYPTION_KEY = normalizeKey(keyStr)
  return ENCRYPTION_KEY
}

/**
 * 容错读取加密密钥。供 maskApiKey / decrypt（读取路径）使用，缺 key 时返回 null，
 * 调用方应降级为显示 `********` 而不是抛 500。
 */
function tryGetEncryptionKey(): Buffer | null {
  if (ENCRYPTION_KEY) return ENCRYPTION_KEY
  const keyStr = process.env.ENCRYPTION_KEY
  if (!keyStr) {
    return null
  }
  try {
    ENCRYPTION_KEY = normalizeKey(keyStr)
  } catch (err: any) {
    // 密钥格式错误 — 记日志后降级
    logger.warn('[crypto] 密钥规范化失败，降级处理', { reason: err?.message })
    return null
  }
  return ENCRYPTION_KEY
}

const IV_LENGTH = 16

export function encrypt(text: string): string {
  if (!text) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(text: string): string {
  if (!text) return ''
  const textParts = text.split(':')
  if (textParts.length < 2) {
    throw new Error('Invalid encrypted format')
  }
  const key = tryGetEncryptionKey()
  if (!key) {
    throw new Error('ENCRYPTION_KEY missing')
  }
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

/**
 * 掩码 API Key 用于前端显示
 *
 * 容错策略：
 *   - 空字符串 → 返回 ''
 *   - 未加密的 raw key（含 ':' 视作已加密）→ 直接掩码显示
 *   - 已加密且密钥可用 → 解密后掩码显示
 *   - 已加密但密钥缺失 / 解密失败 → 降级返回 '********'（不抛 500）
 *   - 解密结果长度不足 8 → 返回 '********'
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''

  let rawKey = apiKey
  if (apiKey.includes(':')) {
    try {
      rawKey = decrypt(apiKey)
    } catch (err: any) {
      // 密钥缺失 / 解密失败 / 格式异常 — 降级显示，绝不抛 500
      logger.warn('[maskApiKey] 解密失败，降级显示 ********', {
        reason: err?.message,
        apiKeyPrefix: apiKey.slice(0, 8)
      })
      return '********'
    }
  }

  if (rawKey.length < 8) return '********'
  return rawKey.slice(0, 3) + '****' + rawKey.slice(-4)
}
