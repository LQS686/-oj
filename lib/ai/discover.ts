/**
 * lib/ai/discover.ts
 * AI Provider 模型发现：调用服务商的 /v1/models 接口或根据 apiFormat 分支
 */
import { prisma } from '@/lib/prisma'
import { getProviderMeta, inferModelType, validateAiBaseUrl, type ProviderMeta } from './providers'
import { validateAiBaseUrlDns } from './providers-dns'
import { ApiError } from '@/lib/api/withApi'
import { decrypt } from '@/lib/crypto'

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
  // SSRF 防护：校验 baseUrl 不指向内网/元数据端点
  validateAiBaseUrl(baseUrl)
  await validateAiBaseUrlDns(baseUrl)
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
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

  // 数据库存储的是 AES-256-CBC 密文，必须先解密再作为 Bearer token 传给服务商
  // （参考 lib/ai/config.ts L56/L89 的 decrypt 调用）
  let apiKey: string
  try {
    apiKey = decrypt(provider.apiKey)
  } catch {
    throw new ApiError(
      'DECRYPT_FAILED',
      'AI 配置加密密钥未设置或解密失败',
      500
    )
  }
  if (!apiKey) {
    throw new ApiError('NO_API_KEY', '服务商 API Key 解密后为空', 400)
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
    return fetchOpenAICompatibleModels(openaiBase, apiKey)
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
