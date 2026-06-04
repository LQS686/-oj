import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      name, model, providerId, type,
      maxTokens, temperature, timeout, isActive, params: modelParams
    } = body

    const existing = await prisma.aiModel.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Model not found' }, { status: 404 })
    }

    const updatedModel = await prisma.aiModel.update({
      where: { id },
      data: {
        name,
        model,
        providerId,
        type,
        maxTokens,
        temperature,
        timeout,
        // 高级参数（DeepSeek v4 thinking / topP 等），允许为空对象
        params: modelParams && typeof modelParams === 'object' ? modelParams : {},
        isActive: isActive !== undefined ? isActive : existing.isActive
      }
    })

    return NextResponse.json({ success: true, data: updatedModel })
  } catch (error) {
    console.error('Update Model Error:', error)
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

    await prisma.aiModel.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete Model Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
