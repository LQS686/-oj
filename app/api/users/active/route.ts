/**
 * /api/users/active - 活跃用户（综合发帖权重3 + 评论权重1）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { toInt } from '@/lib/api/validation'
import { listActiveUsers } from '@/lib/user/service'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ limit?: string }>(req)
  const limit = toInt(q.limit, 'limit', 5)
  const data = await listActiveUsers(limit)
  return ok({ users: data })
})
