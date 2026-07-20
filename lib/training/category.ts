/**
 * lib/training/category.ts
 * 推荐题单 + 分类管理
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { categoriesKey, TRAINING_LIST_TTL } from './crud'
import type { TrainingCategory } from './types'

/* ============================================================================
 * 推荐题单 / 分类
 * ========================================================================== */

export async function listRecommendedTrainings(limit = 3, userId: string | null = null) {
  return cache.get('training:recommended', [limit, userId || 'guest'], async () => {
    const trainings = await prisma.training.findMany({
      where: { isPublic: true, status: 'published', isRecommended: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { problems: true } },
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
        category: { select: { id: true, name: true } },
      },
    })
    return trainings.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      difficulty: t.difficulty,
      cover: t.cover,
      tags: t.tags,
      isRecommended: t.isRecommended,
      joinCount: t.joinCount,
      viewCount: t.viewCount,
      problemCount: t._count.problems,
      author: t.author,
      category: t.category,
      createdAt: t.createdAt,
    }))
  }, { ttl: TRAINING_LIST_TTL })
}

export async function listCategories(): Promise<TrainingCategory[]> {
  return cache.get('training:categories', ['all'], async () => {
    const items = await prisma.trainingCategory.findMany({
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { trainings: true } } },
    })
    return items.map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      orderIndex: c.orderIndex,
      createdAt: c.createdAt,
      _count: c._count,
    }))
  }, { ttl: 60_000 })
}

export async function createCategory(input: { name: string; description?: string; orderIndex?: number }) {
  cache.delete(categoriesKey())
  return prisma.trainingCategory.create({
    data: {
      name: input.name,
      description: input.description || null,
      orderIndex: input.orderIndex ?? 0,
    },
  })
}

export async function updateCategory(id: string, input: { name?: string; description?: string; orderIndex?: number }) {
  cache.delete(categoriesKey())
  return prisma.trainingCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.orderIndex !== undefined ? { orderIndex: input.orderIndex } : {}),
    },
  })
}

export async function deleteCategory(id: string) {
  cache.delete(categoriesKey())
  return prisma.trainingCategory.delete({ where: { id } })
}
