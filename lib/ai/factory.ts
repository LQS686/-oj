import { OpenAI } from 'openai'
import { AiConfig } from './config'
import { resolveBaseUrl, getProviderMeta, inferModelType } from './providers'

export function createAiClient(config: AiConfig, isThinking = false) {
  const apiKey = isThinking ? (config.thinkingApiKey || config.apiKey) : config.apiKey
  const baseURL = isThinking
    ? (config.thinkingBaseUrl || resolveBaseUrl(config.thinkingProvider || config.provider, 'openai', config.baseUrl))
    : resolveBaseUrl(config.provider, 'openai', config.baseUrl)

  if (!apiKey) {
    throw new Error(`${isThinking ? 'Thinking' : 'Generation'} Model API Key is missing`)
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    dangerouslyAllowBrowser: false
  })
}

export function getModelName(config: AiConfig, isThinking = false) {
    return isThinking ? (config.thinkingModel || config.model) : config.model
}

/**
 * 判断指定 model 是否支持 DeepSeek v4 风格的 thinking 参数
 */
export function modelSupportsThinkingParam(config: AiConfig, modelName: string): boolean {
  const providerSlug = config.provider
  const meta = getProviderMeta(providerSlug)
  if (!meta) return false
  const matched = meta.defaultModels.find(m => m.model === modelName)
  return matched?.supportsThinkingParam === true
}

/**
 * 透传模型 params 到 OpenAI chat.completions.create 调用
 *
 * 关键行为：
 * 1. 排除 provider 控制类字段（model / messages / stream）
 * 2. 排除 baseParams 控制的字段（temperature / response_format）
 * 3. 当模型 supportsThinkingParam 时，自动注入：
 *    - thinking: { type: "enabled" }   （若未显式设置）
 *    - reasoning_effort: "medium"     （若 params.reasoning_effort 缺省）
 */
export function buildChatParams(
  config: AiConfig,
  baseParams: { model: string; messages: any[]; temperature?: number; response_format?: any },
  isThinking = false
): Record<string, any> {
  const params: Record<string, any> = { ...baseParams }
  // 合并高级参数（DeepSeek v4 thinking、topP 等）
  const modelParams = (config.params as Record<string, any>) || {}
  // 过滤掉已由 baseParams 控制的字段，避免覆盖
  const filtered: Record<string, any> = {}
  for (const [k, v] of Object.entries(modelParams)) {
    if (!['model', 'messages', 'stream', 'temperature', 'response_format'].includes(k)) {
      filtered[k] = v
    }
  }

  // DeepSeek v4 系列：自动注入 thinking 参数
  const modelName = baseParams.model
  if (modelSupportsThinkingParam(config, modelName)) {
    if (filtered.thinking === undefined) {
      filtered.thinking = { type: 'enabled' }
    }
    if (filtered.reasoning_effort === undefined) {
      filtered.reasoning_effort = 'medium'
    }
  }

  return { ...filtered, ...params }
}
