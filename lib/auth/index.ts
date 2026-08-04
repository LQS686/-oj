/**
 * lib/auth/index.ts
 * 认证模块统一入口（JWT 工具 + 业务服务 + 参数校验）
 */
import jwt from 'jsonwebtoken'
import type { NextRequest } from 'next/server'
import dotenv from 'dotenv'
import { readAuthTokenFromRequest } from './cookie'

// 加载环境变量
dotenv.config()

let JWT_SECRET: string | null = null
let isInitialized = false

export function validateJwtSecret(): void {
  if (isInitialized) return

  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET 环境变量未设置！请在 .env 文件中配置 JWT_SECRET。\n' +
      '示例: JWT_SECRET=your-secure-random-string-at-least-32-characters-long'
    )
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error(
      `JWT_SECRET 长度不足（${process.env.JWT_SECRET.length} < 32），存在被暴力破解风险。\n` +
      `请使用至少 32 字符的强随机字符串：\n` +
      `  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
    )
  }
  JWT_SECRET = process.env.JWT_SECRET
  isInitialized = true
}

export interface JWTPayload {
  userId: string
  email: string
  username: string
  role: string
  tokenVersion: number
}

/** 显式声明算法白名单（防御算法混淆攻击 / algorithm confusion CVE） */
const JWT_ALGORITHM: jwt.Algorithm = 'HS256' as jwt.Algorithm

export function signToken(payload: JWTPayload): string {
  validateJwtSecret()
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 未初始化')
  }
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: '7d',
  })
}

export function verifyToken(token: string): JWTPayload | null {
  validateJwtSecret()
  if (!JWT_SECRET) {
    return null
  }
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as JWTPayload
  } catch {
    return null
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  // 仅 Cookie 会话；不接受 Authorization Bearer（避免 CSRF 旁路与双通道）
  return readAuthTokenFromRequest(request)
}

export function getUserFromRequest(request: NextRequest): JWTPayload | null {
  const token = getTokenFromRequest(request)
  if (!token) return null
  return verifyToken(token)
}

/* ============================================================================
 * 密码重置签名 token（forgot-password 流程）
 * 短 TTL（30 分钟）+ 绑定 tokenVersion：改密/登出后旧链接立即失效。
 * purpose 字段防止被当作登录 token 使用（与 login JWT payload 区分）。
 * ========================================================================== */

const RESET_TOKEN_EXPIRES = '30m'

export interface PasswordResetPayload {
  purpose: 'password-reset'
  userId: string
  tokenVersion: number
}

export function signPasswordResetToken(userId: string, tokenVersion: number): string {
  validateJwtSecret()
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 未初始化')
  }
  const payload: PasswordResetPayload = { purpose: 'password-reset', userId, tokenVersion }
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: RESET_TOKEN_EXPIRES,
  })
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload | null {
  validateJwtSecret()
  if (!JWT_SECRET) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload & Partial<PasswordResetPayload>
    if (payload?.purpose !== 'password-reset') return null
    if (typeof payload.userId !== 'string' || typeof payload.tokenVersion !== 'number') {
      return null
    }
    return { purpose: 'password-reset', userId: payload.userId, tokenVersion: payload.tokenVersion }
  } catch {
    return null
  }
}

// 注意：勿在此 barrel 再导出 ./service（会把 prisma/cache/ioredis 拉进客户端图）
// 需要 findUserById / hashPassword 等请直接 import '@/lib/auth/service'
