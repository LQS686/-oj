/**
 * /api/admin/ai/test - 测试 AI 服务连通性（管理员）
 *
 * 错误码分类（前端针对性提示）：
 *  - MISSING_API_KEY   400  未配置 API Key
 *  - INVALID_PROVIDER  400  服务商不被识别
 *  - PROVIDER_REJECTED 502  服务商返回 401/403/4xx/5xx
 *  - INTERNAL_ERROR    500  其他内部错误
 */
import { withApi, ok, readJson, ApiError, throw400, throw403, throw500 } from '@/lib/api/withApi'
import { OpenAI } from 'openai'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { resolveBaseUrl } from '@/lib/ai/providers'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    provider?: string
    model?: string
    apiKey?: string
    baseUrl?: string
  }>(req)
  let { provider, model, apiKey, baseUrl } = body

  if (!provider) {
    throw400('INVALID_PROVIDER', 'provider is required')
  }

  // 1. Try to use saved key if apiKey is masked or empty
  if (!apiKey || apiKey.includes('****')) {
    const savedConfig = await prisma.aiModelConfig.findFirst({
      where: { scope: 'GLOBAL' },
    })

    if (savedConfig) {
      let decryptedKey = ''
      if (savedConfig.provider === provider) {
        decryptedKey = decrypt(savedConfig.apiKey)
      } else if (savedConfig.thinkingProvider === provider) {
        decryptedKey = savedConfig.thinkingApiKey
          ? decrypt(savedConfig.thinkingApiKey)
          : decrypt(savedConfig.apiKey)
      }

      if (decryptedKey) {
        apiKey = decryptedKey
      }
    }
  }

  if (!apiKey || apiKey.includes('****')) {
    throw400('MISSING_API_KEY', 'API Key is required (and saved key not found/mismatched)')
  }

  // Determine Base URL via provider dictionary
  const finalBaseUrl = baseUrl || resolveBaseUrl(provider!, 'openai', null) || ''

  const client = new OpenAI({
    apiKey,
    baseURL: finalBaseUrl,
  })

  // Determine Model — 优先使用入参 model，否则用 deepseek-v4-flash 作为新版默认
  let finalModel = model
  if (!finalModel) {
    switch (provider) {
      case 'deepseek': finalModel = 'deepseek-v4-flash'; break
      case 'moonshot': finalModel = 'moonshot-v1-8k'; break
      case 'dashscope': finalModel = 'qwen-turbo'; break
      case 'zhipu': finalModel = 'glm-4-flash'; break
      case 'yi': finalModel = 'yi-medium'; break
      case 'baichuan': finalModel = 'baichuan3-turbo'; break
      case 'stepfun': finalModel = 'step-1-8k'; break
      case 'anthropic': finalModel = 'claude-sonnet-4-5'; break
      default: finalModel = 'gpt-3.5-turbo'
    }
  }

  try {
    // Try a simple request
    const response = await client.chat.completions.create({
      model: finalModel,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    })

    return ok({ message: 'Connection successful', data: response })
  } catch (error: any) {
    logger.error('Test Connection Error', { error: error?.message, stack: error?.stack })

    // OpenAI SDK 错误携带 status 属性
    const status = error?.status || error?.response?.status
    if (status === 401 || status === 403) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        `服务商拒绝（${status}）：${error.message || 'API Key 无效或无权限'}`,
        502,
      )
    }
    if (status && status >= 400 && status < 500) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        `服务商返回 ${status}：${error.message || '请求参数有误'}`,
        502,
      )
    }
    if (status && status >= 500) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        `服务商内部错误（${status}）：${error.message || '请稍后重试'}`,
        502,
      )
    }

    throw500(error?.message || 'Connection failed')
  }
})
