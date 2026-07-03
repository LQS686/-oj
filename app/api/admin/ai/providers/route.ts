/**
 * /api/admin/ai/providers - AI 服务商管理（管理员）
 *
 * GET  列出服务商（apiKey 脱敏）
 * POST 创建服务商
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { createAiProvider, listAiProvidersForAdmin } from '@/lib/ai/service'

/**
 * GET /api/admin/ai/providers
 */
export const GET = withApi.admin(async () => {
  const data = await listAiProvidersForAdmin()
  return ok({ items: data })
})

/**
 * POST /api/admin/ai/providers
 */
export const POST = withApi.admin(async (req, _ctx) => {
  const body = await readJson<{ name?: string; slug?: string; baseUrl?: string; apiKey?: string }>(req)
  const { name, slug, baseUrl, apiKey } = body

  if (!name || !slug) {
    throw400('MISSING_FIELDS', 'Missing required fields')
  }

  const provider = await createAiProvider({ name: name!, slug: slug!, baseUrl, apiKey })
  return ok(provider)
})
