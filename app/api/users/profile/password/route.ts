/**
 * /api/users/profile/password - 修改密码
 */
import { withApi, ok, readJson, throw400, throw401, throw404 } from '@/lib/api/withApi'
import { changeCurrentUserPassword } from '@/lib/user/service'
import bcrypt from 'bcryptjs'
import { logger } from '@/lib/logger'

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
    logger.error('修改密码失败', err)
    if (err?.status === 400) throw400('VALIDATION', '请求参数不合法')
    if (err?.status === 401) throw401('认证失败')
    if (err?.status === 404) throw404('资源不存在')
    throw err
  }
})
