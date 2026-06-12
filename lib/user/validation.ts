/**
 * lib/user/validation.ts
 * 用户参数校验
 */
import { required, optional, toBool, ValidationError } from '@/lib/api/validation'

export function parseProfileUpdate(body: any) {
  return {
    nickname: optional(body?.nickname),
    bio: optional(body?.bio),
    avatar: optional(body?.avatar),
  }
}

export function parseEmailUpdate(body: any): { newEmail: string; password: string } {
  return {
    newEmail: required(body?.newEmail, '新邮箱'),
    password: required(body?.password, '当前密码'),
  }
}

export function parsePasswordUpdate(body: any): { oldPassword: string; newPassword: string } {
  const newPassword = required(body?.newPassword, '新密码')
  if (newPassword.length < 6) throw new ValidationError('新密码至少 6 位')
  return {
    oldPassword: required(body?.oldPassword, '当前密码'),
    newPassword,
  }
}

export function parsePreferencesUpdate(body: any) {
  return {
    theme: optional(body?.theme),
    language: optional(body?.language),
    notifications: toBool(body?.notifications),
    soundEnabled: toBool(body?.soundEnabled),
  }
}
