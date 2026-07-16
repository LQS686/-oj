/**
 * /api/admin/ai/logs - AI 生成日志全局视图（仅 SYSTEM_ADMIN）
 *
 * GET  跨用户分页查询 AI 生成日志
 *      query: status / userId / model / page / pageSize
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listAllAiLogs } from '@/lib/ai/service'

/**
 * GET /api/admin/ai/logs
 *   返回 { items, totalCount }，items 含 username
 */
export const GET = withApi.systemAdmin(async (req) => {
  const { searchParams } = new URL(req.url)

  const status = searchParams.get('status') || undefined
  const userId = searchParams.get('userId') || undefined
  const model = searchParams.get('model') || undefined
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const pageSizeRaw = Number(searchParams.get('pageSize') ?? '20')

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 20

  const result = await listAllAiLogs({ status, userId, model, page, pageSize })
  return ok(result)
})
