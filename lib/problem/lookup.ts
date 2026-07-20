/**
 * lib/problem/lookup.ts
 * 题目详情 / 创建（含测试用例）
 */
import { prisma } from '@/lib/prisma'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'
import type { TestCaseInput } from '@/types/api'
import { clearProblemCache } from './admin'

/* ============================================================================
 * 题目详情 / 创建（含测试用例）
 * ========================================================================== */

/** 通过 ObjectId 或 problemNumber 解析题目 */
export async function findProblemByIdOrNumber(idOrNumber: string) {
  const where: any = isObjectIdLike(idOrNumber)
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
}

export function isObjectIdLike(s: string) {
  return /^[0-9a-fA-F]{24}$/.test(s)
}

export interface CreateProblemInput {
  title: string
  description: string
  input: string
  output: string
  samples?: any
  hint?: string
  source?: string
  difficulty: string
  tags?: string[]
  timeLimit?: number
  memoryLimit?: number
  comparisonMode?: string
  realPrecision?: number
  isPublic?: boolean
  testCases?: TestCaseInput[]
  authorId: string
}

export async function createProblemWithTestcases(input: CreateProblemInput) {
  const VALID_COMPARISON_MODES = ['default', 'strict', 'ignore-spaces', 'real-number']
  const problem = await prisma.problem.create({
    data: {
      title: input.title,
      description: input.description,
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
      isPublic: input.isPublic ?? false,
      authorId: input.authorId,
    },
  })

  if (input.testCases && Array.isArray(input.testCases)) {
    const normalized = ensureTotalScoreIs100(
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
    await Promise.all(
      normalized.map((tc) =>
        prisma.testCase.create({
          data: {
            problemId: problem.id,
            input: tc.input,
            output: tc.output,
            isSample: tc.isSample,
            score: tc.score,
            timeLimit: tc.timeLimit ?? null,
            memoryLimit: tc.memoryLimit ?? null,
            orderIndex: tc.orderIndex,
          },
        })
      )
    )
  }
  clearProblemCache(problem.id)
  return problem
}
