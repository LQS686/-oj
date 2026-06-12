/**
 * lib/auth/validation.ts
 * 认证参数校验
 */
import { required, optional, ValidationError } from '@/lib/api/validation'

export interface LoginInput {
  identifier: string
  password: string
}

export function parseLoginInput(body: any): LoginInput {
  return {
    identifier: required(body?.identifier ?? body?.email ?? body?.username, '账号'),
    password: required(body?.password, '密码'),
  }
}

export interface RegisterInput {
  username: string
  email: string
  password: string
  nickname?: string
}

export function parseRegisterInput(body: any): RegisterInput {
  return {
    username: required(body?.username, '用户名'),
    email: required(body?.email, '邮箱'),
    password: required(body?.password, '密码'),
    nickname: optional(body?.nickname),
  }
}

export function parseForgotPasswordInput(body: any): { email: string } {
  return { email: required(body?.email, '邮箱') }
}

export class AuthError extends ValidationError {
  constructor(message: string, public code: string = 'AUTH_ERROR') {
    super(message)
    this.name = 'AuthError'
  }
}
