/**
 * lib/problem/lookup.ts
 * 题目详情 / 创建（含测试用例）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'
import type { TestCaseInput } from '@/types/api'
import { clearProblemCache } from './admin'

/* ============================================================================
 * 题目详情 / 创建（含测试用例）
 * ========================================================================== */

/** 通过 ObjectId 或 problemNumber 解析题目 */
export async function findProblemByIdOrNumber(idOrNumber: string) {
  // 题面详情是高频读路径（每次打开题目页都会请求），且包含关联查询
  // （author + 样例测点），缓存 60s 避免重复往返；clearProblemCache 按前缀失效。
  return cache.get(CacheKeys.problem.byIdOrNumberPrefix(), [idOrNumber], async () => {
    const where: Prisma.ProblemWhereInput = isObjectIdLike(idOrNumber)
      ? { id: idOrNumber }
      : { problemNumber: idOrNumber }
    return prisma.problem.findFirst({
      where,
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        testCases: {
          where: { isSample: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })
  }, { ttl: 60_000 })
}

export function isObjectIdLike(s: string) {
  return /^[0-9a-fA-F]{24}$/.test(s)
}

export interface CreateProblemInput {
  title: string
  description: string
  background?: string
  input: string
  output: string
  samples?: Array<{ input?: string; output?: string }> | null
  hint?: string
  source?: string
  difficulty: string
  tags?: string[]
  timeLimit?: number
  memoryLimit?: number
  comparisonMode?: string
  realPrecision?: number
  spjCode?: string | null
  /** 可见性：唯一真相源；缺省 private */
  visibility?: 'public' | 'private' | 'contest'
  testCases?: TestCaseInput[]
  authorId: string
}

export async function createProblemWithTestcases(input: CreateProblemInput) {
  const VALID_COMPARISON_MODES = [
    'default',
    'strict',
    'ignore-spaces',
    'real-number',
    'special-judge',
  ]
  const visibility = input.visibility ?? 'private'
  const normalizedTestCases = Array.isArray(input.testCases)
    ? ensureTotalScoreIs100(
        input.testCases.map((tc, index) => ({
          input: tc.input,
          output: tc.output,
          isSample: tc.isSample || false,
          score: tc.score || 0,
          timeLimit: tc.timeLimit,
          memoryLimit: tc.memoryLimit,
          orderIndex: index + 1,
        }))
      )
    : []

  // C-P2-7：题目 + 测试点同事务写入，测试点用 createMany 批量插入，避免逐个 create 出现孤儿题目
  // （与 lib/problem/admin.ts 的 $transaction + createMany 先例一致；本项目 MongoDB 副本集已支持事务）
  const problem = await prisma.$transaction(async (tx) => {
    const created = await tx.problem.create({
      data: {
        title: input.title,
        description: input.description,
        background: input.background,
        input: input.input,
        output: input.output,
        samples: input.samples || [],
        hint: input.hint,
        source: input.source,
        difficulty: input.difficulty,
        tags: input.tags || [],
        timeLimit: input.timeLimit || 1000,
        memoryLimit: input.memoryLimit || 128,
        comparisonMode: VALID_COMPARISON_MODES.includes(input.comparisonMode as string)
          ? (input.comparisonMode as string)
          : 'default',
        realPrecision:
          typeof input.realPrecision === 'number' && input.realPrecision >= 0
            ? input.realPrecision
            : 3,
        spjCode: input.spjCode ?? null,
        visibility,
        isPublic: visibility === 'public',
        authorId: input.authorId,
      },
    })

    if (normalizedTestCases.length > 0) {
      await tx.testCase.createMany({
        data: normalizedTestCases.map((tc) => ({
          problemId: created.id,
          input: tc.input,
          output: tc.output,
          isSample: tc.isSample,
          score: tc.score,
          timeLimit: tc.timeLimit ?? null,
          memoryLimit: tc.memoryLimit ?? null,
          orderIndex: tc.orderIndex,
        })),
      })
    }
    return created
  })

  clearProblemCache(problem.id)
  return problem
}
