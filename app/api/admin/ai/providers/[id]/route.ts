import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { encrypt, maskApiKey } from '@/lib/crypto'

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

    // Check if any models are using this provider
    const modelsCount = await prisma.aiModel.count({
      where: { providerId: id }
    })

    if (modelsCount > 0) {
      return NextResponse.json({ success: false, error: 'Cannot delete provider with existing models' }, { status: 400 })
    }

    await prisma.aiProvider.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete Provider Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
