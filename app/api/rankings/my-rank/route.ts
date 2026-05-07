import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'rating'

    let rank = 0
    let diff = 0 // Gap to next rank or top 100? Requirement says "gap" (maybe to previous rank?)
    // Requirement: "Show real rank and gap"

    if (type === 'solved') {
      const currentUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { solvedCount: true, rating: true }
      })
      
      if (currentUser) {
        // Count users with more solvedCount
        const count = await prisma.user.count({
          where: {
            isBanned: false,
            OR: [
              { solvedCount: { gt: currentUser.solvedCount } },
              { 
                solvedCount: currentUser.solvedCount,
                rating: { gt: currentUser.rating } 
              }
            ]
          }
        })
        rank = count + 1
      }
    } else {
      const currentUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { rating: true, solvedCount: true }
      })
      
      if (currentUser) {
        // Count users with higher rating
        const count = await prisma.user.count({
          where: {
            isBanned: false,
            OR: [
              { rating: { gt: currentUser.rating } },
              { 
                rating: currentUser.rating,
                solvedCount: { gt: currentUser.solvedCount } 
              }
            ]
          }
        })
        rank = count + 1
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        rank,
        userId: user.userId
      }
    })

  } catch (error) {
    logger.error('Get my rank error', error)
    return NextResponse.json({ success: false, error: 'Failed to get rank' }, { status: 500 })
  }
}
