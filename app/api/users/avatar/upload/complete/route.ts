/**
 * /api/users/avatar/upload/complete - 完成头像分片上传
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { mergeChunks, isValidUploadId, deleteAvatarFilesByUrl } from '@/lib/upload'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { assertAvatarUploadOwner, consumeAvatarUpload } from '@/lib/avatar-upload-registry'
import { clearUserCache } from '@/lib/user/profile'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{
    uploadId?: string
    filename?: string
    totalChunks?: number
  }>(req)

  const uploadId = body.uploadId
  const filename = body.filename
  const totalChunks = body.totalChunks

  if (!uploadId || !filename || totalChunks == null) {
    throw400('INVALID_PARAMS', 'Invalid params')
  }

  const safeUploadId = uploadId as string
  const safeFilename = filename as string
  const safeTotalChunks = totalChunks as number

  if (!isValidUploadId(safeUploadId)) {
    throw400('INVALID_UPLOAD_ID', '无效的上传ID')
  }

  const owner = await assertAvatarUploadOwner(safeUploadId, user.id)

  if (safeTotalChunks < 1 || safeTotalChunks > 1000) {
    throw400('INVALID_PARAMS', 'totalChunks 范围必须在 1-1000 之间')
  }

  if (safeFilename.length < 1 || safeFilename.length > 255) {
    throw400('INVALID_FILENAME', '文件名长度不合法')
  }
  if (/[\\/\0]/.test(safeFilename)) {
    throw400('INVALID_FILENAME', '文件名包含非法字符')
  }

  const prev = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatar: true },
  })

  let result: { url: string; size: number }
  try {
    result = await mergeChunks(
      safeUploadId,
      safeTotalChunks,
      user.id,
      safeFilename,
      owner.fileSize
    )
  } catch (e) {
    // 合并失败也释放 uploadId，避免占满 30 分钟 TTL
    await consumeAvatarUpload(safeUploadId)
    throw e
  }
  await consumeAvatarUpload(safeUploadId)

  await prisma.user.update({
    where: { id: user.id },
    data: { avatar: result.url },
  })
  clearUserCache(user.id)

  // 旧头像文件 GC（失败不阻断）
  if (prev?.avatar && prev.avatar !== result.url) {
    void deleteAvatarFilesByUrl(prev.avatar).catch(() => {})
  }

  try {
    await prisma.avatarHistory.create({
      data: {
        userId: user.id,
        url: result.url,
        filename: safeFilename,
        size: result.size,
      },
    })
  } catch (historyError) {
    logger.error(
      'Failed to save avatar history',
      historyError instanceof Error ? historyError : new Error(String(historyError))
    )
  }

  return ok({ avatar: result.url })
})
