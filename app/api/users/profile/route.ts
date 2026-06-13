/**
 * /api/users/profile - 当前用户资料
 *
 * GET  鉴权：读取当前用户完整资料
 * PUT  鉴权：更新昵称/简介/头像
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { getCurrentUserProfile, updateCurrentUserBasic } from '@/lib/user/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  const data = await getCurrentUserProfile(user.id)
  return ok(data)
})

export const PUT = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{ nickname?: string; bio?: string; avatar?: string }>(req)
  try {
    const updated = await updateCurrentUserBasic(user.id, body)
    return ok(updated)
  } catch (err: any) {
    if (err?.status === 400) throw400('VALIDATION', err.message)
    throw err
  }
})
