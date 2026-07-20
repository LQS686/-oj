/**
 * lib/training/crud.ts
 * 训练计划基础 CRUD + 缓存 key 工具（跨模块共享）
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions } from '@/lib/types/common'

export interface TrainingFilter {
  keyword?: string
  isPublic?: boolean
  categoryId?: string
}

const TRAINING_LIST_TTL = 30_000
const TRAINING_DETAIL_TTL = 30_000

/** 缓存 key 工具 */
function listKey(filter: object, opts: object): string {
  return `training:list:${cacheHash({ filter, opts })}`
}
export function byIdKey(id: string): string {
  return `training:byId:${id}`
}
export function enrollmentKey(userId: string, trainingId: string): string {
  return `training:enrollment:${userId}:${trainingId}`
}
export function userEnrollmentsKey(userId: string): string {
  return `training:enrollments:${userId}`
}
export function categoriesKey(): string {
  return 'training:categories:all'
}
function cacheHash(input: object): string {
  return Buffer.from(JSON.stringify(input)).toString('base64url').slice(0, 32)
}

export { TRAINING_LIST_TTL, TRAINING_DETAIL_TTL }

/* ============================================================================
 * 基础 CRUD
 * ========================================================================== */

export async function listTrainings(
  filter: TrainingFilter = {},
  options: ListOptions = {}
): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
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
  }, { ttl: TRAINING_DETAIL_TTL })
}

export async function createTraining(data: any) {
  return prisma.training.create({ data })
}

export async function updateTraining(id: string, data: any) {
  cache.delete(byIdKey(id))
  cache.deleteByPrefix('training:list:')
  return prisma.training.update({ where: { id }, data })
}

export async function deleteTraining(id: string) {
  cache.delete(byIdKey(id))
  cache.deleteByPrefix('training:list:')
  // 级联删除关联表（Prisma 关系未设 onDelete: Cascade，需手动）
  return prisma.$transaction([
    prisma.trainingProblem.deleteMany({ where: { trainingId: id } }),
    prisma.trainingEnrollment.deleteMany({ where: { trainingId: id } }),
    prisma.training.delete({ where: { id } }),
  ])
}
