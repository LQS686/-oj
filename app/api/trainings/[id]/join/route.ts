/**
 * /api/trainings/[id]/join - 加入 / 退出题单
 *
 * POST    加入（已加入则幂等）
 * DELETE  退出（未加入返回 200，不抛错）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { enrollTraining, unenrollTraining } from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'
import { throw400 } from '@/lib/api/withApi'

export const POST = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')
  const result = await enrollTraining(id, user.id)
  return ok({ joined: true, id: result.id, joinedAt: result.joinedAt })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')
  const result = await unenrollTraining(id, user.id)
  return ok({ joined: false, removed: !!result })
})
