/**
 * 班级成员积分余额
 * GET /api/classes/[id]/points/balance
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getPointsBalance } from '@/lib/points/account'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const result = await getPointsBalance(classId!, user.id)
  if (!result.success) throw400('QUERY_FAILED', result.error!)
  return ok(result.data)
})
