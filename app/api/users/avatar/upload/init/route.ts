/**
 * /api/users/avatar/upload/init - 初始化头像分片上传
 */
import { withApi, ok, readJson, throw400, throw401 } from '@/lib/api/withApi'
import { randomUUID } from 'crypto'
import { cleanOldTempFiles } from '@/lib/upload'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  // Probabilistic cleanup (1% chance)
  if (Math.random() < 0.01) {
    cleanOldTempFiles().catch(console.error)
  }

  const body = await readJson<{ filename?: string; fileSize?: number }>(req)
  const { filename, fileSize } = body

  // Validation
  if (!filename || !fileSize) {
    throw400('INVALID_REQUEST', 'Invalid request')
  }

  if (fileSize! > 5 * 1024 * 1024) {
    throw400('FILE_TOO_LARGE', 'File too large (Max 5MB)')
  }

  const uploadId = randomUUID()

  return ok({
    data: {
      uploadId,
      chunkSize: 1024 * 1024, // 1MB chunks recommended
    },
  })
})
