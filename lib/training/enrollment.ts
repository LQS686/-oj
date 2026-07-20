/**
 * lib/training/enrollment.ts
 * 报名 / 参与
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { logger } from '@/lib/logger'
import { byIdKey, enrollmentKey, userEnrollmentsKey } from './crud'

/* ============================================================================
 * 加入 / 退出
 * ========================================================================== */

export async function enrollTraining(trainingId: string, userId: string) {
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  })
  if (existing) return existing
  const result = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.trainingEnrollment.create({
      data: { trainingId, userId },
    })
    await tx.training.update({
      where: { id: trainingId },
      data: { joinCount: { increment: 1 } },
    })
    return enrollment
  })
  cache.delete(enrollmentKey(userId, trainingId))
  cache.delete(userEnrollmentsKey(userId))
  return result
}

export async function unenrollTraining(trainingId: string, userId: string) {
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  })
  if (!existing) return null
  await prisma.$transaction(async (tx) => {
    await tx.trainingEnrollment.delete({
      where: { trainingId_userId: { trainingId, userId } },
    })
    await tx.training.update({
      where: { id: trainingId },
      data: { joinCount: { increment: -1 } },
    })
  })
  cache.delete(enrollmentKey(userId, trainingId))
  cache.delete(userEnrollmentsKey(userId))
  return existing
}

export async function isEnrolled(trainingId: string, userId: string): Promise<boolean> {
  return cache.get('training:enrollment:check', [trainingId, userId], async () => {
    const r = await prisma.trainingEnrollment.findUnique({
      where: { trainingId_userId: { trainingId, userId } },
      select: { id: true },
    })
    return !!r
  }, { ttl: 10_000 })
}

export async function getUserEnrollments(userId: string) {
  return cache.get('training:enrollments', [userId], async () => {
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        training: {
          include: {
            _count: { select: { problems: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
    })
    return enrollments.map((e: any) => ({
      trainingId: e.trainingId,
      joinedAt: e.joinedAt,
      training: {
        id: e.training.id,
        title: e.training.title,
        description: e.training.description,
        difficulty: e.training.difficulty,
        cover: e.training.cover,
        tags: e.training.tags,
        problemCount: e.training._count.problems,
        category: e.training.category,
        joinCount: e.training.joinCount,
        viewCount: e.training.viewCount,
      },
    }))
  }, { ttl: 30_000 })
}

export async function incrementJoinCount(trainingId: string, delta: number) {
  try {
    await prisma.training.update({
      where: { id: trainingId },
      data: { joinCount: { increment: delta } },
    })
  } catch (err) {
    logger.warn(`[training] incrementJoinCount failed: ${(err as Error).message}`)
  }
  cache.delete(byIdKey(trainingId))
}

export async function incrementViewCount(trainingId: string) {
  try {
    await prisma.training.update({
      where: { id: trainingId },
      data: { viewCount: { increment: 1 } },
    })
  } catch (err) {
    logger.warn(`[training] incrementViewCount failed: ${(err as Error).message}`)
  }
  // view count 不清除详情缓存以避免抖动
}
