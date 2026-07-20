/**
 * lib/problem/verification.ts
 * 题目验证（管理员 / 作者）原 /api/admin/problems/[id]/verify
 */
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api/withApi'
import { clearProblemCache } from './admin'

/* ============================================================================
 * 题目验证（管理员 / 作者）原 /api/admin/problems/[id]/verify
 * ========================================================================== */

export interface VerifyProblemInput {
  id: string
  verifierId: string
  isAdmin: boolean
  decision: 'accept' | 'reject' | 'fix' | 'archive'
  message?: string
  isAiGenerated?: boolean
}

/**
 * 题目的可验证者：作者 + 管理员
 */
export async function findVerifiableProblem(verifyProblemId: string) {
  return prisma.problem.findUnique({
    where: { id: verifyProblemId },
    include: { author: { select: { id: true, username: true, nickname: true } } },
  })
}

export async function applyProblemVerification(input: VerifyProblemInput) {
  const problem = await findVerifiableProblem(input.id)
  if (!problem) {
    throw new ApiError('NOT_FOUND', '题目不存在', 404)
  }
  if (input.isAiGenerated && problem.authorId !== input.verifierId && !input.isAdmin) {
    throw new ApiError('FORBIDDEN', '只有题目作者或管理员可以验证', 403)
  }

  // 拒绝 / 修复：把状态置为 PENDING，等待作者修改
  // 接受 / 归档：标记为 APPROVED 或 ARCHIVED
  const statusMap = {
    accept: 'APPROVED',
    fix: 'PENDING',
    reject: 'REJECTED',
    archive: 'ARCHIVED',
  } as const

  const newStatus = statusMap[input.decision]
  if (!newStatus) {
    throw new ApiError('INVALID_DECISION', '无效的验证决策', 400)
  }

  await prisma.problem.update({
    where: { id: input.id },
    data: {
      isAiGenerated: input.isAiGenerated ?? problem.isAiGenerated,
      aiStatus: newStatus,
    },
  })
  clearProblemCache(input.id)

  return {
    message: '验证完成',
    status: newStatus,
    decision: input.decision,
  }
}
