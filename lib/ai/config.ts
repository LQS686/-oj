import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export interface AiConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  enableThinking: boolean
  thinkingProvider?: string
  thinkingModel?: string
  thinkingApiKey?: string
  thinkingBaseUrl?: string
  thinkingLevel: number
  /** 模型最大输出 tokens（thinking 模式下会自动放大） */
  maxTokens?: number
  /** 基础温度（generator 会根据场景调整） */
  temperature?: number
  /** 请求超时（毫秒） */
  timeout?: number
  /** 高级参数（topP / frequencyPenalty / presencePenalty / responseFormat / stop / thinking / reasoning_effort） */
  params?: Record<string, any>
}

export async function getAiConfig(userId?: string, requestedModelId?: string): Promise<AiConfig> {
  // 1. Resolve Model ID
  let modelId = requestedModelId

  if (!modelId && userId) {
      // Try to find default or last used
      const pref = await prisma.userAiPreference.findFirst({
          where: { userId, isDefault: true }
      }) || await prisma.userAiPreference.findFirst({
          where: { userId },
          orderBy: { lastUsed: 'desc' }
      })
      if (pref) modelId = pref.modelId
  }

  // 2. Try to fetch from new tables
  if (modelId) {
      const aiModel = await prisma.aiModel.findUnique({
          where: { id: modelId },
          include: { provider: true }
      })

      if (aiModel && aiModel.isActive && aiModel.provider.isActive) {
          // Fetch global legacy config for Thinking settings (hybrid approach)
          // We still rely on the global config for "Thinking" settings because the UI
          // requested focuses on selecting the *Generation* model.
          const globalConfig = await prisma.aiModelConfig.findFirst({ where: { scope: 'GLOBAL' } })

          return {
              provider: aiModel.provider.slug,
              model: aiModel.model,
              apiKey: aiModel.provider.apiKey ? decrypt(aiModel.provider.apiKey) : '',
              baseUrl: aiModel.provider.baseUrl || undefined,
              // Inherit thinking settings from global config for now
              enableThinking: globalConfig?.enableThinking || false,
              thinkingProvider: globalConfig?.thinkingProvider || undefined,
              thinkingModel: globalConfig?.thinkingModel || undefined,
              // 修复：当 thinkingProvider 与主 provider 不一致时，
              // 必须使用 thinkingApiKey，绝不允许回退到主 apiKey。
              // 若 globalConfig 未配置 thinkingApiKey，保持 undefined，调用方会报错。
              thinkingApiKey: globalConfig?.thinkingApiKey ? decrypt(globalConfig.thinkingApiKey as string) : undefined,
              thinkingBaseUrl: globalConfig?.thinkingBaseUrl || undefined,
              thinkingLevel: globalConfig?.thinkingLevel || 3,
              maxTokens: (aiModel as any).maxTokens || undefined,
              temperature: (aiModel as any).temperature || undefined,
              timeout: (aiModel as any).timeout || undefined,
              // 透传模型高级参数（DeepSeek v4 thinking、topP 等）
              params: ((aiModel as any).params as Record<string, any>) || undefined
          }
      }
  }

  // 3. Fallback to Legacy Global Config
  const config = await prisma.aiModelConfig.findFirst({
    where: { scope: 'GLOBAL' }
  })

  if (!config) {
    throw new Error('AI Configuration not found. Please configure it in Settings.')
  }

  return {
    provider: config.provider,
    model: config.model,
    apiKey: decrypt(config.apiKey),
    baseUrl: config.baseUrl || undefined,
    enableThinking: config.enableThinking,
    thinkingProvider: config.thinkingProvider || undefined,
    thinkingModel: config.thinkingModel || undefined,
    // 修复：同上 — 当 thinkingProvider 不一致时不允许回退到主 apiKey
    thinkingApiKey: config.thinkingApiKey ? decrypt(config.thinkingApiKey) : undefined,
    thinkingBaseUrl: config.thinkingBaseUrl || undefined,
    thinkingLevel: config.thinkingLevel,
    maxTokens: (config as any).maxTokens || undefined,
    temperature: (config as any).temperature || undefined,
    timeout: (config as any).timeout || undefined,
  }
}
