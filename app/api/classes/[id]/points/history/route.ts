/**
 * 积分历史记录
 * GET /api/classes/[id]/points/history
 */
import { withApi, ok, readQuery, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getPointsHistory } from '@/lib/points/history'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const q = readQuery<{ page?: string; limit?: string; type?: 'EARN' | 'SPEND' | 'DEDUCT' | 'REFUND' }>(req)
  const page = parseInt(q.page || '1') || 1
  const limit = parseInt(q.limit || '20') || 20

  const result = await getPointsHistory(classId!, user.id, {
    page,
    limit,
    type: q.type,
  })
  if (!result.success) throw400('QUERY_FAILED', result.error!)
  return ok(result.data)
})
