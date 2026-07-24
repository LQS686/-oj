/**
 * lib/training/access.ts
 * 题单可见性统一校验（公开列表之外的详情 / 题单 / 加入入口共用）
 */
import { prisma } from '@/lib/prisma'
import { canAccessAdmin } from '@/lib/permissions'

export type TrainingAccessRow = {
  id: string
  status: string
  isPublic: boolean
  authorId: string | null
  classId: string | null
}

/** 班级题单已下线；带 classId 的历史数据一律不可见 */
export function isClassScopedTraining(training: { classId?: string | null }): boolean {
  return Boolean(training.classId)
}

/**
 * 当前用户是否可查看该题单。
 * - 班级题单：否
 * - 公开已发布：是
 * - 草稿 / 私有：仅作者或管理员
 */
export async function canViewTraining(
  training: TrainingAccessRow,
  userId: string | null | undefined
): Promise<boolean> {
  if (isClassScopedTraining(training)) return false

  if (training.isPublic && training.status === 'published') return true

  if (!userId) return false
  if (training.authorId === userId) return true

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  return canAccessAdmin(u)
}

export async function loadTrainingAccess(id: string): Promise<TrainingAccessRow | null> {
  return prisma.training.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      isPublic: true,
      authorId: true,
      classId: true,
    },
  })
}
