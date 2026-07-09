/**
 * /api/users/avatar/upload/chunk - 接收头像分片
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { saveChunk, isValidUploadId } from '@/lib/upload'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const formData = await req.formData()
  const uploadId = formData.get('uploadId') as string
  const chunkIndex = parseInt(formData.get('chunkIndex') as string)
  const file = formData.get('file') as File

  if (!uploadId || isNaN(chunkIndex) || !file) {
    throw400('INVALID_PARAMS', 'Invalid params')
  }

  if (!isValidUploadId(uploadId)) {
    throw400('INVALID_UPLOAD_ID', '无效的上传ID')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  await saveChunk(uploadId, chunkIndex, buffer)

  return ok({})
})
