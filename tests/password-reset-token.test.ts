/**
 * tests/password-reset-token.test.ts
 * 密码重置签名 token 的签发与校验（purpose 隔离 / 过期 / 篡改 / tokenVersion 绑定）
 */
import { describe, it, expect, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  signPasswordResetToken,
  verifyPasswordResetToken,
} from '../lib/auth'

const JWT_SECRET = 'test-secret-key-abcdefghijklmnopqrstuvwxyz012345'

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET
})

describe('signPasswordResetToken / verifyPasswordResetToken', () => {
  it('签发后可验证，返回绑定的 userId 与 tokenVersion', () => {
    const token = signPasswordResetToken('u1', 3)
    const payload = verifyPasswordResetToken(token)
    expect(payload).toEqual({ purpose: 'password-reset', userId: 'u1', tokenVersion: 3 })
  })

  it('purpose 隔离：登录 JWT 不能被当作重置 token 使用', () => {
    const loginToken = jwt.sign(
      { userId: 'u1', email: 'a@a.com', username: 'alice', role: 'STUDENT', tokenVersion: 0 },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    )
    expect(verifyPasswordResetToken(loginToken)).toBeNull()
  })

  it('篡改 token 后校验失败', () => {
    const token = signPasswordResetToken('u1', 1)
    // 翻转一个字符模拟篡改
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'b' : 'a')
    expect(verifyPasswordResetToken(tampered)).toBeNull()
  })

  it('过期 token 校验失败', async () => {
    const expired = jwt.sign(
      { purpose: 'password-reset', userId: 'u1', tokenVersion: 0 },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -10 } // 已过期
    )
    expect(verifyPasswordResetToken(expired)).toBeNull()
  })

  it('缺少 purpose / userId / tokenVersion 的载荷校验失败', () => {
    const noPurpose = jwt.sign(
      { userId: 'u1', tokenVersion: 0 },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '30m' }
    )
    expect(verifyPasswordResetToken(noPurpose)).toBeNull()

    const wrongType = jwt.sign(
      { purpose: 'password-reset', userId: 123, tokenVersion: 0 },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '30m' }
    )
    expect(verifyPasswordResetToken(wrongType)).toBeNull()
  })
})
