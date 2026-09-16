/**
 * lib/backup/secrets.ts
 * 用「恢复口令」加解密系统密钥（JWT_SECRET / ENCRYPTION_KEY）。
 *
 * 刻意不依赖 lib/crypto.ts：后者用运行时 ENCRYPTION_KEY 加解密，
 * 而新站恢复前 ENCRYPTION_KEY 可能不同，故这里改用口令 scrypt 派生独立密钥。
 *
 * 加密输出格式：`v1:saltHex:ivHex:tagHex:cipherHex`
 */
import crypto from 'crypto'

export interface BackupSecrets {
  jwtSecret: string
  encryptionKey: string
}

const PREFIX = 'v1'
const IV_LEN = 12
const TAG_LEN = 16
const SALT_LEN = 16
const KEY_LEN = 32

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // N=2^14, r=8, p=1：兼顾强度与速度（口令 + 盐，防彩虹表）
  return crypto.scryptSync(passphrase, salt, KEY_LEN, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
}

export function encryptSecrets(
  secrets: BackupSecrets,
  passphrase: string
): {
  cipher: string
  salt: string
} {
  if (!passphrase || passphrase.trim() === '') {
    throw new Error('恢复口令不能为空')
  }
  if (!secrets.jwtSecret || !secrets.encryptionKey) {
    throw new Error('缺少 JWT_SECRET / ENCRYPTION_KEY 环境变量，无法打包密钥')
  }
  const salt = crypto.randomBytes(SALT_LEN)
  const key = deriveKey(passphrase, salt)
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify(secrets)
  const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    cipher: [
      PREFIX,
      salt.toString('hex'),
      iv.toString('hex'),
      tag.toString('hex'),
      ct.toString('hex'),
    ].join(':'),
    salt: salt.toString('hex'),
  }
}

export function decryptSecrets(cipherText: string, passphrase: string): BackupSecrets {
  if (!cipherText) throw new Error('备份包内不含密钥数据')
  if (!passphrase || passphrase.trim() === '') {
    throw new Error('该备份包内含系统密钥，必须输入创建备份时设置的「恢复口令」')
  }
  const parts = cipherText.split(':')
  if (parts.length !== 5 || parts[0] !== PREFIX) {
    throw new Error('备份包密钥格式无效')
  }
  const [, saltHex, ivHex, tagHex, cipherHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ct = Buffer.from(cipherHex, 'hex')
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN || salt.length !== SALT_LEN) {
    throw new Error('备份包密钥字段长度无效')
  }
  const key = deriveKey(passphrase, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  try {
    const parsed = JSON.parse(pt.toString('utf8')) as BackupSecrets
    if (!parsed.jwtSecret || !parsed.encryptionKey) throw new Error('密钥内容缺失')
    return parsed
  } catch {
    throw new Error('恢复口令不正确，或备份包密钥已损坏')
  }
}

/** 导出系统当前密钥（供备份写入）。环境变量缺失时返回 null（不打包密钥）。 */
export function collectCurrentSecrets(): BackupSecrets | null {
  const jwtSecret = process.env.JWT_SECRET?.trim()
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim()
  if (!jwtSecret || !encryptionKey) return null
  return { jwtSecret, encryptionKey }
}
