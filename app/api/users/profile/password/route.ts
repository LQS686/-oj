/**
 * /api/users/profile/password - 修改密码
 */
import { withApi, ok, readJson, throw400, throw401, throw404, ApiError } from '@/lib/api/withApi'
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
      bcrypt
    )
    return ok({ message: '密码修改成功' })
  } catch (err: unknown) {
    logger.error('修改密码失败', err)
    if (err instanceof ApiError) {
      // 400 错误(如 WRONG_PASSWORD「当前密码错误」、WEAK_PASSWORD 强度明细)透传业务消息，
      // 避免前端只看到泛化的「请求参数不合法」而无法定位原因
      if (err.status === 400) throw400('VALIDATION', err.message)
      if (err.status === 401) throw401('认证失败')
      if (err.status === 404) throw404('资源不存在')
    }
    throw err
  }
})
