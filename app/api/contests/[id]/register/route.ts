/**
 * POST /api/contests/[id]/register - 报名参加竞赛
 */
import { withApi, ok, readJson, throw400, throw403, throw404, throw409 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { registerContestParticipantDirect } from '@/lib/mongodb-direct'
import {
  getContestForRegistration,
  isUserRegistered,
  verifyContestPassword,
} from '@/lib/contest/service'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const contestResult = await getContestForRegistration(id)
  if (!contestResult) throw404('竞赛不存在')
  const contest = contestResult!

  const alreadyRegistered = await isUserRegistered(id, user.id)
  if (alreadyRegistered) throw409('您已经报名过此竞赛')

  const body = await readJson<{ password?: string; inviteCode?: string }>(req)

  // 验证报名条件
  if (contest.type === 'password') {
    if (!body.password) throw400('MISSING_PASSWORD', '请输入竞赛密码')
    const passwordValid = await verifyContestPassword(body.password!, contest.password)
    if (!passwordValid) throw403('密码错误')
  } else if (contest.type === 'invite') {
    if (!body.inviteCode) throw400('MISSING_INVITE_CODE', '请输入邀请码')
    const inviteValid = await verifyContestPassword(body.inviteCode!, contest.password)
    if (!inviteValid) throw403('邀请码无效')
  }

  // 创建报名记录（直接驱动以绕过 Prisma 事务限制）
  await registerContestParticipantDirect({
    contestId: id,
    userId: user.id,
    inviteCode: body.inviteCode,
  })

  return ok({ message: '报名成功' })
})
