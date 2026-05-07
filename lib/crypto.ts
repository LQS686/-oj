import crypto from 'crypto'
import { logger } from './logger'

let ENCRYPTION_KEY: Buffer | null = null

function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY) return ENCRYPTION_KEY
  const keyStr = process.env.AI_CONFIG_ENCRYPTION_KEY
  if (!keyStr) {
    throw new Error(
      'AI_CONFIG_ENCRYPTION_KEY 环境变量未设置！请在 .env 文件中配置 32 字节密钥。\n' +
      '生成方式: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  ENCRYPTION_KEY = Buffer.from(keyStr)
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
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  // Try to decrypt first to check length, or just check raw string
  // If it's encrypted (contains :), decrypt it first
  let rawKey = apiKey
  if (apiKey.includes(':')) {
    rawKey = decrypt(apiKey)
  }
  
  if (rawKey.length < 8) return '********'
  return rawKey.slice(0, 3) + '****' + rawKey.slice(-4)
}
