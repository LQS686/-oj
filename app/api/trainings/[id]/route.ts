/**
 * /api/trainings/[id] - 训练计划详情
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getTrainingWithProblemStatuses } from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'
import { verifyToken } from '@/lib/auth'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  // 选登用户：解析 token 拿到 userId（未登录亦可）
  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const training = await getTrainingWithProblemStatuses(id, userId)
  if (!training) throw404('训练计划不存在')
  return ok(training)
})
