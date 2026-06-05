import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * 获取 prisma.solutionLike 模型引用。
 *
 * 注意：SolutionLike 模型是后期加入的，prisma client 必须重新生成
 * （`npx prisma generate`）才能通过 prisma.solutionLike 访问。
 *
 * 在 client 未重新生成的环境（如 Windows 文件锁导致 generate 失败的临时态），
 * 该属性为 undefined，应做优雅降级：
 * - 列表/详情 API：跳过 isLiked 查询
 * - 点赞 API：返回 503 提示功能暂时不可用
 */
export function getSolutionLikeModel(): any | null {
  const model = (prisma as any).solutionLike
  if (model && typeof model.findUnique === 'function') {
    return model
  }
  return null
}

/**
 * 列表/详情场景下，批量获取当前用户对这些题解的点赞状态。
 * - prisma client 未生成时：返回空 Set（全部视为未点赞）
 * - 当前用户未登录时：返回空 Set
 */
export async function getLikedSolutionIds(
  userId: string | null | undefined,
  solutionIds: string[]
): Promise<Set<string>> {
  if (!userId || solutionIds.length === 0) return new Set()
  const model = getSolutionLikeModel()
  if (!model) {
    logger.warn('prisma.solutionLike 不可用，跳过 isLiked 查询（请执行 npx prisma generate）')
    return new Set()
  }
  try {
    const likes = await model.findMany({
      where: {
        userId,
        solutionId: { in: solutionIds }
      },
      select: { solutionId: true }
    })
    return new Set(likes.map((l: any) => l.solutionId))
  } catch (err) {
    logger.error('批量查询点赞状态失败', err)
    return new Set()
  }
}

/**
 * 单题详情场景下，查询当前用户是否已点赞。
 * prisma client 未生成时返回 false。
 */
export async function isSolutionLiked(
  userId: string | null | undefined,
  solutionId: string
): Promise<boolean> {
  if (!userId) return false
  const model = getSolutionLikeModel()
  if (!model) return false
  try {
    const like = await model.findUnique({
      where: {
        solutionId_userId: {
          solutionId,
          userId
        }
      },
      select: { id: true }
    })
    return !!like
  } catch (err) {
    logger.error('查询点赞状态失败', err)
    return false
  }
}
