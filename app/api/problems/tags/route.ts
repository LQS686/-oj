import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    const problems = await prisma.problem.findMany({
      where: { 
        OR: [
          { isPublic: true },
          { visibility: 'public' }
        ]
      },
      select: { tags: true }
    })
    
    const tagSet = new Set<string>()
    problems.forEach(p => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach(tag => {
          if (tag && typeof tag === 'string' && tag.trim()) {
            tagSet.add(tag.trim())
          }
        })
      }
    })
    
    const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    
    return NextResponse.json({
      success: true,
      data: tags
    })
  } catch (error) {
    logger.error('获取标签失败', error)
    return NextResponse.json(
      { success: false, error: '获取标签失败' },
      { status: 500 }
    )
  }
}
