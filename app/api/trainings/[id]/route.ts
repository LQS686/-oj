/**
 * /api/trainings/[id] - 训练计划详情
 */
import { withApi, ok, readJson, throw400, throw403, ApiError } from '@/lib/api/withApi'
import {
  getTrainingWithProblemStatuses,
  updateTrainingAndProblems,
  deleteTraining,
  incrementViewCount,
} from '@/lib/training/service'
import { canViewTraining, loadTrainingAccess } from '@/lib/training/access'
import { isObjectId } from '@/lib/api/validation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessAdmin, canManageContent } from '@/lib/permissions'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const access = await loadTrainingAccess(id)
  if (!access || !(await canViewTraining(access, userId))) {
    throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  }

  const result = await getTrainingWithProblemStatuses(id, userId)
  if (!result) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  void incrementViewCount(id)
  return ok(result)
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const found = await prisma.training.findUnique({
    where: { id },
    select: { authorId: true, classId: true },
  })
  if (!found || found.classId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  const canEdit =
    canManageContent(user) && (canAccessAdmin(u) || found.authorId === user.id)

  if (!canEdit) {
    throw403('无权限编辑训练计划')
  }

  const body = await readJson<{
    title?: string
    description?: string
    difficulty?: string | null
    categoryType?: 'official' | 'contest' | null
    isPublic?: boolean
    status?: string
    isRecommended?: boolean
    categoryId?: string
    tags?: string[]
    cover?: string
  }>(req)

  if (!canAccessAdmin(user)) {
    delete (body as any).categoryType
    delete (body as any).isRecommended
    delete (body as any).status
    delete (body as any).isPublic
  }

  const updated = await updateTrainingAndProblems(id, body)
  return ok(updated)
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const found = await prisma.training.findUnique({
    where: { id },
    select: { authorId: true, classId: true },
  })
  if (!found || found.classId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  const canDelete =
    canManageContent(user) && (canAccessAdmin(u) || found.authorId === user.id)

  if (!canDelete) {
    throw403('无权限删除训练计划')
  }
  await deleteTraining(id)
  return ok({ id })
})
