/**
 * /api/admin/ai/test - AI 服务连通性测试（管理员）
 */
import { withApi, ok, readJson, throw403 } from '@/lib/api/withApi'
import { testAiConnection, TestConnectionInput } from '@/lib/ai/service'

export const POST = withApi.admin(async (req, _ctx) => {
  const { provider, model, apiKey, baseUrl } = await readJson<TestConnectionInput>(req)

  if (!provider) {
    throw403('provider 必填')
  }

  const result = await testAiConnection({ provider, model, apiKey, baseUrl })
  return ok(result)
})
