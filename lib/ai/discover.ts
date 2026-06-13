/**
 * lib/ai/discover.ts
 * AI Provider 模型发现：调用服务商的 /v1/models 接口或根据 apiFormat 分支
 */
import { prisma } from '@/lib/prisma'
import { getProviderMeta, inferModelType, type ProviderMeta } from './providers'
import { ApiError } from '@/lib/api/withApi'

export interface DiscoveredModel {
  name: string
  model: string
  type: 'generation' | 'thinking'
  description?: string
}

/**
 * 解析服务商条目 → 元信息 + 真实 baseUrl
 */
function resolveProvider(provider: {
  slug: string
  name: string
  baseUrl: string | null
  apiKey: string | null
}) {
  const meta: ProviderMeta | undefined = getProviderMeta(provider.slug)
  const openaiBase = provider.baseUrl || meta?.baseUrl || ''
  const anthropicBase = meta?.anthropicBaseUrl || openaiBase
  const format = meta?.apiFormat || 'openai'
  return { meta, format, openaiBase, anthropicBase }
}

/**
 * 解析 /v1/models 响应的 data 数组
 */
interface ModelsListResponse {
  data: Array<{ id: string }>
}

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<DiscoveredModel[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(
      'PROVIDER_ERROR',
      `模型列表请求失败 (${res.status}): ${text.slice(0, 200)}`,
      502
    )
  }
  const data = (await res.json()) as ModelsListResponse
  if (!data?.data) {
    throw new ApiError('BAD_PROVIDER_RESPONSE', '服务商返回格式不符合预期', 502)
  }
  return data.data
    .map((m) => m.id)
    .filter(Boolean)
    .map((id) => ({
      name: id,
      model: id,
      type: inferModelType(id),
    }))
}

/**
 * 对外：发现 AI Provider 的可用模型
 */
export async function discoverProviderModels(
  providerId: string
): Promise<DiscoveredModel[]> {
  const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } })
  if (!provider) {
    throw new ApiError('NOT_FOUND', '服务商不存在', 404)
  }
  if (!provider.apiKey) {
    throw new ApiError('NO_API_KEY', '服务商未配置 API Key', 400)
  }

  const { meta, format, openaiBase } = resolveProvider({
    slug: provider.slug,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  })

  if (format === 'openai' || format === 'both') {
    if (!openaiBase) {
      throw new ApiError('NO_BASE_URL', '未配置 OpenAI 兼容 baseUrl', 400)
    }
    return fetchOpenAICompatibleModels(openaiBase, provider.apiKey)
  }

  if (format === 'anthropic') {
    // Anthropic 没有公开的列表 API；仅返回字典中的 defaultModels
    return (
      meta?.defaultModels.map((m) => ({
        name: m.name,
        model: m.model,
        type: m.type,
        description: m.description,
      })) || []
    )
  }

  // 自定义类型（暂未支持发现）— 返回空
  return []
}
