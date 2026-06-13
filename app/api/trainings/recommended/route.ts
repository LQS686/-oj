/**
 * /api/trainings/recommended - 推荐题单（公开）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listRecommendedTrainings } from '@/lib/training/service'
import { toInt } from '@/lib/api/validation'
import { readQuery } from '@/lib/api/withApi'
import { verifyToken } from '@/lib/auth'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ limit?: string }>(req)
  let limit = toInt(q.limit, 'limit', 3)
  if (limit < 1) limit = 3
  if (limit > 10) limit = 10

  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const items = await listRecommendedTrainings(limit, userId)
  return ok({ items })
})
