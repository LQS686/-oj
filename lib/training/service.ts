/**
 * lib/training/service.ts
 * 训练计划 CRUD + 进度
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface TrainingFilter {
  keyword?: string
  isPublic?: boolean
  categoryId?: string
}

export async function listTrainings(
  filter: TrainingFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.categoryId) where.categoryId = filter.categoryId

  const [items, total] = await Promise.all([
    prisma.training.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'createdAt']: options.sortOrder || 'desc' },
    }),
    prisma.training.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getTrainingById(id: string) {
  return cache.get('training:byId', [id], async () => {
    return prisma.training.findUnique({
      where: { id },
      include: { problems: { include: { problem: true }, orderBy: { orderIndex: 'asc' } } },
    })
  }, { ttl: 30_000 })
}

export async function createTraining(data: any) {
  return prisma.training.create({ data })
}

export async function updateTraining(id: string, data: any) {
  cache.delete(`training:byId:${id}`)
  return prisma.training.update({ where: { id }, data })
}

export async function deleteTraining(id: string) {
  cache.delete(`training:byId:${id}`)
  return prisma.training.delete({ where: { id } })
}

export async function getUserTrainingProgress(trainingId: string, userId: string) {
  return (prisma as any).trainingProgress
    ? await (prisma as any).trainingProgress.findUnique({
        where: { trainingId_userId: { trainingId, userId } },
      })
    : null
}

export async function updateTrainingProgress(
  trainingId: string,
  userId: string,
  data: { completedProblems?: number; totalScore?: number }
) {
  const model = (prisma as any).trainingProgress
  if (!model) return null
  return model.upsert({
    where: { trainingId_userId: { trainingId, userId } },
    update: data,
    create: { trainingId, userId, ...data },
  })
}
