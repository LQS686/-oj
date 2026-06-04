import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { OpenAI } from 'openai'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { resolveBaseUrl } from '@/lib/ai/providers'

/**
 * POST /api/admin/ai/test
 *
 * 错误码分类（前端针对性提示）：
 *  - MISSING_API_KEY   400  未配置 API Key
 *  - INVALID_PROVIDER  400  服务商不被识别
 *  - PROVIDER_REJECTED 502  服务商返回 401/403/4xx/5xx
 *  - INTERNAL_ERROR    500  其他内部错误
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }
      }, { status: 403 })
    }

    const body = await request.json()
    let { provider, model, apiKey, baseUrl } = body

    if (!provider) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_PROVIDER', message: 'provider is required' }
      }, { status: 400 })
    }

    // 1. Try to use saved key if apiKey is masked or empty
    if (!apiKey || apiKey.includes('****')) {
        const savedConfig = await prisma.aiModelConfig.findFirst({
            where: { scope: 'GLOBAL' }
        })

        if (savedConfig) {
            let decryptedKey = ''
            if (savedConfig.provider === provider) {
                decryptedKey = decrypt(savedConfig.apiKey)
            } else if (savedConfig.thinkingProvider === provider) {
                decryptedKey = savedConfig.thinkingApiKey ? decrypt(savedConfig.thinkingApiKey) : decrypt(savedConfig.apiKey)
            }

            if (decryptedKey) {
                apiKey = decryptedKey
            }
        }
    }

    if (!apiKey || apiKey.includes('****')) {
        return NextResponse.json({
          success: false,
          error: { code: 'MISSING_API_KEY', message: 'API Key is required (and saved key not found/mismatched)' }
        }, { status: 400 })
    }

    // Determine Base URL via provider dictionary
    const finalBaseUrl = baseUrl || resolveBaseUrl(provider, 'openai', null) || ''

    const client = new OpenAI({
        apiKey,
        baseURL: finalBaseUrl,
    })

    // Determine Model — 优先使用入参 model，否则用 deepseek-v4-flash 作为新版默认
    let finalModel = model
    if (!finalModel) {
        switch (provider) {
            case 'deepseek': finalModel = 'deepseek-v4-flash'; break;
            case 'moonshot': finalModel = 'moonshot-v1-8k'; break;
            case 'dashscope': finalModel = 'qwen-turbo'; break;
            case 'zhipu': finalModel = 'glm-4-flash'; break;
            case 'yi': finalModel = 'yi-medium'; break;
            case 'baichuan': finalModel = 'baichuan3-turbo'; break;
            case 'stepfun': finalModel = 'step-1-8k'; break;
            case 'anthropic': finalModel = 'claude-sonnet-4-5'; break;
            default: finalModel = 'gpt-3.5-turbo';
        }
    }

    // Try a simple request
    const response = await client.chat.completions.create({
        model: finalModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
    })

    return NextResponse.json({ success: true, message: 'Connection successful', data: response })

  } catch (error: any) {
    logger.error('Test Connection Error', { error: error?.message, stack: error?.stack })

    // OpenAI SDK 错误携带 status 属性
    const status = error?.status || error?.response?.status
    if (status === 401 || status === 403) {
      return NextResponse.json({
        success: false,
        error: { code: 'PROVIDER_REJECTED', message: `服务商拒绝（${status}）：${error.message || 'API Key 无效或无权限'}` }
      }, { status: 502 })
    }
    if (status && status >= 400 && status < 500) {
      return NextResponse.json({
        success: false,
        error: { code: 'PROVIDER_REJECTED', message: `服务商返回 ${status}：${error.message || '请求参数有误'}` }
      }, { status: 502 })
    }
    if (status && status >= 500) {
      return NextResponse.json({
        success: false,
        error: { code: 'PROVIDER_REJECTED', message: `服务商内部错误（${status}）：${error.message || '请稍后重试'}` }
      }, { status: 502 })
    }

    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Connection failed' }
    }, { status: 500 })
  }
}
