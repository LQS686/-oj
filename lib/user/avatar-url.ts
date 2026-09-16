/**
 * 头像 URL 白名单校验（纯函数，可安全用于 Server / Client）
 * 勿从此文件 import prisma / cache / redis。
 */
import { isBuiltinAvatar } from './avatar-config'

/**
 * 读取路径二次校验：仅放行「已上传头像」与「内置头像」，其余对外置空，
 * 防止历史脏数据（外链 / 已废弃的 /api/placeholder 前缀）产生破图或钓鱼。
 */
export function sanitizeAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null
  if (avatar.startsWith('/uploads/avatars/')) return avatar
  if (isBuiltinAvatar(avatar)) return avatar
  return null
}
