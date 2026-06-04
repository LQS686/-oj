import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { encrypt, maskApiKey } from '@/lib/crypto'
import { getProviderMeta, resolveBaseUrl } from '@/lib/ai/providers'

type ProviderWithMaskedKey = {
  id: string
  name: string
  slug: string
  baseUrl: string | null
  apiKey: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const providers = await prisma.aiProvider.findMany({
      orderBy: { createdAt: 'desc' }
    })

    const maskedProviders: ProviderWithMaskedKey[] = providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? maskApiKey(p.apiKey) : null
    }))

    return NextResponse.json({ success: true, data: maskedProviders })
  } catch (error) {
    console.error('Get Providers Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { name, slug, baseUrl, apiKey } = body

    if (!name || !slug) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Check slug uniqueness
    const existing = await prisma.aiProvider.findUnique({
      where: { slug }
    })
    if (existing) {
      return NextResponse.json({ success: false, error: 'Provider slug already exists' }, { status: 400 })
    }

    // 预设填充：若 slug 在字典中且未传 baseUrl，从字典读取
    const meta = getProviderMeta(slug)
    const finalBaseUrl = baseUrl || (meta ? meta.baseUrl : null)

    let encryptedKey: string | null = null
    if (apiKey) {
      try {
        encryptedKey = encrypt(apiKey)
      } catch (err: any) {
        // 写入路径必须配置密钥，给清晰提示（不要 500 通用错误）
        if (err?.message?.includes('AI_CONFIG_ENCRYPTION_KEY')) {
          return NextResponse.json({
            success: false,
            error: 'AI_CONFIG_ENCRYPTION_KEY 环境变量未设置，请先在 .env 配置 32 字节密钥再添加服务商',
            code: 'MISSING_ENCRYPTION_KEY'
          }, { status: 400 })
        }
        throw err
      }
    }

    const provider = await prisma.aiProvider.create({
      data: {
        name,
        slug,
        baseUrl: finalBaseUrl || null,
        apiKey: encryptedKey,
        isActive: true
      }
    })

    return NextResponse.json({ success: true, data: provider })
  } catch (error) {
    console.error('Create Provider Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
