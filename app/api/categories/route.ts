/**
 * /api/categories - 分类
 *
 * GET  获取分类列表
 * POST 初始化默认分类
 */
import { withApi, ok } from '@/lib/api/withApi'
import {
  DEFAULT_CATEGORIES,
  listAllCategories,
  seedDefaultCategories,
} from '@/lib/category/service'
import { logger } from '@/lib/logger'

export const POST = withApi.admin(async () => {
  const data = await seedDefaultCategories()
  return ok({ message: '分类初始化完成', data })
})

export const GET = withApi.public(async () => {
  try {
    let categories = await listAllCategories()
    if (categories.length === 0) {
      // 自动种子
      await seedDefaultCategories()
      categories = await listAllCategories()
    }
    return ok(categories)
  } catch (dbError) {
    // 数据库连接失败，使用模拟数据
    logger.warn('数据库连接失败，使用模拟数据', { err: dbError })
    return ok(DEFAULT_CATEGORIES)
  }
})
