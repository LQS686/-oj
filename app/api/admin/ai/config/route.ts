/**
 * /api/admin/ai/config - AI 全局模型配置（管理员）
 *
 * GET  读取配置 + 累计 token 用量
 * POST 写入配置（敏感字段加密存储）
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { getSystemSettings } from '@/lib/settings'
import {
  getGlobalAiConfig,
  upsertGlobalAiConfig,
} from '@/lib/ai/service'

interface AiConfigBody {
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  enableThinking?: boolean
  thinkingProvider?: string
  thinkingModel?: string
  thinkingApiKey?: string
  thinkingBaseUrl?: string
  thinkingLevel?: number
}

/**
 * GET /api/admin/ai/config
 */
export const GET = withApi.admin(async () => {
  const { data, config, totalTokens } = await getGlobalAiConfig()
  if (data) return ok(data)

  // 数据库无配置时回退到 SystemSettings
  const settings = await getSystemSettings()
  const hasApiKey = !!(settings as any).aiApiKey
  return ok({
    provider: (settings as any).aiProvider || 'openai',
    model: (settings as any).aiModel || 'gpt-4',
    baseUrl: (settings as any).aiBaseUrl || '',
    apiKey: hasApiKey ? '****configured****' : '',
    totalTokens,
    hasApiKey,
  })
})

/**
 * POST /api/admin/ai/config
 */
export const POST = withApi.admin(async (req, _ctx) => {
  const body = await readJson<AiConfigBody>(req)
  const {
    provider, model, apiKey, baseUrl,
    enableThinking, thinkingProvider, thinkingModel, thinkingApiKey, thinkingBaseUrl, thinkingLevel,
  } = body

  if (!provider || !model) {
    throw400('MISSING_FIELDS', 'Missing required fields')
  }

  await upsertGlobalAiConfig({
    provider: provider!,
    model: model!,
    apiKey,
    baseUrl,
    enableThinking,
    thinkingProvider, thinkingModel, thinkingApiKey, thinkingBaseUrl, thinkingLevel,
  })

  return ok({})
})
