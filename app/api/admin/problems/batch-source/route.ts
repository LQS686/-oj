/**
 * /api/admin/problems/batch-source - 批量更新题目的来源标记（管理员）
 */
import { withApi, ok, readJson } from '@/lib/api/withApi'
import { batchUpdateProblemSource } from '@/lib/problem/service'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const { ids, source } = await readJson<{ ids?: string[]; source?: string }>(req)

  const result = await batchUpdateProblemSource(
    user.id,
    ids || [],
    source as 'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED',
    req.headers.get('x-forwarded-for') || 'unknown'
  )

  return ok({ message: `成功更新 ${result.count} 个题目的来源标记` })
})
