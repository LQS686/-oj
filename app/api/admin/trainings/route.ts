/**
 * /api/admin/trainings - 管理后台题单列表
 *
 * GET 鉴权：仅管理员（包含草稿）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import { toInt } from '@/lib/api/validation'

export const GET = withApi.admin(async (req, _ctx) => {
  const q = readQuery<{
    page?: string
    pageSize?: string
    keyword?: string
    status?: string
    categoryId?: string
  }>(req)
  const page = Math.max(1, toInt(q.page, 'page', 1))
  const pageSize = Math.min(100, Math.max(1, toInt(q.pageSize, 'pageSize', 20)))

  const where: any = {}
  if (q.keyword) {
    where.OR = [
      { title: { contains: q.keyword, mode: 'insensitive' } },
      { description: { contains: q.keyword, mode: 'insensitive' } },
    ]
  }
  if (q.status) where.status = q.status
  if (q.categoryId) where.categoryId = q.categoryId

  const [items, total] = await Promise.all([
    prisma.training.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { problems: true, enrollments: true } },
        author: { select: { id: true, username: true, nickname: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.training.count({ where }),
  ])

  return ok({
    items: items.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      difficulty: t.difficulty,
      status: t.status,
      isPublic: t.isPublic,
      isRecommended: t.isRecommended,
      problemCount: t._count.problems,
      joinCount: t.joinCount,
      viewCount: t.viewCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      author: t.author,
      category: t.category,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
})
