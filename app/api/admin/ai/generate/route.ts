import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { addAiJob } from '@/lib/ai/queue'

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    // 2. Parse body
    const body = await request.json()
    const { 
        mode = 'parametric', 
        // Parametric
        type, difficulty, topic, count, additionalInfo, 
        // Text Based
        textInput, textModeType, optimizeDescription,
        // Test Data Gen
        title, description, inputDescription, outputDescription,
        // Common
        targetProblemId,
        solutionCode,
        solutionLanguage,
        modelId
    } = body

    // Validation based on mode
    if (mode === 'text_based') {
        if (!textInput || !textInput.trim()) {
            return NextResponse.json({ success: false, error: 'Missing text input' }, { status: 400 })
        }
    } else if (mode === 'test_data') {
        if (!title || !description) {
            return NextResponse.json({ success: false, error: 'Missing title or description' }, { status: 400 })
        }
        // Enforce solution code presence
        if (!body.solutionCode || !body.solutionCode.trim()) {
            return NextResponse.json({ success: false, error: 'Must provide solution code for test data generation' }, { status: 400 })
        }
    } else {
        // Parametric mode (default)
        if (!type || !difficulty || !topic || !count) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
        }
    }

    // 3. Update User Preference
    if (modelId) {
        try {
            await prisma.userAiPreference.upsert({
                where: {
                    userId_modelId: {
                        userId: user.userId,
                        modelId: modelId
                    }
                },
                update: {
                    lastUsed: new Date(),
                    count: { increment: 1 }
                },
                create: {
                    userId: user.userId,
                    modelId: modelId,
                    count: 1,
                    lastUsed: new Date(),
                    isDefault: false
                }
            })
        } catch (e) {
            console.error('Failed to update preference', e)
        }
    }

    // 4. Create Log
    const log = await prisma.aiGenerationLog.create({
      data: {
        userId: user.userId,
        status: 'PENDING',
        params: body, // Store full body
      }
    })

    // 4. Add to queue
    await addAiJob({
      logId: log.id,
      userId: user.userId,
      params: {
        mode,
        // Parametric
        type,
        difficulty,
        topic,
        count: count ? Math.min(count, 5) : 1,
        additionalInfo,
        // Text Based
        textInput,
        textModeType: textModeType || 'clone',
        optimizeDescription: optimizeDescription || false,
        // Test Data Gen
        title,
        description,
        inputDescription,
        outputDescription,
        // Common
        targetProblemId,
        solutionCode,
        solutionLanguage,
        modelId
      }
    })

    return NextResponse.json({ success: true, data: { logId: log.id } })

  } catch (error) {
    console.error('AI Generate Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const logId = searchParams.get('logId')

    if (!logId) {
      // Return list of recent logs
      const logs = await prisma.aiGenerationLog.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
      return NextResponse.json({ success: true, data: logs })
    }

    const log = await prisma.aiGenerationLog.findUnique({
      where: { id: logId }
    })

    if (!log) {
      return NextResponse.json({ success: false, error: 'Log not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: log })

  } catch (error) {
    console.error('AI Status Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
