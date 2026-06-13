/**
 * /api/users/avatar - 上传头像
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { uploadUserAvatar } from '@/lib/user/service'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars')

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const formData = await req.formData()
  const file = formData.get('avatar') as File | null
  if (!file) throw400('VALIDATION', '请选择头像文件')

  try {
    const avatarUrl = await uploadUserAvatar(
      user.id,
      file!,
      writeFile,
      UPLOAD_DIR,
      crypto,
      path
    )
    return ok({ avatarUrl })
  } catch (err: any) {
    if (err?.status === 400) throw400('VALIDATION', err.message)
    throw err
  }
})
