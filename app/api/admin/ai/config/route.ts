import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { encrypt, decrypt, maskApiKey } from '@/lib/crypto'
import { getSystemSettings } from '@/lib/settings'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { 
      provider, model, apiKey, baseUrl,
      enableThinking, thinkingProvider, thinkingModel, thinkingApiKey, thinkingBaseUrl, thinkingLevel
    } = body

    if (!provider || !model) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const existingConfig = await prisma.aiModelConfig.findFirst({
      where: { scope: 'GLOBAL' }
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
          provider, model, apiKey: finalApiKey, baseUrl,
          enableThinking: enableThinking || false,
          thinkingProvider, thinkingModel, thinkingApiKey: finalThinkingApiKey, thinkingBaseUrl, 
          thinkingLevel: thinkingLevel || 3
        }
      })
    } else {
      await prisma.aiModelConfig.create({
        data: {
          scope: 'GLOBAL',
          provider, model, apiKey: finalApiKey, baseUrl,
          enableThinking: enableThinking || false,
          thinkingProvider, thinkingModel, thinkingApiKey: finalThinkingApiKey, thinkingBaseUrl,
          thinkingLevel: thinkingLevel || 3
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Config Save Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const config = await prisma.aiModelConfig.findFirst({
      where: { scope: 'GLOBAL' }
    })

    const tokenStats = await prisma.aiGenerationLog.aggregate({
      _sum: {
        tokensUsed: true
      }
    })

    if (config) {
      return NextResponse.json({ 
        success: true, 
        data: {
          ...config,
          apiKey: maskApiKey(config.apiKey),
          thinkingApiKey: maskApiKey(config.thinkingApiKey || ''),
          totalTokens: tokenStats._sum.tokensUsed || 0,
          hasApiKey: !!config.apiKey
        }
      })
    }

    const settings = await getSystemSettings()
    const hasApiKey = !!(settings as any).aiApiKey

    return NextResponse.json({ 
      success: true, 
      data: {
        provider: (settings as any).aiProvider || 'openai',
        model: (settings as any).aiModel || 'gpt-4',
        baseUrl: (settings as any).aiBaseUrl || '',
        apiKey: hasApiKey ? '****configured****' : '',
        totalTokens: tokenStats._sum.tokensUsed || 0,
        hasApiKey
      } 
    })
  } catch (error) {
    console.error('Config Get Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
