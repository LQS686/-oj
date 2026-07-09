import { OpenAI } from 'openai'
import type { AiConfig } from './config'
import { resolveBaseUrl, getProviderMeta, inferModelType } from './providers'

export function createAiClient(config: AiConfig, isThinking = false) {
  // 安全约束：当 thinking 模式且 thinkingProvider 与主 provider 不一致时，
  // 必须使用 thinkingApiKey，绝不允许回退到主 apiKey（违反 config.ts 的安全约束）
  const apiKey = isThinking
    ? (config.thinkingApiKey || (config.thinkingProvider && config.thinkingProvider !== config.provider
        ? (() => { throw new Error(`thinkingProvider(${config.thinkingProvider}) 与主 provider(${config.provider}) 不一致，但未配置 thinkingApiKey`) })()
        : config.apiKey))
    : config.apiKey

  // 同样应用安全约束：当 thinkingProvider 与主 provider 不一致时，
  // 不允许回退到主 provider 的 baseUrl，必须使用 thinkingBaseUrl
  const baseURL = isThinking
    ? (config.thinkingBaseUrl || (config.thinkingProvider && config.thinkingProvider !== config.provider
        ? undefined
        : resolveBaseUrl(config.thinkingProvider || config.provider, 'openai', config.baseUrl)))
    : resolveBaseUrl(config.provider, 'openai', config.baseUrl)

  if (!apiKey) {
    throw new Error(`${isThinking ? 'Thinking' : 'Generation'} Model API Key is missing`)
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    // 设置请求超时（默认 10 分钟，可由 config.timeout 覆盖）
    timeout: config.timeout || 10 * 60 * 1000,
    maxRetries: 2,
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
 * 2. 排除 baseParams 控制的字段（temperature / response_format / max_tokens）
 *    —— max_tokens 由 baseParams 显式控制，避免 config.params 中的小值覆盖导致输出被截断
 * 3. 当模型 supportsThinkingParam 时，自动注入：
 *    - thinking: { type: "enabled" }   （若未显式设置）
 *    - reasoning_effort: "medium"     （若 params.reasoning_effort 缺省）
 */
export function buildChatParams(
  config: AiConfig,
  baseParams: { model: string; messages: any[]; temperature?: number; response_format?: any; max_tokens?: number },
  isThinking = false
): Record<string, any> {
  const params: Record<string, any> = { ...baseParams }
  // 合并高级参数（DeepSeek v4 thinking、topP 等）
  const modelParams = (config.params as Record<string, any>) || {}
  // 过滤掉已由 baseParams 控制的字段，避免覆盖
  // 注意：max_tokens 必须在过滤列表中，否则 config.params.max_tokens（可能是默认小值如 2048）
  // 会覆盖 baseParams.max_tokens（如 16384），导致 thinking 模式下输出被截断
  const filtered: Record<string, any> = {}
  for (const [k, v] of Object.entries(modelParams)) {
    if (!['model', 'messages', 'stream', 'temperature', 'response_format', 'max_tokens'].includes(k)) {
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
