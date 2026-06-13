/**
 * POST /api/auth/forgot-password - 忘记密码（暂未实现）
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, fail } from '@/lib/api/withApi'

export const POST = withApi.public(async () => {
  return fail('NOT_IMPLEMENTED', '密码重置功能尚未开放，请联系管理员', 501)
})
