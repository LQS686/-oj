/**
 * /api/users/avatar/history - 当前用户头像历史（最近 20 条）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listAvatarHistory } from '@/lib/user/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  const history = await listAvatarHistory(user.id, 20)
  return ok(history)
})
