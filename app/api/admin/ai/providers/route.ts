/**
 * /api/admin/ai/providers - AI 服务商管理（管理员）
 *
 * GET  列出服务商（apiKey 脱敏）
 * POST 创建服务商
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isSystemAdmin } from '@/lib/permissions'
import { createAiProvider, listAiProvidersForAdmin } from '@/lib/ai/service'

/**
 * GET /api/admin/ai/providers
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const data = await listAiProvidersForAdmin()
  return ok({ items: data })
})

/**
 * POST /api/admin/ai/providers
 */
export const POST = withApi.auth(withPermission('admin.access')(async (req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const body = await readJson<{ name?: string; slug?: string; baseUrl?: string; apiKey?: string }>(req)
  const { name, slug, baseUrl, apiKey } = body

  if (!name || !slug) {
    throw400('MISSING_FIELDS', 'Missing required fields')
  }

  const provider = await createAiProvider({ name: name!, slug: slug!, baseUrl, apiKey })
  return ok(provider)
}))
