/**
 * lib/avatar-upload-registry.ts
 * 头像分片上传的"uploadId → 用户"绑定注册表
 *
 * 唯一存储：Redis（多实例一致）。未配置或不可用时直接失败，不做进程内降级。
 */

import { randomUUID } from 'crypto'
import { ApiError } from '@/lib/api/errors'
import { isRedisConfigured, getRedisClient } from '@/lib/redis'

interface UploadOwner {
  userId: string
  filename: string
  fileSize: number
  expiresAt: number
}

const TTL_MS = 30 * 60 * 1000
const REDIS_KEY_PREFIX = 'avatar-upload:'

function requireRedis(): void {
  if (!isRedisConfigured()) {
    throw new ApiError('UPLOAD_REGISTRY_UNAVAILABLE', '头像上传需要配置 REDIS_URL', 503)
  }
}

function redisKey(uploadId: string): string {
  return `${REDIS_KEY_PREFIX}${uploadId}`
}

async function redisSet(uploadId: string, owner: UploadOwner): Promise<void> {
  const client = getRedisClient()
  const ttlSec = Math.max(1, Math.ceil((owner.expiresAt - Date.now()) / 1000))
  await client.set(redisKey(uploadId), JSON.stringify(owner), 'EX', ttlSec)
}

async function redisGet(uploadId: string): Promise<UploadOwner | null> {
  const client = getRedisClient()
  const raw = await client.get(redisKey(uploadId))
  if (!raw) return null
  return JSON.parse(raw) as UploadOwner
}

async function redisDel(uploadId: string): Promise<void> {
  const client = getRedisClient()
  await client.del(redisKey(uploadId))
}

/** 注册一个新上传会话，返回 uploadId */
export async function registerAvatarUpload(input: {
  userId: string
  filename: string
  fileSize: number
}): Promise<string> {
  requireRedis()

  const uploadId = randomUUID()
  const owner: UploadOwner = {
    userId: input.userId,
    filename: input.filename,
    fileSize: input.fileSize,
    expiresAt: Date.now() + TTL_MS,
  }

  try {
    await redisSet(uploadId, owner)
  } catch {
    throw new ApiError('UPLOAD_REGISTRY_UNAVAILABLE', '上传会话服务不可用，请稍后重试', 503)
  }
  return uploadId
}

/** 校验调用方是否拥有该 uploadId（强制二次鉴权） */
export async function assertAvatarUploadOwner(
  uploadId: string,
  userId: string
): Promise<UploadOwner> {
  requireRedis()

  let owner: UploadOwner | null = null
  try {
    owner = await redisGet(uploadId)
  } catch {
    throw new ApiError('UPLOAD_REGISTRY_UNAVAILABLE', '上传会话服务不可用，请稍后重试', 503)
  }

  if (!owner || owner.expiresAt < Date.now()) {
    throw new ApiError('UPLOAD_NOT_FOUND', '上传会话不存在或已过期', 404)
  }
  if (owner.userId !== userId) {
    throw new ApiError('FORBIDDEN', '无权操作此上传会话', 403)
  }
  return owner
}

/** 完成上传后清理注册表项 */
export async function consumeAvatarUpload(uploadId: string): Promise<void> {
  if (!isRedisConfigured()) return
  try {
    await redisDel(uploadId)
  } catch {
    // 消费失败不阻断上传完成；下次 TTL 过期即可
  }
}

export const AVATAR_UPLOAD_TTL_MS = TTL_MS
