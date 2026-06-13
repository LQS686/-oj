/**
 * 管理员手动发放/扣除积分
 * POST /api/classes/[id]/points/manual
 */
import { withApi, ok, readJson, throw400, throw403, fail } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getCurrentClassMember, isClassAdminRole } from '@/lib/class/service'
import { addPoints, deductPoints } from '@/lib/points/account'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  // 检查管理员权限
  const member = await getCurrentClassMember(classId, user.id)
  if (!member || !isClassAdminRole(member.role)) {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    targetUserId: string
    points: number
    type: 'ADD' | 'DEDUCT'
    reason: string
  }>(req)
  const { targetUserId, points, type, reason } = body

  if (!targetUserId || !points || !type || !reason) {
    throw400('MISSING_FIELDS', '缺少必要参数')
  }
  if (points <= 0) throw400('INVALID_POINTS', '积分必须大于0')

  let result
  if (type === 'ADD') {
    result = await addPoints(classId, targetUserId, points, reason, 'MANUAL_AWARD')
  } else if (type === 'DEDUCT') {
    result = await deductPoints(classId, targetUserId, points, reason, 'MANUAL_DEDUCT')
  } else {
    throw400('INVALID_TYPE', '无效的操作类型')
  }

  if (!result || !result.success) {
    return fail('ERR', (result as any)?.error || '操作失败', 400)
  }

  return ok(result)
})
