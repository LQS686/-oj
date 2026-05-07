import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { OpenAI } from 'openai'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    let { provider, model, apiKey, baseUrl } = body

    // 1. Try to use saved key if apiKey is masked or empty
    if (!apiKey || apiKey.includes('****')) {
        const savedConfig = await prisma.aiModelConfig.findFirst({
            where: { scope: 'GLOBAL' }
        })
        
        // Only use saved key if the provider matches (or we are testing thinking model and provider matches thinkingProvider)
        // Since this endpoint is generic, we check if the requested provider matches EITHER the saved generation provider OR saved thinking provider
        if (savedConfig) {
            let decryptedKey = ''
            if (savedConfig.provider === provider) {
                decryptedKey = decrypt(savedConfig.apiKey)
            } else if (savedConfig.thinkingProvider === provider) {
                 // Note: If testing thinking model, the frontend sends thinkingProvider as 'provider'
                 decryptedKey = savedConfig.thinkingApiKey ? decrypt(savedConfig.thinkingApiKey) : decrypt(savedConfig.apiKey)
            }

            if (decryptedKey) {
                apiKey = decryptedKey
            }
        }
    }

    if (!apiKey || apiKey.includes('****')) {
        return NextResponse.json({ success: false, error: 'API Key is required (and saved key not found/mismatched)' }, { status: 400 })
    }

    // Determine Base URL
    let finalBaseUrl = baseUrl
    if (!finalBaseUrl) {
        switch (provider) {
            case 'openai': finalBaseUrl = 'https://api.openai.com/v1'; break;
            case 'deepseek': finalBaseUrl = 'https://api.deepseek.com'; break;
            case 'moonshot': finalBaseUrl = 'https://api.moonshot.cn/v1'; break;
            case 'aliyun': finalBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'; break;
        }
    }

    const client = new OpenAI({
        apiKey,
        baseURL: finalBaseUrl,
    })

    // Determine Model
    let finalModel = model
    if (!finalModel) {
        switch (provider) {
            case 'deepseek': finalModel = 'deepseek-chat'; break;
            case 'moonshot': finalModel = 'moonshot-v1-8k'; break;
            case 'aliyun': finalModel = 'qwen-turbo'; break;
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
    console.error('Test Connection Error:', error)
    return NextResponse.json({ 
        success: false, 
        error: error.message || 'Connection failed',
        details: error
    }, { status: 500 })
  }
}
