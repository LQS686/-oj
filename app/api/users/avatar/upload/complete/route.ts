/**
 * /api/users/avatar/upload/complete - 完成头像分片上传
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { mergeChunks } from '@/lib/upload'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const { uploadId, filename, totalChunks } = await readJson<{
    uploadId?: string
    filename?: string
    totalChunks?: number
  }>(req)

  if (!uploadId || !filename || !totalChunks) {
    throw400('INVALID_PARAMS', 'Invalid params')
  }

  // Merge and process
  const result = await mergeChunks(uploadId!, totalChunks!, user.id, filename!)

  // Update DB using native MongoDB driver to avoid Prisma transaction requirement on standalone
  const client = await clientPromise
  const db = client.db() // Uses the db name from connection string

  // 1. Update User Avatar
  await db.collection('User').updateOne(
    { _id: new ObjectId(user.id) },
    {
      $set: {
        avatar: result.url,
        updatedAt: new Date(),
      },
    },
  )

  // 2. Create History Record
  try {
    await db.collection('AvatarHistory').insertOne({
      userId: new ObjectId(user.id),
      url: result.url,
      filename: filename,
      size: result.size,
      createdAt: new Date(),
    })
  } catch (historyError) {
    logger.error('Failed to save avatar history:', historyError)
    // Non-blocking error
  }

  return ok({ data: { avatar: result.url } })
})
