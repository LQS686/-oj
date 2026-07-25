/**
 * /api/admin/submissions - 提交记录列表（管理员）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { listAdminSubmissions } from '@/lib/submission/service'

/**
 * GET /api/admin/submissions - 获取所有提交记录（管理员）
 */
export const GET = withApi.admin(async (req, _ctx) => {
  const query = readQuery<{
    page?: string
    pageSize?: string
    status?: string
    language?: string
    keyword?: string
  }>(req)
  const page = parseInt(query.page || '1')
  const pageSize = parseInt(query.pageSize || '50')
  const status = query.status
  const language = query.language
  const keyword = query.keyword

  const result = await listAdminSubmissions({ page, pageSize, status, language, keyword })
  return ok(result)
})
