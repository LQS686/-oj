import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { modelId, isDefault } = body

    if (!modelId) {
        return NextResponse.json({ success: false, error: 'Missing modelId' }, { status: 400 })
    }

    // Check if model exists
    const model = await prisma.aiModel.findUnique({ where: { id: modelId } })
    if (!model) {
        return NextResponse.json({ success: false, error: 'Model not found' }, { status: 404 })
    }

    // Handle "Set as Default" - unset others first if setting true
    if (isDefault) {
        await prisma.userAiPreference.updateMany({
            where: { userId: user.userId, isDefault: true },
            data: { isDefault: false }
        })
    }

    // Upsert preference
    const pref = await prisma.userAiPreference.upsert({
        where: {
            userId_modelId: {
                userId: user.userId,
                modelId: modelId
            }
        },
        update: {
            lastUsed: new Date(),
            count: { increment: 1 },
            isDefault: isDefault !== undefined ? isDefault : undefined
        },
        create: {
            userId: user.userId,
            modelId: modelId,
            count: 1,
            lastUsed: new Date(),
            isDefault: isDefault || false
        }
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('Update Preference Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
