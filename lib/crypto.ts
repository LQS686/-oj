import crypto from 'crypto'
import { logger } from './logger'

let ENCRYPTION_KEY: Buffer | null = null

/**
 * 规范化密钥为 32 字节 Buffer（AES-256-GCM）
 */
function normalizeKey(keyStr: string): Buffer {
  const candidates: Array<{ buf: Buffer }> = [
    { buf: Buffer.from(keyStr, 'base64') },
    { buf: Buffer.from(keyStr, 'hex') },
  ]
  for (const { buf } of candidates) {
    if (buf.length === 32) return buf
  }
  const raw = Buffer.from(keyStr)
  if (raw.length === 32) return raw

  throw new Error(
    `ENCRYPTION_KEY 长度不正确（得到 ${raw.length} 字节，需要 32 字节）。\n` +
      `请重新生成：node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
      `然后把输出填入 .env 的 ENCRYPTION_KEY 并重启服务。`
  )
}

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

function tryGetEncryptionKey(): Buffer | null {
  try {
    return getEncryptionKey()
  } catch (err: unknown) {
    logger.warn('[crypto] 密钥不可用', {
      reason: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

const IV_LENGTH = 12 // GCM 推荐 96-bit IV
const AUTH_TAG_LENGTH = 16
const FORMAT_PREFIX = 'gcm'

/**
 * AES-256-GCM 加密。输出格式：gcm:ivHex:tagHex:cipherHex
 */
export function encrypt(text: string): string {
  if (!text) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    FORMAT_PREFIX,
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * AES-256-GCM 解密。仅接受 gcm: 前缀格式，拒绝明文与旧 CBC。
 */
export function decrypt(text: string): string {
  if (!text) return ''
  const parts = text.split(':')
  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) {
    throw new Error('Invalid encrypted format (expect gcm:iv:tag:cipher)')
  }
  const key = tryGetEncryptionKey()
  if (!key) {
    throw new Error('ENCRYPTION_KEY missing')
  }
  const [, ivHex, tagHex, cipherHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encryptedText = Buffer.from(cipherHex, 'hex')
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid GCM iv/tag length')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()])
  return decrypted.toString('utf8')
}

export function isEncryptedSecret(value: string): boolean {
  return typeof value === 'string' && value.startsWith(`${FORMAT_PREFIX}:`)
}

/**
 * 掩码敏感字段用于前端显示
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''

  if (!isEncryptedSecret(apiKey)) {
    return '********'
  }

  try {
    const rawKey = decrypt(apiKey)
    if (rawKey.length < 8) return '********'
    return rawKey.slice(0, 3) + '****' + rawKey.slice(-4)
  } catch (err: unknown) {
    logger.warn('[maskApiKey] 解密失败', {
      reason: err instanceof Error ? err.message : String(err),
    })
    return '********'
  }
}
