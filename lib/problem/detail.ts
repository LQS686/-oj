/**
 * lib/problem/detail.ts
 * 题面详情数据组装（API 与页面 SSR 共用），避免两处重复组装逻辑。
 */
import { findProblemByIdOrNumber } from './lookup'
import { getProblemStatusCounts } from './crud'
import { assertCanAccessProblem } from './access'
import { AppError } from '@/lib/errors'
import type { AuthUser } from '@/lib/api/handler'

export interface ProblemDetailData {
  id: string
  title: string
  description: string
  background: string | null
  input: string
  output: string
  samples: unknown
  hint: string | null
  source: string | null
  difficulty: string
  tags: string[]
  timeLimit: number
  memoryLimit: number
  isPublic: boolean
  problemNumber: string | null
  author: { id: string; username: string; nickname: string | null } | null
  testCases: Array<{ id: string; input: string; expectedOutput: string; isSample: boolean }>
  totalSubmit: number
  totalAccepted: number
  stats: {
    acCount: number
    totalSubmissions: number
    acRate: number
    statusCounts: Record<string, number>
  }
  createdAt: Date
  updatedAt: Date
}

/**
 * 组装题面详情（含可见性校验与实时提交统计口径）。
 * 不可访问或不存在时 throw AppError(NOT_FOUND, 404)。
 */
export async function getProblemDetailData(
  idOrNumber: string,
  viewer: AuthUser | null,
  contestId?: string
): Promise<ProblemDetailData> {
  const problem = await findProblemByIdOrNumber(idOrNumber)
  if (!problem) throw AppError.notFound('题目不存在')

  const p = problem
  await assertCanAccessProblem(
    { id: p.id, authorId: p.authorId, visibility: p.visibility },
    viewer,
    { contestId }
  )

  const statusCounts = (await getProblemStatusCounts(p.id, {
    contestId,
    viewer,
  })) as Record<string, number>
  const liveTotal = Object.values(statusCounts).reduce((s, n) => s + n, 0)
  const liveAc = statusCounts['AC'] || 0
  // 优先用实时聚合（已按封榜截断）；无数据时回退 denormalized
  const totalSubmissions = liveTotal > 0 ? liveTotal : p.totalSubmit
  const acCount = liveTotal > 0 ? liveAc : p.totalAccepted
  const acRate =
    totalSubmissions > 0 ? Math.round((acCount / totalSubmissions) * 100) : 0

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    background: p.background,
    input: p.input,
    output: p.output,
    samples: p.samples || [],
    hint: p.hint,
    source: p.source,
    difficulty: p.difficulty,
    tags: p.tags || [],
    timeLimit: p.timeLimit,
    memoryLimit: p.memoryLimit,
    isPublic: p.isPublic,
    problemNumber: p.problemNumber,
    author: p.author,
    testCases: p.testCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.output,
      isSample: tc.isSample,
    })),
    totalSubmit: totalSubmissions,
    totalAccepted: acCount,
    stats: {
      acCount,
      totalSubmissions,
      acRate,
      statusCounts,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}
