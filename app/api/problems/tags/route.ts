/**
 * GET /api/problems/tags - 标签列表
 *
 * 公开路由，列出所有题目的去重标签
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listProblemTags } from '@/lib/problem/service'

export const GET = withApi.public(async () => {
  const tags = await listProblemTags()
  return ok(tags)
})
