import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { addAiJob } from '@/lib/ai/queue'
import { logger } from '@/lib/logger'

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
        type, difficulty, topic, additionalInfo,
        // Test Data Gen
        title, description, inputDescription, outputDescription,
        // Common
        targetProblemId,
        solutionCode,
        solutionLanguage,
        modelId,
        // Retry
        retryFromLogId,
        reduceTemperature,  // 显式降温度（用于重试）
    } = body
    // 业务决策（2026-06）：单次 AI 调用只生成 1 道题，count 字段已废弃
    const COUNT = 1

    // 3. Retry path: 从已失败日志重跑
    if (retryFromLogId) {
      const oldLog = await prisma.aiGenerationLog.findUnique({ where: { id: retryFromLogId } })
      if (!oldLog) {
        return NextResponse.json({ success: false, error: 'Log not found' }, { status: 404 })
      }
      if (oldLog.userId !== user.userId && !user.isAdmin) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
      if (oldLog.status === 'COMPLETED') {
        return NextResponse.json({ success: false, error: '该日志已成功完成，无需重试' }, { status: 400 })
      }
      // 僵尸日志（dev server 重启后遗留的 PROCESSING 永远完不成）允许重试
      // 判定标准：PENDING/PROCESSING 且 createdAt 超过 10 分钟
      const STUCK_TIMEOUT_MS = 10 * 60 * 1000
      const isStuck = (oldLog.status === 'PENDING' || oldLog.status === 'PROCESSING') &&
        (Date.now() - new Date(oldLog.createdAt).getTime()) > STUCK_TIMEOUT_MS
      if (!isStuck && (oldLog.status === 'PENDING' || oldLog.status === 'PROCESSING')) {
        return NextResponse.json({ success: false, error: '该日志正在处理中，请等待完成后再试' }, { status: 400 })
      }

      // 重用原参数
      const retryParams = (oldLog.params as any) || {}
      logger.info('[ai-generate] Retry from log', {
        retryFromLogId,
        userId: user.userId,
        reduceTemperature
      })

      // 重置日志状态为 PENDING
      const retryLog = await prisma.aiGenerationLog.create({
        data: {
          userId: user.userId,
          status: 'PENDING',
          params: {
            ...retryParams,
            // 重试时强制重置：清空旧 result/error，标记这是重试
            _retryFrom: retryFromLogId,
            _reduceTemperature: reduceTemperature || true
          }
        }
      })

      // 加入队列（沿用原参数）
      await addAiJob({
        logId: retryLog.id,
        userId: user.userId,
        params: {
          mode: retryParams.mode || mode,
          type: retryParams.type,
          difficulty: retryParams.difficulty,
          topic: retryParams.topic,
          count: COUNT,  // 业务决策（2026-06）：硬编码 1
          additionalInfo: retryParams.additionalInfo,
          title: retryParams.title,
          description: retryParams.description,
          inputDescription: retryParams.inputDescription,
          outputDescription: retryParams.outputDescription,
          targetProblemId: retryParams.targetProblemId,
          solutionCode: retryParams.solutionCode,
          solutionLanguage: retryParams.solutionLanguage,
          modelId: retryParams.modelId || modelId,
          // 重试标识，让 generator 内部降温度
          _retry: true,
          _reduceTemperature: true  // 重试默认降温度
        }
      })

      return NextResponse.json({ success: true, data: { logId: retryLog.id, retriedFrom: retryFromLogId } })
    }

    // Validation based on mode
    if (mode === 'test_data') {
        if (!title || !description) {
            return NextResponse.json({ success: false, error: 'Missing title or description' }, { status: 400 })
        }
        // 标程可选：拆分流程中 AI 在第一阶段已生成 solution_cpp，但部分模型可能未遵守；后端不应阻塞
        // test_data 生成器内部 hasSolution=false 走"无标程：output 必须是真实结果"路径
    } else {
        // Parametric mode (default)
        // 业务决策（2026-06）：count 字段已废弃，固定为 1
        if (!type || !difficulty || !topic) {
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
        count: COUNT,  // 业务决策（2026-06）：硬编码 1
        additionalInfo,
        // Test Data Gen
        title,
        description,
        inputDescription,
        outputDescription,
        // Common
        targetProblemId,
        solutionCode,
        solutionLanguage,
        modelId,
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
