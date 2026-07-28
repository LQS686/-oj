/**
 * GET /api/auth/csrf - 签发 CSRF 双提交 Cookie，并在响应体返回 token
 * 前端在写操作前调用，将 token 填入 X-CSRF-Token。
 */
import { NextResponse } from 'next/server'
import { withApi, ok } from '@/lib/api/withApi'
import { generateCsrfToken, setCsrfCookie, readCsrfCookie } from '@/lib/security/csrf'

export const GET = withApi.public(async (req) => {
  const existing = readCsrfCookie(req)
  const token = existing && existing.length >= 32 ? existing : generateCsrfToken()
  const response = NextResponse.json({ success: true, data: { csrfToken: token } })
  setCsrfCookie(response, token)
  return response
})
