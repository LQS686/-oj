import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const defaultCategories = [
  { id: '1', name: '综合讨论', description: '综合话题讨论', sortOrder: 1 },
  { id: '2', name: '题解分享', description: '题目解答分享', sortOrder: 2 },
  { id: '3', name: '求助问答', description: '问题求助和解答', sortOrder: 3 },
  { id: '4', name: '技术交流', description: '技术讨论与交流', sortOrder: 4 },
  { id: '5', name: '公告', description: '系统公告', sortOrder: 0 },
]

export async function POST() {
  try {
    const results = []
    
    for (const cat of defaultCategories) {
      const existing = await prisma.category.findFirst({
        where: { name: cat.name }
      })
      
      if (!existing) {
        const created = await prisma.category.create({
          data: cat
        })
        results.push({ action: 'created', category: created })
      } else {
        results.push({ action: 'exists', category: existing })
      }
    }
    
    return NextResponse.json({
      success: true,
      message: '分类初始化完成',
      data: results
    })
  } catch (error) {
    logger.error('初始化分类失败', error)
    return NextResponse.json(
      { success: false, error: '初始化分类失败' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // 尝试从数据库获取数据
    try {
      let categories = await prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
      })
      
      if (categories.length === 0) {
        for (const cat of defaultCategories) {
          await prisma.category.create({ data: cat })
        }
        categories = await prisma.category.findMany({
          orderBy: { sortOrder: 'asc' },
        })
      }

      return NextResponse.json({
        success: true,
        data: categories,
      })
    } catch (dbError) {
      // 数据库连接失败，使用模拟数据
      console.log('数据库连接失败，使用模拟数据')
      return NextResponse.json({
        success: true,
        data: defaultCategories,
      })
    }
  } catch (error) {
    logger.error('获取分类失败', error)
    return NextResponse.json(
      { success: false, error: '获取分类失败' },
      { status: 500 }
    )
  }
}
