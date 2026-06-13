/**
 * /api/admin/ai/config - AI 全局模型配置（管理员）
 *
 * GET  读取配置 + 累计 token 用量
 * POST 写入配置（敏感字段加密存储）
 */
import { withApi, ok, readJson, throw400, throw403, throw500 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import { encrypt, maskApiKey } from '@/lib/crypto'
import { getSystemSettings } from '@/lib/settings'

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
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const config = await prisma.aiModelConfig.findFirst({
    where: { scope: 'GLOBAL' },
  })

  const tokenStats = await prisma.aiGenerationLog.aggregate({
    _sum: { tokensUsed: true },
  })

  if (config) {
    return ok({
      data: {
        ...config,
        apiKey: maskApiKey(config.apiKey),
        thinkingApiKey: maskApiKey(config.thinkingApiKey || ''),
        totalTokens: tokenStats._sum.tokensUsed || 0,
        hasApiKey: !!config.apiKey,
      },
    })
  }

  const settings = await getSystemSettings()
  const hasApiKey = !!(settings as any).aiApiKey

  return ok({
    data: {
      provider: (settings as any).aiProvider || 'openai',
      model: (settings as any).aiModel || 'gpt-4',
      baseUrl: (settings as any).aiBaseUrl || '',
      apiKey: hasApiKey ? '****configured****' : '',
      totalTokens: tokenStats._sum.tokensUsed || 0,
      hasApiKey,
    },
  })
})

/**
 * POST /api/admin/ai/config
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<AiConfigBody>(req)
  const {
    provider, model, apiKey, baseUrl,
    enableThinking, thinkingProvider, thinkingModel, thinkingApiKey, thinkingBaseUrl, thinkingLevel,
  } = body

  if (!provider || !model) {
    throw400('MISSING_FIELDS', 'Missing required fields')
  }

  const existingConfig = await prisma.aiModelConfig.findFirst({
    where: { scope: 'GLOBAL' },
  })

  let finalApiKey = existingConfig?.apiKey || ''
  if (apiKey && !/^\*{3,}$/.test(apiKey)) {
    finalApiKey = encrypt(apiKey)
  } else if (apiKey === '') {
    finalApiKey = ''
  }

  let finalThinkingApiKey = existingConfig?.thinkingApiKey || ''
  if (thinkingApiKey && !/^\*{3,}$/.test(thinkingApiKey)) {
    finalThinkingApiKey = encrypt(thinkingApiKey)
  } else if (thinkingApiKey === '') {
    finalThinkingApiKey = ''
  }

  if (existingConfig) {
    await prisma.aiModelConfig.update({
      where: { id: existingConfig.id },
      data: {
        provider: provider!, model: model!, apiKey: finalApiKey, baseUrl,
        enableThinking: enableThinking || false,
        thinkingProvider, thinkingModel, thinkingApiKey: finalThinkingApiKey, thinkingBaseUrl,
        thinkingLevel: thinkingLevel || 3,
      },
    })
  } else {
    await prisma.aiModelConfig.create({
      data: {
        scope: 'GLOBAL',
        provider: provider!, model: model!, apiKey: finalApiKey, baseUrl,
        enableThinking: enableThinking || false,
        thinkingProvider, thinkingModel, thinkingApiKey: finalThinkingApiKey, thinkingBaseUrl,
        thinkingLevel: thinkingLevel || 3,
      },
    })
  }

  return ok({})
})
