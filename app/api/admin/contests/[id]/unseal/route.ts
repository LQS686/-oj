/**
 * POST /api/admin/contests/[id]/unseal - 管理员手动解冻封榜
 *
 * 比赛结束后，管理员可调用此接口将 sealUnlocked 置为 true，
 * 让所有用户看到完整排名（参考 HOJ sealUnlocked + Hydro unlock）。
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'

export const POST = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const contest = await prisma.contest.findUnique({ where: { id }, select: { id: true, sealRankTime: true } })
  if (!contest) throw404('竞赛不存在')

  await prisma.contest.update({
    where: { id },
    data: { sealUnlocked: true },
  })

  cache.delete(CacheKeys.contest.byId(id))
  cache.deleteByPrefix('contest:rank')

  return ok({ message: '已解冻封榜' })
})
