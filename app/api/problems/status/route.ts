/**
 * 获取用户对题目的完成状态
 * GET /api/problems/status?problemIds=id1,id2,id3
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { getProblemStatusesForUser } from '@/lib/problem/user-status'

export const GET = withApi.auth(async (req, _ctx, { user }) => {
  const q = readQuery<{ problemIds?: string }>(req)
  if (!q.problemIds) return ok({})

  const problemIds = q.problemIds.split(',')
  return ok(await getProblemStatusesForUser(user.id, problemIds))
})
