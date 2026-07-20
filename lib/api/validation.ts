/**
 * lib/api/validation.ts
 * 轻量运行时参数校验（避免引入 zod 依赖）
 *
 * 简单场景使用；如需复杂校验可后续引入 zod
 */

export interface ValidationResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export function required(value: unknown, name: string): string {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${name} 不能为空`)
  }
  return String(value)
}

export function optional(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return String(value)
}

export function toInt(value: string | undefined, name: string, def: number, min?: number): number {
  if (value === undefined || value === null || value === '') return def
  const n = parseInt(value, 10)
  if (isNaN(n)) return def
  return min !== undefined ? Math.max(min, n) : n
}

export function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1
}

export function isObjectId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
}

export function validateObjectId(id: unknown, name = 'id'): string {
  if (!isObjectId(id)) {
    throw new ValidationError(`${name} 格式无效`)
  }
  return id
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/* ============================================================================
 * 兼容旧 lib/validation.ts 的校验函数（迁移自旧模块）
 * 新代码建议使用上方 throw-based 校验函数；以下保留供历史调用方使用
 * ========================================================================== */

/**
 * 校验必填字段，返回错误信息（null 表示通过）
 */
export function validateRequired(obj: Record<string, unknown>, fields: string[]): string | null {
  if (!obj || typeof obj !== 'object') {
    return '无效的请求数据'
  }

  for (const field of fields) {
    const value = obj[field]
    if (value === undefined || value === null || value === '') {
      return `缺少必填字段: ${field}`
    }
    if (typeof value === 'string' && value.trim() === '') {
      return `字段 ${field} 不能为空`
    }
  }

  return null
}

/**
 * 校验邮箱格式
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }
  if (email.length > 254) {
    return false
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return emailRegex.test(email)
}

/**
 * 校验用户名格式：3-20 位字母、数字、下划线或中文
 */
export function validateUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false
  }
  if (username.length < 3 || username.length > 20) {
    return false
  }
  const usernameRegex = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/
  return usernameRegex.test(username)
}

/**
 * 校验密码强度
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['密码不能为空'] }
  }

  if (password.length < 8) {
    errors.push('密码长度至少为8位')
  }

  if (password.length > 128) {
    errors.push('密码长度不能超过128位')
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('密码必须包含至少一个字母')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含至少一个数字')
  }

  const commonPasswords = [
    '12345678', 'password', '123456789', '1234567890', 'qwerty',
    'abc123', '111111', '1234567', '12345', '123456', 'password1', 'qwerty123'
  ]
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('密码过于简单，请使用更强的密码')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
