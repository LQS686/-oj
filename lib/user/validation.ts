/**
 * lib/user/validation.ts
 * 用户参数校验
 */
import { required, optional, toBool, ValidationError, asRecord, validatePassword } from '@/lib/api/validation'

export function parseProfileUpdate(body: unknown) {
  const b = asRecord(body)
  return {
    nickname: optional(b.nickname),
    bio: optional(b.bio),
    avatar: optional(b.avatar),
  }
}

export function parseEmailUpdate(body: unknown): { newEmail: string; password: string } {
  const b = asRecord(body)
  return {
    newEmail: required(b.newEmail, '新邮箱'),
    password: required(b.password, '当前密码'),
  }
}

export function parsePasswordUpdate(body: unknown): { oldPassword: string; newPassword: string } {
  const b = asRecord(body)
  const newPassword = required(b.newPassword, '新密码')
  const passwordValidation = validatePassword(newPassword)
  if (!passwordValidation.valid) {
    throw new ValidationError(passwordValidation.errors.join('；'))
  }
  return {
    oldPassword: required(b.oldPassword, '当前密码'),
    newPassword,
  }
}

export function parsePreferencesUpdate(body: unknown) {
  const b = asRecord(body)
  return {
    theme: optional(b.theme),
    language: optional(b.language),
    notifications: toBool(b.notifications),
    soundEnabled: toBool(b.soundEnabled),
  }
}
