/**
 * /api/users/[id]/info - 获取用户公开资料
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getUserPublicInfo } from '@/lib/user/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.public(async (_req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的用户ID')
  const data = await getUserPublicInfo(id)
  if (!data) throw404('用户不存在')
  return ok(data)
})
