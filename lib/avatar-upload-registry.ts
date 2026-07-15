/**
 * lib/avatar-upload-registry.ts
 * 头像分片上传的"uploadId → 用户"绑定注册表（P1-5 服务层二次鉴权）
 *
 * 背景：
 *   - 之前 init/chunk/complete 三步只用 UUID 验证上传合法性，缺少 user 绑定校验。
 *   - 这意味着任意已登录用户拿到别人的 uploadId 后可向 TEMP_DIR 注入垃圾分片。
 *   - 修复：init 时把 userId 写入内存注册表，chunk/complete 时强制校验。
 *
 * 特点：
 *   - 进程级内存 Map（多实例部署需替换为 Redis；当前单实例够用）
 *   - 30 分钟 TTL，过期自动清理
 *   - 校验失败抛 403 FORBIDDEN
 */

import { randomUUID } from 'crypto'
import { ApiError } from '@/lib/api/withApi'

interface UploadOwner {
  userId: string
  filename: string
  fileSize: number
  expiresAt: number
}

const TTL_MS = 30 * 60 * 1000
const MAX_ENTRIES = 5000

// globalThis 单例，HMR 兼容
const g = globalThis as any
if (!g.__avatarUploadRegistry) {
  g.__avatarUploadRegistry = new Map<string, UploadOwner>()
}
const registry: Map<string, UploadOwner> = g.__avatarUploadRegistry

function gc() {
  const now = Date.now()
  for (const [k, v] of registry.entries()) {
    if (v.expiresAt < now) registry.delete(k)
  }
  // LRU 淘汰
  while (registry.size > MAX_ENTRIES) {
    const first = registry.keys().next().value
    if (first === undefined) break
    registry.delete(first)
  }
}

/** 注册一个新上传会话，返回 uploadId */
export function registerAvatarUpload(input: {
  userId: string
  filename: string
  fileSize: number
}): string {
  gc()
  const uploadId = randomUUID()
  registry.set(uploadId, {
    userId: input.userId,
    filename: input.filename,
    fileSize: input.fileSize,
    expiresAt: Date.now() + TTL_MS,
  })
  return uploadId
}

/** 校验调用方是否拥有该 uploadId（强制二次鉴权） */
export function assertAvatarUploadOwner(uploadId: string, userId: string): UploadOwner {
  gc()
  const owner = registry.get(uploadId)
  if (!owner) {
    throw new ApiError('UPLOAD_NOT_FOUND', '上传会话不存在或已过期', 404)
  }
  if (owner.userId !== userId) {
    throw new ApiError('FORBIDDEN', '无权操作此上传会话', 403)
  }
  return owner
}

/** 完成上传后清理注册表项 */
export function consumeAvatarUpload(uploadId: string): void {
  registry.delete(uploadId)
}

export const AVATAR_UPLOAD_TTL_MS = TTL_MS