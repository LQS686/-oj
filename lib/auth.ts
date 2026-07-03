import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import dotenv from 'dotenv'

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
  JWT_SECRET = process.env.JWT_SECRET
  isInitialized = true
}

export interface JWTPayload {
  userId: string
  email: string
  username: string
  role: string
}

export function signToken(payload: JWTPayload): string {
  validateJwtSecret()
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 未初始化')
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  validateJwtSecret()
  if (!JWT_SECRET) {
    return null
  }
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch (error) {
    return null
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    if (token && token !== 'null' && token !== 'undefined' && token.split('.').length === 3) {
      return token
    }
  }
  
  const token = request.cookies.get('token')?.value
  return token || null
}

export function getUserFromRequest(request: NextRequest): JWTPayload | null {
  const token = getTokenFromRequest(request)
  if (!token) return null
  return verifyToken(token)
}
