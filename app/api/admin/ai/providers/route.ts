import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { encrypt, maskApiKey } from '@/lib/crypto'

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

    const encryptedKey = apiKey ? encrypt(apiKey) : null

    const provider = await prisma.aiProvider.create({
      data: {
        name,
        slug,
        baseUrl: baseUrl || null,
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
