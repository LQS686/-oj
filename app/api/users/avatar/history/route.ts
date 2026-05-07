import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const history = await prisma.avatarHistory.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    return NextResponse.json({ success: true, data: history })
  } catch (error) {
    console.error('Fetch history error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch history' }, { status: 500 })
  }
}
