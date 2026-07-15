/**
 * /api/users/avatar/upload/complete - 完成头像分片上传
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { mergeChunks, isValidUploadId } from '@/lib/upload'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'
import { assertAvatarUploadOwner, consumeAvatarUpload } from '@/lib/avatar-upload-registry'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const { uploadId, filename, totalChunks } = await readJson<{
    uploadId?: string
    filename?: string
    totalChunks?: number
  }>(req)

  if (!uploadId || !filename || !totalChunks) {
    throw400('INVALID_PARAMS', 'Invalid params')
  }

  if (!isValidUploadId(uploadId!)) {
    throw400('INVALID_UPLOAD_ID', '无效的上传ID')
  }

  // P1-5 修复：二次鉴权 - 必须是该 uploadId 的拥有者本人
  assertAvatarUploadOwner(uploadId!, user.id)

  if (totalChunks! < 1 || totalChunks! > 1000) {
    throw400('INVALID_PARAMS', 'totalChunks 范围必须在 1-1000 之间')
  }

  // Merge and process
  const result = await mergeChunks(uploadId!, totalChunks!, user.id, filename!)

  // P1-5：完成后清理注册表项（一次性会话）
  consumeAvatarUpload(uploadId!)

  const client = await clientPromise
  const db = client.db()

  await db.collection('User').updateOne(
    { _id: new ObjectId(user.id) },
    {
      $set: {
        avatar: result.url,
        updatedAt: new Date(),
      },
    },
  )

  try {
    await db.collection('AvatarHistory').insertOne({
      userId: new ObjectId(user.id),
      url: result.url,
      filename: filename,
      size: result.size,
      createdAt: new Date(),
    })
  } catch (historyError) {
    logger.error(
      'Failed to save avatar history',
      historyError instanceof Error ? historyError : new Error(String(historyError))
    )
  }

  return ok({ avatar: result.url })
})
