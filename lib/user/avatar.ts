/**
 * lib/user/avatar.ts
 * 头像上传、活跃用户、头像历史
 */
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { clearUserCache } from './profile'

/**
 * 头像上传校验 + 写入
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function uploadUserAvatar(
  userId: string,
  file: File,
  writeFile: (path: string, data: Buffer) => Promise<void>,
  uploadDir: string,
  cryptoModule: typeof import('crypto'),
  pathModule: typeof import('path')
) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw AppError.badRequest('INVALID_FILE_TYPE', '仅支持 JPG、PNG、GIF、WebP 格式的图片')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw AppError.badRequest('FILE_TOO_LARGE', '文件大小不能超过 5MB')
  }
  const ext = pathModule.extname(file.name).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw AppError.badRequest('UNSUPPORTED_FORMAT', '不支持的文件格式')
  }
  const safeFilename = cryptoModule.randomUUID() + ext
  const filePath = pathModule.join(uploadDir, safeFilename)
  const resolvedPath = pathModule.resolve(filePath)
  if (!resolvedPath.startsWith(pathModule.resolve(uploadDir))) {
    throw AppError.badRequest('INVALID_PATH', '非法的文件路径')
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  // 魔数校验
  const magic = (ext: string) => {
    if (ext === '.png') return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    if (ext === '.jpg' || ext === '.jpeg') return buffer[0] === 0xFF && buffer[1] === 0xD8
    if (ext === '.gif') return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46
    if (ext === '.webp') return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    return false
  }
  if (!magic(ext)) {
    throw AppError.badRequest('FILE_MISMATCH', '文件内容与声明格式不匹配')
  }
  await writeFile(filePath, buffer)
  const avatarUrl = `/uploads/avatars/${safeFilename}`
  await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } })
  clearUserCache(userId)
  return avatarUrl
}

/**
 * 活跃用户列表（题解权重 3 + 近期提交）
 */
export async function listActiveUsers(limit = 5) {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const [solutionCounts, recentSubmitters] = await Promise.all([
    prisma.solution.groupBy({
      by: ['authorId'],
      _count: { id: true },
    }),
    prisma.submission.groupBy({
      by: ['userId'],
      _count: { id: true },
      where: { submittedAt: { gte: since } },
    }),
  ])
  const userScores = new Map<string, number>()
  solutionCounts.forEach((item) => {
    userScores.set(item.authorId, (userScores.get(item.authorId) || 0) + item._count.id * 3)
  })
  recentSubmitters.forEach((item) => {
    userScores.set(item.userId, (userScores.get(item.userId) || 0) + item._count.id)
  })
  const sortedUserIds = Array.from(userScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map((entry) => entry[0])
  if (sortedUserIds.length === 0) {
    return prisma.user.findMany({
      take: limit,
      orderBy: { rating: 'desc' },
      select: {
        id: true,
        username: true,
        nickname: true,
        rating: true,
        color: true,
        avatar: true,
        _count: { select: { solutions: true } },
      },
    })
  }
  const users = await prisma.user.findMany({
    where: { id: { in: sortedUserIds } },
    select: {
      id: true,
      username: true,
      nickname: true,
      rating: true,
      color: true,
      avatar: true,
      _count: {
        select: {
          solutions: true,
        },
      },
    },
  })
  return sortedUserIds.map((id) => users.find((u) => u.id === id)).filter((u) => u !== undefined)
}

/**
 * 当前用户头像历史
 */
export async function listAvatarHistory(userId: string, take = 20) {
  return prisma.avatarHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  })
}

/**
 * 删除一条头像历史记录，并同步删除上传的图片文件（主图 + 缩略图）。
 *
 * 安全：
 * 1. 校验 historyId 对应记录归属当前 userId，防止越权删除他人头像
 * 2. 拒绝删除当前正在使用的头像（user.avatar === history.url），避免出现指向已删除文件的悬空引用
 *
 * 文件删除失败不抛错（DB 记录已删，文件可由后续清理任务兜底），
 * 但会记录日志便于排查。
 */
export async function deleteAvatarHistory(userId: string, historyId: string): Promise<void> {
  const record = await prisma.avatarHistory.findUnique({ where: { id: historyId } })
  if (!record) {
    throw AppError.notFound('头像历史记录不存在')
  }
  if (record.userId !== userId) {
    throw AppError.forbidden('无权删除该头像历史')
  }

  // 拒绝删除当前正在使用的头像：避免 user.avatar 指向已删除文件
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  })
  if (user?.avatar && record.url && user.avatar === record.url) {
    throw AppError.badRequest(
      'AVATAR_IN_USE',
      '该头像正在使用中，请先切换到其他头像后再删除'
    )
  }

  await prisma.avatarHistory.delete({ where: { id: historyId } })

  // 同步删除文件系统中的图片（主图 + 缩略图）
  try {
    const { deleteAvatarFilesByUrl } = await import('@/lib/upload')
    await deleteAvatarFilesByUrl(record.url)
  } catch (e) {
    // 文件删除失败不阻断流程：DB 记录已删，文件残留可由清理任务兜底
    logger.error('删除头像文件失败', e instanceof Error ? e : new Error(String(e)))
  }
}
