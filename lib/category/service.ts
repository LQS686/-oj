/**
 * lib/category/service.ts
 * 分类：默认种子 + 列表
 */
import { prisma } from '@/lib/prisma'

export const DEFAULT_CATEGORIES = [
  { id: '5', name: '公告', description: '系统公告', sortOrder: 0 },
]

/** 列出所有分类 */
export async function listAllCategories() {
  return prisma.category.findMany({ orderBy: { sortOrder: 'asc' } })
}

/** 初始化默认分类，返回哪些创建 / 哪些已存在 */
export async function seedDefaultCategories() {
  const results: any[] = []
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name: cat.name } })
    if (!existing) {
      const created = await prisma.category.create({ data: cat })
      results.push({ action: 'created', category: created })
    } else {
      results.push({ action: 'exists', category: existing })
    }
  }
  return results
}
