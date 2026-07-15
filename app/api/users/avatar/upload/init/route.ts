/**
 * /api/users/avatar/upload/init - 初始化头像分片上传
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { cleanOldTempFiles } from '@/lib/upload'
import { logger } from '@/lib/logger'
import { registerAvatarUpload } from '@/lib/avatar-upload-registry'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (Math.random() < 0.01) {
    cleanOldTempFiles().catch(err => logger.error('cleanOldTempFiles failed', err))
  }

  const body = await readJson<{ filename?: string; fileSize?: number }>(req)
  const { filename, fileSize } = body

  if (!filename || !fileSize) {
    throw400('INVALID_REQUEST', 'Invalid request')
  }

  if (fileSize! > 5 * 1024 * 1024) {
    throw400('FILE_TOO_LARGE', 'File too large (Max 5MB)')
  }

  // P1-5 修复：将 uploadId 与当前用户绑定，后续 chunk/complete 必须二次校验
  const uploadId = registerAvatarUpload({
    userId: user.id,
    filename: filename!,
    fileSize: fileSize!,
  })

  // 修复：ok() 已包装一层 data 字段，这里不能再嵌套 data，
  // 否则前端 initData.data.uploadId 取到 undefined。
  return ok({
    uploadId,
    chunkSize: 1024 * 1024,
  })
})