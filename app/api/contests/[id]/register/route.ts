/**
 * POST /api/contests/[id]/register - 报名参加竞赛
 */
import { withApi, ok, readJson, throw400, throw403, throw404, throw409, errorLike } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { registerContestParticipantDirect } from '@/lib/mongodb-direct'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import {
  getContestForRegistration,
  isUserRegistered,
  verifyContestPassword,
} from '@/lib/contest/service'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const contestResult = await getContestForRegistration(id)
  if (!contestResult) throw404('竞赛不存在')
  const contest = contestResult!

  const alreadyRegistered = await isUserRegistered(id, user.id)
  if (alreadyRegistered) throw409('您已经报名过此竞赛')

  // type 字段是赛制（ACM/OI），密码门以 password 字段是否存在为准
  if (contest.endTime && new Date() > contest.endTime) {
    throw403('竞赛已结束，无法报名')
  }

  const body = await readJson<{ password?: string; inviteCode?: string }>(req)

  if (contest.password) {
    const secret = (body.password || body.inviteCode || '').trim()
    if (!secret) throw400('MISSING_PASSWORD', '请输入竞赛密码或邀请码')
    const passwordValid = await verifyContestPassword(secret, contest.password)
    if (!passwordValid) throw403('密码或邀请码错误')
  }

  try {
    await registerContestParticipantDirect({
      contestId: id,
      userId: user.id,
      inviteCode: body.inviteCode,
    })
  } catch (e: unknown) {
    // 并发报名：唯一约束冲突视为已报名（幂等）
    const err = errorLike(e)
    if (err.message === 'Already registered' || Number(err.code) === 11000) {
      throw409('您已经报名过此竞赛')
    }
    throw e
  }

  cache.deleteByPrefix(CacheKeys.contest.rankPrefix(id))
  return ok({ message: '报名成功' })
})
