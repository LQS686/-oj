/**
 * lib/admin/logs.ts
 * 管理员审计 / 验证日志
 */
import { prisma } from '@/lib/prisma'

/**
 * 获取最近 100 条"题目来源变更"审计日志
 */
export async function listProblemSourceChangeLogs() {
  return prisma.auditLog.findMany({
    where: { action: 'UPDATE_PROBLEM_SOURCE' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

/**
 * 获取某道题目的验证日志
 */
export async function listProblemVerificationLogs(problemId: string) {
  return prisma.verificationLog.findMany({
    where: { problemId },
    orderBy: { createdAt: 'desc' },
    // C-P2-12：验证日志只读最近记录，加 take 上限防单题日志无限增长拖垮响应
    take: 100,
  })
}
