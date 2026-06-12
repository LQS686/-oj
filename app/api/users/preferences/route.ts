/**
 * /api/users/preferences - 用户偏好
 *
 * GET 鉴权：读取
 * PUT 鉴权：增量合并（白名单 + 值校验）
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { getUserPreferencesCollection, updateUserPreferencesCollection } from '@/lib/user/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  const preferences = await getUserPreferencesCollection(user.id)
  return ok(preferences)
})

export const PUT = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<Record<string, any>>(req)
  try {
    const preferences = await updateUserPreferencesCollection(user.id, body)
    return ok({ data: preferences, message: '偏好设置已更新' })
  } catch (err: any) {
    if (err?.status === 400) throw400('VALIDATION', err.message)
    throw err
  }
})
