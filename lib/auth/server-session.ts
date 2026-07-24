/**
 * lib/auth/server-session.ts
 * 服务端读取 cookie 会话，供 Root Layout 注入 UserProvider，避免硬刷新导航栏闪「登录」。
 * 仅可在 Server Component / Route Handler 中调用。
 */
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getCachedUser } from '@/lib/api/handler'
import type { UserData } from '@/lib/api/auth'

/** 从 httpOnly token cookie 解析当前用户（校验 tokenVersion） */
export async function getServerSessionUser(): Promise<UserData | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return null

    const session = verifyToken(token)
    if (!session?.userId) return null

    const user = await getCachedUser(session.userId, session.tokenVersion)
    if (!user) return null

    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      nickname: user.nickname || undefined,
      avatar: user.avatar || undefined,
      role: user.role,
      // 完整资料由客户端 /auth/me 补全；导航栏仅需身份字段
      rating: 0,
      rank: '',
      color: '',
      createdAt: '',
    }
  } catch {
    return null
  }
}
