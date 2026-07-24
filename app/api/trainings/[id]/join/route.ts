/**
 * /api/trainings/[id]/join - 加入 / 退出题单
 *
 * POST    加入（已加入则幂等）
 * DELETE  退出（未加入返回 200，不抛错）
 */
import { withApi, ok, throw400, ApiError } from '@/lib/api/withApi'
import { enrollTraining, unenrollTraining } from '@/lib/training/service'
import { canViewTraining, loadTrainingAccess } from '@/lib/training/access'
import { isObjectId } from '@/lib/api/validation'

export const POST = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const access = await loadTrainingAccess(id)
  if (!access || !(await canViewTraining(access, user.id))) {
    throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  }
  // 仅公开已发布题单可收藏加入（作者看自己的私有草稿不可“加入”语义）
  if (!(access.isPublic && access.status === 'published')) {
    throw new ApiError('FORBIDDEN', '仅公开题单可加入', 403)
  }

  const result = await enrollTraining(id, user.id)
  return ok({ joined: true, id: result.id, joinedAt: result.joinedAt })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')
  const result = await unenrollTraining(id, user.id)
  return ok({ joined: false, removed: !!result })
})
