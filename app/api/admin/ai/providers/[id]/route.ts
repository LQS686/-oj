import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { encrypt, maskApiKey } from '@/lib/crypto'
import { logger } from '@/lib/logger'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, baseUrl, apiKey, isActive } = body

    const existing = await prisma.aiProvider.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 })
    }

    const data: any = {
      name,
      baseUrl: baseUrl || null,
      isActive: isActive !== undefined ? isActive : existing.isActive
    }

    // Update API key only if provided and not masked
    if (apiKey && !apiKey.includes('****')) {
      data.apiKey = encrypt(apiKey)
    } else if (apiKey === '') {
      data.apiKey = null
    }

    const provider = await prisma.aiProvider.update({
      where: { id },
      data
    })

    // 级联处理：当 isActive 从 true 变为 false 时，软删除挂载在该 Provider 上的所有 model
    // 这样可以避免出现"挂在已禁用 Provider 上的活跃 model"这种孤儿数据。
    // 反向（false → true）不做处理，model 的 isActive 状态由用户在「AI 模型管理」页手动恢复。
    if (
      isActive === false &&
      existing.isActive === true
    ) {
      const cascaded = await prisma.aiModel.updateMany({
        where: { providerId: id, isActive: true },
        data: { isActive: false }
      })
      if (cascaded.count > 0) {
        logger.info(
          `[ai/providers] 服务商 ${id} 被禁用，级联软删除 ${cascaded.count} 个挂载模型`
        )
      }
    }

    return NextResponse.json({ success: true, data: provider })
  } catch (error) {
    console.error('Update Provider Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params

    // 级联删除：先删除该服务商下的所有模型，再删除服务商本身
    // 避免在 MongoDB 无外键约束时留下指向不存在 Provider 的孤儿 model
    const deletedModels = await prisma.aiModel.deleteMany({
      where: { providerId: id }
    })

    await prisma.aiProvider.delete({
      where: { id }
    })

    if (deletedModels.count > 0) {
      logger.info(`[ai/providers] 级联删除服务商 ${id}，连带删除 ${deletedModels.count} 个模型`)
    }

    return NextResponse.json({
      success: true,
      deletedModels: deletedModels.count
    })
  } catch (error) {
    console.error('Delete Provider Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
