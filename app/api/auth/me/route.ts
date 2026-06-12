/**
 * GET /api/auth/me - 获取当前用户信息
 * 迁移到 withApi.auth 模式：自动鉴权 + 错误处理
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getUserProfile } from '@/lib/user/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  const profile = await getUserProfile(user.id)
  return ok(profile)
})
