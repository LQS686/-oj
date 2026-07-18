/**
 * /api/trainings/[id] - 训练计划详情
 */
import { withApi, ok, readJson, throw400, throw403, throw404, ApiError } from '@/lib/api/withApi'
import {
  getTrainingWithProblemStatuses,
  updateTrainingAndProblems,
  deleteTraining,
  incrementViewCount,
  isClassMember,
  canManageClassTraining,
} from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessAdmin, canManageContent } from '@/lib/permissions'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  // 选登用户：解析 token 拿到 userId（未登录亦可）
  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const result = await getTrainingWithProblemStatuses(id, userId)
  if (!result) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  const training = result as any

  // 班级私有题单（classId 不为空）：仅班级成员可访问
  const trainingClassId: string | null = training.classId ?? null
  if (trainingClassId) {
    if (!(await isClassMember(trainingClassId, userId))) {
      throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
    }
  } else if (training.status === 'draft') {
    // 公开题单的草稿：仅作者/admin 可见
    if (!userId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    const authorId: string | null = training.author?.id ?? null
    if (!canAccessAdmin(u) && authorId !== userId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  }

  // 异步 viewCount++（不阻塞响应）
  void incrementViewCount(id)

  return ok(training)
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const found = await prisma.training.findUnique({
    where: { id },
    select: { authorId: true, classId: true },
  })
  if (!found) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  const isClassTraining = !!found.classId
  const canEdit = isClassTraining
    ? await canManageClassTraining(found.classId!, user.id)
    : canManageContent(user) && (canAccessAdmin(u) || found.authorId === user.id)

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

  // 班级题单：不允许修改发布/推荐/分类等公开属性
  // 公开题单：发布/推荐等高级设置仅管理员可改
  if (isClassTraining) {
    delete (body as any).categoryType
    delete (body as any).isRecommended
    delete (body as any).status
    delete (body as any).isPublic
  } else if (!canAccessAdmin(user)) {
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
  if (!found) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  const isClassTraining = !!found.classId
  const canDelete = isClassTraining
    ? await canManageClassTraining(found.classId!, user.id)
    : canManageContent(user) && (canAccessAdmin(u) || found.authorId === user.id)

  if (!canDelete) {
    throw403('无权限删除训练计划')
  }
  await deleteTraining(id)
  return ok({ id })
})
