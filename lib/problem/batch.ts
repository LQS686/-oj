/**
 * lib/problem/batch.ts
 * 管理员批量题目操作 / 导出 / 审核 / 重生成题解
 */
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api/withApi'
import { DIFFICULTIES, isValidDifficulty, migrateDifficulty } from '@/lib/constants'
import { clearProblemCache } from './admin'
import { deleteTestCaseFiles } from './testcase'
import { logger } from '@/lib/logger'

/* ============================================================================
 * 管理员批量题目操作 / 导出 / 审核 / 重生成题解
 * ========================================================================== */

export type BatchProblemAction = 'visibility' | 'difficulty' | 'delete'
export type BatchProblemVisibility = 'public' | 'private' | 'contest'

const VALID_VISIBILITY: BatchProblemVisibility[] = ['public', 'private', 'contest']
// 批量修改难度允许 8 档 + 兼容旧版 4 档（自动迁移）
const VALID_DIFFICULTY_BATCH = [...DIFFICULTIES] as readonly string[]

/**
 * 批量修改题目可见性
 */
export async function batchUpdateProblemVisibility(
  problemIds: string[],
  visibility: BatchProblemVisibility
) {
  const result = await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: {
      visibility,
      isPublic: visibility === 'public',
    },
  })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 批量修改题目难度
 */
export async function batchUpdateProblemDifficulty(problemIds: string[], difficulty: string) {
  const result = await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: { difficulty },
  })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 批量删除题目：级联删除 submissions / solutions / contestProblems / trainingProblems / testCases
 *
 * 参考 HOJ 外键级联 + Hydro 硬删 document+软删 storage 的策略：
 *   - DB 记录硬删除
 *   - 磁盘测试点文件同步清理（失败仅 warn，不阻塞）
 *   - 缓存清理放在 DB 删除之后（LOGIC-09）
 */
export async function batchDeleteProblems(problemIds: string[]) {
  // 回退已 AC 用户的 solvedCount
  const acUsers = await prisma.submission.findMany({
    where: { problemId: { in: problemIds }, status: 'AC' },
    select: { userId: true, problemId: true },
    distinct: ['userId', 'problemId'],
  })
  if (acUsers.length > 0) {
    // 按用户聚合每人对多少道题 AC（每道题回退 1）
    const userAcCount = new Map<string, number>()
    acUsers.forEach(u => {
      userAcCount.set(u.userId, (userAcCount.get(u.userId) ?? 0) + 1)
    })
    await Promise.all(
      Array.from(userAcCount.entries()).map(([userId, count]) =>
        prisma.user.update({
          where: { id: userId },
          data: { solvedCount: { decrement: count } },
        })
      )
    )
  }

  await prisma.submission.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.solution.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.contestProblem.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.trainingProblem.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.testCase.deleteMany({ where: { problemId: { in: problemIds } } })
  const result = await prisma.problem.deleteMany({ where: { id: { in: problemIds } } })

  // 同步清理磁盘测试点文件（DB 已删，磁盘文件不再有用）
  // 失败仅 warn，不阻塞批量删除流程
  await Promise.allSettled(problemIds.map(id => deleteTestCaseFiles(id))).then(settled => {
    const failed = settled.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      logger.warn(`[problem] 批量删除 ${failed.length}/${problemIds.length} 个题目的磁盘文件失败`)
    }
  })

  // LOGIC-09: 先 DB 后清缓存
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 校验批量操作的入参 + ID 合法性
 */
export function validateBatchProblemInput(input: {
  action?: string
  problemIds?: string[]
  visibility?: string
  difficulty?: string
  isObjectId: (s: string) => boolean
}): { action: BatchProblemAction; problemIds: string[]; visibility?: BatchProblemVisibility; difficulty?: string } {
  const { action, problemIds, visibility, difficulty, isObjectId } = input
  if (!Array.isArray(problemIds) || problemIds.length === 0) {
    throw new ApiError('INVALID_PROBLEM_IDS', 'problemIds 必须是非空数组', 400)
  }
  const invalidIds = problemIds.filter((id) => !isObjectId(id))
  if (invalidIds.length > 0) {
    throw new ApiError(
      'INVALID_IDS',
      `以下 ID 格式无效: ${invalidIds.slice(0, 3).join(', ')}`,
      400
    )
  }
  switch (action) {
    case 'visibility': {
      if (!visibility || !VALID_VISIBILITY.includes(visibility as BatchProblemVisibility)) {
        throw new ApiError('INVALID_VISIBILITY', '无效的可见性', 400)
      }
      return { action, problemIds, visibility: visibility as BatchProblemVisibility }
    }
    case 'difficulty': {
      // 统一使用 8 档标准，旧版 4 档自动迁移
      if (!difficulty || (!VALID_DIFFICULTY_BATCH.includes(difficulty) && !isValidDifficulty(migrateDifficulty(difficulty)))) {
        throw new ApiError('INVALID_DIFFICULTY', `难度值无效，必须是 8 档之一：${DIFFICULTIES.join(' / ')}（旧版简单/中等/困难将自动迁移）`, 400)
      }
      return { action, problemIds, difficulty }
    }
    case 'delete':
      return { action, problemIds }
    default:
      throw new ApiError('INVALID_ACTION', '无效的操作类型', 400)
  }
}
