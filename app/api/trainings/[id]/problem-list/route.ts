/**
 * GET /api/trainings/[id]/problem-list - 题单题目列表（A/B/C + 状态）
 */
import { withApi, ok, throw400, ApiError } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { verifyToken } from '@/lib/auth'
import { listTrainingProblemsWithStatus } from '@/lib/training/service'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/permissions'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as { params: { id: string } }).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const training = await prisma.training.findUnique({
    where: { id },
    select: { id: true, status: true, isPublic: true, authorId: true },
  })
  if (!training) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  if (training.status === 'draft') {
    const token = req.cookies.get('token')?.value
    const userId = token ? verifyToken(token)?.userId : null
    if (!userId) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!isAdmin(u) && training.authorId !== userId) {
      throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
    }
  }

  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const result = await listTrainingProblemsWithStatus(id, userId)
  if (!result) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  return ok(result)
})