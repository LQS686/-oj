/**
 * lib/category/service.ts
 * 分类：默认种子 + 列表
 */
import { prisma } from '@/lib/prisma'

export const DEFAULT_CATEGORIES = [
  { id: '1', name: '综合讨论', description: '综合话题讨论', sortOrder: 1 },
  { id: '2', name: '题解分享', description: '题目解答分享', sortOrder: 2 },
  { id: '3', name: '求助问答', description: '问题求助和解答', sortOrder: 3 },
  { id: '4', name: '技术交流', description: '技术讨论与交流', sortOrder: 4 },
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
