/**
 * /api/admin/ai/generate/suggestions - PRE-generation 难度分布均衡建议（spec 7.3 / Task 10.1）
 *
 * GET 返回当前用户近 7 天已生成题目的难度分布统计 + 推荐补充的稀缺难度档位，
 * 供前端 AiGenerationForm 在难度选择区域上方展示分布信息与推荐徽章。
 *
 * 返回结构：
 * ```ts
 * {
 *   recentCount: number;                              // 近 7 天用户生成题目总数（题目数，非日志数）
 *   difficultyDistribution: Array<{ difficulty: string; count: number }>;
 *   recommendedDifficulty: Difficulty | null;         // 推荐补充的稀缺难度；分布均衡或无记录时为 null
 * }
 * ```
 *
 * 推荐逻辑：
 * 1. recentCount === 0 → null（无记录，前端展示"可自由选择难度"）
 * 2. 8 档中存在 count === 0 的档位 → 返回首个 0 档位（按 DIFFICULTIES 顺序）
 * 3. 8 档 count 均在 [1, 3] → null（分布均衡）
 * 4. 否则 → 返回 count 最少的档位（同 count 取 DIFFICULTIES 中靠前者）
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import { DIFFICULTIES, type Difficulty, isValidDifficulty } from '@/lib/constants'

/**
 * 从单条 AiGenerationLog.result 中提取 previewProblems 数组（防御性类型断言）。
 * result 在 Prisma schema 中为 Json? 类型，运行时结构由 parametric.ts 写入：
 * `{ previewProblems: Array<{ difficulty: string; ... }>, thought, correctionStats, isPreview }`。
 */
function extractPreviewProblems(result: unknown): Array<{ difficulty: string }> {
  if (!result || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  const arr = r.previewProblems
  if (!Array.isArray(arr)) return []
  return arr.filter(
    (p): p is { difficulty: string } =>
      !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).difficulty === 'string'
  )
}

/**
 * 计算 8 档难度的推荐补充档位（spec 7.3 推荐逻辑）。
 *
 * @param counts 8 档难度的题目数（按 DIFFICULTIES 顺序，0 表示该档位无题目）
 * @returns 推荐档位或 null（无记录 / 分布均衡）
 */
function pickRecommendedDifficulty(counts: number[]): Difficulty | null {
  // 1. 无记录 → null
  const total = counts.reduce((s, c) => s + c, 0)
  if (total === 0) return null

  // 2. 存在 0 档位 → 返回首个 0 档位
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    if (counts[i] === 0) return DIFFICULTIES[i]
  }

  // 3. 8 档均在 [1, 3] → null（分布均衡）
  const allBalanced = counts.every(c => c >= 1 && c <= 3)
  if (allBalanced) return null

  // 4. 否则返回 count 最少的档位（同 count 取靠前者）
  let minIdx = 0
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[minIdx]) minIdx = i
  }
  return DIFFICULTIES[minIdx]
}

export const GET = withApi.admin(async (_req, _ctx, { user }) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const logs = await prisma.aiGenerationLog.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: sevenDaysAgo },
      status: 'COMPLETED',
    },
    select: { result: true },
  })

  // 按 8 档难度聚合 previewProblems 题目数（顺序与 DIFFICULTIES 一致）
  const counts = new Array<number>(DIFFICULTIES.length).fill(0)
  let recentCount = 0

  for (const log of logs) {
    const previews = extractPreviewProblems(log.result)
    for (const p of previews) {
      recentCount++
      const idx = DIFFICULTIES.indexOf(p.difficulty as Difficulty)
      if (idx >= 0 && isValidDifficulty(p.difficulty)) {
        counts[idx]++
      }
    }
  }

  const difficultyDistribution = DIFFICULTIES.map((difficulty, idx) => ({
    difficulty,
    count: counts[idx],
  })).filter(entry => entry.count > 0)

  const recommendedDifficulty = pickRecommendedDifficulty(counts)

  return ok({
    recentCount,
    difficultyDistribution,
    recommendedDifficulty,
  })
})
