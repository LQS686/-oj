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

export function toInt(value: unknown, name: string, def = 0): number {
  const v = Number(value)
  if (!Number.isFinite(v) || !Number.isInteger(v)) {
    throw new ValidationError(`${name} 必须是整数`)
  }
  return v ?? def
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
