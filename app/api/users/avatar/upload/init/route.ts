/**
 * /api/users/avatar/upload/init - 初始化头像分片上传
 */
import { randomInt } from 'crypto'
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { cleanOldTempFiles } from '@/lib/upload'
import { logger } from '@/lib/logger'
import { registerAvatarUpload } from '@/lib/avatar-upload-registry'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  // 1/100 概率异步触发 GC，不阻塞本请求；用 crypto.randomInt 而非 Math.random
  if (randomInt(100) === 0) {
    setImmediate(() => {
      cleanOldTempFiles().catch((err) => logger.error('cleanOldTempFiles failed', err))
    })
  }

  const body = await readJson<{ filename?: string; fileSize?: number }>(req)
  const { filename, fileSize } = body

  if (!filename || !fileSize) {
    throw400('INVALID_REQUEST', 'Invalid request')
  }

  if (fileSize! > 5 * 1024 * 1024) {
    throw400('FILE_TOO_LARGE', 'File too large (Max 5MB)')
  }

  const uploadId = await registerAvatarUpload({
    userId: user.id,
    filename: filename!,
    fileSize: fileSize!,
  })

  return ok({
    uploadId,
    chunkSize: 1024 * 1024,
  })
})
