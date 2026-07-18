import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { encrypt, decrypt, maskApiKey } from '@/lib/crypto'
import { resolveBaseUrl, getProviderMeta, validateAiBaseUrl } from '../providers'
import { validateAiBaseUrlDns } from '../providers-dns'
import { OpenAI } from 'openai'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import type { TestConnectionInput } from './types'

/* ---------- Provider ---------- */

export type ProviderWithMaskedKey = {
  id: string
  name: string
  slug: string
  baseUrl: string | null
  apiKey: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** 列出所有 AI 服务商（apiKey 脱敏） */
export async function listAiProvidersForAdmin() {
  const providers = await prisma.aiProvider.findMany({ orderBy: { createdAt: 'desc' } })
  return providers.map(p => ({
    ...p,
    apiKey: p.apiKey ? maskApiKey(p.apiKey) : null,
  })) as ProviderWithMaskedKey[]
}

/** 创建 AI 服务商 */
export async function createAiProvider(input: {
  name: string
  slug: string
  baseUrl?: string
  apiKey?: string
}) {
  const existing = await prisma.aiProvider.findUnique({ where: { slug: input.slug } })
  if (existing) {
    throw new ApiError('DUPLICATE_SLUG', 'Provider slug already exists', 400)
  }
  const meta = getProviderMeta(input.slug)
  const finalBaseUrl = input.baseUrl || (meta ? meta.baseUrl : null)

  if (finalBaseUrl) {
    validateAiBaseUrl(finalBaseUrl)
    await validateAiBaseUrlDns(finalBaseUrl)
  }

  let encryptedKey: string | null = null
  if (input.apiKey) {
    try {
      encryptedKey = encrypt(input.apiKey)
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('AI_CONFIG_ENCRYPTION_KEY')) {
        throw new ApiError(
          'MISSING_ENCRYPTION_KEY',
          'AI_CONFIG_ENCRYPTION_KEY 环境变量未设置，请先在 .env 配置 32 字节密钥再添加服务商',
          400
        )
      }
      throw err
    }
  }

  return prisma.aiProvider.create({
    data: {
      name: input.name,
      slug: input.slug,
      baseUrl: finalBaseUrl || null,
      apiKey: encryptedKey,
      isActive: true,
    },
  })
}

/** 获取 AI 服务商（不脱敏，给后续更新用） */
export async function getAiProviderForUpdate(id: string) {
  const provider = await prisma.aiProvider.findUnique({ where: { id } })
  if (!provider) {
    throw new ApiError('NOT_FOUND', 'Provider not found', 404)
  }
  return provider
}

/** 更新 AI 服务商 */
export async function updateAiProvider(
  id: string,
  input: { name?: string; baseUrl?: string; apiKey?: string; isActive?: boolean }
) {
  const existing = await getAiProviderForUpdate(id)
  const data: { name?: string; baseUrl?: string | null; apiKey?: string | null; isActive?: boolean } = {
    name: input.name,
    baseUrl: input.baseUrl || null,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
  }
  // Update API key only if provided and not masked
  if (input.apiKey && !input.apiKey.includes('****')) {
    data.apiKey = encrypt(input.apiKey)
  } else if (input.apiKey === '') {
    data.apiKey = null
  }
  if (input.baseUrl) {
    validateAiBaseUrl(input.baseUrl)
    await validateAiBaseUrlDns(input.baseUrl)
  }
  const provider = await prisma.aiProvider.update({ where: { id }, data })

  // 级联处理：当 isActive 从 true 变为 false 时，软删除挂载在该 Provider 上的所有 model
  if (input.isActive === false && existing.isActive === true) {
    const cascaded = await prisma.aiModel.updateMany({
      where: { providerId: id, isActive: true },
      data: { isActive: false },
    })
    if (cascaded.count > 0) {
      logger.info(
        `[ai/providers] 服务商 ${id} 被禁用，级联软删除 ${cascaded.count} 个挂载模型`
      )
    }
  }
  return provider
}

/** 删除 AI 服务商（级联删除挂载的 model） */
export async function deleteAiProviderCascade(id: string) {
  const deletedModels = await prisma.aiModel.deleteMany({ where: { providerId: id } })
  await prisma.aiProvider.delete({ where: { id } })
  if (deletedModels.count > 0) {
    logger.info(`[ai/providers] 级联删除服务商 ${id}，连带删除 ${deletedModels.count} 个模型`)
  }
  return { deletedModels: deletedModels.count }
}

/* ---------- Model ---------- */

/** 列出有效 AI 模型（带 provider enrich） */
export async function listActiveAiModelsEnriched() {
  const allModels = await prisma.aiModel.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  if (allModels.length === 0) return { data: [], orphanCount: 0 }

  const providerIds = Array.from(new Set(allModels.map(m => m.providerId)))
  const providers = await prisma.aiProvider.findMany({
    where: { id: { in: providerIds }, isActive: true },
    select: { id: true, name: true, slug: true },
  })
  const providerMap = new Map(providers.map(p => [p.id, p]))

  const validModels = allModels
    .filter(m => providerMap.has(m.providerId))
    .map(m => ({ ...m, provider: providerMap.get(m.providerId) }))

  const orphanCount = allModels.length - validModels.length
  if (orphanCount > 0) {
    logger.warn(`[ai/models] 过滤孤儿/挂载在已禁用 Provider 上的模型 ${orphanCount} 条`)
  }
  return { data: validModels, orphanCount }
}

/** 创建 AI 模型 */
export async function createAiModel(input: {
  name: string
  model: string
  providerId: string
  type: string
  maxTokens?: number
  temperature?: number
  timeout?: number
  params?: Record<string, unknown>
}) {
  return prisma.aiModel.create({
    data: {
      name: input.name,
      model: input.model,
      providerId: input.providerId,
      type: input.type,
      maxTokens: input.maxTokens || 2048,
      temperature: input.temperature !== undefined ? input.temperature : 0.7,
      timeout: input.timeout || 60000,
      // 高级参数（DeepSeek v4 thinking / topP 等），默认空对象
      params: (input.params && typeof input.params === 'object' ? input.params : {}) as Prisma.InputJsonValue,
      isActive: true,
    },
  })
}

/** 获取 AI 模型（更新用） */
export async function getAiModelForUpdate(id: string) {
  const m = await prisma.aiModel.findUnique({ where: { id } })
  if (!m) {
    throw new ApiError('NOT_FOUND', 'Model not found', 404)
  }
  return m
}

/** 更新 AI 模型 */
export async function updateAiModel(
  id: string,
  input: {
    name?: string
    model?: string
    providerId?: string
    type?: string
    maxTokens?: number
    temperature?: number
    timeout?: number
    isActive?: boolean
    params?: Record<string, unknown>
    // Task 35.5：每百万 tokens 单价（用于成本估算）
    pricePerMillionTokens?: number | null
  }
) {
  const existing = await getAiModelForUpdate(id)
  return prisma.aiModel.update({
    where: { id },
    data: {
      name: input.name,
      model: input.model,
      providerId: input.providerId,
      type: input.type,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      timeout: input.timeout,
      // 高级参数（DeepSeek v4 thinking / topP 等），允许为空对象
      params: (input.params && typeof input.params === 'object' ? input.params : {}) as Prisma.InputJsonValue,
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      // Task 35.5：pricePerMillionTokens（null = 不估算成本）
      pricePerMillionTokens: input.pricePerMillionTokens,
    },
  })
}

/** 删除 AI 模型 */
export async function deleteAiModel(id: string) {
  return prisma.aiModel.delete({ where: { id } })
}

/* ---------- Global Model Config ---------- */

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  deepseek: 'deepseek-v4-flash',
  moonshot: 'moonshot-v1-8k',
  dashscope: 'qwen-turbo',
  zhipu: 'glm-4-flash',
  yi: 'yi-medium',
  baichuan: 'baichuan3-turbo',
  stepfun: 'step-1-8k',
  anthropic: 'claude-sonnet-4-5',
}

/** 读取管理员 AI 全局配置 + 累计 token 用量 */
export async function getGlobalAiConfig() {
  const config = await prisma.aiModelConfig.findFirst({ where: { scope: 'GLOBAL' } })
  const tokenStats = await prisma.aiGenerationLog.aggregate({
    _sum: { tokensUsed: true },
  })
  if (config) {
    return {
      data: {
        ...config,
        apiKey: maskApiKey(config.apiKey),
        thinkingApiKey: maskApiKey(config.thinkingApiKey || ''),
        totalTokens: tokenStats._sum.tokensUsed || 0,
        hasApiKey: !!config.apiKey,
      },
      totalTokens: tokenStats._sum.tokensUsed || 0,
    }
  }
  return { data: null, totalTokens: tokenStats._sum.tokensUsed || 0 }
}

/** 写入管理员 AI 全局配置（敏感字段加密，事务保证原子性） */
export async function upsertGlobalAiConfig(input: {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  enableThinking?: boolean
  thinkingProvider?: string
  thinkingModel?: string
  thinkingApiKey?: string
  thinkingBaseUrl?: string
  thinkingLevel?: number
}) {
  if (input.baseUrl) {
    validateAiBaseUrl(input.baseUrl)
    await validateAiBaseUrlDns(input.baseUrl)
  }
  if (input.thinkingBaseUrl) {
    validateAiBaseUrl(input.thinkingBaseUrl)
    await validateAiBaseUrlDns(input.thinkingBaseUrl)
  }
  await prisma.$transaction(async (tx) => {
    const existingConfig = await tx.aiModelConfig.findFirst({ where: { scope: 'GLOBAL' } })

    let finalApiKey = existingConfig?.apiKey || ''
    if (input.apiKey && !/^\*{3,}$/.test(input.apiKey)) {
      finalApiKey = encrypt(input.apiKey)
    } else if (input.apiKey === '') {
      finalApiKey = ''
    }

    let finalThinkingApiKey = existingConfig?.thinkingApiKey || ''
    if (input.thinkingApiKey && !/^\*{3,}$/.test(input.thinkingApiKey)) {
      finalThinkingApiKey = encrypt(input.thinkingApiKey)
    } else if (input.thinkingApiKey === '') {
      finalThinkingApiKey = ''
    }

    const data = {
      provider: input.provider,
      model: input.model,
      apiKey: finalApiKey,
      baseUrl: input.baseUrl,
      enableThinking: input.enableThinking || false,
      thinkingProvider: input.thinkingProvider,
      thinkingModel: input.thinkingModel,
      thinkingApiKey: finalThinkingApiKey,
      thinkingBaseUrl: input.thinkingBaseUrl,
      thinkingLevel: input.thinkingLevel || 3,
    }

    if (existingConfig) {
      await tx.aiModelConfig.update({
        where: { id: existingConfig.id },
        data,
      })
    } else {
      await tx.aiModelConfig.create({
        data: { scope: 'GLOBAL', ...data },
      })
    }
  })
}

/* ---------- 连通性测试 ---------- */

/**
 * 用 OpenAI SDK 测试 AI 服务连通性。
 *  - MISSING_API_KEY: 入参 + 全局配置都拿不到可用 Key
 *  - PROVIDER_REJECTED: 服务商返回 401/403/4xx/5xx
 *  - INTERNAL_ERROR: 其他内部错误
 */
export async function testAiConnection(input: TestConnectionInput) {
  const { provider, model, baseUrl: initialBaseUrl } = input
  let { apiKey } = input

  // 1. Try to use saved key if apiKey is masked or empty
  if (!apiKey || apiKey.includes('****')) {
    const savedConfig = await prisma.aiModelConfig.findFirst({ where: { scope: 'GLOBAL' } })
    if (savedConfig) {
      let decryptedKey = ''
      if (savedConfig.provider === provider) {
        decryptedKey = decrypt(savedConfig.apiKey)
      } else if (savedConfig.thinkingProvider === provider) {
        // 安全约束：当 thinkingProvider 与主 provider 不一致时，必须使用 thinkingApiKey
        // （遵循 config.ts 的安全约束：绝不允许回退到主 apiKey）
        if (savedConfig.thinkingProvider && savedConfig.thinkingProvider !== savedConfig.provider) {
          if (!savedConfig.thinkingApiKey) {
            throw new ApiError(
              'MISSING_API_KEY',
              `thinkingProvider(${savedConfig.thinkingProvider}) 与主 provider(${savedConfig.provider}) 不一致，但未配置 thinkingApiKey`,
              400
            )
          }
          decryptedKey = decrypt(savedConfig.thinkingApiKey)
        } else {
          decryptedKey = savedConfig.thinkingApiKey
            ? decrypt(savedConfig.thinkingApiKey)
            : decrypt(savedConfig.apiKey)
        }
      }
      if (decryptedKey) apiKey = decryptedKey
    }
  }

  if (!apiKey || apiKey.includes('****')) {
    throw new ApiError(
      'MISSING_API_KEY',
      'API Key is required (and saved key not found/mismatched)',
      400
    )
  }

  // Determine Base URL via provider dictionary
  const finalBaseUrl = initialBaseUrl || resolveBaseUrl(provider, 'openai', null) || ''
  // SSRF 防护：校验 baseUrl 不指向内网/元数据端点
  if (finalBaseUrl) {
    try {
      validateAiBaseUrl(finalBaseUrl)
      await validateAiBaseUrlDns(finalBaseUrl)
    } catch (e: unknown) {
      throw new ApiError('INVALID_BASE_URL', e instanceof Error ? e.message : 'baseUrl 校验失败', 400)
    }
  }
  const client = new OpenAI({ apiKey, baseURL: finalBaseUrl })

  // Determine Model — 优先使用入参 model，否则用 default
  const finalModel = model || DEFAULT_MODEL_BY_PROVIDER[provider] || 'gpt-3.5-turbo'

  try {
    const response = await client.chat.completions.create({
      model: finalModel,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    })
    return { message: 'Connection successful', data: response }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    const status = Number((error as Record<string, unknown>)?.status || (error as Record<string, Record<string, unknown>>)?.response?.status) || 0
    logger.error('Test Connection Error', { error: err.message, stack: err.stack })

    if (status === 401 || status === 403) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        `服务商拒绝（${status}）：${err.message || 'API Key 无效或无权限'}`,
        502
      )
    }
    if (status && status >= 400 && status < 500) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        `服务商返回 ${status}：${err.message || '请求参数有误'}`,
        502
      )
    }
    if (status && status >= 500) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        `服务商内部错误（${status}）：${err.message || '请稍后重试'}`,
        502
      )
    }
    throw new ApiError('INTERNAL', err.message || 'Connection failed', 500)
  }
}
