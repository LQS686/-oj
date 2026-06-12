/**
 * /api/users/profile/password - 修改密码
 */
import { withApi, ok, readJson, throw400, throw401, throw404 } from '@/lib/api/withApi'
import { changeCurrentUserPassword } from '@/lib/user/service'
import bcrypt from 'bcryptjs'

export const PUT = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req)
  try {
    await changeCurrentUserPassword(
      user.id,
      body.currentPassword || '',
      body.newPassword || '',
      bcrypt as any
    )
    return ok({ message: '密码修改成功' })
  } catch (err: any) {
    if (err?.status === 400) throw400('VALIDATION', err.message)
    if (err?.status === 401) throw401(err.message)
    if (err?.status === 404) throw404(err.message)
    throw err
  }
})
