/**
 * /api/users/profile/email - 修改邮箱
 *
 * PUT 鉴权：校验密码 + 邮箱格式 + 唯一性后更新
 */
import { withApi, ok, readJson, throw400, throw401, throw404, throw409 } from '@/lib/api/withApi'
import { getMongoClient } from '@/lib/mongodb-direct'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { getUserWithPassword, changeCurrentUserEmail } from '@/lib/user/service'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PUT = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{ newEmail?: string; password?: string }>(req)
  const { newEmail, password } = body

  if (!newEmail || !password) throw400('VALIDATION', '请提供新邮箱和当前密码')
  if (!EMAIL_REGEX.test(newEmail!)) throw400('VALIDATION', '邮箱格式不正确')
  if (newEmail!.length > 100) throw400('VALIDATION', '邮箱长度不能超过100个字符')

  const userRecord = await getUserWithPassword(user.id)
  if (!userRecord) throw404('用户不存在')
  const safeUserRecord = userRecord!

  const isPasswordValid = await bcrypt.compare(password!, safeUserRecord.password)
  if (!isPasswordValid) throw401('当前密码错误')

  // 邮箱未变：直接返回
  if (safeUserRecord.email === newEmail) {
    return ok({ message: '邮箱未发生变化' })
  }

  // 邮箱是否已被其他账号使用
  const { isEmailTaken, changeCurrentUserEmail: changeEmail } = await import('@/lib/user/service')
  const taken = await isEmailTaken(newEmail!, user.id)
  if (taken) {
    throw409('该邮箱已被使用')
  }

  // Mongo 写入（同步 +1 写库）
  const client = await getMongoClient()
  const db = client.db()
  await db
    .collection('User')
    .updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { email: newEmail!, updatedAt: new Date() } }
    )
  await changeEmail(user.id, newEmail!)

  return ok({ message: '邮箱修改成功' })
})
