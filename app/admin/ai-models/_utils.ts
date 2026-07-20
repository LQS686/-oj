import { getProviderMeta } from '@/lib/ai/providers'

/**
 * 判断某条 model 是否支持 DeepSeek v4 风格的 thinking 参数
 * 通过 provider.slug 查 provider 字典，再匹配 model id
 */
export function supportsThinkingParam(model: {
  model: string
  provider?: { slug?: string }
}): boolean {
  const slug = model.provider?.slug
  if (!slug) return false
  const meta = getProviderMeta(slug)
  if (!meta) return false
  const matched = meta.defaultModels.find(m => m.model === model.model)
  return matched?.supportsThinkingParam === true
}

/**
 * 判断 params 中是否含 v4 高级参数（thinking / reasoning_effort）
 */
export function hasV4AdvancedParams(model: {
  params?: Record<string, any>
}): boolean {
  if (!model.params || typeof model.params !== 'object') return false
  return Boolean(model.params.thinking) || Boolean(model.params.reasoning_effort)
}
