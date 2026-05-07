import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const models = await prisma.aiModel.findMany({
      include: {
        provider: {
          select: { name: true, slug: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ success: true, data: models })
  } catch (error) {
    console.error('Get Models Error:', error)
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
    const { 
      name, model, providerId, type,
      maxTokens, temperature, timeout
    } = body

    if (!name || !model || !providerId || !type) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const newModel = await prisma.aiModel.create({
      data: {
        name,
        model,
        providerId,
        type, // 'generation' or 'thinking'
        maxTokens: maxTokens || 2048,
        temperature: temperature !== undefined ? temperature : 0.7,
        timeout: timeout || 60000,
        isActive: true
      }
    })

    return NextResponse.json({ success: true, data: newModel })
  } catch (error) {
    console.error('Create Model Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
