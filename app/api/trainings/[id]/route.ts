/**
 * /api/trainings/[id] - 训练计划详情
 */
import { withApi, ok, readJson, throw400, throw403, throw404, ApiError } from '@/lib/api/withApi'
import {
  getTrainingWithProblemStatuses,
  updateTrainingAndProblems,
  deleteTraining,
  incrementViewCount,
} from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  // 选登用户：解析 token 拿到 userId（未登录亦可）
  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const result = await getTrainingWithProblemStatuses(id, userId)
  if (!result) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  const training = result

  // 草稿仅作者/admin 可见
  if (training.status === 'draft') {
    if (!userId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    const authorId: string | null = training.author?.id ?? null
    if (u?.role !== 'SYSTEM_ADMIN' && authorId !== userId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  }

  // 异步 viewCount++（不阻塞响应）
  void incrementViewCount(id)

  return ok(training)
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  // 仅作者或管理员可改
  const found = await prisma.training.findUnique({
    where: { id },
    select: { authorId: true },
  })
  if (!found) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  if (u?.role !== 'SYSTEM_ADMIN' && found.authorId !== user.id) {
    throw403('只有作者或管理员可以编辑')
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

  // 分类仅 admin 可选；普通用户若传则丢弃
  if (u?.role !== 'SYSTEM_ADMIN') {
    delete (body as any).categoryType
    delete (body as any).isRecommended
    delete (body as any).status
    delete (body as any).isPublic
  }

  const updated = await updateTrainingAndProblems(id, body)
  return ok(updated)
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const found = await prisma.training.findUnique({
    where: { id },
    select: { authorId: true },
  })
  if (!found) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  if (u?.role !== 'SYSTEM_ADMIN' && found.authorId !== user.id) {
    throw403('只有作者或管理员可以删除')
  }
  await deleteTraining(id)
  return ok({ id })
})
