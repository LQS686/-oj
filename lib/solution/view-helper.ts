import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * 获取 prisma.solutionView 模型引用。
 *
 * prisma client 必须在重新生成后才能访问新加的模型，
 * 在 client 未重新生成的环境（如 Windows 文件锁导致 generate 失败的临时态），
 * 该属性为 undefined，应做优雅降级。
 */
export function getSolutionViewModel(): any | null {
  const model = (prisma as any).solutionView
  if (model && typeof model.create === 'function') {
    return model
  }
  return null
}

/**
 * 原子地记录一次浏览（基于 SolutionView 唯一索引去重）。
 *
 * - 同一 (solutionId, viewerKey) 重复调用不会增加 views
 * - prisma client 未生成时直接返回 false（功能降级，不增加 views）
 *
 * 返回：true 表示本次新增了浏览记录（应 +1），false 表示重复浏览或降级
 */
export async function recordUniqueView(
  solutionId: string,
  userId: string | null,
  ip: string
): Promise<boolean> {
  const model = getSolutionViewModel()
  if (!model) {
    logger.warn('prisma.solutionView 不可用，跳过 views 去重（请执行 npx prisma generate）')
    return false
  }
  // 登录用户以 userId 区分；未登录用户以 IP 区分（FNV-1a 哈希后更短）
  const viewerKey = userId ? `u:${userId}` : `g:${fnv1a(ip)}`
  try {
    await model.create({
      data: {
        solutionId,
        userId: userId ?? undefined,
        viewerKey
      }
    })
    return true
  } catch (err: any) {
    // 唯一约束冲突 = 重复浏览
    if (err?.code === 'P2002') return false
    logger.error('记录题解浏览失败', err)
    return false
  }
}

/**
 * 单 IP 限流键的简单哈希（FNV-1a，32-bit），避免 viewerKey 列过长
 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16)
}
