/**
 * /api/trainings/[id]/problems - 训练题目列表（轻量）
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getTrainingProblems } from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'
import { verifyToken } from '@/lib/auth'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const data = await getTrainingProblems(id, userId)
  if (!data) throw404('训练计划不存在')
  return ok(data)
})
