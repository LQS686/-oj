import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    // 使用两步查询避免 MongoDB 在 include 孤儿引用时抛 500：
    //   1) 仅拉取 isActive=true 的 models
    //   2) 拉取这些 models 引用的 providers（同时要求 provider isActive=true）
    //   3) 过滤掉 provider 不存在或 provider.isActive=false 的 models
    //   4) 手动 enrich 后返回
    // 严格过滤的目的：即使数据库中残留历史脏数据（如 provider 已被软删除），
    // 也不会让"挂在已禁用 Provider 上的模型"出现在前端 UI 上。
    const allModels = await prisma.aiModel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    })

    if (allModels.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const providerIds = Array.from(new Set(allModels.map(m => m.providerId)))
    const providers = await prisma.aiProvider.findMany({
      where: { id: { in: providerIds }, isActive: true },
      select: { id: true, name: true, slug: true }
    })
    const providerMap = new Map(providers.map(p => [p.id, p]))

    const validModels = allModels
      .filter(m => providerMap.has(m.providerId))
      .map(m => ({ ...m, provider: providerMap.get(m.providerId) }))

    const orphanCount = allModels.length - validModels.length
    if (orphanCount > 0) {
      logger.warn(`[ai/models] 过滤孤儿/挂载在已禁用 Provider 上的模型 ${orphanCount} 条`)
    }

    return NextResponse.json({ success: true, data: validModels })
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
      maxTokens, temperature, timeout, params
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
        // 高级参数（DeepSeek v4 thinking / topP 等），默认空对象
        params: params && typeof params === 'object' ? params : {},
        isActive: true
      }
    })

    return NextResponse.json({ success: true, data: newModel })
  } catch (error) {
    console.error('Create Model Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
