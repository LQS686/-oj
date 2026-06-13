/**
 * GET /api/problems/tags - 标签列表
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async () => {
  const problems = await prisma.problem.findMany({
    where: {
      OR: [{ isPublic: true }, { visibility: 'public' }],
    },
    select: { tags: true },
  })

  const tagSet = new Set<string>()
  problems.forEach((p) => {
    if (Array.isArray(p.tags)) {
      p.tags.forEach((tag) => {
        if (tag && typeof tag === 'string' && tag.trim()) {
          tagSet.add(tag.trim())
        }
      })
    }
  })

  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return ok(tags)
})
