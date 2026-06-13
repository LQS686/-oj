/**
 * /api/categories - 分类
 *
 * GET  获取分类列表
 * POST 初始化默认分类
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

const defaultCategories = [
  { id: '1', name: '综合讨论', description: '综合话题讨论', sortOrder: 1 },
  { id: '2', name: '题解分享', description: '题目解答分享', sortOrder: 2 },
  { id: '3', name: '求助问答', description: '问题求助和解答', sortOrder: 3 },
  { id: '4', name: '技术交流', description: '技术讨论与交流', sortOrder: 4 },
  { id: '5', name: '公告', description: '系统公告', sortOrder: 0 },
]

export const POST = withApi.public(async () => {
  const results: any[] = []
  for (const cat of defaultCategories) {
    const existing = await prisma.category.findFirst({ where: { name: cat.name } })
    if (!existing) {
      const created = await prisma.category.create({ data: cat })
      results.push({ action: 'created', category: created })
    } else {
      results.push({ action: 'exists', category: existing })
    }
  }
  return ok({ message: '分类初始化完成', data: results })
})

export const GET = withApi.public(async () => {
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
    return ok(categories)
  } catch (dbError) {
    // 数据库连接失败，使用模拟数据
    console.log('数据库连接失败，使用模拟数据')
    return ok(defaultCategories)
  }
})
