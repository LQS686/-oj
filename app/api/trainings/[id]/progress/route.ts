/**
 * /api/trainings/[id]/progress - 训练进度（需登录）
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getUserTrainingProgressDetail } from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const data = await getUserTrainingProgressDetail(id, user.id)
  if (!data) throw404('训练计划不存在')
  return ok(data)
})
