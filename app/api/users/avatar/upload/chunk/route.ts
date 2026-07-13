/**
 * /api/users/avatar/upload/chunk - 接收头像分片
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { saveChunk, isValidUploadId } from '@/lib/upload'

/** 单个分片大小上限：2MB（init 路由推荐 1MB，允许一定余量） */
const MAX_CHUNK_SIZE = 2 * 1024 * 1024
/** chunkIndex 上限（与 complete 路由的 totalChunks 上限一致） */
const MAX_CHUNK_INDEX = 1000

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

  // chunkIndex 范围校验
  if (chunkIndex < 0 || chunkIndex > MAX_CHUNK_INDEX) {
    throw400('INVALID_CHUNK_INDEX', `chunkIndex 超出范围 (0-${MAX_CHUNK_INDEX})`)
  }

  // 单 chunk 大小限制
  if (file.size > MAX_CHUNK_SIZE) {
    throw400('CHUNK_TOO_LARGE', `分片大小超过限制 (Max ${MAX_CHUNK_SIZE} bytes)`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  await saveChunk(uploadId, chunkIndex, buffer)

  return ok({})
})
