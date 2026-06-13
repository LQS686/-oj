/**
 * GET /api/classes/[id]/statistics - 班级统计
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, throw400, fail } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  ensureClassAccessible,
  computeClassStatistics,
} from '@/lib/class/service'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const access = await ensureClassAccessible(classId!, user.id)
  if (!access.ok) {
    return fail('ERR', access.error, access.code)
  }

  const data = await computeClassStatistics(classId!)
  return ok(data)
})
