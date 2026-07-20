/**
 * lib/training/problems.ts
 * 训练 + 题目组合操作 + 训练题目管理
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { byIdKey } from './crud'
import type { TrainingCreateInput, TrainingUpdateInput } from './types'

/* ============================================================================
 * 创建 / 更新（含题目）
 * ========================================================================== */

export async function createTrainingWithProblems(input: TrainingCreateInput) {
  const { problemIds, ...rest } = input
  const training = await prisma.training.create({
    data: {
      title: rest.title,
      description: rest.description,
      // difficulty 可选字段，仅在显式传入时设置
      ...(rest.difficulty != null ? { difficulty: rest.difficulty } : {}),
      categoryType: rest.categoryType ?? null,
      isPublic: rest.isPublic ?? true,
      status: rest.status ?? 'published',
      isRecommended: rest.isRecommended ?? false,
      authorId: rest.authorId || null,
      categoryId: rest.categoryId || null,
      tags: rest.tags || [],
      cover: rest.cover || null,
      ...(rest.classId ? { classId: rest.classId } : {}),
    },
  })
  if (problemIds && problemIds.length > 0) {
    const trainingProblems = problemIds.map((problemId, index) => ({
      trainingId: training.id,
      problemId,
      orderIndex: index,
    }))
    await prisma.trainingProblem.createMany({ data: trainingProblems })
  }
  cache.deleteByPrefix('training:list:')
  return training
}

export async function updateTrainingAndProblems(
  id: string,
  input: TrainingUpdateInput
) {
  cache.delete(byIdKey(id))
  cache.deleteByPrefix('training:list:')
  return prisma.training.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
      ...(input.categoryType !== undefined ? { categoryType: input.categoryType } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.cover !== undefined ? { cover: input.cover } : {}),
    },
  })
}

/* ============================================================================
 * 题目管理（add/remove/reorder/update）
 * ========================================================================== */

export async function addTrainingProblems(
  trainingId: string,
  problems: Array<{ problemId: string; orderIndex?: number; score?: number; required?: boolean }>
) {
  cache.delete(byIdKey(trainingId))
  if (problems.length === 0) return { count: 0 }
  // 计算起始 orderIndex
  const latest = await prisma.trainingProblem.findMany({
    where: { trainingId },
    orderBy: { orderIndex: 'desc' },
    take: 1,
    select: { orderIndex: true },
  })
  let next = (latest[0]?.orderIndex ?? -1) + 1
  const data = problems.map((p: any) => ({
    trainingId,
    problemId: p.problemId,
    orderIndex: p.orderIndex ?? next++,
    score: p.score ?? 100,
    required: p.required ?? true,
  }))
  // 先查询已存在的 trainingId+problemId 组合，再批量插入未存在的
  const existingProblems = await prisma.trainingProblem.findMany({
    where: { trainingId },
    select: { problemId: true },
  })
  const existingIds = new Set(existingProblems.map(e => e.problemId))
  const toCreate = data.filter(item => !existingIds.has(item.problemId))
  let count = 0
  if (toCreate.length > 0) {
    const result = await prisma.trainingProblem.createMany({ data: toCreate })
    count = result.count
  }
  return { count }
}

export async function removeTrainingProblems(trainingId: string, problemIds: string[]) {
  cache.delete(byIdKey(trainingId))
  return prisma.trainingProblem.deleteMany({
    where: { trainingId, problemId: { in: problemIds } },
  })
}

export async function reorderTrainingProblems(
  trainingId: string,
  orderMap: Array<{ problemId: string; orderIndex: number }>
) {
  cache.delete(byIdKey(trainingId))
  await prisma.$transaction(
    orderMap.map(item =>
      prisma.trainingProblem.update({
        where: { trainingId_problemId: { trainingId, problemId: item.problemId } },
        data: { orderIndex: item.orderIndex },
      })
    )
  )
  return { count: orderMap.length }
}

export async function updateTrainingProblemItem(
  trainingId: string,
  updates: Array<{ problemId: string; score?: number; required?: boolean; orderIndex?: number }>
) {
  cache.delete(byIdKey(trainingId))
  await prisma.$transaction(
    updates.map((u: any) =>
      prisma.trainingProblem.update({
        where: { trainingId_problemId: { trainingId, problemId: u.problemId } },
        data: {
          ...(u.score !== undefined ? { score: u.score } : {}),
          ...(u.required !== undefined ? { required: u.required } : {}),
          ...(u.orderIndex !== undefined ? { orderIndex: u.orderIndex } : {}),
        },
      })
    )
  )
  return { count: updates.length }
}
