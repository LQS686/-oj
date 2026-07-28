/**
 * 头像 URL 白名单校验（纯函数，可安全用于 Server / Client）
 * 勿从此文件 import prisma / cache / redis。
 */

/** 读取路径二次校验：非白名单头像 URL 对外置空，防止历史脏数据钓鱼 */
export function sanitizeAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null
  if (
    avatar.startsWith('/uploads/avatars/') ||
    avatar.startsWith('/api/placeholder/')
  ) {
    return avatar
  }
  return null
}
