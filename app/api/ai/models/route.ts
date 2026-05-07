import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

// This endpoint is for normal users to get available models and their own preferences
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    // Get all active models
    const models = await prisma.aiModel.findMany({
      where: { isActive: true },
      include: {
        provider: {
          select: { name: true, slug: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    // If user is logged in, get their preferences
    let preferences: any[] = []
    let defaultModelId = null
    
    if (user) {
        preferences = await prisma.userAiPreference.findMany({
            where: { userId: user.userId },
            orderBy: { lastUsed: 'desc' }
        })
        
        const defaultPref = preferences.find(p => p.isDefault)
        if (defaultPref) {
            defaultModelId = defaultPref.modelId
        } else if (preferences.length > 0) {
            defaultModelId = preferences[0].modelId // Last used
        }
    }

    return NextResponse.json({ 
        success: true, 
        data: {
            models: models.map(m => ({
                id: m.id,
                name: m.name,
                model: m.model,
                type: m.type,
                providerName: m.provider.name
            })),
            preferences: preferences.map(p => ({
                modelId: p.modelId,
                lastUsed: p.lastUsed,
                count: p.count,
                isDefault: p.isDefault
            })),
            defaultModelId
        }
    })
  } catch (error) {
    console.error('Get User AI Config Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
