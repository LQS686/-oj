/**
 * 题解查看权限控制工具
 *
 * 规则优先级：
 *   1. 管理员/教师（SYSTEM_ADMIN / TEACHER）始终允许
 *   2. 作业场景（isAssignmentContext=true）一律隐藏
 *   3. 其他情况下查询该用户在该题的最高分，达到 60 分即可查看
 */

import { prisma } from '@/lib/prisma'
import { canManageContent } from '@/lib/permissions'

/** 查看题解所需的最低分 */
export const REQUIRED_SOLUTION_SCORE = 60

/** 题解不可见的原因枚举 */
export type SolutionViewReason =
  | 'ADMIN'
  | 'TEACHER'
  | 'ENOUGH_SCORE'
  | 'ASSIGNMENT_CONTEXT'
  | 'NO_SUBMISSION'
  | 'LOW_SCORE'

/** canViewSolutions 的可选参数 */
export interface CanViewOptions {
  isAssignmentContext?: boolean
}

/** canViewSolutions 的返回结果 */
export interface SolutionViewResult {
  allowed: boolean
  reason: SolutionViewReason
  bestScore?: number
  /** 始终为 60（与 REQUIRED_SOLUTION_SCORE 保持一致） */
  requiredScore: typeof REQUIRED_SOLUTION_SCORE
}

/**
 * 调用方传入的 user 形状：
 *   - 完整 User 对象（含 role）
 *   - JWT 解码后的 payload（role 需要从 DB 二次查询）
 */
export interface SolutionViewUser {
  id: string
  role?: string
}

/**
 * 查询某用户在某题目的最高提交分
 *
 * @returns 最高分（0 表示无提交或全为 0 分）
 */
export async function getUserBestScore(
  userId: string,
  problemId: string
): Promise<number> {
  if (!userId || !problemId) {
    return 0
  }

  const submission = await prisma.submission.findFirst({
    where: { userId, problemId },
    orderBy: { score: 'desc' },
    select: { score: true }
  })

  return submission?.score ?? 0
}

/**
 * 基于已知的最高分做最终决策
 * （会通过 canManageContent 校验内容管理权限）
 */
export async function decideSolutionView(
  user: SolutionViewUser | null,
  bestScore: number,
  options: CanViewOptions = {}
): Promise<SolutionViewResult> {
  // 1) 可管理内容的管理员 / 教师直接放行
  if (user && canManageContent(user)) {
    return {
      allowed: true,
      reason: 'ADMIN',
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  // 2) 作业场景下隐藏
  if (options.isAssignmentContext === true) {
    return {
      allowed: false,
      reason: 'ASSIGNMENT_CONTEXT',
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  // 3) 未登录用户直接拒绝
  if (!user) {
    return {
      allowed: false,
      reason: 'NO_SUBMISSION',
      bestScore: 0,
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  // 4) 普通用户按分数决定
  if (bestScore < REQUIRED_SOLUTION_SCORE) {
    return {
      allowed: false,
      reason: bestScore === 0 ? 'NO_SUBMISSION' : 'LOW_SCORE',
      bestScore,
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  return {
    allowed: true,
    reason: 'ENOUGH_SCORE',
    bestScore,
    requiredScore: REQUIRED_SOLUTION_SCORE
  }
}

/**
 * 判断用户是否可以查看某题目的题解
 *
 * 使用方式：
 *   - 路由处理函数中先用 `getUserFromRequest` 解析 JWT，得到 payload
 *   - 若 payload 中无 role 字段（例如没有预查询 User），可以传入完整的 User 对象
 *   - 然后调用本函数
 */
export async function canViewSolutions(
  user: SolutionViewUser | null,
  problemId: string,
  options: CanViewOptions = {}
): Promise<SolutionViewResult> {
  // 1) 可管理内容的管理员 / 教师短路返回
  if (user && canManageContent(user)) {
    return {
      allowed: true,
      reason: 'ADMIN',
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  // 2) 作业场景下隐藏
  if (options.isAssignmentContext === true) {
    return {
      allowed: false,
      reason: 'ASSIGNMENT_CONTEXT',
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  // 3) 未登录用户直接拒绝
  if (!user) {
    return {
      allowed: false,
      reason: 'NO_SUBMISSION',
      bestScore: 0,
      requiredScore: REQUIRED_SOLUTION_SCORE
    }
  }

  // 4) 查询最高分并决策
  const bestScore = await getUserBestScore(user.id, problemId)
  return decideSolutionView(user, bestScore, options)
}
