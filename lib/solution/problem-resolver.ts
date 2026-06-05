import { prisma } from '@/lib/prisma'

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/

/**
 * 根据题目标识查找题目，支持：
 * - 24 位 hex ObjectId（数据库主键）
 * - 题号（problemNumber，如 "P1005"）
 *
 * 返回真实 ObjectId（用于 Solution.problemId 外键）。
 */
export async function resolveProblemId(input: string | null | undefined): Promise<string | null> {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1) 优先按 ObjectId 查
  if (OBJECT_ID_REGEX.test(trimmed)) {
    const problem = await prisma.problem.findUnique({
      where: { id: trimmed },
      select: { id: true }
    })
    if (problem) return problem.id
  }

  // 2) 按 problemNumber 查
  const problem = await prisma.problem.findUnique({
    where: { problemNumber: trimmed },
    select: { id: true }
  })
  return problem?.id ?? null
}
